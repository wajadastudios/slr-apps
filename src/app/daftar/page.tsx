import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { submitRegistrationAction } from "./actions";

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const supabase = await createClient();

  const { data: programs } = await supabase
    .from("programs")
    .select("id, name")
    .order("name");

  if (success) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center p-6">
        <GlassCard className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Pendaftaran Diterima
          </h1>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
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
    <div className="flex min-h-screen flex-1 items-center justify-center p-6">
      <GlassCard className="w-full max-w-lg">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">
          Daftar Member Baru
        </h1>
        <p className="mb-6 text-sm text-slate-700 dark:text-slate-300">
          Isi data di bawah, admin akan meninjau pendaftaran Anda.
        </p>

        <form action={submitRegistrationAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Nama Anak/Peserta
            </label>
            <GlassInput name="child_name" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800 dark:text-slate-200">
                Nama Orang Tua
              </label>
              <GlassInput name="parent_name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800 dark:text-slate-200">
                Email
              </label>
              <GlassInput name="parent_email" type="email" required />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Nomor Telepon/WhatsApp
            </label>
            <GlassInput name="parent_phone" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
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
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Jadwal yang Diminati (opsional)
            </label>
            <GlassInput
              name="preferred_schedule"
              placeholder="Contoh: Sabtu pagi"
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 dark:text-red-300">
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
