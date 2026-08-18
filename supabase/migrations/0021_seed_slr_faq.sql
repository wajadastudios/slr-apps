-- Konten awal FAQ SLR. Aman dijalankan ulang: setiap pertanyaan hanya dibuat sekali.
-- Seluruh isi tetap dapat diedit, ditambah, atau dihapus dari Admin > FAQ.

insert into public.faq_items (question, answer, sort_order)
select q.question, q.answer, q.sort_order
from (
  values
    (
      'Bagaimana cara mengikuti kelas trial di SLR?',
      'Pendaftaran trial dapat dilakukan langsung melalui website SLR. Biaya trial adalah Rp50.000 dan jadwal akan dikonfirmasi oleh tim admin melalui WhatsApp sesuai ketersediaan kelas. Trial membantu kami memahami kebutuhan peserta sebelum merekomendasikan program dan jadwal yang paling sesuai.',
      1
    ),
    (
      'Berapa jumlah peserta dalam satu kelas?',
      'Kelas grup SLR dibatasi maksimal 5–6 siswa agar setiap peserta tetap memperoleh perhatian dan arahan yang optimal dari pengajar. Untuk kelas private, jumlah peserta dibatasi 1–2 siswa dengan pendekatan yang lebih personal.',
      2
    ),
    (
      'Program apa yang tepat untuk anak atau peserta saya?',
      'Setiap program disusun berdasarkan usia, kesiapan, dan tujuan belajar peserta. Setelah trial, tim SLR akan membantu merekomendasikan kategori kelas, format grup atau private, serta jadwal yang paling sesuai.',
      3
    ),
    (
      'Apakah orang tua perlu masuk ke kolam?',
      'Untuk kelas bayi dan balita, pendampingan orang tua dapat diperlukan sesuai arahan pengajar demi kenyamanan dan keamanan anak. Untuk peserta yang lebih mandiri, sesi dilaksanakan bersama pengajar dengan orang tua dapat menunggu di area yang disediakan.',
      4
    ),
    (
      'Bagaimana jika peserta masih takut air atau menangis?',
      'Hal tersebut sangat wajar, terutama pada tahap awal. Pengajar SLR menggunakan pendekatan bertahap, suportif, dan berbasis permainan untuk membangun rasa aman serta kepercayaan diri peserta—tanpa memaksa.',
      5
    ),
    (
      'Bagaimana jika tidak dapat hadir pada jadwal kelas?',
      'Mohon informasikan kepada admin sesegera mungkin. Pilihan perubahan jadwal atau sesi pengganti akan disesuaikan dengan kebijakan program dan ketersediaan kuota kelas pada periode berjalan.',
      6
    ),
    (
      'Bagaimana perkembangan belajar peserta dipantau?',
      'Setiap sesi dapat dilengkapi laporan perkembangan digital yang memuat kehadiran, indikator keterampilan, catatan pengajar, dan dokumentasi yang relevan. Laporan hanya dapat diakses oleh akun keluarga peserta terkait.',
      7
    ),
    (
      'Apa yang perlu dibawa saat mengikuti kelas?',
      'Peserta disarankan membawa baju renang yang nyaman, handuk, perlengkapan mandi, dan kacamata renang bila diperlukan. Untuk bayi atau anak yang belum toilet trained, mohon membawa swim diaper.',
      8
    ),
    (
      'Bagaimana informasi biaya dan paket kelas?',
      'Pilihan paket disesuaikan dengan kategori program dan kebutuhan peserta. Informasi harga, jumlah sesi, serta benefit setiap paket dapat dilihat pada website atau dikonsultasikan bersama tim admin setelah trial.',
      9
    )
) as q(question, answer, sort_order)
where not exists (
  select 1
  from public.faq_items existing
  where existing.question = q.question
);
