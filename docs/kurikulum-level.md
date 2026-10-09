# Kurikulum Level (Kids Swim)

Penilaian enam skill dengan level per gaya, tes kemampuan, dan profil perkembangan. Berjalan di belakang saklar
`programs.curriculum_mode` (`legacy` | `levels_v1`). Selama `legacy`, tidak ada yang berubah bagi pengguna.

## Cara menyalakan

1. Jalankan `supabase/migrations/0048_curriculum_levels.sql` lalu `0049_curriculum_levels_seed.sql` di SQL Editor
   (lalu `notify pgrst, 'reload schema';`). `0049` hanya menyiapkan isi kurikulum Kids Swim dalam keadaan tidak aktif.
2. Admin: **Atur Program → Kids Swim → Kurikulum Level → Aktifkan**. Ini perpindahan sekali pakai; indikator lama
   disembunyikan (bukan dihapus) dan dikembalikan persis bila saklar dimatikan lagi.
3. Pembaruan kurikulum berikutnya dilakukan lewat tab **Kurikulum Level** di `/admin/penilaian` (indikator, rubrik,
   syarat lulus, tes, target). Tidak perlu migrasi.

## Model

- Skill = `indicator_groups` (Dasar, Water Safety, Gaya Bebas, Gaya Dada, Gaya Punggung, Gaya Kupu-kupu). Dasar dan
  Water Safety tanpa level; empat gaya punya Level 1 Dasar / 2 Pengembangan / 3 Penguasaan, **per gaya per anak**
  (`skill_level_events`: penempatan awal, lalu kenaikan yang dikonfirmasi pengajar).
- Indikator gaya diduplikasi per level (standar tiap level berbeda). `progress_reports.scores` hanya berisi
  indikator yang benar-benar dinilai; kunci yang tidak ada = tidak dinilai. **0 = sudah diamati, belum mampu.**
  "Tidak berlaku" + alasan disimpan di `assessment_context.na`.
- Ringkasan penilaian teknik = jumlah skor / (5 × indikator wajib yang dinilai) × 100, dengan keterangan cakupan.
  Penilaian sebagian ditandai dan tidak dihubungkan di grafik. Tidak ada skor gabungan lintas skill.
- Lulus level **bukan rata-rata**: semua indikator wajib memenuhi skor minimal pada cukup sesi, tes wajib
  memenuhi target, lalu pengajar mengonfirmasi (server memeriksa ulang syarat).
- Tes (`skill_test_results`): jarak (m), durasi (detik), dan Rangkaian Keselamatan (checklist 7 langkah, bukan
  indikator ke-9). Rekor pribadi dan pencapaian **selalu diturunkan** dari hasil valid (tervalidasi, kondisi
  sebanding, bantuan dipisah); tidak disimpan, sehingga edit/hapus laporan otomatis konsisten. Target jarak
  versi-versian dan tidak bisa diubah setelah dipakai; mengganti target = versi baru.
- Simpan laporan memakai `save_report_tests` (atomik); mengirim ulang tidak menggandakan hasil.

## Data lama

Laporan sebelum kurikulum level tidak dipetakan ke Level 1-3 dan diberi label "Penilaian sebelum kurikulum level".
Nilai 0 pada laporan lama tampil "Belum dapat dipastikan (data lama)" (form lama mengirim semua indikator dengan
default 0). Rekor lama tampil hanya-baca sebagai "Rekor lama (sebelum kurikulum level)". Indikator Water Safety
baru tidak dianggap pernah dinilai.

## Keputusan yang perlu divalidasi tim SLR

Seluruhnya usulan awal, dapat diubah admin tanpa migrasi:

- Teks rubrik tiap indikator per level.
- Target jarak: Bebas/Dada/Punggung 10/25/50 m, Kupu-kupu 5/10/25 m (target internal SLR, bukan standar internasional).
- Syarat lulus: skor ≥ 4 pada ≥ 2 sesi untuk semua indikator wajib + tes jarak level memenuhi target (tanpa
  bantuan, syarat teknik terpenuhi).
- Definisi "kompetensi dikuasai" untuk Dasar dan Water Safety (aturan yang sama: ≥ 4 pada ≥ 2 sesi).
- Syarat "kondisi sebanding" (saat ini penanda pengajar).
- Floating dan Treading Water hanya diukur durasi, tanpa target bawaan.
- Milestone "Tahan Nafas Terkontrol" (Kids 3/5/8 detik; Teen & Adult 5/10/20 detik) tidak dipakai di kurikulum
  baru dan tidak dihapus.
- Program lain (Teen & Adult, Adaptive, Aquanatal) belum memakai kurikulum level.

## Teen & Adult Swim

Kurikulum yang sama (6 skill, Level 1-3 untuk empat gaya, bintang 1-5, Progress %, tes, rekor) dengan indikator
berbahasa dewasa. Sumbernya `src/lib/curriculum/definition-adult.ts`; migrasi `0054_curriculum_adult_seed.sql` dihasilkan
oleh `scripts/gen-curriculum-seed.ts` dan dijaga sinkron oleh tes.

- 90 indikator: Dasar 7 (Kenyamanan dan Kepercayaan Diri di Air menggantikan "Sikap dan Keberanian"), Water Safety 8,
  dan gaya renang 75. Indikator teknik gaya renang **sama persis** dengan Kids (aspek, rubrik, slug) supaya laporan
  konsisten dan bisa dibandingkan bila peserta berpindah kategori; ditambah dua indikator khusus dewasa
  (Ritme dan Konsistensi Teknik di Level 2-3, Teknik Saat Jarak Bertambah di Level 3).
- Target jarak per level: Bebas/Dada/Punggung 10/25/50 m, Kupu-kupu 5/10/25 m. Rekor (medali) dikelola di tab Rekor;
  migrasi hanya mengubah milestone yang masih bernilai awal, sehingga koreksi admin tidak pernah ditimpa.
- Dorman sampai admin menekan Aktifkan di Atur Program. Indikator lama diarsipkan (tidak dihapus) dan nilainya dapat
  dipetakan di tab Riwayat Lama.
- Backup: `supabase/maintenance/backup-before-adult-curriculum.sql`. Rollback: `rollback-adult-curriculum.sql`.
