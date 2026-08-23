-- Quantitative progress evidence (time, distance, breath-hold, treading
-- water) alongside the existing qualitative skill scores in
-- progress_reports.scores. Modeled after the same RLS pattern as
-- progress_reports (see 0021_substitute_access.sql for pelatih_teaches_student).

create table public.performance_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  progress_report_id uuid references public.progress_reports (id) on delete set null,
  pelatih_id uuid references public.users (id) on delete set null,
  metric_type text not null check (
    metric_type in ('waktu_tempuh', 'jarak_tempuh', 'tahan_nafas', 'treading_water')
  ),
  stroke text check (stroke is null or stroke in ('Bebas', 'Dada', 'Punggung', 'Kupu-kupu')),
  -- waktu_tempuh: distance_m = target jarak, duration_seconds = waktu tempuh
  -- jarak_tempuh: distance_m = jarak tercapai, duration_seconds null
  -- tahan_nafas / treading_water: duration_seconds = durasi, distance_m null
  distance_m numeric check (distance_m is null or distance_m > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds > 0),
  recorded_at date not null default current_date,
  created_at timestamptz not null default now(),
  check (distance_m is not null or duration_seconds is not null)
);

create index performance_records_student_idx
  on public.performance_records (student_id, metric_type, stroke, distance_m);

alter table public.performance_records enable row level security;

drop policy if exists "pelatih can read accessible records" on public.performance_records;
create policy "pelatih can read accessible records"
  on public.performance_records for select
  using (
    pelatih_id = auth.uid()
    or public.pelatih_teaches_student(performance_records.student_id)
  );

drop policy if exists "pelatih can insert own records" on public.performance_records;
create policy "pelatih can insert own records"
  on public.performance_records for insert
  with check (
    pelatih_id = auth.uid()
    and public.pelatih_teaches_student(student_id)
  );

drop policy if exists "ortu can read records for own children" on public.performance_records;
create policy "ortu can read records for own children"
  on public.performance_records for select
  using (
    exists (
      select 1 from public.students st
      where st.id = performance_records.student_id
        and st.parent_id = auth.uid()
    )
  );

drop policy if exists "admin full access to performance_records" on public.performance_records;
create policy "admin full access to performance_records"
  on public.performance_records for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');
