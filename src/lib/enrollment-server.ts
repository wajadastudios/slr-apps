import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/site-url";
import { sendWhatsApp } from "@/lib/whatsapp";
import { PROGRAM_SELECT, normalizeProgram, type ProgramMeta } from "@/lib/programs";
import { scheduleConfirmedMessage, slotDescription, type EnrollmentStatus } from "@/lib/enrollment";

export type EnrollmentRow = {
  id: string;
  student_id: string;
  program_id: string;
  status: EnrollmentStatus;
  source: string;
  slot_id: string | null;
  offered_slot_id: string | null;
  offer_token: string | null;
  offer_expires_at: string | null;
  preferred_schedule: string | null;
  preferred_location: string | null;
  // the participant allowed the registering account to see schedule + reports
  report_access_granted_to_requester: boolean;
  created_at: string;
  program: ProgramMeta;
};

// Enrollments of the given participants, with each program's assessment meta.
// RLS scopes this to what the caller may see.
export async function loadEnrollments(
  supabase: SupabaseClient,
  studentIds: string[]
): Promise<EnrollmentRow[]> {
  if (studentIds.length === 0) return [];
  const { data } = await supabase
    .from("enrollments")
    .select(
      `id, student_id, program_id, status, source, slot_id, offered_slot_id, offer_token, offer_expires_at, preferred_schedule, preferred_location, report_access_granted_to_requester, created_at, program:program_id(${PROGRAM_SELECT})`
    )
    .in("student_id", studentIds)
    .order("created_at", { ascending: true });

  return ((data ?? []) as unknown as (Omit<EnrollmentRow, "program"> & {
    program: Parameters<typeof normalizeProgram>[0] | null;
  })[])
    .filter((e) => e.program)
    .map((e) => ({ ...e, program: normalizeProgram(e.program!) }));
}

type SlotInfo = { day_of_week: number; start_time: string; location: string | null; label: string | null };

async function adminPhone(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin.from("site_settings").select("value").eq("key", "phone").maybeSingle();
  return data?.value ?? null;
}

// WhatsApp after a participant answered a schedule offer. Best effort: a
// failed message never changes the outcome that was already committed.
export async function notifyOfferOutcome(outcome: string, enrollmentId: string) {
  const admin = createAdminClient();
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id, slot_id, student:student_id(full_name, parent_id, phone), program:program_id(name)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enrollment) return;

  const student = enrollment.student as unknown as { full_name: string; parent_id: string; phone: string | null } | null;
  const program = enrollment.program as unknown as { name: string } | null;
  const programName = program?.name ?? "kelas";

  if (outcome === "accepted") {
    const [{ data: user }, { data: slot }] = await Promise.all([
      admin.from("users").select("phone").eq("id", student?.parent_id ?? "").maybeSingle(),
      admin
        .from("class_slots")
        .select("day_of_week, start_time, location, label")
        .eq("id", enrollment.slot_id ?? "")
        .maybeSingle(),
    ]);
    if (slot) {
      await sendWhatsApp(
        student?.phone || user?.phone,
        scheduleConfirmedMessage({ program: programName, slot: slot as SlotInfo })
      );
    }
    return;
  }

  if (outcome === "declined" || outcome === "slot_full" || outcome === "expired") {
    const origin = await getSiteOrigin();
    const reason =
      outcome === "declined"
        ? "belum cocok dengan jadwal yang ditawarkan"
        : outcome === "slot_full"
          ? "jadwal yang ditawarkan sudah penuh saat disetujui"
          : "penawaran jadwal sudah kedaluwarsa";
    await sendWhatsApp(
      await adminPhone(admin),
      `${student?.full_name ?? "Peserta"} — ${programName}: ${reason}. Mohon tawarkan jadwal lain: ${origin}/admin/pendaftar/kelas/${enrollmentId}`
    );
  }
}

export { slotDescription };
