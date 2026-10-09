-- ROLLBACK kurikulum Teen & Adult (0054). Jalankan HANYA bila kurikulum level
-- Teen & Adult belum pernah dipakai pengajar (belum ada laporan baru).
--
-- Bila sudah diaktifkan lalu ingin kembali: admin menekan "Kembalikan ke penilaian
-- lama" di Atur Program (indikator lama aktif lagi persis seperti sebelumnya).
-- Laporan yang sudah dibuat dengan kurikulum level tidak dihapus oleh langkah itu.
--
-- 1) hapus isi kurikulum baru (tidak menyentuh indikator, laporan, atau nilai lama)
delete from public.skill_rules
where group_id in (select g.id from public.indicator_groups g join public.programs p on p.id = g.program_id where p.name = 'Teen & Adult Swim' and g.slug is not null);
delete from public.skill_test_types
where program_id in (select id from public.programs where name = 'Teen & Adult Swim');   -- targets ikut terhapus
delete from public.indicators i
using public.programs p
where p.id = i.program_id and p.name = 'Teen & Adult Swim' and i.seed_key like 'ta1\_%'
  and not exists (select 1 from public.progress_reports r where r.program_id = p.id and r.scores ? i.key);
delete from public.indicator_groups g
using public.programs p
where p.id = g.program_id and p.name = 'Teen & Adult Swim' and g.slug is not null
  and not exists (select 1 from public.indicators i where i.group_id = g.id);

-- 2) rekor kembali seperti sebelumnya (dari salinan backup)
update public.milestones m
set bronze = b.bronze, silver = b.silver, gold = b.gold, active = b.active
from backup_20261009.milestones b
where b.id = m.id;
delete from public.milestones m
using public.programs p
where p.id = m.program_id and p.name = 'Teen & Adult Swim'
  and m.seed_key in ('adult-meluncur-jarak', 'adult-dada-jarak', 'adult-punggung-jarak', 'adult-kupu-jarak')
  and not exists (select 1 from public.performance_records r where r.program_id = p.id and r.awards ? m.id::text);

notify pgrst, 'reload schema';
