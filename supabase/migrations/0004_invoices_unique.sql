-- Phase 5: prevent duplicate invoices for the same murid + period.
-- Safe to re-run.

alter table public.invoices
  drop constraint if exists invoices_student_period_unique;

alter table public.invoices
  add constraint invoices_student_period_unique
  unique (student_id, period_month, period_year);
