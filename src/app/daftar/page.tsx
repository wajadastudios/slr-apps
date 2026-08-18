import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { RegistrationForm } from "@/components/registration-form";

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const supabase = await createClient();

  const [{ data: programs }, { data: gallery }, { data: settings }] =
    await Promise.all([
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
      supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["qris_image_url", "bank_transfer_info"]),
    ]);

  const heroImage = gallery?.find((g) => g.media_type === "image")?.media_url;
  const qrisImageUrl =
    settings?.find((s) => s.key === "qris_image_url")?.value || "";
  const bankTransferInfo =
    settings?.find((s) => s.key === "bank_transfer_info")?.value || "";

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

        {error && (
          <p className="mb-4 text-sm text-red-700">
            {decodeURIComponent(error)}
          </p>
        )}

        <RegistrationForm
          programs={programs ?? []}
          qrisImageUrl={qrisImageUrl}
          bankTransferInfo={bankTransferInfo}
        />
      </GlassCard>
    </div>
  );
}
