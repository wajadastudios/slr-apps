import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { WaterBg } from "@/components/water-bg";
import { PRIMARY_BUTTON } from "@/lib/ui-classes";
import { claimParticipantAction, createAccountAndClaimAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-xl font-bold text-[#17263D]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg />
      <GlassCard className="w-full max-w-md">{children}</GlassCard>
    </div>
  );
}

// Invitation for a participant who was registered by someone else (spouse or
// family member). It shows only who registered them and for which class --
// never a schedule or report -- and lets them create / link their own account.
export default async function ClaimParticipantPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_claim_info", { p_token: token }).maybeSingle();
  const info = data as { participant_name: string; registered_by: string | null; program_names: string[] } | null;

  if (!info) {
    return (
      <Shell>
        <h1 className={HEADING}>Undangan Tidak Berlaku</h1>
        <p className="mt-2 text-sm text-slate-700">
          Undangan ini sudah dipakai, sudah berakhir, atau tidak ditemukan. Hubungi orang yang mendaftarkan Anda atau
          admin jika ini keliru.
        </p>
        <Link href="/" className="mt-5 inline-block">
          <GlassButton>Kembali ke Beranda</GlassButton>
        </Link>
      </Shell>
    );
  }

  const session = await getUserWithRole();
  const programs = info.program_names.length ? info.program_names.join(", ") : "kelas renang";

  return (
    <Shell>
      <h1 className={HEADING}>Halo, {info.participant_name}</h1>
      <p className="mt-2 text-sm text-slate-700">
        {info.registered_by ?? "Seseorang"} mendaftarkan Anda ke <strong>{programs}</strong> di Sari Les Renang. Buat
        akun Anda sendiri untuk mengikuti prosesnya: jadwal, laporan, dan data Anda hanya dapat dilihat oleh Anda.
        Anda yang memutuskan apakah {info.registered_by ?? "pendaftar"} boleh ikut melihat jadwal dan laporan kelas.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {decodeURIComponent(error)}
        </p>
      )}

      {session ? (
        session.role === "ortu" ? (
          <form action={claimParticipantAction} className="mt-5 flex flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-slate-600">
              Anda masuk sebagai <strong>{session.fullName ?? session.user.email}</strong>.
            </p>
            <GlassButton type="submit" className={`${PRIMARY_BUTTON} w-fit`}>
              Hubungkan ke akun saya
            </GlassButton>
          </form>
        ) : (
          <p className="mt-4 text-sm text-slate-700">
            Akun yang sedang masuk bukan akun peserta. Keluar terlebih dahulu, lalu buka kembali link ini.
          </p>
        )
      ) : (
        <form action={createAccountAndClaimAction} className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800" htmlFor="claim-name">
              Nama lengkap
            </label>
            <GlassInput id="claim-name" name="full_name" required defaultValue={info.participant_name} autoComplete="name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800" htmlFor="claim-phone">
              Nomor WhatsApp
            </label>
            <GlassInput id="claim-phone" name="phone" type="tel" required autoComplete="tel" placeholder="08xxxxxxxxxx" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800" htmlFor="claim-email">
              Email
            </label>
            <GlassInput id="claim-email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800" htmlFor="claim-password">
              Password
            </label>
            <GlassInput id="claim-password" name="password" type="password" required minLength={8} autoComplete="new-password" />
            <p className="text-xs text-slate-500">Minimal 8 karakter.</p>
          </div>
          <GlassButton type="submit" className={`${PRIMARY_BUTTON} w-fit`}>
            Buat Akun Saya
          </GlassButton>
          <p className="text-xs text-slate-600">
            Sudah punya akun?{" "}
            <Link href="/login" className="font-medium text-[#1597A3] underline-offset-4 hover:underline">
              Masuk
            </Link>
            , lalu buka kembali link undangan ini.
          </p>
        </form>
      )}
    </Shell>
  );
}
