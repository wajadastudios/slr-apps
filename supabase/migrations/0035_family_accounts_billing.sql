-- One family account, many participants, one payer per invoice.
--
--   users        = login accounts
--   students     = PARTICIPANTS (children, adults, spouses...). parent_id = the
--                  family account that manages them, user_id = the
--                  participant's OWN account (once claimed)
--   enrollments  = participant + program. Now also records WHO PAYS
--                  (billing_mode + billing_contact_user_id) and what the
--                  registrant asked for regarding report access
--   invoices     = tied to an enrollment and to exactly ONE billing account
--                  (billing_account_id, NOT NULL). Only that account can see or
--                  pay it; everyone else gets a summary through
--                  enrollment_billing() / invoice_summaries()
--
-- Additive and safe to re-run.

-- ============================================================
-- 1. programs: who a program is meant for (child vs adult flow)
-- ============================================================
alter table public.programs add column if not exists audience text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'programs_audience_check') then
    alter table public.programs add constraint programs_audience_check
      check (audience is null or audience in ('child', 'adult', 'all'));
  end if;
end $$;
update public.programs
set audience = case when self_registration then 'adult' else 'child' end
where audience is null;
alter table public.programs alter column audience set default 'child';
alter table public.programs alter column audience set not null;

-- ============================================================
-- 2. enrollments: payer + report-access request
-- ============================================================
alter table public.enrollments
  add column if not exists billing_mode text not null default 'requester',
  add column if not exists report_access_requested boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'enrollments_billing_mode_check') then
    alter table public.enrollments add constraint enrollments_billing_mode_check
      check (billing_mode in ('requester', 'participant'));
  end if;
end $$;

-- every enrollment has an owner: legacy flows (add child, admin schedule
-- assignment) do not set one, so it defaults to the family account
create or replace function public.enrollment_default_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_user uuid;
begin
  select parent_id, user_id into v_parent, v_user from public.students where id = new.student_id;
  new.requested_by_user_id := coalesce(new.requested_by_user_id, v_parent);
  if new.billing_mode = 'participant' then
    new.billing_contact_user_id := coalesce(new.billing_contact_user_id, v_user);
  else
    new.billing_contact_user_id := coalesce(new.billing_contact_user_id, v_parent);
  end if;
  return new;
end;
$$;

drop trigger if exists enrollments_default_owner on public.enrollments;
create trigger enrollments_default_owner
  before insert on public.enrollments
  for each row execute function public.enrollment_default_owner();

-- ============================================================
-- 3. invoices: exactly one billing account
-- ============================================================
alter table public.invoices
  add column if not exists billing_account_id uuid references public.users (id) on delete cascade,
  add column if not exists enrollment_id uuid references public.enrollments (id) on delete set null;

-- existing invoices were always the parent's
update public.invoices i
set billing_account_id = st.parent_id
from public.students st
where st.id = i.student_id and i.billing_account_id is null;

update public.invoices i
set enrollment_id = (
  select e.id
  from public.enrollments e
  left join public.program_packages pp on pp.id = i.program_package_id
  where e.student_id = i.student_id
    and (pp.program_id is null or e.program_id = pp.program_id)
  order by (e.status not in ('cancelled', 'rejected')) desc, e.created_at
  limit 1
)
where i.enrollment_id is null;

alter table public.invoices alter column billing_account_id set not null;

create index if not exists invoices_billing_account_idx on public.invoices (billing_account_id);
create index if not exists invoices_enrollment_idx on public.invoices (enrollment_id);

-- a new invoice is tied to the enrollment of its package's program and to that
-- enrollment's payer; it can never be created without one
create or replace function public.set_invoice_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_program uuid;
  e record;
