import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { DayAccordion, FocusDay } from "@/components/teaching-schedule";
import { addDays, formatRange, jakartaToday, startOfWeek, toISODate } from "@/lib/week";
import { GHOST_BUTTON } from "@/lib/ui-classes";
import {
  buildWeek,
  type DaySchedule,
  type Enrollment,
  type ReportLite,
} from "@/lib/teaching-schedule";

// Same window as the pengganti page: two weeks back covers late reports,
// two weeks ahead lets a pengajar look at what is coming.
const MAX_OFFSET = 2;

function Chevron({ left }: { left?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={`h-4 w-4 ${left ? "" : "rotate-180"}`}
      aria-hidden="true"
    >
      <path d="M12.5 5.5L8 10l4.5 4.5" />
    </svg>
  );
}

function WeekNav({ offset, label }: { offset: number; label: string }) {
  const base = `inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/50 bg-white/50 px-3 text-sm font-medium text-[#17263D] backdrop-blur-md ${GHOST_BUTTON}`;
  const disabled = "pointer-events-none opacity-40";

  return (
    <nav aria-label="Navigasi minggu" className="flex items-center justify-between gap-2">
      <Link
        href={`/pelatih?minggu=${offset - 1}`}
        aria-disabled={offset <= -MAX_OFFSET}
        className={`${base} ${offset <= -MAX_OFFSET ? disabled : ""}`}
      >
        <Chevron left />
        <span className="hidden sm:inline">Minggu lalu</span>
      </Link>
      <div className="text-center">
        <p className="text-sm font-semibold text-[#17263D]">
          {offset === 0 ? "Minggu Ini" : offset > 0 ? "Minggu Depan" : "Minggu Lalu"}
        </p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <Link
        href={`/pelatih?minggu=${offset + 1}`}
        aria-disabled={offset >= MAX_OFFSET}
        className={`${base} ${offset >= MAX_OFFSET ? disabled : ""}`}
      >
        <span className="hidden sm:inline">Minggu depan</span>
        <Chevron />
      </Link>
    </nav>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">
      {children}
    </h2>
  );
}

export default async function PelatihDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ minggu?: string }>;
}) {
  const { minggu } = await searchParams;
  const rawOffset = Number(minggu ?? "0");
  const offset = Number.isFinite(rawOffset)
    ? Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.trunc(rawOffset)))
    : 0;

  const supabase = await createClient();

  const [{ data: rows }, { data: reports }] = await Promise.all([
    supabase
      .from("schedules")
      .select(
        "id, student:student_id(id, full_name), slot:slot_id(id, label, location, day_of_week, start_time, program_id, programs:program_id(name))"
      ),
    supabase
      .from("progress_reports")
      .select("student_id, program_id, session_date, attendance, next_focus")
      .order("session_date", { ascending: false }),
  ]);

  const enrollments: Enrollment[] = [];
  for (const row of (rows ?? []) as unknown as {
    student: { id: string; full_name: string } | null;
    slot: {
      id: string;
      label: string | null;
      location: string | null;
      day_of_week: number;
      start_time: string;
      program_id: string;
      programs: { name: string } | null;
    } | null;
  }[]) {
    if (!row.student || !row.slot) continue;
    enrollments.push({
      student: row.student,
      slot: {
        id: row.slot.id,
        label: row.slot.label,
        location: row.slot.location,
        day_of_week: row.slot.day_of_week,
        start_time: row.slot.start_time,
        program_id: row.slot.program_id,
        program: row.slot.programs?.name ?? null,
      },
    });
  }
  const reportList = (reports ?? []) as ReportLite[];

  const today = jakartaToday();
  const todayIso = toISODate(today);
  const weekStart = startOfWeek(today, offset);
  const weekLabel = formatRange(weekStart, addDays(weekStart, 6));

  const week = buildWeek(enrollments, reportList, weekStart, todayIso).filter((d) => d.items.length > 0);

  // Current week: today gets its own section; when today is empty the next
  // day with sessions (possibly next week) takes the spotlight instead.
  const todayDay = offset === 0 ? week.find((d) => d.isToday) : undefined;
  let spotlight: DaySchedule | undefined;
  if (offset === 0 && !todayDay && enrollments.length > 0) {
    spotlight =
      week.find((d) => d.iso > todayIso) ??
      buildWeek(enrollments, reportList, startOfWeek(today, 1), todayIso).find((d) => d.items.length > 0);
  }

  const upcoming = offset === 0 ? week.filter((d) => d.iso > todayIso && d.iso !== spotlight?.iso) : [];
  const earlier = offset === 0 ? week.filter((d) => d.iso < todayIso) : [];
  const otherWeek = offset === 0 ? [] : week;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        Jadwal Mengajar
      </h1>

      <WeekNav offset={offset} label={weekLabel} />

      {enrollments.length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-600">Belum ada siswa yang dijadwalkan untuk Anda.</p>
        </GlassCard>
      )}

      {offset === 0 && enrollments.length > 0 && (
        <>
          {todayDay ? (
            <FocusDay day={todayDay} kicker="Hari ini" />
          ) : (
            <>
              <GlassCard tone="soft">
                <p className="font-[family-name:var(--font-quicksand)] text-base font-bold text-[#17263D]">
                  Tidak ada sesi hari ini
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  Nikmati harinya. Sesi berikutnya ada di bawah.
                </p>
              </GlassCard>
              {spotlight && <FocusDay day={spotlight} kicker="Sesi berikutnya" />}
            </>
          )}

          {upcoming.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionTitle>Jadwal Berikutnya</SectionTitle>
              {upcoming.map((d) => (
                <DayAccordion key={d.iso} day={d} />
              ))}
            </section>
          )}

          {earlier.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionTitle>Sudah Lewat Minggu Ini</SectionTitle>
              {earlier.map((d) => (
                <DayAccordion key={d.iso} day={d} defaultOpen={d.pending > 0} />
              ))}
            </section>
          )}
        </>
      )}

      {offset !== 0 && enrollments.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>{offset > 0 ? "Jadwal Minggu Depan" : "Jadwal Minggu Lalu"}</SectionTitle>
          {otherWeek.map((d) => (
            <DayAccordion key={d.iso} day={d} defaultOpen={d.isPast && d.pending > 0} />
          ))}
        </section>
      )}
    </div>
  );
}
