import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { RegistrationForm } from "@/components/registration-form";
import { readyBlockers } from "@/lib/admin/readiness";
import { loadReadiness } from "@/lib/admin/readiness-load";

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const supabase = await createClient();

  const [{ data: allPrograms }, { data: settings }] =
    await Promise.all([
      supabase
        .from("programs")
        .select("id, name, self_registration, audience, assessment_type, records_mode, registration_open")
        .eq("active", true)
        .order("name"),
      supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["registrasi_dewasa_aktif", "trial_fee_amount"]),
    ]);

  // registration_open alone is not enough: a program opened before the
  // readiness checklist existed (or configured incompletely) must never be
  // offered here either -- same gap and same fix as loadRegistrationPrograms
  // in src/lib/registration-data.ts, applied to this separate trial-lead
  // form. Never flips registration_open itself, only filters this one read.
  const openPrograms = (allPrograms ?? []).filter((p) => p.registration_open === true);
  const readiness = await Promise.all(
    openPrograms.map((p) => loadReadiness(supabase, { ...p, active: true }))
  );
  const programs = openPrograms.filter((_, i) => readyBlockers(readiness[i]).length === 0);

  const adultModeEnabled =
    settings?.find((s) => s.key === "registrasi_dewasa_aktif")?.value ===
    "true";
  const trialFeeAmount =
    Number(settings?.find((s) => s.key === "trial_fee_amount")?.value) ||
    50000;

  if (success) {
    return (
      <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6">
        <WaterBg />
        <GlassCard className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900">
            Pendaftaran Diterima
          </h1>
          <p className="mt-2 text-sm text-slate-700">
            Terima kasih! Admin kami akan segera menghubungi Anda melalui
            WhatsApp untuk mengatur jadwal sesi trial.
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
      <WaterBg />
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
          programs={(programs ?? []).map((p) => ({ id: p.id, name: p.name }))}
          selfPrograms={(programs ?? []).filter((p) => p.self_registration).map((p) => ({ id: p.id, name: p.name }))}
          adultModeEnabled={adultModeEnabled}
          trialFeeAmount={trialFeeAmount}
        />
      </GlassCard>
    </div>
  );
}
