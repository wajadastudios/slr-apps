-- BACKUP sebelum kurikulum Teen & Adult (migrasi 0054).
-- Jalankan SEKALI di Supabase SQL Editor sebelum 0054. Hanya MENYALIN data ke
-- schema terpisah; tidak mengubah apa pun. Aman diulang (tidak menimpa salinan).
create schema if not exists backup_20261009;
revoke all on schema backup_20261009 from public, anon, authenticated;

create table if not exists backup_20261009.programs as table public.programs;
create table if not exists backup_20261009.indicator_groups as table public.indicator_groups;
create table if not exists backup_20261009.indicators as table public.indicators;
create table if not exists backup_20261009.progress_reports as table public.progress_reports;
create table if not exists backup_20261009.milestones as table public.milestones;
create table if not exists backup_20261009.performance_records as table public.performance_records;
create table if not exists backup_20261009.skill_rules as table public.skill_rules;
create table if not exists backup_20261009.skill_test_types as table public.skill_test_types;
create table if not exists backup_20261009.skill_test_targets as table public.skill_test_targets;

alter table backup_20261009.programs enable row level security;
alter table backup_20261009.indicator_groups enable row level security;
alter table backup_20261009.indicators enable row level security;
alter table backup_20261009.progress_reports enable row level security;
alter table backup_20261009.milestones enable row level security;
alter table backup_20261009.performance_records enable row level security;
alter table backup_20261009.skill_rules enable row level security;
alter table backup_20261009.skill_test_types enable row level security;
alter table backup_20261009.skill_test_targets enable row level security;

-- cek: jumlah baris harus sama dengan tabel aslinya
select 'progress_reports' as tabel, (select count(*) from public.progress_reports) as asli, (select count(*) from backup_20261009.progress_reports) as salinan
union all select 'indicators', (select count(*) from public.indicators), (select count(*) from backup_20261009.indicators)
union all select 'indicator_groups', (select count(*) from public.indicator_groups), (select count(*) from backup_20261009.indicator_groups)
union all select 'milestones', (select count(*) from public.milestones), (select count(*) from backup_20261009.milestones)
union all select 'performance_records', (select count(*) from public.performance_records), (select count(*) from backup_20261009.performance_records);
