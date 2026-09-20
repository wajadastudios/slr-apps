import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/site-url";
import { sendWhatsApp } from "@/lib/whatsapp";
import { adminNewRegistrationMessage, participantInviteMessage } from "@/lib/enrollment";
import { DAYS } from "@/lib/days";
import {
  ACK_VERSION,
  type ChildRequest,
  preferenceSummary,
  checkRequestAgainstProgram,
  unsuitableProgramMessage,
  type EnrollmentRequest,
} from "@/lib/registration-input";

export type EnrollmentResult =
  | { ok: true; enrollmentId: string; studentId: string }
  | { ok: false; error: string };

// One place that turns a validated request into an enrollment, for both the
// public page (new account) and the signed-in form. The RPC does the writing
// (participant + enrollment, pending_review, no schedule); this adds the checks
// that need program data and sends the WhatsApp messages.
export async function submitEnrollmentRequest(
  supabase: SupabaseClient,
  account: { id: string; fullName: string },
  request: EnrollmentRequest
): Promise<EnrollmentResult> {
  const { data: program } = await supabase
    .from("programs")
    .select("id, name, active, self_registration, requires_acknowledgement, intended_gender, audience")
    .eq("id", request.program_id)
    .maybeSingle();

  const problem = checkRequestAgainstProgram(
    program ? { ...program, intended_gender: program.intended_gender ?? null, audience: program.audience } : null,
    request
  );
  if (problem || !program) return { ok: false, error: problem ?? "Program tidak ditemukan." };

  const { data, error } = await supabase.rpc("register_enrollment", {
    p_program_id: program.id,
    p_for: request.for,
    p_full_name: request.participant_name,
    p_phone: request.participant_phone,
    p_birth_date: request.birth_date,
    p_gender: request.gender ?? "",
    p_relationship: request.relationship,
    p_preferred_schedule: request.preferred_schedule,
    p_preferred_location: request.preferred_location,
    p_ack_version: program.requires_acknowledgement ? ACK_VERSION : "",
    p_account_mode: request.account_mode,
    p_billing: request.billing,
    p_report_access: request.report_access,
  });

  const row = (Array.isArray(data) ? data[0] : data) as
    | { out_enrollment_id: string; out_student_id: string; out_claim_token: string | null }
    | null;

  if (error || !row) {
    const message = error?.message ?? "";
    return {
      ok: false,
      error: message.includes("already enrolled")
        ? `${request.for === "self" ? "Anda" : request.participant_name} sudah terdaftar di ${program.name}.`
        : message.includes("not suitable")
          ? unsuitableProgramMessage(program.name, request.for)
          : message.includes("not open")
            ? "Program ini belum dibuka untuk pendaftaran mandiri."
            : message.includes("participant account required")
              ? "Pembayaran atau laporan khusus peserta memerlukan akun sendiri untuk peserta."
              : "Pendaftaran belum dapat disimpan. Periksa data lalu coba lagi.",
    };
  }

  // ---- notifications (best effort; the registration is already saved) ----
  const admin = createAdminClient();
  const [{ data: participant }, { data: adminPhone }] = await Promise.all([
    admin.from("students").select("full_name, phone, relationship").eq("id", row.out_student_id).maybeSingle(),
    admin.from("site_settings").select("value").eq("key", "phone").maybeSingle(),
  ]);
  const origin = await getSiteOrigin();

  await sendWhatsApp(
    adminPhone?.value,
    adminNewRegistrationMessage({
      program: program.name,
      name: participant?.full_name ?? request.participant_name ?? account.fullName,
      phone: participant?.phone ?? null,
      preferred: preferenceSummary(request.preferred_schedule, request.preferred_location),
      link: `${origin}/admin/pendaftar/kelas/${row.out_enrollment_id}`,
      registeredBy:
        request.for === "other"
          ? { name: account.fullName, relationship: participant?.relationship ?? null }
          : null,
    })
  );

  // The participant is invited to create / claim their own account.
  if (request.for === "other" && row.out_claim_token && participant?.phone) {
    await sendWhatsApp(
      participant.phone,
      participantInviteMessage({
        name: (participant.full_name ?? request.participant_name).split(" ")[0],
        registeredBy: account.fullName,
        program: program.name,
        link: `${origin}/klaim/${row.out_claim_token}`,
      })
    );
  }

  return { ok: true, enrollmentId: row.out_enrollment_id, studentId: row.out_student_id };
}

export type ChildResult = { ok: true; studentId: string; enrollmentId: string | null } | { ok: false; error: string };

// "Anak saya": an existing child or a new one, booked straight into a slot of a
// children's program (the seat is taken atomically by the database). The child
// appears as its own card on the family dashboard.
export async function submitChildRegistration(
  supabase: SupabaseClient,
  account: { fullName: string },
  request: ChildRequest
): Promise<ChildResult> {
  const { data: slot } = await supabase
    .from("class_slots")
    .select("id, program_id, day_of_week, start_time, label, program:program_id(name)")
    .eq("id", request.slot_id)
    .maybeSingle();
  if (!slot || slot.program_id !== request.program_id) {
    return { ok: false, error: "Jadwal ini bukan untuk program yang dipilih." };
  }

  const { data, error } = await supabase.rpc("register_child_enrollment", {
    p_student_id: request.child_id || null,
    p_full_name: request.child_name,
    p_birth_date: request.birth_date,
    p_slot_id: request.slot_id,
  });
  const row = (Array.isArray(data) ? data[0] : data) as { out_enrollment_id: string | null; out_student_id: string } | null;

  if (error || !row) {
    const message = error?.message ?? "";
    return {
      ok: false,
      error: message.includes("slot is full")
        ? "Maaf, slot jadwal ini baru saja penuh. Silakan pilih jadwal lain."
        : message.includes("already enrolled")
          ? "Anak ini sudah terdaftar di program tersebut."
          : message.includes("not open")
            ? "Program ini tidak tersedia untuk pendaftaran anak."
            : message.includes("not authorized")
              ? "Anak ini tidak terdaftar di akun Anda."
              : "Pendaftaran belum dapat disimpan. Periksa data lalu coba lagi.",
    };
  }

  const admin = createAdminClient();
  const [{ data: adminPhone }, { data: child }] = await Promise.all([
    admin.from("site_settings").select("value").eq("key", "phone").maybeSingle(),
    admin.from("students").select("full_name").eq("id", row.out_student_id).maybeSingle(),
  ]);
  const program = slot.program as unknown as { name: string } | null;
  await sendWhatsApp(
    adminPhone?.value,
    `Pendaftaran baru dari ${account.fullName} untuk anak ${child?.full_name ?? request.child_name}. Permintaan jadwal: ${DAYS[slot.day_of_week]}, ${slot.start_time.slice(0, 5)} WIB${
      program?.name ? ` — ${program.name}` : ""
    }${slot.label ? ` (${slot.label})` : ""}. Mohon di-follow up.`
  );

  return { ok: true, studentId: row.out_student_id, enrollmentId: row.out_enrollment_id };
}
