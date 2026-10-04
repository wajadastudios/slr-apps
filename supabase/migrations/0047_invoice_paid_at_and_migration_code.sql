-- Billing history migration from Excel (scripts/billing-migration/).
--
--   paid_at         when an invoice was actually paid. Migrated invoices keep
--                   their original payment date; from now on "tandai lunas"
--                   records it too. Cash flow uses it as the income date.
--   migration_code  "Kode Migrasi" from the Excel template. Unique, so the
--                   import can be re-run without ever creating a duplicate.
--   price_source    gains 'migration' for invoices created by the import.
--
-- Idempotent: safe to run more than once.

alter table public.invoices
  add column if not exists paid_at timestamptz,
  add column if not exists migration_code text;

create unique index if not exists invoices_migration_code_unique
  on public.invoices (migration_code)
  where migration_code is not null;

alter table public.invoices drop constraint if exists invoices_price_source_check;
alter table public.invoices
  add constraint invoices_price_source_check
  check (price_source in ('package', 'enrollment_lock', 'override', 'migration'));
