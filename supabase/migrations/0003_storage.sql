-- Phase 3: public storage bucket for progress-report photos/videos.
-- Safe to re-run.

insert into storage.buckets (id, name, public)
values ('progress-media', 'progress-media', true)
on conflict (id) do nothing;

-- Public bucket: reads happen via the public URL and bypass RLS entirely,
-- so we only need an INSERT policy for authenticated uploads.
drop policy if exists "authenticated can upload progress media" on storage.objects;
create policy "authenticated can upload progress media"
  on storage.objects for insert
  with check (bucket_id = 'progress-media' and auth.role() = 'authenticated');
