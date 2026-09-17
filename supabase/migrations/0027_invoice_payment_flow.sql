-- Phase: self-service invoice payment (QRIS/transfer + proof upload),
-- mirroring the trial-fee flow but with a genuine admin-verification step
-- in between: uploading proof moves the invoice to 'processing', not
-- straight to 'paid' -- admin still confirms via markPaidAction.
-- Safe to re-run.

-- The original status check constraint was declared inline without an
-- explicit name, so its auto-generated name isn't guaranteed here; find
-- and drop whatever it actually is rather than guessing.
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.invoices'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if con_name is not null then
    execute format('alter table public.invoices drop constraint %I', con_name);
  end if;
end $$;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'approved', 'sent', 'processing', 'paid'));

alter table public.invoices
  add column if not exists payment_method text
    check (payment_method in ('qris', 'transfer')),
  add column if not exists payment_proof_url text,
  add column if not exists proof_submitted_at timestamptz;

-- Parents need to see their own invoice while it's awaiting verification,
-- not just before/after.
drop policy if exists "ortu can read own invoices" on public.invoices;
create policy "ortu can read own invoices"
  on public.invoices for select
  using (
    exists (
      select 1 from public.students st
      where st.id = invoices.student_id
        and st.parent_id = auth.uid()
    )
    and status in ('sent', 'processing', 'paid')
  );

-- Narrow security-definer RPC (same convention as update_own_profile /
-- update_own_child_profile in 0012): a parent can only move their own
-- invoice from 'sent' to 'processing' and attach proof -- never touch
-- amount, status transitions to 'paid', or anyone else's invoice.
create or replace function public.submit_invoice_payment_proof(
  p_invoice_id uuid,
  p_payment_method text,
  p_proof_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_payment_method not in ('qris', 'transfer') then
    raise exception 'invalid payment method';
  end if;

  update public.invoices i
    set payment_method = p_payment_method,
        payment_proof_url = p_proof_url,
        proof_submitted_at = now(),
        status = 'processing'
    from public.students st
    where i.id = p_invoice_id
      and st.id = i.student_id
      and st.parent_id = auth.uid()
      and i.status = 'sent';

  if not found then
    raise exception 'not authorized or invoice not awaiting payment';
  end if;
end;
$$;

grant execute on function public.submit_invoice_payment_proof(uuid, text, text) to authenticated;
