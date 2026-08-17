-- Phase 14: programs become addable/deactivatable (mirrors program_packages,
-- which already has an `active` column). Admin can now create brand-new
-- programs through the UI instead of only editing ones seeded via migration.
-- Safe to re-run.

alter table public.programs
  add column if not exists active boolean not null default true;
