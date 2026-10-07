-- BACKUP sebelum migrasi pemetaan nilai lama (0050).
-- Jalankan SEKALI di Supabase SQL Editor sebelum 0050. Hanya MENYALIN data ke
-- schema terpisah; tidak mengubah apa pun. Aman diulang (tidak menimpa salinan).
create schema if not exists backup_20261007;
revoke all on schema backup_20261007 from public, anon, authenticated;

create table if not exists backup_20261007.programs as table public.programs;
create table if not exists backup_20261007.indicator_groups as table public.indicator_groups;
create table if not exists backup_20261007.indicators as table public.indicators;
create table if not exists backup_20261007.progress_reports as table public.progress_reports;
create table if not exists backup_20261007.skill_level_events as table public.skill_level_events;
create table if not exists backup_20261007.skill_test_results as table public.skill_test_results;

alter table backup_20261007.programs enable row level security;
alter table backup_20261007.indicator_groups enable row level security;
alter table backup_20261007.indicators enable row level security;
alter table backup_20261007.progress_reports enable row level security;
alter table backup_20261007.skill_level_events enable row level security;
alter table backup_20261007.skill_test_results enable row level security;

-- cek: jumlah baris harus sama dengan tabel aslinya
select 'progress_reports' as tabel,
       (select count(*) from public.progress_reports) as asli,
       (select count(*) from backup_20261007.progress_reports) as salinan
union all
select 'indicators', (select count(*) from public.indicators), (select count(*) from backup_20261007.indicators)
union all
select 'indicator_groups', (select count(*) from public.indicator_groups), (select count(*) from backup_20261007.indicator_groups);
