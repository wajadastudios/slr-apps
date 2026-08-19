import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { saveSiteSettingsAction, uploadQrisAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function PengaturanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("site_settings")
    .select("key, value");

  const get = (key: string) =>
    settings?.find((s) => s.key === key)?.value ?? "";

  return (
    <GlassCard>
      <h2 className={HEADING}>Info Kontak &amp; Lokasi (tampil di landing page)</h2>
      <form action={saveSiteSettingsAction} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Alamat</label>
          <GlassTextarea name="address" rows={2} defaultValue={get("address")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Nomor Telepon</label>
            <GlassInput name="phone" defaultValue={get("phone")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Email</label>
            <GlassInput name="email" type="email" defaultValue={get("email")} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Jam Operasional</label>
            <GlassInput
              name="operating_hours"
              placeholder="Senin-Sabtu, 08:00-17:00"
              defaultValue={get("operating_hours")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Instagram</label>
            <GlassInput
              name="instagram"
              placeholder="sarilesrenang"
              defaultValue={get("instagram")}
            />
          </div>
        </div>

        <h2 className={`mt-2 ${HEADING}`}>Statistik Hero (landing page)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Keluarga Aktif</label>
            <GlassInput
              name="stat_families"
              placeholder="100+"
              defaultValue={get("stat_families")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Lama Berdiri</label>
            <GlassInput
              name="stat_years"
              placeholder="5 Thn"
              defaultValue={get("stat_years")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Rating Kepuasan</label>
            <GlassInput
              name="stat_rating"
              placeholder="4.9"
              defaultValue={get("stat_rating")}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Kosongkan kartu yang belum punya data asli — kartu itu otomatis
          disembunyikan di landing page.
        </p>

        <h2 className={`mt-2 ${HEADING}`}>Tentang Kami (landing page)</h2>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Cerita Singkat</label>
          <GlassTextarea
            name="about_text"
            rows={4}
            placeholder="Ceritakan singkat tentang Sari Les Renang..."
            defaultValue={get("about_text")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">
            Sertifikasi Founder (Sari)
          </label>
          <GlassTextarea
            name="founder_certifications"
            rows={3}
            placeholder="Contoh: Bersertifikasi AASM dan Akuatik Indonesia"
            defaultValue={get("founder_certifications")}
          />
        </div>

        <h2 className={`mt-2 ${HEADING}`}>Pembayaran Trial</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Biaya Trial (Rp)</label>
            <GlassInput
              name="trial_fee_amount"
              type="number"
              min={0}
              placeholder="50000"
              defaultValue={get("trial_fee_amount")}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">
            Info Transfer Manual
          </label>
          <GlassTextarea
            name="bank_transfer_info"
            rows={3}
            placeholder="Contoh: BCA 1234567890 a.n. Sari Les Renang"
            defaultValue={get("bank_transfer_info")}
          />
        </div>

        <h2 className={`mt-2 ${HEADING}`}>Pendaftaran</h2>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="registrasi_dewasa_aktif"
            value="true"
            defaultChecked={get("registrasi_dewasa_aktif") === "true"}
          />
          <span className="text-sm text-slate-800">
            Aktifkan Form Pendaftaran Remaja/Dewasa
          </span>
        </label>
        <p className="text-xs text-slate-500">
          Saat nonaktif, pilihan &quot;Untuk diri sendiri (remaja/dewasa)&quot;
          disembunyikan dari form pendaftaran publik — hanya pendaftaran
          orang tua untuk anak yang tersedia.
        </p>

        {error && (
          <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
        )}
        {saved && <p className="text-sm text-[#1a8f6f]">Tersimpan.</p>}
        <GlassButton
          type="submit"
          className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
        >
          Simpan
        </GlassButton>
      </form>

      <div className="mt-6 border-t border-white/30 pt-6">
        <label className="text-sm text-slate-800">Gambar QRIS</label>
        {get("qris_image_url") && (
          <div className="mt-2 w-40 overflow-hidden rounded-xl border border-white/30 bg-white/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={get("qris_image_url")}
              alt="QRIS"
              className="w-full object-contain"
            />
          </div>
        )}
        <form
          action={uploadQrisAction}
          className="mt-3 flex flex-wrap items-end gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <input
              type="file"
              name="qris_image"
              accept="image/*"
              required
              className="text-sm text-slate-700"
            />
            <span className="text-xs text-slate-500">
              Foto: persegi, minimal 600×600px.
            </span>
          </div>
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]"
          >
            Unggah &amp; Ganti QRIS
          </GlassButton>
        </form>
      </div>
    </GlassCard>
  );
}
