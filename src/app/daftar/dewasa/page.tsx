import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { WaterBg } from "@/components/water-bg";
import { EnrollmentRequestFields } from "@/components/enrollment-request-fields";
import { loadRegistrationPrograms } from "@/lib/registration-data";
import { submitAdultRegistrationAction } from "./actions";

export default async function DaftarDewasaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; program?: string }>;
}) {
  const { error, program } = await searchParams;
  const supabase = await createClient();

  const [{ programs, error: loadError }, { data: settings }] = await Promise.all([
    loadRegistrationPrograms(),
    supabase.from("site_settings").select("key, value").eq("key", "registrasi_dewasa_aktif"),
  ]);

  const open = settings?.find((s) => s.key === "registrasi_dewasa_aktif")?.value === "true";

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6">
      <WaterBg />
      <GlassCard className="w-full max-w-2xl">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Daftar Kelas Remaja &amp; Dewasa</h1>

        {!open ? (
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
              Buat akun Anda, pilih siapa yang akan mengikuti kelas, lalu pilih program. Admin akan mencarikan jadwal
              yang sesuai dan menghubungi melalui WhatsApp &mdash; jadwal baru berlaku setelah disetujui.
            </p>
            {error && (
              <p role="alert" className="mb-4 text-sm text-red-700">
                {decodeURIComponent(error)}
              </p>
            )}

            <form action={submitAdultRegistrationAction} className="flex flex-col gap-5">
              {/* honeypot: real people never see or fill this */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />

              <fieldset className="flex flex-col gap-4 rounded-2xl border border-white/50 bg-white/40 p-4">
                <legend className="px-1 text-sm font-semibold text-[#17263D]">Akun Anda (untuk login)</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm text-slate-800" htmlFor="account-name">
                      Nama lengkap Anda
                    </label>
                    <GlassInput id="account-name" name="full_name" required autoComplete="name" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm text-slate-800" htmlFor="account-phone">
                      Nomor WhatsApp Anda
                    </label>
                    <GlassInput
                      id="account-phone"
                      name="phone"
                      type="tel"
                      required
                      autoComplete="tel"
                      placeholder="08xxxxxxxxxx"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm text-slate-800" htmlFor="account-email">
                      Email
                    </label>
                    <GlassInput id="account-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm text-slate-800" htmlFor="account-password">
                      Password
                    </label>
                    <GlassInput
                      id="account-password"
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-slate-500">Minimal 8 karakter.</p>
                  </div>
                </div>
              </fieldset>

              <EnrollmentRequestFields
                programs={programs}
                loadError={loadError}
                initialProgramId={program}
                submitLabel="Buat Akun & Daftar"
              />
            </form>

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
