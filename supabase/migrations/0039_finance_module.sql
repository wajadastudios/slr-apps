-- Fondasi modul Keuangan & Pajak-Ready.
--
-- Prinsip (dari spesifikasi admin):
--   * Semua angka pajak berlabel estimasi internal -- tidak ada SPT/e-Faktur/
--     bukti potong/pembayaran pajak sungguhan dibuat di sini.
--   * Tarif pajak TIDAK di-hardcode: tax_settings kosong secara default,
--     Admin yang mengisi, setiap baris punya tanggal berlaku dan status
--     "perlu dikonfirmasi akuntan".
--   * Invoice/tagihan lama tidak pernah berubah karena pengaturan pajak/
--     harga baru -- lihat 0038_price_versioning.sql untuk prinsip yang sama
--     pada harga; modul ini menambah lapisan pajak/kas di atasnya tanpa
--     menyentuh invoices sama sekali.
--   * Setiap transaksi final (cash flow tercatat, biaya dibayar, gaji
--     dibayar) adalah snapshot -- perubahan berikutnya adalah baris/status
--     baru, bukan overwrite, dan tercatat di activity_log (trigger generik
--     yang sama dari 0036_admin_operations.sql).
--
-- Additive dan aman dijalankan ulang.

-- ============================================================
-- 1. cash_flow_entries -- buku kas
-- ============================================================
create table if not exists public.cash_flow_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  direction text not null check (direction in ('masuk', 'keluar')),
  category text not null check (
    category in (
      'pembayaran_murid', 'refund', 'gaji_pengajar', 'sewa_lokasi',
      'perlengkapan', 'marketing', 'operasional', 'pajak', 'lainnya'
    )
  ),
  amount numeric(14, 2) not null check (amount >= 0),
  payment_method text,
  -- referensi opsional ke sumber transaksi -- diisi otomatis oleh sinkronisasi
  -- invoice/gaji/biaya, kosong untuk entri manual (mis. refund, sewa).
  invoice_id uuid references public.invoices (id) on delete set null,
  payroll_payment_id uuid references public.payroll_payments (id) on delete set null,
  -- FK to operational_expenses added further below (section 2), once that
  -- table exists -- it is created after this one in this same file.
  expense_id uuid,
  -- program/lokasi disalin (snapshot) saat entri dibuat, bukan di-join live,
  -- supaya laporan periode lama tetap konsisten walau data induk berubah.
  program_id uuid references public.programs (id) on delete set null,
  location text,
  note text,
  attachment_url text,
  status text not null default 'tercatat' check (
    status in ('draft', 'tercatat', 'dibayar', 'dibatalkan')
  ),
  cancelled_reason text,
  is_test boolean not null default false,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- satu entri kas per invoice/gaji/biaya -- sinkronisasi ulang tidak pernah
-- menduplikasi (di-cek lewat "on conflict do nothing" di kode aplikasi, index
-- ini adalah jaring pengamannya di level database).
create unique index if not exists cash_flow_entries_invoice_unique
  on public.cash_flow_entries (invoice_id) where invoice_id is not null;
create unique index if not exists cash_flow_entries_payroll_unique
  on public.cash_flow_entries (payroll_payment_id) where payroll_payment_id is not null;
create unique index if not exists cash_flow_entries_expense_unique
  on public.cash_flow_entries (expense_id) where expense_id is not null;

create index if not exists cash_flow_entries_date_idx on public.cash_flow_entries (entry_date desc);
create index if not exists cash_flow_entries_category_idx on public.cash_flow_entries (category);

alter table public.cash_flow_entries enable row level security;

drop policy if exists "admin full access to cash_flow_entries" on public.cash_flow_entries;
create policy "admin full access to cash_flow_entries"
  on public.cash_flow_entries for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- 2. operational_expenses -- biaya operasional (input manual admin)
-- ============================================================
create table if not exists public.operational_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (
    category in (
      'sewa_lokasi', 'perlengkapan', 'marketing', 'operasional', 'pajak', 'lainnya'
    )
  ),
  amount numeric(14, 2) not null check (amount >= 0),
  expense_date date not null default current_date,
  program_id uuid references public.programs (id) on delete set null,
  location text,
  vendor text,
  reference_number text,
  attachment_url text,
  note text,
  payment_status text not null default 'belum_dibayar' check (
    payment_status in ('belum_dibayar', 'dibayar', 'dibatalkan')
  ),
  payment_method text,
  cancelled_reason text,
  paid_at timestamptz,
  is_test boolean not null default false,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists operational_expenses_date_idx on public.operational_expenses (expense_date desc);
create index if not exists operational_expenses_status_idx on public.operational_expenses (payment_status);

alter table public.operational_expenses enable row level security;

drop policy if exists "admin full access to operational_expenses" on public.operational_expenses;
create policy "admin full access to operational_expenses"
  on public.operational_expenses for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- now that operational_expenses exists, point cash_flow_entries.expense_id
