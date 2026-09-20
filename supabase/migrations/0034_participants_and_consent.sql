-- Participants (the people who actually attend class) vs the accounts that
-- register/pay for them.
--
--   users        = login accounts
--   students     = PARTICIPANTS (kept under its old name; every report, record
--                  and schedule already hangs off it). New columns hold what
--                  belongs to the person, not the account:
--                    gender, phone (participant WhatsApp), birth_date (exists),
--                    relationship to whoever registered them, and
--                    user_id = the participant's OWN account (NULL until they
--                    claim it; parent_id stays the registering account)
--   enrollments  = participant + program (+ slot), now also recording who
--                  requested it, who is billed and whether the participant
--                  allowed the registering person to see schedule and reports.
--
-- Privacy: an adult registered by someone else (spouse / family member) is
-- kind = 'adult_family'. The registering account keeps administrative access
-- (registration status, invoices) but does NOT see schedule or class reports
-- unless the participant explicitly allows it. Children keep working as
-- before. Additive and safe to re-run.

-- ============================================================
-- 1. participant profile
-- ============================================================
alter table public.students
  add column if not exists gender text,
  add column if not exists phone text,
  add column if not exists relationship text,
  add column if not exists kind text not null default 'child',
  add column if not exists user_id uuid references public.users (id) on delete set null,
  add column if not exists claim_token text unique,
  add column if not exists claim_expires_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_gender_check') then
    alter table public.students add constraint students_gender_check
      check (gender is null or gender in ('male', 'female', 'undisclosed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_kind_check') then
    alter table public.students add constraint students_kind_check
      check (kind in ('child', 'self', 'adult_family'));
  end if;
end $$;

-- existing self-registered participants ARE their account
update public.students set kind = 'self', user_id = coalesce(user_id, parent_id) where is_self and kind = 'child';

create index if not exists students_user_idx on public.students (user_id);

-- a program may state who it is intended for (Aquanatal: pregnant participants).
-- It is shown to the participant and used to stop an obviously wrong choice;
-- it is never the only thing that decides eligibility (admin reviews every
-- registration).
alter table public.programs add column if not exists intended_gender text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'programs_intended_gender_check') then
    alter table public.programs add constraint programs_intended_gender_check
      check (intended_gender is null or intended_gender in ('male', 'female'));
  end if;
end $$;
update public.programs set intended_gender = 'female' where name = 'Aquanatal';

-- ============================================================
-- 2. enrollments: who asked, who pays, consent
-- ============================================================
alter table public.enrollments
  add column if not exists requested_by_user_id uuid references public.users (id) on delete set null,
  add column if not exists billing_contact_user_id uuid references public.users (id) on delete set null,
  add column if not exists report_access_granted_to_requester boolean not null default false;

update public.enrollments e
set requested_by_user_id = coalesce(e.requested_by_user_id, st.parent_id),
    billing_contact_user_id = coalesce(e.billing_contact_user_id, st.parent_id)
from public.students st
where st.id = e.student_id;

-- ============================================================
-- 3. who may see what
-- ============================================================
-- administrative access: the registering account OR the participant's own
create or replace function public.parent_owns_student(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.students st
    where st.id = p_student_id
      and (st.parent_id = auth.uid() or st.user_id = auth.uid())
  );
$$;

-- schedule / reports / records / goals: the participant always; the
-- registering account for children and for themselves, but for an adult
-- registered for someone else only with the participant's consent.
create or replace function public.can_view_enrollment_records(p_enrollment_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.students st on st.id = e.student_id
    where e.id = p_enrollment_id
      and (
        st.user_id = auth.uid()
        or (
          st.parent_id = auth.uid()
          and (st.kind <> 'adult_family' or e.report_access_granted_to_requester)
        )
      )
  );
$$;

