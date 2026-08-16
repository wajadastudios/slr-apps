-- Phase 10: landing page redesign to match the user's Figma reference.
-- Safe to re-run.

alter table public.testimonials
  add column if not exists rating smallint check (rating between 1 and 5);

alter table public.programs
  add column if not exists badge text;

insert into public.site_settings (key, value) values
  ('stat_families', ''),
  ('stat_years', ''),
  ('stat_trainers', ''),
  ('stat_rating', ''),
  ('about_text', '')
on conflict (key) do nothing;
