import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { submitRegistrationAction } from "./actions";

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const supabase = await createClient();

  const [{ data: programs }, { data: gallery }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("gallery_items")
      .select("media_url, media_type")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const heroImage = gallery?.find((g) => g.media_type === "image")?.media_url;

  if (success) {
    return (
      <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6">
        <WaterBg imageUrl={heroImage} />
        <GlassCard className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900">
            Pendaftaran Diterima
          </h1>
          <p className="mt-2 text-sm text-slate-700">
            Terima kasih! Admin akan meninjau pendaftaran Anda. Anda akan
            dihubungi untuk info akun login setelah disetujui.
          </p>
          <Link href="/" className="mt-6 inline-block">
            <GlassButton>Kembali ke Beranda</GlassButton>
          </Link>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6">
      <WaterBg imageUrl={heroImage} />
      <GlassCard className="w-full max-w-lg">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">
          Daftar Member Baru
        </h1>
        <p className="mb-6 text-sm text-slate-700">
          Isi data di bawah, admin akan meninjau pendaftaran Anda.
        </p>

        <form action={submitRegistrationAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Nama Anak/Peserta
            </label>
            <GlassInput name="child_name" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">
                Nama Orang Tua
              </label>
              <GlassInput name="parent_name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">
                Email
              </label>
              <GlassInput name="parent_email" type="email" required />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Nomor Telepon/WhatsApp
            </label>
            <GlassInput name="parent_phone" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Program
            </label>
            <GlassSelect name="program_id" required defaultValue="">
              <option value="" disabled>
                Pilih program
              </option>
              {programs?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </GlassSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Jadwal yang Diminati (opsional)
            </label>
            <GlassInput
              name="preferred_schedule"
              placeholder="Contoh: Sabtu pagi"
            />
          </div>

          {error && (
            <p className="text-sm text-red-700">
              {decodeURIComponent(error)}
            </p>
          )}

          <GlassButton type="submit" className="mt-2">
            Kirim Pendaftaran
          </GlassButton>
        </form>
      </GlassCard>
    </div>
  );
}
