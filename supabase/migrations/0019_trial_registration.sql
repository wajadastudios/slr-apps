-- Phase 34: trial registration payment step (QRIS or manual transfer).
-- Safe to re-run.

alter table public.registrations
  add column if not exists trial_fee_status text not null default 'pending'
    check (trial_fee_status in ('pending', 'paid')),
  add column if not exists payment_method text
    check (payment_method in ('qris', 'transfer'));
