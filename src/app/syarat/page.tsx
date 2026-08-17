import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";

export default async function SyaratPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("key, value");
  const email = settings?.find((s) => s.key === "email")?.value;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <GlassCard>
        <h1 className="text-2xl font-semibold text-slate-900">
          Syarat &amp; Ketentuan
        </h1>
        <p className="mt-2 rounded-xl border border-amber-400/40 bg-amber-100/30 px-4 py-2 text-sm text-amber-800">
          ⚠️ Ini draf awal, belum direview oleh profesional hukum. Jangan
          dijadikan acuan hukum final sebelum ditinjau.
        </p>

        <div className="mt-6 flex flex-col gap-4 text-sm text-slate-700">
          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              1. Pendaftaran
            </h2>
            <p>
              Pendaftaran member baru dilakukan melalui formulir di halaman
              ini dan akan ditinjau oleh admin sebelum akun diaktifkan. Data
              yang diisi harus benar dan dapat dipertanggungjawabkan.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              2. Pembayaran &amp; Tagihan
            </h2>
            <p>
              Biaya les ditagih per paket sesi sesuai pilihan yang
              dikonfirmasi admin. Tagihan dikirim setelah paket sebelumnya
              selesai digunakan, dan pembayaran dikonfirmasi secara manual
              oleh admin.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              3. Reschedule &amp; Pembatalan
            </h2>
            <p>
              Kebijakan reschedule dan refund belum ditetapkan secara resmi
              — silakan hubungi admin langsung untuk kasus per kasus.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              4. Tanggung Jawab Peserta
            </h2>
            <p>
              Orang tua/wali bertanggung jawab menginformasikan kondisi
              kesehatan anak/peserta yang relevan kepada pelatih sebelum
              sesi dimulai. SLR menyediakan pelatih bersertifikat namun
              keselamatan di air tetap memerlukan kerja sama semua pihak.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-slate-900">
              5. Perubahan Ketentuan
            </h2>
            <p>
              Ketentuan ini dapat berubah sewaktu-waktu; perubahan akan
              diumumkan melalui halaman ini.
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
