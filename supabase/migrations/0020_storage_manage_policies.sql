-- Fix: only an INSERT policy existed on storage.objects for the
-- progress-media bucket (0003_storage.sql). Every "delete old file on
-- replace/remove" feature added since (Media Ads, QRIS, Galeri, ortu
-- avatars) calls storage.list() and storage.remove(), which need
-- SELECT and DELETE policies respectively -- without them those calls
-- silently no-op (list() returns nothing, remove() is skipped), so old
-- files never actually get deleted and re-uploading the same filename
-- fails with "The resource already exists".
-- Safe to re-run.

drop policy if exists "authenticated can list progress media" on storage.objects;
create policy "authenticated can list progress media"
  on storage.objects for select
  using (bucket_id = 'progress-media' and auth.role() = 'authenticated');

drop policy if exists "authenticated can delete progress media" on storage.objects;
create policy "authenticated can delete progress media"
  on storage.objects for delete
  using (bucket_id = 'progress-media' and auth.role() = 'authenticated');

drop policy if exists "authenticated can update progress media" on storage.objects;
create policy "authenticated can update progress media"
  on storage.objects for update
  using (bucket_id = 'progress-media' and auth.role() = 'authenticated')
  with check (bucket_id = 'progress-media' and auth.role() = 'authenticated');
