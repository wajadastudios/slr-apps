import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { saveSiteSettingsAction } from "./actions";

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
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-slate-800">Jam Operasional</label>
          <GlassInput
            name="operating_hours"
            placeholder="Senin-Sabtu, 08:00-17:00"
            defaultValue={get("operating_hours")}
          />
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
    </GlassCard>
  );
}
