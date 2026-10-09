-- Benefit paket "Baby Swim One-Time Session" (1 sesi, Rp150.000) dirapikan:
-- empat poin yang disepakati, tanpa tanda bintang/bullet ketikan.
-- Hanya mengubah kolom benefits satu paket itu. Aman dijalankan ulang.
update public.program_packages p
set benefits = array[
  '1 sesi pengenalan air bersama coach',
  'Didampingi orang tua atau pendamping di area kolam',
  'Observasi kesiapan air dan rekomendasi latihan dari coach',
  'Belum termasuk tiket masuk kolam'
]
from public.programs g
where g.id = p.program_id
  and g.name = 'Baby Swim'
  and p.name ilike '%one-time%session%'
  and p.sessions_count = 1
  and p.benefits is distinct from array[
    '1 sesi pengenalan air bersama coach',
    'Didampingi orang tua atau pendamping di area kolam',
    'Observasi kesiapan air dan rekomendasi latihan dari coach',
    'Belum termasuk tiket masuk kolam'
  ];
