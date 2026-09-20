import { DAYS } from "@/lib/days";
import { addDays, formatDayDate, toISODate } from "@/lib/week";

export type Enrollment = {
  student: { id: string; full_name: string };
  slot: {
    id: string;
    label: string | null;
    location: string | null;
    day_of_week: number;
    start_time: string;
    program_id: string;
    program: string | null;
  };
};

// Newest first, as the dashboard queries them.
export type ReportLite = {
  student_id: string;
  // the program (enrollment) the report belongs to
  program_id: string | null;
  session_date: string;
  attendance: string | null;
  next_focus: string | null;
};

export type SessionStatus = "belum" | "tersimpan" | "izin" | "sakit" | "mendatang";

export type StudentSession = {
  studentId: string;
  // which enrollment this session is for (a person can have several)
  programId: string;
  name: string;
  status: SessionStatus;
  // trainer's own latest "fokus sesi berikutnya" for this child
  focus: string | null;
  // any report at all exists for this child
  hasReport: boolean;
  // date of this session, used to prefill the report form
  date: string;
};

export type SessionItem = {
  key: string;
  time: string;
  programId: string;
  // program name, shown as a label on every session
  program: string;
  // "Private" / "Grup" (null when the slot has no label)
  classLabel: string | null;
  location: string | null;
  isGroup: boolean;
  students: StudentSession[];
};

export type DaySchedule = {
  iso: string;
  dayName: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  items: SessionItem[];
  // reports still to be written (today and past sessions only)
  pending: number;
};

// "15:00:00" -> "15.00"
export function formatSessionTime(start: string): string {
  return start.slice(0, 5).replace(":", ".");
}

export function sessionStatus(
  report: { attendance: string | null } | undefined,
  dateIso: string,
  todayIso: string
): SessionStatus {
  if (report) {
    if (report.attendance === "izin") return "izin";
    if (report.attendance === "sakit") return "sakit";
    return "tersimpan";
  }
  return dateIso <= todayIso ? "belum" : "mendatang";
}

const isGroupLabel = (label: string | null) => /grup|group/i.test(label ?? "");

// Seven days (Minggu -> Sabtu) of one week. Enrolments of the same slot are
// merged into a single group session; a report belongs to a session when it is
// for that child on that date.
export function buildWeek(
  enrollments: Enrollment[],
  reports: ReportLite[],
  weekStart: Date,
  todayIso: string
): DaySchedule[] {
  // Everything is keyed by participant AND program: the same person can have
  // Adult Swim and Aquanatal sessions and their reports must never mix.
  const reportByKey = new Map<string, ReportLite>();
  const focusByEnrollment = new Map<string, string>();
  const hasReport = new Set<string>();
  for (const r of reports) {
    const enrollment = `${r.student_id}|${r.program_id ?? ""}`;
    const key = `${enrollment}|${r.session_date}`;
    if (!reportByKey.has(key)) reportByKey.set(key, r);
    hasReport.add(enrollment);
    if (!focusByEnrollment.has(enrollment) && r.next_focus?.trim()) {
      focusByEnrollment.set(enrollment, r.next_focus.trim());
    }
  }

  const bySlot = new Map<string, Enrollment[]>();
  for (const e of enrollments) {
    const list = bySlot.get(e.slot.id) ?? [];
    list.push(e);
    bySlot.set(e.slot.id, list);
  }

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const iso = toISODate(date);

    const items: SessionItem[] = [];
    for (const [slotId, list] of bySlot) {
      const slot = list[0].slot;
      if (slot.day_of_week !== i) continue;
      const students: StudentSession[] = list
        .map((e) => {
          const enrollment = `${e.student.id}|${e.slot.program_id}`;
          return {
            studentId: e.student.id,
            programId: e.slot.program_id,
            name: e.student.full_name,
            status: sessionStatus(reportByKey.get(`${enrollment}|${iso}`), iso, todayIso),
            focus: focusByEnrollment.get(enrollment) ?? null,
            hasReport: hasReport.has(enrollment),
            date: iso,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "id"));
      items.push({
        key: `${slotId}|${iso}`,
        time: formatSessionTime(slot.start_time),
        programId: slot.program_id,
        program: slot.program ?? "Kelas",
        classLabel: slot.label,
        location: slot.location,
        isGroup: list.length > 1 || isGroupLabel(slot.label),
        students,
      });
    }
    items.sort((a, b) => a.time.localeCompare(b.time) || a.program.localeCompare(b.program));

    return {
      iso,
      dayName: DAYS[i],
      dateLabel: formatDayDate(date),
      isToday: iso === todayIso,
      isPast: iso < todayIso,
      items,
      pending: items.reduce((n, it) => n + it.students.filter((s) => s.status === "belum").length, 0),
    };
  });
}

// "2 sesi · 2 laporan perlu diisi" / "2 sesi · semua laporan terisi" / "7 sesi"
// (upcoming days carry no report obligation yet)
export function daySummary(day: DaySchedule): string {
  const count = `${day.items.length} sesi`;
  if (!day.isToday && !day.isPast) return count;
  return day.pending > 0
    ? `${count} · ${day.pending} laporan perlu diisi`
    : `${count} · semua laporan terisi`;
}

// First names, shortened: "Sheza, Sabhira, Umar +2"
export function namesPreview(names: string[], max = 3): string {
  const firsts = names.map((n) => n.trim().split(/\s+/)[0]);
  const shown = firsts.slice(0, max).join(", ");
  return firsts.length > max ? `${shown} +${firsts.length - max}` : shown;
}

export function reportHref(
  studentId: string,
  status: SessionStatus,
  date: string,
  programId: string
): string {
  // only an unwritten report needs a date to prefill
  return status === "belum"
    ? `/pelatih/murid/${studentId}?program=${programId}&tanggal=${date}`
    : `/pelatih/murid/${studentId}?program=${programId}`;
}
