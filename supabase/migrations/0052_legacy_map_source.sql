-- Menelusuri pemetaan nilai lama: menyimpan rujukan ke indikator LAMA (baris
-- indicators) dan alasan/aturan pemetaan. Hanya mengubah tabel pemetaan; tidak
-- ada laporan, nilai, atau indikator yang diubah. Aman dijalankan ulang.

alter table public.legacy_indicator_map
  add column if not exists legacy_indicator_id uuid references public.indicators (id) on delete set null;

-- rujukan ke baris indikator lama bila ada (kunci yang sama dengan kunci di laporan)
update public.legacy_indicator_map m
set legacy_indicator_id = i.id
from public.indicators i
where i.program_id = m.program_id
  and i.key = m.legacy_key
  and m.legacy_indicator_id is null;

-- alasan pemetaan otomatis yang belum tercatat
update public.legacy_indicator_map
set note = case method
  when 'kunci_sama' then 'Kunci indikator sama dengan indikator kurikulum baru.'
  when 'nama_sama' then 'Nama indikator sama.'
  when 'sinonim' then 'Nama berbeda tetapi artinya sama (sinonim).'
  when 'level_awal' then 'Semua siswa saat pembaruan masih Level 1, jadi nilai lama ditampilkan sebagai indikator yang sama di Level 1.'
  else note
end
where status = 'auto' and note is null;

create index if not exists legacy_indicator_map_legacy_idx on public.legacy_indicator_map (legacy_indicator_id);