create or replace function public.can_view_student_records(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.students st
    where st.id = p_student_id
      and (
        st.user_id = auth.uid()
        or (
          st.parent_id = auth.uid()
          and (
            st.kind <> 'adult_family'
            or exists (
              select 1 from public.enrollments e
              where e.student_id = st.id and e.report_access_granted_to_requester
            )
          )
        )
      )
  );
$$;

grant execute on function public.can_view_enrollment_records(uuid) to authenticated;
grant execute on function public.can_view_student_records(uuid) to authenticated;

-- goals hang off enrollments: same rule as reports
create or replace function public.parent_owns_enrollment(p_enrollment_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.can_view_enrollment_records(p_enrollment_id);
$$;

drop policy if exists "ortu can read own children" on public.students;
create policy "ortu can read own children"
  on public.students for select
  using (parent_id = auth.uid() or user_id = auth.uid());

drop policy if exists "ortu can read schedules for own children" on public.schedules;
create policy "ortu can read schedules for own children"
  on public.schedules for select
  using (public.can_view_student_records(schedules.student_id));

drop policy if exists "ortu can read reports for own children" on public.progress_reports;
create policy "ortu can read reports for own children"
  on public.progress_reports for select
  using (
    (enrollment_id is not null and public.can_view_enrollment_records(enrollment_id))
    or (enrollment_id is null and public.can_view_student_records(student_id))
  );

drop policy if exists "ortu can read records for own children" on public.performance_records;
create policy "ortu can read records for own children"
  on public.performance_records for select
  using (
    (enrollment_id is not null and public.can_view_enrollment_records(enrollment_id))
    or (enrollment_id is null and public.can_view_student_records(student_id))
  );

-- ============================================================
-- 4. registration RPC (replaces register_participant_enrollment)
-- ============================================================
drop function if exists public.register_participant_enrollment(uuid, text, text, text);

create or replace function public.register_enrollment(
  p_program_id uuid,
  p_for text,
  p_full_name text,
  p_phone text,
  p_birth_date date,
  p_gender text,
  p_relationship text,
  p_preferred_schedule text,
  p_preferred_location text,
  p_ack_version text
)
returns table (out_enrollment_id uuid, out_student_id uuid, out_claim_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program record;
  v_student uuid;
  v_enrollment uuid;
  v_gender text := nullif(trim(coalesce(p_gender, '')), '');
  v_name text;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_for not in ('self', 'other') then
    raise exception 'invalid participant';
  end if;
  if v_gender is not null and v_gender not in ('male', 'female', 'undisclosed') then
    raise exception 'invalid gender';
  end if;

  select id, active, self_registration, requires_acknowledgement, intended_gender
  into v_program
  from public.programs where id = p_program_id;

  if not found or not v_program.active or not v_program.self_registration then
    raise exception 'program not open for registration';
  end if;
  if v_program.requires_acknowledgement and coalesce(trim(p_ack_version), '') = '' then
    raise exception 'acknowledgement required';
  end if;
  -- a clearly mismatching choice is stopped; "undisclosed" / unknown passes to
  -- admin review
  if v_program.intended_gender is not null
     and v_gender is not null
     and v_gender <> 'undisclosed'
     and v_gender <> v_program.intended_gender then
    raise exception 'program not suitable for participant';
  end if;

  if p_for = 'self' then
    select id into v_student
    from public.students where parent_id = auth.uid() and is_self limit 1;

    if v_student is null then
      select coalesce(full_name, email) into v_name from public.users where id = auth.uid();
      insert into public.students (full_name, parent_id, user_id, program_id, active, is_self, kind, phone)
      values (
        coalesce(v_name, 'Peserta'), auth.uid(), auth.uid(), null, true, true, 'self',
        coalesce(v_phone, (select regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') from public.users where id = auth.uid()))
      )
      returning id into v_student;
    end if;

    -- participant data given now completes the profile, never blanks it
    update public.students
    set gender = coalesce(v_gender, gender),
        phone = coalesce(v_phone, phone),
        birth_date = coalesce(p_birth_date, birth_date)
    where id = v_student;
  else
    v_name := nullif(trim(coalesce(p_full_name, '')), '');
    if v_name is null or length(v_name) < 2 then
      raise exception 'participant name required';
    end if;
    if v_phone is null or length(v_phone) < 9 then
      raise exception 'participant phone required';
    end if;

    -- the same person registered again (e.g. Aquanatal after Adult Swim) is the
    -- same participant
    select id, claim_token into v_student, v_token
    from public.students
    where parent_id = auth.uid() and kind = 'adult_family' and lower(full_name) = lower(v_name)
    limit 1;

    if v_student is null then
      v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
      insert into public.students (
        full_name, parent_id, user_id, program_id, active, is_self, kind,
        gender, phone, birth_date, relationship, claim_token, claim_expires_at
      )
      values (
        v_name, auth.uid(), null, null, true, false, 'adult_family',
        v_gender, v_phone, p_birth_date, nullif(trim(coalesce(p_relationship, '')), ''),
        v_token, now() + interval '30 days'
      )
      returning id into v_student;
    else
      update public.students
      set gender = coalesce(v_gender, gender),
          phone = coalesce(v_phone, phone),
          birth_date = coalesce(p_birth_date, birth_date)
      where id = v_student;
    end if;
  end if;

  if exists (
    select 1 from public.enrollments
    where student_id = v_student and program_id = p_program_id
      and status not in ('cancelled', 'rejected')
  ) then
    raise exception 'already enrolled';
  end if;

  insert into public.enrollments (
    student_id, program_id, status, source,
    preferred_schedule, preferred_location, acknowledged_at, acknowledgement_version,
    requested_by_user_id, billing_contact_user_id, report_access_granted_to_requester
  )
  values (
    v_student, p_program_id, 'pending_review', 'self_registered',
    nullif(trim(coalesce(p_preferred_schedule, '')), ''),
    nullif(trim(coalesce(p_preferred_location, '')), ''),
    case when coalesce(trim(p_ack_version), '') = '' then null else now() end,
    nullif(trim(coalesce(p_ack_version, '')), ''),
    auth.uid(), auth.uid(),
    -- someone registering themselves can of course see their own class
    p_for = 'self'
  )
  returning id into v_enrollment;

  update public.students set program_id = coalesce(program_id, p_program_id) where id = v_student;

  return query
    select v_enrollment, v_student, (select s.claim_token from public.students s where s.id = v_student and s.user_id is null);
end;
$$;

grant execute on function public.register_enrollment(uuid, text, text, text, date, text, text, text, text, text) to authenticated;

-- ============================================================
-- 5. invitation: the participant claims their own account
-- ============================================================
create or replace function public.get_claim_info(p_token text)
returns table (participant_name text, registered_by text, program_names text[])
language sql
security definer
stable
set search_path = public
as $$
  select st.full_name,
         (select u.full_name from public.users u where u.id = st.parent_id),
         coalesce(
           (select array_agg(distinct p.name)
            from public.enrollments e join public.programs p on p.id = e.program_id
            where e.student_id = st.id and e.status not in ('cancelled', 'rejected')),
           array[]::text[]
         )
  from public.students st
  where st.claim_token = p_token
    and st.user_id is null
    and (st.claim_expires_at is null or st.claim_expires_at > now());
$$;

grant execute on function public.get_claim_info(text) to anon, authenticated;

create or replace function public.claim_participant(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  st record;
begin
  if auth.uid() is null then
    return 'not_authenticated';
  end if;

  select * into st from public.students where claim_token = p_token for update;
  if not found or st.user_id is not null
     or (st.claim_expires_at is not null and st.claim_expires_at <= now()) then
    return 'invalid';
  end if;
  -- the registering account cannot claim the participant it registered
  if st.parent_id = auth.uid() then
    return 'same_account';
  end if;

  update public.students set user_id = auth.uid(), claim_token = null where id = st.id;
  return 'claimed';
end;
$$;

grant execute on function public.claim_participant(text) to authenticated;

-- ============================================================
-- 6. participant controls
-- ============================================================
create or replace function public.set_report_access(p_enrollment_id uuid, p_allow boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return 'not_found';
  end if;
  update public.enrollments e
  set report_access_granted_to_requester = p_allow, updated_at = now()
  from public.students st
  where e.id = p_enrollment_id and st.id = e.student_id and st.user_id = auth.uid();
  if not found then
    return 'not_found';
  end if;
  return 'ok';
end;
$$;

grant execute on function public.set_report_access(uuid, boolean) to authenticated;

create or replace function public.update_participant_profile(
  p_student_id uuid,
  p_gender text,
  p_phone text,
  p_birth_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gender text := nullif(trim(coalesce(p_gender, '')), '');
begin
  if auth.uid() is null then
    return 'not_found';
  end if;
  if v_gender is not null and v_gender not in ('male', 'female', 'undisclosed') then
    return 'invalid_gender';
  end if;

  -- the participant themselves (own account, or an adult who registered
  -- themselves); a registering spouse cannot edit the other person's profile
  update public.students
  set gender = v_gender,
      phone = nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), ''),
      birth_date = p_birth_date
  where id = p_student_id
    and (user_id = auth.uid() or (is_self and parent_id = auth.uid()));
  if not found then
    return 'not_found';
  end if;
  return 'ok';
end;
$$;

grant execute on function public.update_participant_profile(uuid, text, text, date) to authenticated;

-- the child/own profile RPC must not let a registering spouse rename or change
-- the photo of an adult they registered: only the participant (own account) or
-- the parent of a child / of themselves
create or replace function public.update_own_child_profile(
  p_student_id uuid,
  p_full_name text,
  p_nickname text,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.students
    where id = p_student_id
      and (user_id = auth.uid() or (parent_id = auth.uid() and kind in ('child', 'self')))
  ) then
    raise exception 'not authorized';
  end if;

  update public.students
    set full_name = coalesce(p_full_name, full_name),
        nickname = p_nickname,
        avatar_url = p_avatar_url
    where id = p_student_id;
end;
$$;

grant execute on function public.update_own_child_profile(uuid, text, text, text) to authenticated;

-- ============================================================
-- 7. administrative actions stay with whoever registered / is the participant
--    (answering a schedule offer, withdrawing) -- independent of the consent
--    that governs schedule and report visibility
-- ============================================================
create or replace function public.enrollment_is_mine(p_enrollment_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.students st on st.id = e.student_id
    where e.id = p_enrollment_id
      and (st.parent_id = auth.uid() or st.user_id = auth.uid())
  );
$$;

grant execute on function public.enrollment_is_mine(uuid) to authenticated;

create or replace function public.respond_schedule_offer_for_me(p_enrollment_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.enrollment_is_mine(p_enrollment_id) then
    return 'not_found';
  end if;
  return public._respond_schedule_offer(p_enrollment_id, p_accept);
end;
$$;

create or replace function public.cancel_my_enrollment(p_enrollment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  if auth.uid() is null or not public.enrollment_is_mine(p_enrollment_id) then
    return 'not_found';
  end if;

  select * into e from public.enrollments where id = p_enrollment_id for update;
  if e.status not in ('pending_review', 'waiting_schedule', 'schedule_offered', 'scheduled') then
    return 'not_cancellable';
  end if;

  if e.status = 'scheduled' and e.slot_id is not null then
    delete from public.schedules where student_id = e.student_id and slot_id = e.slot_id;
  end if;

  update public.enrollments
  set status = 'cancelled', offered_slot_id = null, offer_token = null,
      offer_expires_at = null, updated_at = now()
  where id = e.id;
  return 'cancelled';
end;
$$;
