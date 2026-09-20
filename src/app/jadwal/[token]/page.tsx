import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { WaterBg } from "@/components/water-bg";
import { offerOutcomeMessage, slotDescription } from "@/lib/enrollment";
import { answerOfferAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-xl font-bold text-[#17263D]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden p-6 font-[family-name:var(--font-plus-jakarta)]">
      <WaterBg />
      <GlassCard className="w-full max-w-md">{children}</GlassCard>
    </div>
  );
}

export default async function ScheduleOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ hasil?: string }>;
}) {
  const { token } = await params;
  const { hasil } = await searchParams;
  const supabase = await createClient();

  // Once answered the token is cleared, so the answer page has to render from
  // the outcome in the URL rather than from the (now gone) offer.
  if (hasil) {
    const result = offerOutcomeMessage(hasil);
    return (
      <Shell>
        <h1 className={HEADING}>{result.ok ? "Terima kasih" : "Jadwal Belum Dapat Dikonfirmasi"}</h1>
        <p className="mt-2 text-sm text-slate-700">{result.message}</p>
        <Link href="/login" className="mt-5 inline-block">
          <GlassButton>Masuk ke Akun</GlassButton>
        </Link>
      </Shell>
    );
  }

  const { data: offer } = await supabase.rpc("get_schedule_offer", { p_token: token }).maybeSingle();
  const o = offer as {
    participant_name: string;
    program_name: string;
    slot_label: string | null;
    day_of_week: number | null;
    start_time: string | null;
    location: string | null;
    expires_at: string | null;
    status: string;
  } | null;

  const valid =
    o &&
    o.status === "schedule_offered" &&
    o.day_of_week !== null &&
    o.start_time &&
    (!o.expires_at || new Date(o.expires_at) > new Date());

  if (!valid) {
    return (
      <Shell>
        <h1 className={HEADING}>Link Tidak Berlaku</h1>
        <p className="mt-2 text-sm text-slate-700">
          Penawaran jadwal ini sudah dijawab, berakhir, atau tidak ditemukan. Hubungi admin jika Anda
          merasa ini keliru.
        </p>
        <Link href="/" className="mt-5 inline-block">
          <GlassButton>Kembali ke Beranda</GlassButton>
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className={HEADING}>Jadwal Kelas Anda</h1>
      <p className="mt-1 text-sm text-slate-700">
        Halo {o.participant_name}, berikut jadwal yang disiapkan admin.
      </p>
      <dl className="mt-4 grid gap-2 rounded-2xl border border-[#35C5D0]/30 bg-[#EEF9FB] p-4 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Program</dt>
          <dd className="font-semibold text-[#17263D]">
            {o.program_name}
            {o.slot_label ? ` (${o.slot_label})` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Jadwal</dt>
          <dd className="font-semibold text-[#17263D]">
            {slotDescription({ day_of_week: o.day_of_week!, start_time: o.start_time! })} WIB
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Lokasi</dt>
          <dd className="font-semibold text-[#17263D]">{o.location || "-"}</dd>
        </div>
      </dl>

      <form action={answerOfferAction} className="mt-5 flex flex-col gap-2">
        <input type="hidden" name="token" value={token} />
        <GlassButton
          type="submit"
          name="decision"
          value="accept"
          className="!bg-[#35C5D0] !text-white hover:!bg-[#2bb0ba]"
        >
          Setujui Jadwal
        </GlassButton>
        <GlassButton type="submit" name="decision" value="decline">
          Belum Cocok
        </GlassButton>
      </form>
      <p className="mt-3 text-xs text-slate-500">
        Kursi dikunci saat Anda menyetujui. Bila jadwal sudah terisi, pendaftaran Anda tetap
        tersimpan dan admin akan menawarkan jadwal lain.
      </p>
    </Shell>
  );
}
