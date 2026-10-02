# SLR APPS

## Health-check Supabase (solusi sementara pada Free Plan)

Supabase Free mem-pause project yang dianggap tidak aktif. Untuk mengurangi risiko itu, GitHub Actions memanggil `GET /api/health/supabase` sekali sehari (08.00 WIB). Endpoint menjalankan satu fungsi database ringan (`public.health_check()`, hanya mengembalikan `'ok'`) memakai anon key publik. Endpoint tidak membaca tabel apa pun: tidak ada data murid, laporan, tagihan, atau data pribadi yang tersentuh, dan service-role key tidak dipakai.

**Ini hanya solusi sementara, bukan jaminan resmi anti-pause dari Supabase.** Setelah SLR dipakai operasional, upgrade ke Supabase Pro (tidak pernah di-pause, ada backup harian).

### Konfigurasi

1. Jalankan migrasi `supabase/migrations/0045_health_check.sql` di database produksi (`npx supabase db push`).
2. Buat token acak panjang, mis. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. Hosting (Vercel -> Settings -> Environment Variables, Production): `SLR_HEALTHCHECK_SECRET` = token tadi. Lalu redeploy.
4. GitHub (repo -> Settings -> Secrets and variables -> Actions): `SLR_HEALTHCHECK_SECRET` = token yang sama, dan `SLR_HEALTHCHECK_URL` = URL lengkap produksi, mis. `https://domain-anda/api/health/supabase`.

### Tes manual

```bash
# tanpa token -> 401
curl -i https://domain-anda/api/health/supabase
# token salah -> 403
curl -i -H "Authorization: Bearer salah" https://domain-anda/api/health/supabase
# token benar -> 200 {"ok":true,"service":"slr-app","database":"reachable","checkedAt":"..."}
curl -i -H "Authorization: Bearer $SLR_HEALTHCHECK_SECRET" https://domain-anda/api/health/supabase
```

Workflow juga bisa dijalankan manual: GitHub -> Actions -> "Supabase health-check" -> Run workflow. Jika gagal, run-nya merah dengan pesan generik (tanpa token atau isi response).

Catatan: GitHub menonaktifkan workflow terjadwal otomatis pada repo publik yang tidak ada aktivitas selama 60 hari; cek tab Actions sesekali.