-- at it for real (the column above was declared before this table existed
-- in file order, but the FK constraint itself is added here to avoid a
-- forward reference inside one CREATE TABLE statement).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cash_flow_entries_expense_id_fkey'
  ) then
    alter table public.cash_flow_entries
      add constraint cash_flow_entries_expense_id_fkey
      foreign key (expense_id) references public.operational_expenses (id) on delete set null;
  end if;
end $$;

-- ============================================================
-- 3. payroll_payments -- perluas jadi draft/disetujui/dibayar/dibatalkan
--    (tabel dan rate versioning sudah ada sejak 0022_payroll.sql; baris lama
--    di sana sudah merupakan gaji yang benar-benar dibayar, jadi backfill
--    status = 'dibayar' lewat DEFAULT pada ADD COLUMN di bawah adalah tepat,
--    bukan tebakan).
-- ============================================================
alter table public.payroll_payments
  add column if not exists status text not null default 'dibayar',
  add column if not exists gross_amount numeric(14, 2),
  add column if not exists adjustment_amount numeric(14, 2) not null default 0,
  add column if not exists adjustment_reason text,
  add column if not exists tax_deduction_amount numeric(14, 2) not null default 0,
  add column if not exists tax_deduction_note text,
  add column if not exists net_amount numeric(14, 2),
  add column if not exists payment_method text,
  add column if not exists cancelled_reason text,
  add column if not exists is_test boolean not null default false;

update public.payroll_payments set gross_amount = amount where gross_amount is null;
update public.payroll_payments set net_amount = amount where net_amount is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_payments_status_check') then
    alter table public.payroll_payments add constraint payroll_payments_status_check
      check (status in ('draft', 'disetujui', 'dibayar', 'dibatalkan'));
  end if;
end $$;

-- draft/disetujui belum benar-benar "dibayar" -- paid_at dulu berarti
-- "kapan dibuat = kapan dibayar" (baris hanya pernah dibuat saat lunas).
-- Sekarang paid_at hanya bermakna saat status = 'dibayar'; untuk baris baru
-- yang masih draft/disetujui, halaman gaji akan mengosongkannya sendiri
-- lewat kode aplikasi -- tidak ada migrasi mundur yang perlu dilakukan di
-- sini karena kolom ini tetap nullable secara default not-null lama (NOT
-- diubah).

-- ============================================================
-- 4. tax_entity_profile -- profil entitas, versi baru per perubahan
-- ============================================================
create table if not exists public.tax_entity_profile (
  id uuid primary key default gen_random_uuid(),
  entity_name text not null,
  business_form text not null check (
    business_form in ('individu', 'pt_perorangan', 'cv', 'firma', 'koperasi', 'pt')
  ),
  npwp text,
  pkp_status text not null default 'belum_pkp' check (pkp_status in ('belum_pkp', 'pkp')),
  fiscal_year_start_month integer not null default 1 check (fiscal_year_start_month between 1 and 12),
  accountant_note text,
  effective_from date not null default current_date,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tax_entity_profile_effective_idx
  on public.tax_entity_profile (effective_from desc);

alter table public.tax_entity_profile enable row level security;

drop policy if exists "admin full access to tax_entity_profile" on public.tax_entity_profile;
create policy "admin full access to tax_entity_profile"
  on public.tax_entity_profile for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- 5. tax_settings -- konfigurasi tarif/metode pajak, per tanggal berlaku.
--    Sengaja TIDAK diisi baris apa pun di sini -- Admin yang mengisi lewat
--    halaman Pajak & Kepatuhan, dan setiap baris lahir dengan
--    confirmation_status = 'perlu_dikonfirmasi_akuntan'.
-- ============================================================
create table if not exists public.tax_settings (
  id uuid primary key default gen_random_uuid(),
  tax_name text not null,
  tax_type text not null check (
    tax_type in ('pph_estimasi', 'ppn_estimasi', 'potongan_gaji_vendor', 'lainnya')
  ),
  rate_percent numeric(6, 3),
  calculation_method text,
  basis text not null check (basis in ('omzet', 'laba', 'invoice', 'biaya', 'manual')),
  effective_from date not null,
  effective_until date,
  active boolean not null default false,
  confirmation_status text not null default 'perlu_dikonfirmasi_akuntan'
    check (confirmation_status in ('perlu_dikonfirmasi_akuntan', 'dikonfirmasi_akuntan')),
  note text,
  source_reference text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tax_settings_lookup_idx
  on public.tax_settings (tax_type, effective_from desc);

alter table public.tax_settings enable row level security;

drop policy if exists "admin full access to tax_settings" on public.tax_settings;
create policy "admin full access to tax_settings"
  on public.tax_settings for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- 6. activity log: audit trail untuk semua tabel keuangan baru
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'cash_flow_entries', 'operational_expenses', 'payroll_payments',
    'tax_entity_profile', 'tax_settings'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_activity', t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()',
        t || '_activity', t
      );
    end if;
  end loop;
end $$;
