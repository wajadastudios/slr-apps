-- Phase 47: trial-first registration flow.
--
-- The public registration form becomes intake-only (no payment collected
-- at submission). Admin later enters an agreed trial schedule, which
-- generates a payment_token used for a public, no-login link where the
-- parent pays and self-confirms. Whether to ever create a login account
-- stays a fully separate, later, manual admin decision -- these columns
-- never trigger account creation on their own.
--
-- Safe to re-run.

alter table public.registrations
  add column if not exists trial_pelatih_id uuid references public.users (id) on delete set null,
  add column if not exists trial_session_date date,
  add column if not exists trial_session_time time,
  add column if not exists trial_location text,
  add column if not exists payment_token text unique,
  add column if not exists trial_proof_url text,
  add column if not exists trial_confirmed_at timestamptz;

-- ============================================================
-- Public (anon) read access for the /trial/[token] payment page, narrowed
-- to exactly the columns that page needs -- same pattern as
-- lookup_referral_code in 0023.
-- ============================================================
create or replace function public.get_registration_by_token(p_token text)
returns table (
  child_name text,
  program_name text,
  trial_session_date date,
  trial_session_time time,
  trial_location text,
  trial_pelatih_name text,
  trial_fee_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.child_name,
    p.name,
    r.trial_session_date,
    r.trial_session_time,
    r.trial_location,
    u.full_name,
    r.trial_fee_status
  from public.registrations r
  left join public.programs p on p.id = r.program_id
  left join public.users u on u.id = r.trial_pelatih_id
  where r.payment_token = p_token;
$$;

grant execute on function public.get_registration_by_token(text) to anon, authenticated;

-- ============================================================
-- A pengajar can read their own assigned trial rows -- lets the new
-- /pelatih/trial page query registrations directly. RLS only gates which
-- rows are visible; the page itself selects just the columns it needs.
-- ============================================================
drop policy if exists "pelatih can read own trial registrations" on public.registrations;
create policy "pelatih can read own trial registrations"
  on public.registrations for select
  using (trial_pelatih_id = auth.uid());
