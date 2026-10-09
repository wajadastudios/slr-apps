-- Memulihkan indikator "Floating" di skill Water Safety kurikulum level.
--
-- Indikator ini dibuat oleh 0049 lalu terhapus lewat menu Indikator (karena
-- tampak ganda dengan "Floating" lama). Water Safety membutuhkannya (8 indikator
-- + tes Floating), dan nilai "Floating" lama dipetakan ke sini. Hanya MENAMBAH
-- satu baris bila belum ada; tidak mengubah baris, laporan, atau nilai mana pun.
-- Aman dijalankan ulang.

insert into public.indicators
  (program_id, group_id, key, label, sort_order, active, level, description, rubric, required, seed_key)
select
  g.program_id,
  g.id,
  'k1_water_safety_floating',
  'Floating',
  3,
  (p.curriculum_mode = 'levels_v1'),
  null,
  'Mempertahankan posisi mengapung dengan jalan napas di atas air.',
  'Contoh bintang 5: Mempertahankan posisi mengapung dengan wajah/jalan napas di atas air tanpa bantuan fisik selama durasi latihan. Contoh bintang 3: Mengapung dengan jalan napas di atas air, tetapi masih perlu arahan verbal untuk menjaga posisi kepala.',
  true,
  'k1_water_safety_floating'
from public.indicator_groups g
join public.programs p on p.id = g.program_id
where g.slug = 'water_safety'
  and p.name = 'Kids Swim'
  and not exists (
    select 1 from public.indicators i
    where i.program_id = g.program_id
      and (i.seed_key = 'k1_water_safety_floating' or i.key = 'k1_water_safety_floating')
  );
