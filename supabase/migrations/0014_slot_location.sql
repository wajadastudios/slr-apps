-- Phase 15: custom pool/venue location per class slot.
-- Safe to re-run.

alter table public.class_slots
  add column if not exists location text;
