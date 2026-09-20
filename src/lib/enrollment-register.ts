import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/site-url";
import { sendWhatsApp } from "@/lib/whatsapp";
import { adminNewRegistrationMessage, participantInviteMessage } from "@/lib/enrollment";
import {
  ACK_VERSION,
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
    .select("id, name, active, self_registration, requires_acknowledgement, intended_gender")
    .eq("id", request.program_id)
    .maybeSingle();

  const problem = checkRequestAgainstProgram(
    program ? { ...program, intended_gender: program.intended_gender ?? null } : null,
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
