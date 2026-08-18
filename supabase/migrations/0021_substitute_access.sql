-- Phase 35: pengajar pengganti (substitute teacher) access.
--
-- Three problems this fixes, all surfaced by the substitute question:
--   1. A substitute had no way to gain access to a student at all.
--   2. progress_reports SELECT was "pelatih_id = auth.uid()", so a pengajar
--      could not read reports written by anyone else -- even for their own
--      students. That made next_focus (rekomendasi fokus sesi berikutnya)
--      unreadable by the next coach, defeating its purpose.
--   3. progress_reports INSERT only checked the report was self-attributed,
--      never that the author actually teaches the student.
--
-- Plus a data-loss fix: progress_reports.pelatih_id was ON DELETE CASCADE,
-- so deleting a resigned pengajar destroyed every report they ever wrote,
-- including reports for still-active students.
--
-- Safe to re-run.

-- ============================================================
-- substitution_requests
-- ============================================================
create table if not exists public.substitution_requests (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.class_slots (id) on delete cascade,
  requester_id uuid not null references public.users (id) on delete cascade,
  session_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approval_token text not null unique,
  token_expires_at timestamptz not null,
  -- Stored rather than derived from session_date so that changing the
  -- 7-day rule later does not retroactively alter grants already given.
  access_until date,
  approved_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists substitution_requests_requester_idx
  on public.substitution_requests (requester_id);
create index if not exists substitution_requests_slot_idx
  on public.substitution_requests (slot_id);

alter table public.substitution_requests enable row level security;

drop policy if exists "pelatih can create own substitution requests" on public.substitution_requests;
create policy "pelatih can create own substitution requests"
  on public.substitution_requests for insert
  with check (requester_id = auth.uid() and public.get_my_role() = 'pelatih');

-- Readable by the requester and by the pengajar being replaced. This also
-- doubles as the authorization check for the approval page: if you cannot
-- read the request, you are not entitled to decide it.
drop policy if exists "involved parties can read substitution requests" on public.substitution_requests;
create policy "involved parties can read substitution requests"
  on public.substitution_requests for select
  using (
    requester_id = auth.uid()
    or exists (
      select 1 from public.class_slots cs
      where cs.id = substitution_requests.slot_id
        and cs.pelatih_id = auth.uid()
    )
  );

drop policy if exists "slot owner can decide substitution requests" on public.substitution_requests;
create policy "slot owner can decide substitution requests"
  on public.substitution_requests for update
  using (
    exists (
      select 1 from public.class_slots cs
      where cs.id = substitution_requests.slot_id
        and cs.pelatih_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.class_slots cs
      where cs.id = substitution_requests.slot_id
        and cs.pelatih_id = auth.uid()
    )
  );

drop policy if exists "admin full access to substitution_requests" on public.substitution_requests;
create policy "admin full access to substitution_requests"
  on public.substitution_requests for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- Access helpers
--
-- security definer so policies can call them without the subquery
-- re-entering RLS on schedules / class_slots / substitution_requests.
-- ============================================================
create or replace function public.has_approved_substitution(p_slot_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.substitution_requests sr
    where sr.slot_id = p_slot_id
      and sr.requester_id = auth.uid()
      and sr.status = 'approved'
      and sr.access_until is not null
      and current_date <= sr.access_until
  );
$$;

grant execute on function public.has_approved_substitution(uuid) to authenticated;

-- Assigned pengajar OR an approved, unexpired substitute. Extending this
-- one function is what grants substitutes access to students, and through
-- the students policy, to everything downstream.
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
  )
  or exists (
    select 1
    from public.schedules s
    join public.substitution_requests sr on sr.slot_id = s.slot_id
    where s.student_id = p_student_id
      and sr.requester_id = auth.uid()
      and sr.status = 'approved'
      and sr.access_until is not null
      and current_date <= sr.access_until
  );
$$;

-- ============================================================
-- schedules: a substitute must be able to list the students enrolled
-- in the slot they are covering.
-- ============================================================
drop policy if exists "pelatih can read own schedules" on public.schedules;
create policy "pelatih can read own schedules"
  on public.schedules for select
  using (
    exists (
      select 1 from public.class_slots cs
      where cs.id = schedules.slot_id
        and cs.pelatih_id = auth.uid()
    )
    or public.has_approved_substitution(schedules.slot_id)
  );

-- ============================================================
-- progress_reports: loosen read, tighten write
-- ============================================================
drop policy if exists "pelatih can read own reports" on public.progress_reports;
create policy "pelatih can read own reports"
  on public.progress_reports for select
  using (
    pelatih_id = auth.uid()
    or public.pelatih_teaches_student(progress_reports.student_id)
  );

drop policy if exists "pelatih can insert own reports" on public.progress_reports;
create policy "pelatih can insert own reports"
  on public.progress_reports for insert
  with check (
    pelatih_id = auth.uid()
    and public.pelatih_teaches_student(student_id)
  );

-- Snapshot of the replaced pengajar's name, same convention as
-- invoices.package_name: avoids a join everywhere ReportHistoryCard is
-- rendered, and survives the original pengajar being renamed or removed.
alter table public.progress_reports
  add column if not exists substitute_for text;

-- Data-loss fix: never destroy a student's history when an account goes.
alter table public.progress_reports
  alter column pelatih_id drop not null;

alter table public.progress_reports
  drop constraint if exists progress_reports_pelatih_id_fkey;

alter table public.progress_reports
  add constraint progress_reports_pelatih_id_fkey
  foreign key (pelatih_id) references public.users (id)
  on delete set null;

-- ============================================================
-- users.active -- deactivate a resigned pengajar instead of deleting,
-- so their reports keep their attribution.
-- ============================================================
alter table public.users
  add column if not exists active boolean not null default true;
