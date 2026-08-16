-- Phase 2.5: fixed weekly timetable ("class_slots") + schedules becomes a
-- pure student <-> slot enrollment table with capacity enforcement.
-- Safe to re-run.

-- ============================================================
-- class_slots (the admin-defined timetable)
-- ============================================================
create table if not exists public.class_slots (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  pelatih_id uuid not null references public.users (id) on delete cascade,
  label text,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now()
);

alter table public.class_slots enable row level security;

drop policy if exists "authenticated can read class_slots" on public.class_slots;
create policy "authenticated can read class_slots"
  on public.class_slots for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin full access to class_slots" on public.class_slots;
create policy "admin full access to class_slots"
  on public.class_slots for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- schedules: drop the old free-form version, recreate as a pure
-- student <-> slot enrollment table (only Phase 2 test data existed).
-- ============================================================
drop table if exists public.schedules cascade;

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  slot_id uuid not null references public.class_slots (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, slot_id)
);

alter table public.schedules enable row level security;

drop policy if exists "pelatih can read own schedules" on public.schedules;
create policy "pelatih can read own schedules"
  on public.schedules for select
  using (
    exists (
      select 1 from public.class_slots cs
      where cs.id = schedules.slot_id
        and cs.pelatih_id = auth.uid()
    )
  );

drop policy if exists "ortu can read schedules for own children" on public.schedules;
create policy "ortu can read schedules for own children"
  on public.schedules for select
  using (public.parent_owns_student(schedules.student_id));

drop policy if exists "admin full access to schedules" on public.schedules;
create policy "admin full access to schedules"
  on public.schedules for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- pelatih_teaches_student(): schedules no longer has a pelatih_id
-- column directly, so this must join through class_slots now.
-- ============================================================
create or replace function public.pelatih_teaches_student(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.schedules s
    join public.class_slots cs on cs.id = s.slot_id
    where s.student_id = p_student_id and cs.pelatih_id = auth.uid()
  );
$$;
