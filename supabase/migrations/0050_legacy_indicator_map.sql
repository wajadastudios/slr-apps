-- Pemetaan indikator LAMA -> indikator kurikulum BARU, dan perlindungan hapus.
--
-- Aman: hanya MENAMBAH objek baru. Tidak satu pun baris di progress_reports,
-- indicators, atau tabel lain diubah atau dihapus oleh file ini. Nilai lama
-- tetap persis seperti tersimpan (nilai bintang, tanggal sesi, catatan,
-- kehadiran, pengajar); pemetaan hanya relasi yang dibaca saat menampilkan
-- riwayat. Aman dijalankan ulang.
--
-- Rollback: lihat supabase/maintenance/rollback-legacy-mapping.sql

-- ============================================================
-- Relasi pemetaan (satu baris per indikator lama per program)
-- ============================================================
create table if not exists public.legacy_indicator_map (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  -- kunci yang tersimpan di progress_reports.scores (tidak pernah diubah)
  legacy_key text not null,
  -- label/kelompok saat laporan lama ditulis, untuk ditampilkan dan diaudit
  legacy_label text not null,
  legacy_group text,
  -- auto: dipetakan otomatis (tidak ambigu). manual: dipilih admin.
  -- review: menunggu admin. skipped: admin memutuskan tidak dipetakan
  -- (riwayatnya tetap tampil di "Riwayat kurikulum sebelumnya").
  status text not null default 'review' check (status in ('auto', 'manual', 'review', 'skipped')),
  target_indicator_id uuid references public.indicators (id) on delete restrict,
  method text check (method in ('kunci_sama', 'nama_sama', 'sinonim', 'level_awal', 'manual')),
  note text,
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, legacy_key),
  check ((status in ('auto', 'manual')) = (target_indicator_id is not null))
);
create index if not exists legacy_indicator_map_target_idx on public.legacy_indicator_map (target_indicator_id);

alter table public.legacy_indicator_map enable row level security;

-- semua pengguna masuk membaca (orang tua perlu membaca pemetaan untuk
-- menampilkan riwayat anaknya); hanya admin yang menulis
drop policy if exists "authenticated can read legacy_indicator_map" on public.legacy_indicator_map;
create policy "authenticated can read legacy_indicator_map" on public.legacy_indicator_map for select
  using (auth.role() = 'authenticated');
drop policy if exists "admin full access to legacy_indicator_map" on public.legacy_indicator_map;
create policy "admin full access to legacy_indicator_map" on public.legacy_indicator_map for all
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- jejak audit (log_activity, 0036)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'log_activity' and pronamespace = 'public'::regnamespace) then
    execute 'drop trigger if exists legacy_indicator_map_log on public.legacy_indicator_map';
    execute 'create trigger legacy_indicator_map_log after insert or update or delete on public.legacy_indicator_map for each row execute function public.log_activity()';
  end if;
end $$;

-- ============================================================
-- Berapa laporan memakai tiap indikator (admin saja), untuk peringatan dampak
-- ============================================================
create or replace function public.indicator_usage_counts()
returns table (indicator_key text, report_count bigint)
language sql
security definer
stable
set search_path = public
as $$
  select k as indicator_key, count(*) as report_count
  from public.progress_reports pr,
       lateral jsonb_object_keys(
         case when jsonb_typeof(pr.scores) = 'object' then pr.scores else '{}'::jsonb end
       ) as k
  where public.get_my_role() = 'admin'
  group by k;
$$;
grant execute on function public.indicator_usage_counts() to authenticated;

-- ============================================================
-- Hapus permanen: ditolak bila indikator pernah dinilai ATAU menjadi tujuan
-- pemetaan nilai lama (riwayat tidak boleh kehilangan padanannya).
-- ============================================================
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

  if exists (select 1 from public.legacy_indicator_map where target_indicator_id = p_id) then
    raise exception 'indicator in use';
  end if;

  delete from public.indicators where id = p_id;
end;
$$;
grant execute on function public.admin_delete_indicator(uuid) to authenticated;
