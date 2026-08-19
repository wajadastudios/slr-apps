-- Phase 40: gaji pengajar (pengajar payroll).
--
-- SLR pays per session taught, at a rate set individually per pengajar,
-- with a separate (lower) rate for izin/sakit sessions. Rate changes are
-- never retroactive -- a session is always paid at whatever rate was in
-- effect on that session's own date. That is why pelatih_rates stores a
-- new row per change instead of updating one column in place: point-in-time
-- lookup against effective_from is what makes "the first 2 weeks paid at
-- 80.000, the next 2 at 100.000" come out correct by construction.
--
-- Safe to re-run.

-- ============================================================
-- pelatih_rates
-- ============================================================
create table if not exists public.pelatih_rates (
  id uuid primary key default gen_random_uuid(),
  pelatih_id uuid not null references public.users (id) on delete cascade,
  rate_hadir numeric not null check (rate_hadir >= 0),
  rate_izin_sakit numeric not null default 0 check (rate_izin_sakit >= 0),
  effective_from date not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pelatih_rates_lookup_idx
  on public.pelatih_rates (pelatih_id, effective_from desc);

alter table public.pelatih_rates enable row level security;

drop policy if exists "pelatih can read own rates" on public.pelatih_rates;
create policy "pelatih can read own rates"
  on public.pelatih_rates for select
  using (pelatih_id = auth.uid());

drop policy if exists "admin full access to pelatih_rates" on public.pelatih_rates;
create policy "admin full access to pelatih_rates"
  on public.pelatih_rates for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- payroll_payments
-- ============================================================
create table if not exists public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  pelatih_id uuid not null references public.users (id) on delete cascade,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  hadir_count integer not null default 0,
  izin_sakit_count integer not null default 0,
  amount numeric not null,
  proof_url text,
  paid_at timestamptz not null default now(),
  paid_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (pelatih_id, period_year, period_month)
);

alter table public.payroll_payments enable row level security;

drop policy if exists "pelatih can read own payroll payments" on public.payroll_payments;
create policy "pelatih can read own payroll payments"
  on public.payroll_payments for select
  using (pelatih_id = auth.uid());

drop policy if exists "admin full access to payroll_payments" on public.payroll_payments;
create policy "admin full access to payroll_payments"
  on public.payroll_payments for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- users.bank_info -- pengajar's own account, for admin to transfer to.
-- Same free-text shape as the site_settings bank_transfer_info key
-- already used for the business's own account on the trial-payment page.
-- ============================================================
alter table public.users
  add column if not exists bank_info text;

-- Self-service phone + bank_info, mirroring update_own_profile's
-- security-definer pattern from 0012 rather than a broad UPDATE policy
-- (which would let a crafted request touch role or other columns).
-- Deliberately excludes full_name/title, which stay admin-managed via
-- updatePelatihTitleAction.
create or replace function public.update_own_pelatih_settings(
  p_phone text,
  p_bank_info text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
    set phone = p_phone,
        bank_info = p_bank_info
    where id = auth.uid();
end;
$$;

grant execute on function public.update_own_pelatih_settings(text, text) to authenticated;