begin
  select parent_id into v_parent from public.students where id = new.student_id;

  if new.enrollment_id is null then
    select program_id into v_program from public.program_packages where id = new.program_package_id;
    select id into new.enrollment_id
    from public.enrollments
    where student_id = new.student_id
      and status not in ('cancelled', 'rejected')
      and (v_program is null or program_id = v_program)
    order by created_at
    limit 1;
  end if;

  if new.billing_account_id is null then
    if new.enrollment_id is not null then
      select billing_mode, billing_contact_user_id into e from public.enrollments where id = new.enrollment_id;
      if e.billing_mode = 'participant' and e.billing_contact_user_id is null then
        raise exception 'billing account not ready';
      end if;
      new.billing_account_id := coalesce(e.billing_contact_user_id, v_parent);
    else
      new.billing_account_id := v_parent;
    end if;
  end if;

  if new.billing_account_id is null then
    raise exception 'billing account required';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_set_owner on public.invoices;
create trigger invoices_set_owner
  before insert on public.invoices
  for each row execute function public.set_invoice_owner();

-- only the billing account sees / pays an invoice
drop policy if exists "ortu can read own invoices" on public.invoices;
create policy "ortu can read own invoices"
  on public.invoices for select
  using (
    billing_account_id = auth.uid()
    and status in ('sent', 'processing', 'paid')
  );

