-- Pengajar can already update their own progress_reports (0001) but had no
-- way to delete a wrongly-entered one -- only admin's "for all" policy
-- covered delete. Safe to re-run.

drop policy if exists "pelatih can delete own reports" on public.progress_reports;
create policy "pelatih can delete own reports"
  on public.progress_reports for delete
  using (pelatih_id = auth.uid());
