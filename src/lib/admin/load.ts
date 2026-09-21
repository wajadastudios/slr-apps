import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jakartaToday, toISODate } from "@/lib/week";
import { coachName } from "./format";
import type { SlotContext } from "./schedule-rules";
import type { InvoiceLite } from "./quota";
import type { QEnrollment, QReport, QSchedule } from "./queue";

// PostgREST returns at most 1000 rows per request; the admin views need all of
// them (every report, every invoice), so read in pages.
export async function selectAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  order = "created_at"
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(order, { ascending: true })
      .range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as unknown as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

export type AdminData = {
  enrollments: QEnrollment[];
  invoices: InvoiceLite[];
  reports: QReport[];
  schedules: QSchedule[];
  slots: SlotContext[];
  slotById: Map<string, SlotContext>;
  filledBySlot: Map<string, number>;
  pelatihNames: Map<string, string>;
  studentNames: Map<string, string>;
  threshold: number;
  overdueDays: number;
  todayISO: string;
  nowMinutes: number;
};

type EnrollmentRow = Omit<QEnrollment, "studentName" | "programName"> & {
  student: { full_name: string } | null;
  program: { name: string } | null;
};

const num = (v: string | null | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Everything the dashboard, billing and participant screens are built from,
// read once. RLS keeps this admin-only.
export async function loadAdminData(supabase: SupabaseClient): Promise<AdminData> {
  const [enrollmentRows, invoices, reports, schedules, slotRows, pelatihRows, studentRows, settingRows] = await Promise.all([
    selectAll<EnrollmentRow>(
      supabase,
      "enrollments",
      "id, student_id, program_id, status, slot_id, offered_slot_id, preferred_schedule, preferred_location, created_at, updated_at, followed_up_at, student:student_id(full_name), program:program_id(name)"
    ),
    selectAll<InvoiceLite>(
      supabase,
      "invoices",
      "id, student_id, enrollment_id, status, sessions_count, amount, package_name, created_at, sent_at"
    ),
    selectAll<QReport>(supabase, "progress_reports", "student_id, program_id, session_date, attendance, enrollment_id", "session_date"),
    selectAll<QSchedule>(supabase, "schedules", "student_id, slot_id, created_at"),
    supabase
      .from("class_slots")
      .select(
        "id, program_id, pelatih_id, label, location, day_of_week, start_time, capacity, duration_minutes, programs:program_id(name), pelatih:pelatih_id(full_name, title)"
      )
      .order("day_of_week")
      .order("start_time"),
    supabase.from("users").select("id, full_name, title").eq("role", "pelatih"),
    supabase.from("students").select("id, full_name"),
    supabase.from("site_settings").select("key, value").in("key", ["ambang_penagihan", "jatuh_tempo_hari"]),
  ]);

  const pelatihNames = new Map<string, string>();
  for (const p of pelatihRows.data ?? []) pelatihNames.set(p.id, coachName(p));

  const studentNames = new Map<string, string>();
  for (const s of studentRows.data ?? []) studentNames.set(s.id, s.full_name);

  const slots: SlotContext[] = (slotRows.data ?? []).map((s) => {
    const program = s.programs as unknown as { name: string } | null;
    const pelatih = s.pelatih as unknown as { full_name: string; title: string | null } | null;
    return {
      id: s.id,
      program_id: s.program_id,
      pelatih_id: s.pelatih_id,
      location: s.location,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      duration_minutes: s.duration_minutes ?? 60,
      capacity: s.capacity,
      programName: program?.name ?? "Program",
      pelatihName: coachName(pelatih),
    };
  });

  const filledBySlot = new Map<string, number>();
  for (const sc of schedules) filledBySlot.set(sc.slot_id, (filledBySlot.get(sc.slot_id) ?? 0) + 1);

  const setting = (key: string) => (settingRows.data ?? []).find((r) => r.key === key)?.value;

  const now = new Date();
  const today = jakartaToday();
  const jakartaMinutes =
    Number(now.toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).slice(0, 2)) * 60 +
    Number(now.toLocaleTimeString("en-GB", { minute: "2-digit", timeZone: "Asia/Jakarta" }).slice(-2));

  return {
    enrollments: enrollmentRows.map((e) => ({
      id: e.id,
      student_id: e.student_id,
      program_id: e.program_id,
      status: e.status,
      slot_id: e.slot_id,
      offered_slot_id: e.offered_slot_id,
      preferred_schedule: e.preferred_schedule,
      preferred_location: e.preferred_location,
      created_at: e.created_at,
      updated_at: e.updated_at,
      followed_up_at: e.followed_up_at,
      studentName: e.student?.full_name ?? "Peserta",
      programName: e.program?.name ?? "Program",
    })),
    invoices,
    reports,
    schedules,
    slots,
    slotById: new Map(slots.map((s) => [s.id, s])),
    filledBySlot,
    pelatihNames,
    studentNames,
    threshold: num(setting("ambang_penagihan"), 2),
    overdueDays: num(setting("jatuh_tempo_hari"), 7),
    todayISO: toISODate(today),
    nowMinutes: jakartaMinutes,
  };
}