create or replace function public.submit_invoice_payment_proof(
  p_invoice_id uuid,
  p_payment_method text,
  p_proof_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_payment_method not in ('qris', 'transfer') then
    raise exception 'invalid payment method';
  end if;

  update public.invoices i
    set payment_method = p_payment_method,
        payment_proof_url = p_proof_url,
        proof_submitted_at = now(),
        status = 'processing'
    where i.id = p_invoice_id
      and i.billing_account_id = auth.uid()
      and i.status = 'sent';

  if not found then
    raise exception 'not authorized or invoice not awaiting payment';
  end if;
end;
$$;

grant execute on function public.submit_invoice_payment_proof(uuid, text, text) to authenticated;

-- ============================================================
-- 4. what a NON-payer may know: who pays and whether it is settled.
--    No amount, no invoice id, no payment link.
-- ============================================================
create or replace function public.enrollment_billing()
returns table (
  out_enrollment_id uuid,
  out_student_id uuid,
  out_payer_name text,
  out_is_payer boolean,
  out_payer_pending boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select e.id,
         e.student_id,
         u.full_name,
         coalesce(e.billing_contact_user_id, st.parent_id) = auth.uid(),
         (e.billing_mode = 'participant' and e.billing_contact_user_id is null)
  from public.enrollments e
  join public.students st on st.id = e.student_id
  left join public.users u on u.id = coalesce(e.billing_contact_user_id, st.parent_id)
  where auth.uid() is not null
    and (st.parent_id = auth.uid() or st.user_id = auth.uid());
$$;

grant execute on function public.enrollment_billing() to authenticated;

create or replace function public.invoice_summaries()
returns table (
  out_invoice_id uuid,
  out_student_id uuid,
  out_enrollment_id uuid,
  out_status text,
  out_sessions_count integer,
  out_package_name text,
  out_created_at timestamptz,
  out_is_payer boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select case when i.billing_account_id = auth.uid() then i.id end,
         i.student_id,
         i.enrollment_id,
         i.status,
         i.sessions_count,
         i.package_name,
         i.created_at,
         i.billing_account_id = auth.uid()
  from public.invoices i
  join public.students st on st.id = i.student_id
  where auth.uid() is not null
    and i.status in ('sent', 'processing', 'paid')
    and (st.parent_id = auth.uid() or st.user_id = auth.uid() or i.billing_account_id = auth.uid());
$$;

grant execute on function public.invoice_summaries() to authenticated;

-- ============================================================
-- 5. registration: account access, payer and report access
-- ============================================================
drop function if exists public.register_enrollment(uuid, text, text, text, date, text, text, text, text, text);

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
  p_ack_version text,
  p_account_mode text default 'own',      -- 'family' (stay in this account) | 'own' (participant gets an account)
  p_billing text default 'requester',     -- 'requester' | 'participant'
  p_report_access text default 'participant' -- 'family' (requester sees reports) | 'participant'
)
returns table (out_enrollment_id uuid, out_student_id uuid, out_claim_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program record;
  v_student uuid;
  v_student_user uuid;
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
  if p_account_mode not in ('family', 'own') or p_billing not in ('requester', 'participant')
     or p_report_access not in ('family', 'participant') then
    raise exception 'invalid access option';
  end if;
  if v_gender is not null and v_gender not in ('male', 'female', 'undisclosed') then
    raise exception 'invalid gender';
  end if;
  -- a participant who stays in the family account has no account of their own
  -- to pay from or to keep reports in
  if p_for = 'other' and p_account_mode = 'family'
     and (p_billing = 'participant' or p_report_access = 'participant') then
    raise exception 'participant account required';
  end if;

  select id, active, self_registration, requires_acknowledgement, intended_gender, audience
  into v_program
  from public.programs where id = p_program_id;

  if not found or not v_program.active or not v_program.self_registration
     or v_program.audience not in ('adult', 'all') then
    raise exception 'program not open for registration';
  end if;
  if v_program.requires_acknowledgement and coalesce(trim(p_ack_version), '') = '' then
    raise exception 'acknowledgement required';
  end if;
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

    update public.students
    set gender = coalesce(v_gender, gender),
        phone = coalesce(v_phone, phone),
        birth_date = coalesce(p_birth_date, birth_date)
    where id = v_student;
    v_student_user := auth.uid();
  else
    v_name := nullif(trim(coalesce(p_full_name, '')), '');
    if v_name is null or length(v_name) < 2 then
      raise exception 'participant name required';
    end if;
    if v_phone is null or length(v_phone) < 9 then
      raise exception 'participant phone required';
    end if;

    -- the same person registered again (e.g. Aquanatal after Adult Swim) is the
    -- same participant: never a duplicate
    select id, claim_token, user_id into v_student, v_token, v_student_user
    from public.students
    where parent_id = auth.uid() and kind = 'adult_family' and lower(full_name) = lower(v_name)
    limit 1;

    if v_student is null then
      if p_account_mode = 'own' then
        v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
      end if;
      insert into public.students (
        full_name, parent_id, user_id, program_id, active, is_self, kind,
        gender, phone, birth_date, relationship, claim_token, claim_expires_at
      )
      values (
        v_name, auth.uid(), null, null, true, false, 'adult_family',
        v_gender, v_phone, p_birth_date, nullif(trim(coalesce(p_relationship, '')), ''),
        v_token, case when v_token is null then null else now() + interval '30 days' end
      )
      returning id into v_student;
    else
      update public.students
      set gender = coalesce(v_gender, gender),
          phone = coalesce(v_phone, phone),
          birth_date = coalesce(p_birth_date, birth_date),
          -- an invitation asked for now, for a participant without one yet
          claim_token = case
            when p_account_mode = 'own' and user_id is null and claim_token is null
              then replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
            else claim_token end,
          claim_expires_at = case
            when p_account_mode = 'own' and user_id is null and claim_token is null
              then now() + interval '30 days'
            else claim_expires_at end
      where id = v_student
      returning claim_token into v_token;
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
    requested_by_user_id, billing_mode, billing_contact_user_id,
    report_access_granted_to_requester, report_access_requested
  )
  values (
    v_student, p_program_id, 'pending_review', 'self_registered',
    nullif(trim(coalesce(p_preferred_schedule, '')), ''),
    nullif(trim(coalesce(p_preferred_location, '')), ''),
    case when coalesce(trim(p_ack_version), '') = '' then null else now() end,
    nullif(trim(coalesce(p_ack_version, '')), ''),
    auth.uid(),
    case when p_for = 'other' then p_billing else 'requester' end,
    case when p_for = 'other' and p_billing = 'participant' then v_student_user else auth.uid() end,
    -- registering yourself, or someone who stays inside this family account:
    -- the reports are yours. For a participant with their own account it is
    -- only ever the participant who grants it (on claiming, or in settings).
    (p_for = 'self') or (p_account_mode = 'family' and v_student_user is null),
    p_for = 'other' and p_report_access = 'family'
  )
  returning id into v_enrollment;

  update public.students set program_id = coalesce(program_id, p_program_id) where id = v_student;

  return query
    select v_enrollment, v_student,
           (select s.claim_token from public.students s where s.id = v_student and s.user_id is null and p_account_mode = 'own');
end;
$$;

grant execute on function public.register_enrollment(uuid, text, text, text, date, text, text, text, text, text, text, text, text) to authenticated;

-- ============================================================
-- 6. child registration: an existing child or a new one, one program slot
-- ============================================================
create or replace function public.register_child_enrollment(
  p_student_id uuid,
  p_full_name text,
  p_birth_date date,
  p_slot_id uuid
)
returns table (out_enrollment_id uuid, out_student_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot record;
  v_program record;
  v_student uuid := p_student_id;
  v_filled integer;
  v_enrollment uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id, program_id, capacity into v_slot from public.class_slots where id = p_slot_id;
  if not found then
    raise exception 'slot not found';
  end if;

  select id, active, audience into v_program from public.programs where id = v_slot.program_id;
  if not found or not v_program.active or v_program.audience not in ('child', 'all') then
    raise exception 'program not open for registration';
  end if;

  if v_student is null then
    if nullif(trim(coalesce(p_full_name, '')), '') is null then
      raise exception 'child name required';
    end if;
    insert into public.students (full_name, birth_date, parent_id, program_id, active, kind)
    values (trim(p_full_name), p_birth_date, auth.uid(), v_slot.program_id, true, 'child')
    returning id into v_student;
  else
    if not exists (
      select 1 from public.students
      where id = v_student and parent_id = auth.uid() and kind = 'child'
    ) then
      raise exception 'not authorized';
    end if;
    if exists (
      select 1 from public.enrollments
      where student_id = v_student and program_id = v_slot.program_id
        and status not in ('cancelled', 'rejected')
    ) then
      raise exception 'already enrolled';
    end if;
  end if;

  insert into public.schedules (student_id, slot_id) values (v_student, p_slot_id);

  -- checked after the insert so a last-seat race rolls the whole thing back
  select count(*) into v_filled from public.schedules where slot_id = p_slot_id;
  if v_filled > v_slot.capacity then
    raise exception 'slot is full';
  end if;

  select id into v_enrollment
  from public.enrollments
  where student_id = v_student and program_id = v_slot.program_id
    and status not in ('cancelled', 'rejected')
  limit 1;

  return query select v_enrollment, v_student;
end;
$$;

grant execute on function public.register_child_enrollment(uuid, text, date, uuid) to authenticated;

-- ============================================================
-- 7. claiming: the participant decides what the family account sees
-- ============================================================
drop function if exists public.claim_participant(text);

create or replace function public.claim_participant(p_token text, p_share_reports boolean default false)
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
  if st.parent_id = auth.uid() then
    return 'same_account';
  end if;

  update public.students set user_id = auth.uid(), claim_token = null where id = st.id;

  -- what the family account may see follows the participant's own answer;
  -- enrollments that were to be paid by the participant now have a payer
  update public.enrollments
  set report_access_granted_to_requester = coalesce(p_share_reports, false),
      billing_contact_user_id = case when billing_mode = 'participant' then auth.uid() else billing_contact_user_id end,
      updated_at = now()
  where student_id = st.id;

  return 'claimed';
end;
$$;

grant execute on function public.claim_participant(text, boolean) to authenticated;

-- claim page: what the registrant asked for
drop function if exists public.get_claim_info(text);
create or replace function public.get_claim_info(p_token text)
returns table (
  participant_name text,
  registered_by text,
  program_names text[],
  wants_report_access boolean,
  participant_pays boolean
)
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
         ),
         exists (select 1 from public.enrollments e where e.student_id = st.id and e.report_access_requested),
         exists (select 1 from public.enrollments e where e.student_id = st.id and e.billing_mode = 'participant')
  from public.students st
  where st.claim_token = p_token
    and st.user_id is null
    and (st.claim_expires_at is null or st.claim_expires_at > now());
$$;

grant execute on function public.get_claim_info(text) to anon, authenticated;

-- a participant registered "inside the family account" can be invited later
create or replace function public.invite_participant(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    return null;
  end if;
  update public.students
  set claim_token = coalesce(claim_token, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
      claim_expires_at = now() + interval '30 days'
  where id = p_student_id
    and parent_id = auth.uid()
    and kind = 'adult_family'
    and user_id is null
  returning claim_token into v_token;
  return v_token;
end;
$$;

grant execute on function public.invite_participant(uuid) to authenticated;
