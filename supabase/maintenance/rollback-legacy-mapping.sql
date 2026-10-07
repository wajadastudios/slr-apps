-- ROLLBACK pemetaan nilai lama (0050). Karena 0050 hanya menambah objek baru
-- dan tidak pernah mengubah laporan atau nilai, mengembalikan keadaan semula
-- cukup dengan menghapus objek itu. Nilai, laporan, dan indikator tidak tersentuh.
drop table if exists public.legacy_indicator_map cascade;
drop function if exists public.indicator_usage_counts();

-- fungsi hapus indikator kembali ke versi 0030 (tanpa pemeriksaan pemetaan)
create or replace function public.admin_delete_indicator(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if public.get_my_role() <> 'admin' then
    raise exception 'not authorized';
  end if;
  select key into v_key from public.indicators where id = p_id;
  if v_key is null then
    raise exception 'indicator not found';
  end if;
  if exists (
    select 1 from public.progress_reports
    where jsonb_typeof(scores) = 'object' and scores ? v_key
  ) then
    raise exception 'indicator in use';
  end if;
  delete from public.indicators where id = p_id;
end;
$$;
grant execute on function public.admin_delete_indicator(uuid) to authenticated;

notify pgrst, 'reload schema';
