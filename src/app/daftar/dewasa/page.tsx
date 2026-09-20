import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { AdultRegistrationForm } from "@/components/adult-registration-form";

export default async function DaftarDewasaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: programs }, { data: settings }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, description, requires_acknowledgement")
      .eq("active", true)
      .eq("self_registration", true)
      .order("name"),
    supabase.from("site_settings").select("key, value").eq("key", "registrasi_dewasa_aktif"),
  ]);

  const open = settings?.find((s) => s.key === "registrasi_dewasa_aktif")?.value === "true";

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6">
      <WaterBg />
      <GlassCard className="w-full max-w-lg">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Daftar Kelas Dewasa</h1>

        {!open || !programs || programs.length === 0 ? (
          <>
            <p className="mt-2 text-sm text-slate-700">
              Pendaftaran kelas dewasa belum dibuka. Silakan hubungi admin melalui WhatsApp.
            </p>
            <Link href="/" className="mt-5 inline-block">
              <GlassButton>Kembali ke Beranda</GlassButton>
            </Link>
          </>
        ) : (
          <>
            <p className="mb-5 text-sm text-slate-700">
              Buat akun Anda dan pilih program. Admin akan mencarikan jadwal yang sesuai dan
              menghubungi Anda melalui WhatsApp — jadwal baru berlaku setelah Anda setujui.
            </p>
            {error && <p className="mb-4 text-sm text-red-700">{decodeURIComponent(error)}</p>}
            <AdultRegistrationForm programs={programs} />
            <p className="mt-4 text-center text-xs text-slate-600">
              Sudah punya akun?{" "}
              <Link href="/login" className="font-medium text-[#1597A3] underline-offset-4 hover:underline">
                Masuk
              </Link>
            </p>
          </>
        )}
      </GlassCard>
    </div>
  );
}
