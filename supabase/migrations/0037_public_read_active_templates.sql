-- Phase 37: let the public landing page read active assessment-template
-- metadata (indicator group/indicator names, milestone names + medal
-- targets, display order) so the "#contoh-aplikasi" example cards can stop
-- guessing at names and reuse the real admin-configured template instead.
--
-- Only ACTIVE rows are exposed -- an admin draft/deactivated indicator or
-- milestone never reaches an anonymous visitor. No participant data lives
-- in these tables (performance_records/progress_reports are untouched and
-- stay authenticated-only), so this is safe to expose the same way
-- programs/class_slots/program_packages already are (see
-- 0009_public_read_fixes.sql).
--
-- Additive: these are new permissive SELECT policies alongside the existing
-- "authenticated can read ..." ones (Postgres OR's permissive policies
-- together), so admin/pengajar/orang tua access to inactive rows for
-- editing/history is unchanged.
-- Safe to re-run.

drop policy if exists "anyone can read active indicator_groups" on public.indicator_groups;
create policy "anyone can read active indicator_groups"
  on public.indicator_groups for select
  using (active = true);

drop policy if exists "anyone can read active indicators" on public.indicators;
create policy "anyone can read active indicators"
  on public.indicators for select
  using (active = true);

drop policy if exists "anyone can read active milestones" on public.milestones;
create policy "anyone can read active milestones"
  on public.milestones for select
  using (active = true);
