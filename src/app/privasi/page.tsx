import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";

export default async function PrivasiPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("key, value");
  const email = settings?.find((s) => s.key === "email")?.value;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <GlassCard>
        <h1 className="text-2xl font-semibold text-slate-900">
          Kebijakan Privasi
        </h1>
        <p className="mt-2 rounded-xl border border-amber-400/40 bg-amber-100/30 px-4 py-2 text-sm text-amber-800">
          ⚠️ Ini draf awal, belum direview oleh profesional hukum. Jangan
          dijadikan acuan hukum final sebelum ditinjau.
        </p>

        <div className="mt-6 flex flex-col gap-4 text-sm text-slate-700">
          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              1. Data yang Kami Kumpulkan
            </h2>
            <p>
              Saat mendaftar atau menggunakan layanan Sari Les Renang, kami
              mengumpulkan: nama dan tanggal lahir anak/peserta, nama, email,
              dan nomor telepon/WhatsApp orang tua, data kehadiran dan
              catatan perkembangan per sesi (termasuk foto/video kegiatan
              yang diunggah pengajar), serta riwayat tagihan dan pembayaran.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              2. Bagaimana Data Digunakan
            </h2>
            <p>
              Data digunakan untuk mengelola pendaftaran, jadwal kelas,
              laporan perkembangan yang dapat dilihat orang tua, serta
              penagihan biaya les. Kami tidak menggunakan data Anda untuk
              tujuan lain tanpa izin.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              3. Penyimpanan &amp; Akses
            </h2>
            <p>
              Data disimpan di penyedia layanan cloud (Supabase) dan dibatasi
              aksesnya sesuai peran — pengajar hanya melihat siswa yang
              diajarnya, orang tua hanya melihat data anaknya sendiri, dan
              admin mengelola operasional secara keseluruhan.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              4. Berbagi Data
            </h2>
            <p>
              Kami tidak menjual atau membagikan data Anda ke pihak ketiga
              untuk keperluan pemasaran. Data hanya diproses oleh penyedia
              layanan teknis yang mendukung operasional aplikasi ini.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              5. Hak Anda
            </h2>
            <p>
              Anda dapat meminta koreksi atau penghapusan data dengan
              menghubungi admin melalui kontak di bawah.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              6. Kontak
            </h2>
            <p>{email || "Hubungi admin Sari Les Renang."}</p>
          </section>
        </div>

        <Link
          href="/"
          className="mt-6 inline-block text-sm text-[#35C5D0] underline"
        >
          &larr; Kembali ke Beranda
        </Link>
      </GlassCard>
    </div>
  );
}
