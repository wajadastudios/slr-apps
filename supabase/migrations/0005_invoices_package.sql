-- Phase 5.5: bill per package of 4 attended sessions instead of per
-- calendar month (attendance-based, not date-based, so izin/sakit
-- doesn't push a student's next invoice out of sync with the calendar).
-- Safe to re-run.

alter table public.invoices
  drop constraint if exists invoices_student_period_unique;

alter table public.invoices
  add column if not exists package_number integer;

update public.invoices
  set package_number = 1
  where package_number is null;

alter table public.invoices
  alter column package_number set not null;

alter table public.invoices
  drop column if exists period_month;

alter table public.invoices
  drop column if exists period_year;

alter table public.invoices
  drop constraint if exists invoices_student_package_unique;

alter table public.invoices
  add constraint invoices_student_package_unique
  unique (student_id, package_number);
