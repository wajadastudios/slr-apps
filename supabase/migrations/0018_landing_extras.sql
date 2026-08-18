-- Phase 30-32: pool locations (Google Maps embeds), FAQ, and package
-- promo badges. Safe to re-run.

-- ============================================================
-- pool_locations (Lokasi Kolam admin CRUD + public Maps section)
-- ============================================================
create table if not exists public.pool_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  maps_link text not null,
  created_at timestamptz not null default now()
);

alter table public.pool_locations enable row level security;

drop policy if exists "public can read pool_locations" on public.pool_locations;
create policy "public can read pool_locations"
  on public.pool_locations for select
  using (true);

drop policy if exists "admin full access to pool_locations" on public.pool_locations;
create policy "admin full access to pool_locations"
  on public.pool_locations for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- faq_items (FAQ admin CRUD + public accordion)
-- ============================================================
create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.faq_items enable row level security;

drop policy if exists "public can read faq_items" on public.faq_items;
create policy "public can read faq_items"
  on public.faq_items for select
  using (true);

drop policy if exists "admin full access to faq_items" on public.faq_items;
create policy "admin full access to faq_items"
  on public.faq_items for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- program_packages.badge (promo/diskon/best_deal/direkomendasikan)
-- ============================================================
alter table public.program_packages
  add column if not exists badge text
    check (badge in ('promo', 'diskon', 'best_deal', 'direkomendasikan'));
