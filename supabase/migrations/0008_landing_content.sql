-- Phase 8: public landing page content (documentation gallery + editable
-- site info). Testimonials and registrations already exist from 0001
-- with correct public-facing RLS.
-- Safe to re-run.

-- ============================================================
-- gallery_items (training-activity photos/videos, spec 2A)
-- ============================================================
create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption text,
  created_at timestamptz not null default now()
);

alter table public.gallery_items enable row level security;

drop policy if exists "anyone can read gallery_items" on public.gallery_items;
create policy "anyone can read gallery_items"
  on public.gallery_items for select
  using (true);

drop policy if exists "admin full access to gallery_items" on public.gallery_items;
create policy "admin full access to gallery_items"
  on public.gallery_items for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- site_settings (address/phone/email/hours shown on the landing page)
-- ============================================================
create table if not exists public.site_settings (
  key text primary key,
  value text not null default ''
);

alter table public.site_settings enable row level security;

drop policy if exists "anyone can read site_settings" on public.site_settings;
create policy "anyone can read site_settings"
  on public.site_settings for select
  using (true);

drop policy if exists "admin full access to site_settings" on public.site_settings;
create policy "admin full access to site_settings"
  on public.site_settings for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

insert into public.site_settings (key, value) values
  ('address', ''),
  ('phone', ''),
  ('email', ''),
  ('operating_hours', '')
on conflict (key) do nothing;
