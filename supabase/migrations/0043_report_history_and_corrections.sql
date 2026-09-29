-- Riwayat laporan lintas-pengajar, evaluasi perkembangan, dan koreksi laporan.
--
-- 1. progress_reports gets an audit trail for free by reusing the generic
--    log_activity() trigger already attached to enrollments/class_slots/etc
--    (see 0036_admin_operations.sql) -- no new columns, just one more table
--    in the tracked list. This is what powers "Riwayat perubahan" on a
--    pengajar's own edited report and the handover-date lookup on
--    class_slots (pelatih_id changes already logged there since 0036).
--
-- 2. report_corrections: the lightweight "Ajukan koreksi" action for a
--    report a pengajar can read but not edit (someone else's, per the
--    existing update/delete RLS). Modeled on substitution_requests
--    (0021_substitute_access.sql) for RLS style.

drop trigger if exists progress_reports_activity on public.progress_reports;
create trigger progress_reports_activity
  after insert or update or delete on public.progress_reports
  for each row execute function public.log_activity();

-- activity_log is admin-only by default (0036). A pengajar may read the
-- edit history of THEIR OWN reports only -- "Riwayat perubahan" on a report
-- they wrote, never another pengajar's, and never any other audited table.
drop policy if exists "pelatih reads own report history" on public.activity_log;
create policy "pelatih reads own report history"
  on public.activity_log for select
  using (
    entity_type = 'progress_reports'
    and exists (
      select 1 from public.progress_reports pr
      where pr.id = activity_log.entity_id
        and pr.pelatih_id = auth.uid()
    )
  );

-- Session quota for the "Ringkasan sebelum Anda mengajar" handover card
-- (jumlah sesi dibeli/hadir/tersisa). A pengajar has no RLS access to
-- invoices (billing is private -- only the payer and admin read it), so
-- this returns counts only, never amounts or payment status, and only for
-- an enrollment the caller actually teaches (pelatih_teaches_enrollment,
-- 0033_enrollments_and_program_assessment.sql).
create or replace function public.pelatih_session_quota(p_enrollment_id uuid)
returns table(total_sessions integer, attended integer, remaining integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(total.n, 0)::int,
    coalesce(attended.n, 0)::int,
    greatest(0, coalesce(total.n, 0) - coalesce(attended.n, 0))::int
  from
    (select sum(sessions_count) n from public.invoices where enrollment_id = p_enrollment_id and status = 'paid') total,
    (select count(distinct session_date) n from public.progress_reports where enrollment_id = p_enrollment_id and attendance = 'hadir') attended
  where public.pelatih_teaches_enrollment(p_enrollment_id);
$$;

grant execute on function public.pelatih_session_quota(uuid) to authenticated;

create table if not exists public.report_corrections (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.progress_reports (id) on delete cascade,
  reported_by uuid not null references public.users (id) on delete set null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  admin_note text,
  resolved_by uuid references public.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists report_corrections_report_idx on public.report_corrections (report_id);
create index if not exists report_corrections_status_idx on public.report_corrections (status);

alter table public.report_corrections enable row level security;

-- A pengajar may flag any report they can currently READ -- same scoping as
-- "pelatih can read own reports" on progress_reports (0033_enrollments_and_
-- program_assessment.sql): per ENROLLMENT (student + program), not merely
-- per student, so teaching a child's Aquanatal class never exposes their
-- unrelated Kids Swim reports. Filing one for your own report is harmless
-- and not worth a special case.
drop policy if exists "pelatih can flag reports of taught students" on public.report_corrections;
create policy "pelatih can flag reports of taught students"
  on public.report_corrections for insert
  with check (
    reported_by = auth.uid()
    and exists (
      select 1 from public.progress_reports pr
      where pr.id = report_corrections.report_id
        and (
          pr.pelatih_id = auth.uid()
          or (pr.enrollment_id is not null and public.pelatih_teaches_enrollment(pr.enrollment_id))
          or (pr.enrollment_id is null and public.pelatih_teaches_student(pr.student_id))
        )
    )
  );

drop policy if exists "pelatih can read own corrections" on public.report_corrections;
create policy "pelatih can read own corrections"
  on public.report_corrections for select
  using (reported_by = auth.uid());

drop policy if exists "admin full access to report_corrections" on public.report_corrections;
create policy "admin full access to report_corrections"
  on public.report_corrections for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');
