-- Phase 9: fix RLS gaps found while planning the landing page polish.
-- programs/class_slots/program_packages were only ever readable by
-- `authenticated` sessions, never by real anonymous visitors -- meaning
-- the public landing page's program list and the /daftar registration
-- form's program dropdown have been silently empty for anyone who
-- isn't already logged in. Matches the public-read shape already used
-- correctly for testimonials/gallery_items/site_settings.
-- Safe to re-run.

drop policy if exists "authenticated can read programs" on public.programs;
create policy "anyone can read programs"
  on public.programs for select
  using (true);

drop policy if exists "authenticated can read class_slots" on public.class_slots;
create policy "anyone can read class_slots"
  on public.class_slots for select
  using (true);

drop policy if exists "authenticated can read program_packages" on public.program_packages;
create policy "anyone can read program_packages"
  on public.program_packages for select
  using (true);

-- Aggregate-only slot capacity for the public landing page. `schedules`
-- itself stays role-restricted (it links to specific children), so this
-- exposes counts only -- never which student fills a slot.
create or replace function public.get_slot_availability()
returns table (slot_id uuid, filled bigint)
language sql
security definer
stable
set search_path = public
as $$
  select schedules.slot_id, count(*) as filled
  from public.schedules
  group by schedules.slot_id;
$$;

grant execute on function public.get_slot_availability() to anon, authenticated;
