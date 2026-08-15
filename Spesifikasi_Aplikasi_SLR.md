# Spesifikasi Aplikasi — Sari Les Renang (SLR)
*Draft v1 — disusun berdasarkan diskusi kebutuhan awal*

---

## 1. Ringkasan

Web app untuk Sari Les Renang dengan 4 kelompok pengguna:
- **Publik/Calon member** — lihat info, testimoni, dokumentasi, daftar jadi member baru
- **Pelatih** — isi laporan perkembangan murid per sesi
- **Orang tua murid** — lihat laporan anak, terima & lihat tagihan bulanan
- **Admin (Abi)** — kelola semua data, approve tagihan, kelola pelatih & murid

Tema visual: **glassmorphism / liquid glass** ala iOS — panel translucent, blur background, rounded corners besar, subtle shadow.

---

## 2. Modul & Fitur

### A. Landing Page (Publik)
- Hero section + info program (Baby Swim, Aquanatal, Hydrotherapy)
- Galeri testimoni (teks + bisa foto/video)
- Dokumentasi pelatihan (galeri foto/video kegiatan)
- Info lokasi, jadwal, kontak
- CTA "Daftar Member Baru"

### B. Pendaftaran Member Baru
- Form pendaftaran: data anak/peserta, data orang tua, pilihan program, jadwal yang diminati
- Status: *Pending → Direview Admin → Disetujui (jadi akun aktif) / Ditolak*
- Notifikasi email ke admin saat ada pendaftar baru
- Notifikasi email ke orang tua saat disetujui (sekaligus info cara login)

### C. Portal Pelatih
- Login
- Lihat jadwal mengajar & daftar murid per sesi
- Isi laporan perkembangan per murid per sesi (lihat format di bagian 4)
- Lihat riwayat laporan yang pernah diisi

### D. Portal Orang Tua
- Login
- Lihat profil anak & progres dari waktu ke waktu (bisa lihat tren, bukan cuma laporan terakhir)
- Lihat & unduh tagihan bulanan (status: belum bayar / sudah dikonfirmasi)
- Riwayat pembayaran

### E. Admin Panel
- Kelola akun pelatih & orang tua
- Kelola jadwal & penempatan murid ke pelatih
- **Generate tagihan otomatis** (dari data paket/jumlah sesi) → **admin approve** → baru terkirim ke orang tua (sesuai keputusan Abi)
- Kelola konten landing page (testimoni, dokumentasi, info program)
- Kelola pendaftar baru (approve/reject)

---

## 3. Role & Permission

| Role | Akses |
|---|---|
| Admin | Semua modul |
| Pelatih | Jadwal sendiri, isi laporan, tidak bisa lihat data tagihan |
| Orang tua | Data anak sendiri saja, laporan & tagihan |
| Publik | Landing page & form pendaftaran saja |

---

## 4. Rekomendasi Format Laporan Perkembangan

Karena 3 program SLR sifatnya beda (Baby Swim = anak-anak, Aquanatal = ibu hamil, Hydrotherapy = terapi), aku sarankan **1 struktur dasar yang sama**, tapi dengan **checklist skill yang beda per program** (jadi bisa dikonfigurasi, bukan hardcode):

**Struktur dasar tiap laporan sesi:**
1. Tanggal & nomor sesi
2. Kehadiran (hadir/izin/sakit)
3. Skor per komponen skill (skala 1–5), spesifik per program:
   - *Baby Swim*: water confidence, floating, kicking, breath control, koordinasi gerak
   - *Aquanatal*: kenyamanan di air, teknik relaksasi/napas, partisipasi latihan, keluhan fisik (jika ada)
   - *Hydrotherapy*: tujuan terapi (ROM/mobilitas/dsb), tingkat nyeri sebelum-sesudah (skala 1–10), progres fungsional
4. Catatan naratif bebas dari pelatih
5. Foto/video opsional (upload)
6. Rekomendasi fokus sesi berikutnya

Ini dibuat sebagai **template yang bisa di-edit dari Admin Panel** (bukan hardcode di kode), jadi kalau ke depan mau nambah/ubah komponen skill, Abi nggak perlu minta ubah kode.

---

## 5. Alur Tagihan

1. Sistem hitung tagihan otomatis tiap akhir bulan berdasarkan jumlah sesi/paket yang diambil murid
2. Admin review & approve (bisa edit dulu kalau ada penyesuaian/diskon)
3. Setelah approve → terkirim ke orang tua (channel: **email dulu di tahap awal**, WA menyusul — lihat catatan di bagian 7)
4. Orang tua lihat status di portal; admin update status "sudah dikonfirmasi bayar" (manual, kecuali nanti mau pakai payment gateway)

