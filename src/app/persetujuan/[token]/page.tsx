import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { DAYS } from "@/lib/days";
import {
  approveSubstitutionAction,
  rejectSubstitutionAction,
} from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-xl font-bold text-[#17263D]";

const ERROR_MESSAGE: Record<string, string> = {
  notfound: "Permintaan tidak ditemukan.",
  forbidden: "Anda tidak berwenang memutuskan permintaan ini.",
  decided: "Permintaan ini sudah diputuskan sebelumnya.",
  expired: "Link persetujuan sudah kedaluwarsa.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg imageUrl={undefined} />
      <GlassCard className="w-full max-w-md">{children}</GlassCard>
    </div>
  );
}

export default async function PersetujuanPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; selesai?: string }>;
}) {
  const { token } = await params;
  const { error, selesai } = await searchParams;

  const session = await getUserWithRole();

  // The link arrives over WhatsApp, which gets forwarded and screenshotted,
  // so approving always requires being signed in as an authorised person.
  if (!session) {
    return (
      <Shell>
        <h1 className={HEADING}>Persetujuan Pengajar Pengganti</h1>
        <p className="mt-2 text-sm text-slate-700">
          Silakan masuk terlebih dahulu untuk melihat dan memutuskan
          permintaan ini.
        </p>
        <Link
          href={`/login?next=/persetujuan/${token}`}
          className="mt-5 inline-block"
        >
          <GlassButton className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]">
            Masuk ke Akun
          </GlassButton>
        </Link>
      </Shell>
    );
  }

  const supabase = await createClient();

  // RLS limits this to the requester and the slot's pengajar (admin has full
  // access) — an unauthorised viewer gets nothing back rather than a leak.
  const [{ data: request }, { data: pelatihNames }] = await Promise.all([
    supabase
      .from("substitution_requests")
      .select(
        "id, status, session_date, requester_id, token_expires_at, decided_at, slot:slot_id(pelatih_id, day_of_week, start_time, label, location, programs:program_id(name))"
      )
      .eq("approval_token", token)
      .maybeSingle(),
    supabase.rpc("get_public_pelatih_names"),
  ]);

  if (!request) {
    return (
      <Shell>
        <h1 className={HEADING}>Permintaan Tidak Ditemukan</h1>
        <p className="mt-2 text-sm text-slate-700">
          Link ini tidak valid, atau akun yang sedang Anda gunakan tidak
          berwenang melihat permintaan ini.
        </p>
        <Link href="/" className="mt-5 inline-block">
          <GlassButton>Kembali ke Beranda</GlassButton>
        </Link>
      </Shell>
    );
  }

  const slot = request.slot as unknown as {
    pelatih_id: string;
    day_of_week: number;
    start_time: string;
    label: string | null;
    location: string | null;
    programs: { name: string } | null;
  } | null;

  const nameById = new Map<string, string>();
  for (const p of pelatihNames ?? []) nameById.set(p.id, p.full_name);

  const isSlotOwner = slot?.pelatih_id === session.user.id;
  const canDecide = session.role === "admin" || isSlotOwner;
  const expired = new Date(request.token_expires_at).getTime() < Date.now();

  return (
    <Shell>
      <h1 className={HEADING}>Persetujuan Pengajar Pengganti</h1>

      <div className="mt-4 flex flex-col gap-1 rounded-xl border border-white/30 bg-white/30 p-4 text-sm text-slate-700">
        <p>
          <span className="text-slate-500">Pengaju:</span>{" "}
          <span className="font-medium text-[#17263D]">
            {nameById.get(request.requester_id) ?? "Pengajar"}
          </span>
        </p>
        <p>
          <span className="text-slate-500">Menggantikan:</span>{" "}
          {slot ? nameById.get(slot.pelatih_id) ?? "-" : "-"}
        </p>
        <p>
          <span className="text-slate-500">Sesi:</span>{" "}
          {slot ? DAYS[slot.day_of_week] : "-"}, {request.session_date} pukul{" "}
          {slot ? String(slot.start_time).slice(0, 5) : "-"}
        </p>
        <p>
          <span className="text-slate-500">Kelas:</span>{" "}
          {slot?.programs?.name ?? "-"}
          {slot?.label ? ` (${slot.label})` : ""}
          {slot?.location ? ` · ${slot.location}` : ""}
        </p>
      </div>

      {error && ERROR_MESSAGE[error] && (
        <p className="mt-4 text-sm text-red-700">{ERROR_MESSAGE[error]}</p>
      )}
      {error && !ERROR_MESSAGE[error] && (
        <p className="mt-4 text-sm text-red-700">{decodeURIComponent(error)}</p>
      )}

      {request.status === "approved" && (
        <p className="mt-4 text-sm font-medium text-[#1a8f6f]">
          ✅ Sudah disetujui. Pengajar pengganti dapat membaca catatan siswa
          dan menulis laporan untuk sesi ini.
        </p>
      )}
      {request.status === "rejected" && (
        <p className="mt-4 text-sm font-medium text-red-700">
          ❌ Permintaan ini ditolak. Tidak ada akses yang diberikan.
        </p>
      )}

      {request.status === "pending" && expired && (
        <p className="mt-4 text-sm text-amber-700">
          Link persetujuan sudah lewat 48 jam. Minta pengajar pengganti
          mengajukan ulang.
        </p>
      )}

      {request.status === "pending" && !expired && !canDecide && (
        <p className="mt-4 text-sm text-slate-600">
          Menunggu persetujuan dari pengajar yang digantikan atau admin.
        </p>
      )}

      {request.status === "pending" && !expired && canDecide && (
        <>
          {selesai && (
            <p className="mt-4 text-sm text-[#1a8f6f]">Keputusan tersimpan.</p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <form action={approveSubstitutionAction}>
              <input type="hidden" name="token" value={token} />
              <GlassButton
                type="submit"
                className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]"
              >
                Setujui
              </GlassButton>
            </form>
            <form action={rejectSubstitutionAction}>
              <input type="hidden" name="token" value={token} />
              <GlassButton className="!border-red-300 !bg-red-500/10 !text-red-700 hover:!bg-red-500/20">
                Tolak
              </GlassButton>
            </form>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Akses berlaku sampai 7 hari setelah tanggal sesi, lalu berakhir
            otomatis. Laporan yang sudah ditulis tetap tersimpan permanen.
          </p>
        </>
      )}
    </Shell>
  );
}
