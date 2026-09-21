-- Admin operations: activity log, schedule-conflict guards, program readiness,
-- follow-up marks and the billing threshold. Additive and safe to re-run;
-- nothing existing is removed or rewritten.

-- ============================================================
-- 1. class slots: a duration, so overlaps can be detected
-- ============================================================
alter table public.class_slots
  add column if not exists duration_minutes integer not null default 60;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'class_slots_duration_check') then
    alter table public.class_slots add constraint class_slots_duration_check
      check (duration_minutes between 15 and 240);
  end if;
end $$;

-- ============================================================
-- 2. programs: "ready to accept registrations" is an explicit switch
-- ============================================================
alter table public.programs
  add column if not exists registration_open boolean not null default false;

-- programs that are running today keep accepting registrations
update public.programs set registration_open = true where active and not registration_open;

-- ============================================================
-- 3. follow-up marks on enrollments
-- ============================================================
alter table public.enrollments
  add column if not exists followed_up_at timestamptz,
  add column if not exists followed_up_by uuid references public.users (id) on delete set null;

-- ============================================================
-- 4. billing threshold (remaining sessions at or below which a participant
--    is due for a new invoice)
-- ============================================================
insert into public.site_settings (key, value)
values ('ambang_penagihan', '2'), ('jatuh_tempo_hari', '7')
on conflict (key) do nothing;

-- ============================================================
-- 5. activity log
-- ============================================================
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references public.users (id) on delete set null,
  actor_name text,
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('insert', 'update', 'delete', 'note')),
  -- links, so a participant's or a slot's history can be read directly
  student_id uuid,
  enrollment_id uuid,
  slot_id uuid,
  invoice_id uuid,
  program_id uuid,
  -- update: {column: [before, after]}; insert/delete: the row (without secrets)
  changes jsonb not null default '{}'::jsonb,
  note text
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_student_idx on public.activity_log (student_id, created_at desc);
create index if not exists activity_log_slot_idx on public.activity_log (slot_id, created_at desc);
create index if not exists activity_log_enrollment_idx on public.activity_log (enrollment_id, created_at desc);
create index if not exists activity_log_invoice_idx on public.activity_log (invoice_id, created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "admin reads activity_log" on public.activity_log;
create policy "admin reads activity_log"
  on public.activity_log for select
  using (public.get_my_role() = 'admin');

-- app-level notes (e.g. a reminder that was sent) may be written by an admin;
-- rows produced by the triggers below bypass RLS (security definer)
drop policy if exists "admin writes activity_log" on public.activity_log;
create policy "admin writes activity_log"
  on public.activity_log for insert
  with check (public.get_my_role() = 'admin');

-- One generic trigger for every audited table. Tokens and proof links never
-- enter the log.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_noise text[] := array['updated_at', 'created_at', 'offer_token', 'offer_expires_at', 'claim_token',
                          'payment_proof_url', 'proof_submitted_at'];
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_actor uuid := auth.uid();
  v_entity uuid := nullif(v_row->>'id', '')::uuid;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> all (v_noise) and (v_old->v_key) is distinct from (v_new->v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old->v_key, v_new->v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  else
    v_changes := v_row - v_noise;
  end if;

  -- who this is about, readable later even if the row or the person is gone
  if nullif(v_row->>'student_id', '') is not null then
    v_changes := v_changes || jsonb_build_object(
      '_student', (select full_name from public.students where id = (v_row->>'student_id')::uuid)
    );
  end if;

  insert into public.activity_log (
    actor_id, actor_name, entity_type, entity_id, action,
    student_id, enrollment_id, slot_id, invoice_id, program_id, changes
  )
  values (
    v_actor,
    (select coalesce(full_name, email) from public.users where id = v_actor),
    tg_table_name,
    v_entity,
    lower(tg_op),
    case tg_table_name
      when 'students' then v_entity
      else nullif(v_row->>'student_id', '')::uuid end,
    case tg_table_name
      when 'enrollments' then v_entity
      else nullif(v_row->>'enrollment_id', '')::uuid end,
    case tg_table_name
      when 'class_slots' then v_entity
      else nullif(v_row->>'slot_id', '')::uuid end,
    case tg_table_name
      when 'invoices' then v_entity
      else null end,
    case tg_table_name
      when 'programs' then v_entity
      else nullif(v_row->>'program_id', '')::uuid end,
    v_changes
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['enrollments', 'class_slots', 'schedules', 'invoices', 'programs',
                           'program_packages', 'indicators', 'indicator_groups', 'milestones']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_activity', t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()',
        t || '_activity', t
      );
    end if;
  end loop;
end $$;

-- ============================================================
-- 6. guards for CERTAIN conflicts (the admin screens explain them first; these
--    are the backstop for every other path)
-- ============================================================
create or replace function public.guard_class_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.day_of_week is distinct from old.day_of_week
     or new.start_time is distinct from old.start_time
     or new.pelatih_id is distinct from old.pelatih_id
     or new.duration_minutes is distinct from old.duration_minutes
     or new.location is distinct from old.location
     or new.program_id is distinct from old.program_id then

    -- an identical slot already exists
    if exists (
      select 1 from public.class_slots o
      where o.id <> new.id
        and o.program_id = new.program_id
        and o.pelatih_id = new.pelatih_id
        and o.day_of_week = new.day_of_week
        and o.start_time = new.start_time
        and coalesce(o.location, '') = coalesce(new.location, '')
    ) then
      raise exception 'slot_duplicate';
    end if;

    -- a coach cannot teach two classes at overlapping times
    if exists (
      select 1 from public.class_slots o
      where o.id <> new.id
        and o.pelatih_id = new.pelatih_id
        and o.day_of_week = new.day_of_week
        and new.start_time < o.start_time + (o.duration_minutes * interval '1 minute')
        and o.start_time < new.start_time + (new.duration_minutes * interval '1 minute')
    ) then
      raise exception 'slot_conflict_pelatih';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists class_slots_guard on public.class_slots;
create trigger class_slots_guard
  before insert or update on public.class_slots
  for each row execute function public.guard_class_slot();

-- a participant cannot be in two classes at overlapping times
create or replace function public.guard_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select day_of_week, start_time, duration_minutes into s from public.class_slots where id = new.slot_id;
  if found and exists (
    select 1
    from public.schedules sc
    join public.class_slots o on o.id = sc.slot_id
    where sc.student_id = new.student_id
      and sc.slot_id <> new.slot_id
      and o.day_of_week = s.day_of_week
      and s.start_time < o.start_time + (o.duration_minutes * interval '1 minute')
      and o.start_time < s.start_time + (s.duration_minutes * interval '1 minute')
  ) then
    raise exception 'participant_conflict';
  end if;
  return new;
end;
$$;

drop trigger if exists schedules_guard on public.schedules;
create trigger schedules_guard
  before insert on public.schedules
  for each row execute function public.guard_schedule();
