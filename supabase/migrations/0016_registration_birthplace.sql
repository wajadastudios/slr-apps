-- Phase 20: capture birthplace/birthdate on registration for a real
-- customer database, and carry birthplace through to students.
-- Safe to re-run.

alter table public.registrations
  add column if not exists birth_place text,
  add column if not exists birth_date date;

alter table public.students
  add column if not exists birth_place text;
