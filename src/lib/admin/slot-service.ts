import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coachName } from "./format";
import {
  checkSlot,
  participantConflicts,
  type Conflict,
  type SlotContext,
  type SlotLike,
} from "./schedule-rules";

export type SlotInput = {
  program_id: string;
  pelatih_id: string;
  label: string | null;
  location: string | null;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
};

export function parseSlotInput(formData: FormData): { ok: true; value: SlotInput } | { ok: false; error: string } {
  const program_id = String(formData.get("program_id") ?? "");
  const pelatih_id = String(formData.get("pelatih_id") ?? "");
  const day = String(formData.get("day_of_week") ?? "");
  const time = String(formData.get("start_time") ?? "").slice(0, 5);
  const capacity = Number(formData.get("capacity") ?? "");
  const duration = Number(formData.get("duration_minutes") || 60);

  if (!program_id || !pelatih_id || day === "" || !/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, error: "Program, pengajar, hari, dan jam wajib diisi." };
  }
  if (!Number.isInteger(capacity) || capacity < 1) return { ok: false, error: "Kapasitas minimal 1 peserta." };
  if (!Number.isInteger(duration) || duration < 15 || duration > 240) {
    return { ok: false, error: "Durasi kelas harus antara 15 dan 240 menit." };
  }
  const dayNum = Number(day);
  if (!Number.isInteger(dayNum) || dayNum < 0 || dayNum > 6) return { ok: false, error: "Hari tidak valid." };

  return {
    ok: true,
    value: {
      program_id,
      pelatih_id,
      label: String(formData.get("label") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      day_of_week: dayNum,
      start_time: `${time}:00`,
      duration_minutes: duration,
      capacity,
    },
  };
}

export async function loadSlotContexts(supabase: SupabaseClient) {
  const [{ data: slotRows }, { data: schedules }] = await Promise.all([
    supabase
      .from("class_slots")
      .select(
        "id, program_id, pelatih_id, location, day_of_week, start_time, capacity, duration_minutes, programs:program_id(name), pelatih:pelatih_id(full_name, title)"
      ),
    supabase.from("schedules").select("id, student_id, slot_id, student:student_id(full_name)"),
  ]);
  const slots: SlotContext[] = (slotRows ?? []).map((s) => ({
    id: s.id,
    program_id: s.program_id,
    pelatih_id: s.pelatih_id,
    location: s.location,
    day_of_week: s.day_of_week,
    start_time: s.start_time,
    duration_minutes: s.duration_minutes ?? 60,
    capacity: s.capacity,
    programName: (s.programs as unknown as { name: string } | null)?.name ?? "Program",
    pelatihName: coachName(s.pelatih as unknown as { full_name: string; title: string | null } | null),
  }));
  const rows = (schedules ?? []).map((s) => ({
    schedule_id: s.id as string,
    student_id: s.student_id as string,
    slot_id: s.slot_id as string,
    name: (s.student as unknown as { full_name: string } | null)?.full_name ?? "Peserta",
  }));
  return { slots, rows };
}

export type SlotPlan = {
  conflicts: Conflict[];
  affected: { schedule_id: string; student_id: string; name: string; issues: Conflict[] }[];
  // an existing slot with participants whose day/time/place/coach changes
  material: boolean;
  before: SlotContext | null;
  names: { programName: string; pelatihName: string };
};

// Everything the admin needs to know before a slot is created or changed.
export async function planSlot(supabase: SupabaseClient, id: string | null, input: SlotInput): Promise<SlotPlan> {
  const { slots, rows } = await loadSlotContexts(supabase);
  const before = id ? (slots.find((s) => s.id === id) ?? null) : null;
  const filledNow = id ? rows.filter((r) => r.slot_id === id).length : 0;
  const programName = slots.find((s) => s.program_id === input.program_id)?.programName;
  const pelatihName = slots.find((s) => s.pelatih_id === input.pelatih_id)?.pelatihName;

  const [{ data: program }, { data: pelatih }] = await Promise.all([
    programName ? Promise.resolve({ data: { name: programName } }) : supabase.from("programs").select("name").eq("id", input.program_id).maybeSingle(),
    pelatihName
      ? Promise.resolve({ data: null })
      : supabase.from("users").select("full_name, title").eq("id", input.pelatih_id).maybeSingle(),
  ]);
  const names = {
    programName: program?.name ?? "program ini",
    pelatihName: pelatihName ?? coachName(pelatih as { full_name: string; title: string | null } | null),
  };

  const candidate: SlotLike = { ...input, id: id ?? undefined };
  const conflicts = checkSlot(candidate, slots, names, filledNow);

  const material =
    !!before &&
    filledNow > 0 &&
    (before.day_of_week !== input.day_of_week ||
      before.start_time.slice(0, 5) !== input.start_time.slice(0, 5) ||
      before.duration_minutes !== input.duration_minutes ||
      (before.location ?? "") !== (input.location ?? "") ||
      before.pelatih_id !== input.pelatih_id);

  // each current participant must still be free at the new time
  const affected = rows
    .filter((r) => r.slot_id === id)
    .map((r) => {
      const theirOthers = rows
        .filter((o) => o.student_id === r.student_id && o.slot_id !== id)
        .map((o) => slots.find((s) => s.id === o.slot_id))
        .filter((s): s is SlotContext => !!s);
      return { schedule_id: r.schedule_id, student_id: r.student_id, name: r.name, issues: participantConflicts(candidate, r.name, theirOthers) };
    });

  return { conflicts, affected, material, before, names };
}

// Enrollments hold their own slot pointer; keep it in step with the schedule.
export async function syncEnrollmentSlot(
  supabase: SupabaseClient,
  studentId: string,
  programId: string,
  slotId: string | null
) {
  await supabase
    .from("enrollments")
    .update({ slot_id: slotId, updated_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .eq("program_id", programId)
    .not("status", "in", "(cancelled,rejected)");
}
