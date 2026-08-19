-- Phase 40 follow-up: full pengajar self-service profile + referral
-- commission system.
--
-- Referral terms (discount for the student, commission for the recruiting
-- pengajar) are snapshotted onto registrations at submission time and
-- copied onto students at approval -- never read live from referral_codes
-- -- so editing or retiring a code later never changes what was already
-- promised to a parent or already-earning pengajar. Commission follows the
-- RECRUITING pengajar regardless of who ends up teaching the student
-- (mirrors how progress_reports.substitute_for already separates "who
-- taught" from credit/attribution). If the recruiting pengajar is later
-- deactivated, /admin/gaji only ever iterates active pengajar, so their
-- commission naturally stops appearing -- no extra logic needed for that
-- rule.
--
-- Safe to re-run.

-- ============================================================
-- users: birth fields for the pengajar profile (students already have
-- these from 0016_registration_birthplace.sql).
-- ============================================================
alter table public.users
  add column if not exists birth_place text;

alter table public.users
  add column if not exists birth_date date;

-- ============================================================
-- Replace the narrow phone/bank_info RPC from 0022 with the full profile
-- RPC -- no shipped UI calls the old one yet, so this is a clean swap
-- rather than a second overlapping function. title (Ms/Mr/Coach) stays
-- admin-only via the existing updatePelatihTitleAction -- it reads as a
-- business-assigned designation, not personal info, and the user's field
-- list didn't include it.
-- ============================================================
drop function if exists public.update_own_pelatih_settings(text, text);

create or replace function public.update_own_pelatih_profile(
  p_full_name text,
  p_phone text,
  p_bank_info text,
  p_birth_place text,
  p_birth_date date,
  p_address text,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
    set full_name = coalesce(p_full_name, full_name),
        phone = p_phone,
        bank_info = p_bank_info,
        birth_place = p_birth_place,
        birth_date = p_birth_date,
        address = p_address,
        avatar_url = p_avatar_url
    where id = auth.uid();
end;
$$;

grant execute on function public.update_own_pelatih_profile(
  text, text, text, text, date, text, text
) to authenticated;

-- ============================================================
-- referral_codes
-- ============================================================
create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  pelatih_id uuid not null references public.users (id) on delete cascade,
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric not null check (discount_value >= 0),
  komisi_per_sesi numeric not null check (komisi_per_sesi >= 0),
  active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists referral_codes_pelatih_idx
  on public.referral_codes (pelatih_id);

alter table public.referral_codes enable row level security;

drop policy if exists "pelatih can read own referral codes" on public.referral_codes;
create policy "pelatih can read own referral codes"
  on public.referral_codes for select
  using (pelatih_id = auth.uid());

drop policy if exists "admin full access to referral_codes" on public.referral_codes;
create policy "admin full access to referral_codes"
  on public.referral_codes for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- Public registration lookup needs to validate a code before an account
-- exists, so anon must be able to check active codes -- narrowed to
-- exactly the columns submitRegistrationAction needs, nothing else about
-- the pengajar leaks.
create or replace function public.lookup_referral_code(p_code text)
returns table (
  pelatih_id uuid,
  discount_type text,
  discount_value numeric,
  komisi_per_sesi numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select pelatih_id, discount_type, discount_value, komisi_per_sesi
  from public.referral_codes
  where code = p_code and active = true;
$$;

grant execute on function public.lookup_referral_code(text) to anon, authenticated;

-- ============================================================
-- registrations: snapshot at submission time
-- ============================================================
alter table public.registrations
  add column if not exists referral_code text,
  add column if not exists referred_by_pelatih_id uuid references public.users (id) on delete set null,
  add column if not exists referral_discount_type text,
  add column if not exists referral_discount_value numeric,
  add column if not exists referral_komisi_per_sesi numeric;

-- ============================================================
-- students: same snapshot, copied over at approval
-- ============================================================
alter table public.students
  add column if not exists referral_code_used text,
  add column if not exists referred_by_pelatih_id uuid references public.users (id) on delete set null,
  add column if not exists referral_discount_type text,
  add column if not exists referral_discount_value numeric,
  add column if not exists referral_komisi_per_sesi numeric;
