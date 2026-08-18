import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { DAYS } from "@/lib/days";
import {
  jakartaToday,
  startOfWeek,
  addDays,
  toISODate,
  formatDayDate,
  formatRange,
} from "@/lib/week";
import { requestSubstitutionAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

// Back 2 weeks covers writing a late report; forward 2 weeks lets a
// pengajar prepare and read the student's notes before the session.
const MAX_OFFSET = 2;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "⏳ Menunggu persetujuan", className: "bg-amber-500/15 text-amber-700" },
  approved: { label: "✅ Disetujui", className: "bg-[#55D6A6]/20 text-[#1a8f6f]" },
  rejected: { label: "❌ Ditolak", className: "bg-red-500/15 text-red-700" },
};

export default async function PenggantiPage({
  searchParams,
}: {
  searchParams: Promise<{ minggu?: string; error?: string; diajukan?: string }>;
}) {
  const { minggu, error, diajukan } = await searchParams;
  const session = await getUserWithRole();
  if (!session) redirect("/login");

  const rawOffset = Number(minggu ?? "0");
  const offset = Number.isFinite(rawOffset)
    ? Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.trunc(rawOffset)))
    : 0;

  const today = jakartaToday();
  const todayIso = toISODate(today);
  const weekStart = startOfWeek(today, offset);

  const supabase = await createClient();

  const [
    { data: slots },
    { data: pelatihNames },
    { data: availability },
    { data: requests },
  ] = await Promise.all([
    supabase
      .from("class_slots")
      .select(
        "id, pelatih_id, label, location, day_of_week, start_time, capacity, programs:program_id(name)"
      )
      .order("day_of_week")
      .order("start_time"),
    // users is own-profile-only for a pengajar, so coach names come from
    // the same narrow RPC the public landing page uses.
    supabase.rpc("get_public_pelatih_names"),
    supabase.rpc("get_slot_availability"),
    supabase
      .from("substitution_requests")
      .select("id, slot_id, session_date, status")
      .eq("requester_id", session.user.id),
  ]);

  const pelatihNameById = new Map<string, string>();
  for (const p of pelatihNames ?? []) pelatihNameById.set(p.id, p.full_name);

  const filledBySlot = new Map<string, number>();
  for (const row of availability ?? []) {
    filledBySlot.set(row.slot_id, Number(row.filled));
  }

  const requestByKey = new Map<string, { status: string }>();
  for (const r of requests ?? []) {
    requestByKey.set(`${r.slot_id}|${r.session_date}`, { status: r.status });
  }

  // Students only become readable once a substitution is approved: the
  // schedules policy gained a has_approved_substitution() branch in 0021.
  const approvedSlotIds = Array.from(
    new Set(
      (requests ?? [])
        .filter((r) => r.status === "approved")
        .map((r) => r.slot_id)
    )
  );

  const { data: enrolled } =
    approvedSlotIds.length > 0
      ? await supabase
          .from("schedules")
          .select("slot_id, student:student_id(id, full_name, nickname)")
          .in("slot_id", approvedSlotIds)
      : { data: null };

  const studentsBySlot = new Map<
    string,
    { id: string; full_name: string; nickname: string | null }[]
  >();
  for (const row of enrolled ?? []) {
    const st = row.student as unknown as {
      id: string;
      full_name: string;
      nickname: string | null;
    } | null;
    if (!st) continue;
    const list = studentsBySlot.get(row.slot_id) ?? [];
    list.push(st);
    studentsBySlot.set(row.slot_id, list);
  }

  // Only other people's slots — you already have access to your own.
  const otherSlots = (slots ?? []).filter(
    (s) => s.pelatih_id !== session.user.id
  );

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return {
      date,
      iso: toISODate(date),
      isToday: toISODate(date) === todayIso,
      slots: otherSlots.filter((s) => s.day_of_week === i),
    };
  }).filter((d) => d.slots.length > 0);

  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
          Pengajar Pengganti
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Pilih sesi yang Anda gantikan, lalu ajukan akses. Pengajar yang
          digantikan dan admin akan menerima WhatsApp berisi link
          persetujuan — akses aktif setelah salah satu menyetujui.
        </p>
      </div>

      {error && (
        <GlassCard className="!border-red-300/60 !bg-red-500/10">
          <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
        </GlassCard>
      )}
      {diajukan && (
        <GlassCard className="!border-[#55D6A6]/50 !bg-[#55D6A6]/10">
          <p className="text-sm text-[#1a8f6f]">
            Permintaan terkirim. Menunggu persetujuan.
          </p>
        </GlassCard>
      )}

      <div className="flex items-center justify-between gap-3">
        <a
          href={`/pelatih/pengganti?minggu=${offset - 1}`}
          className={`rounded-2xl border border-white/30 bg-white/30 px-4 py-2 text-sm font-medium text-slate-900 backdrop-blur-xl hover:bg-white/40 ${
            offset <= -MAX_OFFSET ? "pointer-events-none opacity-40" : ""
          }`}
        >
          &lsaquo; Minggu lalu
        </a>
        <p className="text-center text-sm font-semibold text-[#17263D]">
          {offset === 0 ? "Minggu Ini" : "Minggu"} &middot;{" "}
          {formatRange(weekStart, weekEnd)}
        </p>
        <a
          href={`/pelatih/pengganti?minggu=${offset + 1}`}
          className={`rounded-2xl border border-white/30 bg-white/30 px-4 py-2 text-sm font-medium text-slate-900 backdrop-blur-xl hover:bg-white/40 ${
            offset >= MAX_OFFSET ? "pointer-events-none opacity-40" : ""
          }`}
        >
          Minggu depan &rsaquo;
        </a>
      </div>

      {days.length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-600">
            Tidak ada slot pengajar lain di minggu ini.
          </p>
        </GlassCard>
      )}

      {days.map((day) => (
        <div key={day.iso} className="flex flex-col gap-2">
          <p
            className={`text-sm font-semibold ${
              day.isToday ? "text-[#35C5D0]" : "text-slate-600"
            }`}
          >
            {day.isToday && "HARI INI · "}
            {DAYS[day.date.getDay()]}, {formatDayDate(day.date)}
          </p>

          {day.slots.map((slot) => {
            const program = slot.programs as unknown as { name: string } | null;
            const request = requestByKey.get(`${slot.id}|${day.iso}`);
            const badge = request ? STATUS_BADGE[request.status] : null;
            const filled = filledBySlot.get(slot.id) ?? 0;

            return (
              <GlassCard
                key={slot.id}
                className={day.isToday ? "!border-[#35C5D0]/40" : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[#17263D]">
                      {String(slot.start_time).slice(0, 5)} &mdash;{" "}
                      {program?.name ?? "-"}
                      {slot.label ? ` (${slot.label})` : ""}
                    </p>
                    <p className="text-sm text-slate-600">
                      Coach {pelatihNameById.get(slot.pelatih_id) ?? "-"} &middot;{" "}
                      {filled} siswa
                      {slot.location ? ` · ${slot.location}` : ""}
                    </p>
                  </div>

                  {badge ? (
                    <span
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  ) : (
                    <form action={requestSubstitutionAction} className="shrink-0">
                      <input type="hidden" name="slot_id" value={slot.id} />
                      <input
                        type="hidden"
                        name="session_date"
                        value={day.iso}
                      />
                      <GlassButton
                        type="submit"
                        className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
                      >
                        Ajukan Akses
                      </GlassButton>
                    </form>
                  )}
                </div>

                {request?.status === "approved" && (
                  <div className="mt-3 border-t border-white/30 pt-3">
                    <p className="mb-2 text-xs text-slate-500">
                      Pilih siswa untuk membuat laporan:
                    </p>
                    <div className="flex flex-col gap-2">
                      {(studentsBySlot.get(slot.id) ?? []).length === 0 && (
                        <p className="text-sm text-slate-600">
                          Belum ada siswa terdaftar di slot ini.
                        </p>
                      )}
                      {(studentsBySlot.get(slot.id) ?? []).map((st) => (
                        <div
                          key={st.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/30 bg-white/30 px-4 py-2.5"
                        >
                          <span className="text-sm font-medium text-[#17263D]">
                            {st.nickname || st.full_name}
                          </span>
                          <Link href={`/pelatih/murid/${st.id}`}>
                            <GlassButton className="px-4 py-2 text-sm">
                              Buat Laporan
                            </GlassButton>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      ))}
    </div>
  );
}
