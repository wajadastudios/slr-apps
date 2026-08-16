-- Phase 7: sequential, human-readable invoice numbers, assigned at
-- send time (draft invoices don't get one yet — not official).
-- Safe to re-run.

create sequence if not exists public.invoice_number_seq;

alter table public.invoices
  add column if not exists invoice_number text unique;

-- PostgREST can't call nextval() on a bare sequence directly, so this
-- wraps it in a callable, RPC-exposed function.
create or replace function public.next_invoice_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0');
$$;

grant execute on function public.next_invoice_number() to authenticated;