**Keputusan: pakai payment gateway — Midtrans.**
Alasan: Midtrans mendukung akun tipe **Individual/Perorangan** hanya dengan KTP + rekening bank pribadi (proses verifikasi ±1-3 hari kerja), sementara Xendit saat ini belum mengakomodasi bisnis perorangan murni tanpa badan usaha. Karena SLR belum punya PT/CV/NIB, Midtrans jadi pilihan paling praktis untuk mulai. Biaya transaksi (MDR) berlaku per metode pembayaran yang dipilih orang tua — akan dicek detail tarifnya saat proses registrasi akun.

> Catatan ke depan: kalau SLR nanti resmi jadi PT Perorangan (bisa diurus mandiri via OSS, prosesnya relatif simpel), akun Midtrans bisa di-upgrade ke tipe badan usaha.

---

## 6. Desain — Glass/Liquid Bubble (iOS-style)

Elemen kunci yang perlu diterapkan konsisten:
- Background blur (`backdrop-filter: blur()`) pada card/panel
- Warna translucent dengan opacity rendah di atas background gradient/foto
- Rounded corner besar (16–24px)
- Shadow lembut, bukan hard shadow
- Animasi transisi halus (spring-like, bukan linear)
- Palet warna disarankan mengikuti brand kit Canva SLR yang sudah ada, supaya konsisten dengan materi promosi

---

## 7. Rekomendasi Tech Stack

Karena budget fleksibel dan prioritas fitur lengkap dulu:

| Layer | Rekomendasi | Alasan |
|---|---|---|
| Frontend | Next.js (React) + Tailwind CSS | Mendukung efek glassmorphism dengan mudah, SEO-friendly untuk landing page |
| Backend/DB | Supabase (Postgres + Auth + Storage) | Auth multi-role built-in, storage untuk foto/video laporan, gratis di awal lalu scalable |
| Email | Resend / SendGrid | Murah, gampang setup untuk notifikasi & tagihan |
| Payment Gateway | **Midtrans** (akun Individual) | Support akun perorangan tanpa PT/NIB, verifikasi cepat (1-3 hari kerja) |
| WhatsApp (fase 2) | Fonnte / Wablas (provider lokal, lebih murah dari WA Business API resmi) | Perlu budget bulanan per pesan, disarankan mulai setelah email berjalan stabil |
| Hosting | Vercel (frontend) + Supabase (backend) | Deploy gampang, gratis di tier awal |

---

## 8. Skema Database (garis besar)

- `users` (role: admin/pelatih/ortu, linked ke auth)
- `students` (data anak, linked ke parent user — **1 parent bisa punya banyak students/anak**, program, status aktif)
- `programs` (Baby Swim, Aquanatal, Hydrotherapy — termasuk template skill checklist per program)
- `schedules` (jadwal per pelatih, per murid)
- `progress_reports` (per sesi, linked ke student + pelatih, skor + catatan + media)
- `invoices` (per murid per bulan, status, nominal, approved_by, sent_at)
- `testimonials` (untuk landing page)
- `registrations` (pendaftar baru, status pending/approved/rejected)

---

## 9. Urutan Pembangunan (tetap bertahap meski scope penuh)

Meski targetnya full scope, secara teknis tetap perlu dibangun berurutan supaya stabil:

1. **Fondasi**: setup project, database, auth 3 role
2. **Admin panel inti**: kelola pelatih, murid, program
3. **Portal Pelatih**: isi laporan perkembangan
4. **Portal Orang Tua**: lihat laporan
5. **Modul tagihan**: generate → approve → kirim email
6. **Landing page publik + pendaftaran member baru**
7. **Polish desain glass/bubble di semua halaman**
8. **Integrasi WhatsApp** (fase lanjutan, setelah stabil)

---

## 10. Status Konfirmasi

- [x] Metode pembayaran: **Payment gateway (Midtrans, akun Individual)**
- [x] Multi-anak per orang tua: **Ya, didukung**
- [x] Domain: **Belum ada** — perlu dibeli sebelum go-live (di luar scope dev, tapi akan diingatkan saat deployment)
- [x] Aset brand: **Sudah ada** (logo, warna, font milik Abi sendiri — akan dipakai, bukan brand kit Canva SLR lama)
- [ ] Skala harga per program (nominal per paket/sesi) — masih perlu didefinisikan sebelum modul tagihan bisa dibangun
