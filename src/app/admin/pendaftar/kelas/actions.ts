"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { sendWhatsApp } from "@/lib/whatsapp";
import {
  adminCanMove,
  remainingSeats,
  scheduleOfferMessage,
  type EnrollmentStatus,
} from "@/lib/enrollment";

const OFFER_VALID_HOURS = 72;

function back(id: string) {
  return `/admin/pendaftar/kelas/${id}`;
}

function fail(id: string, message: string): never {
  redirect(`${back(id)}?error=${encodeURIComponent(message)}`);
}

async function loadEnrollment(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("id, status, program_id, student_id, slot_id, student:student_id(full_name, parent_id, phone), program:program_id(name)")
    .eq("id", id)
    .maybeSingle();
  return { supabase, enrollment: data };
}

async function setStatusImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("to") ?? "") as EnrollmentStatus;
  const note = String(formData.get("note") ?? "").trim() || null;

  const { supabase, enrollment } = await loadEnrollment(id);
  if (!enrollment) fail(id, "Pendaftaran tidak ditemukan.");
  const from = enrollment.status as EnrollmentStatus;
  if (!adminCanMove(from, to)) fail(id, "Perubahan status ini tidak diperbolehkan.");

  // Ending a scheduled enrollment frees its seat.
  if (to === "cancelled" && enrollment.slot_id) {
    await supabase
      .from("schedules")
      .delete()
      .eq("student_id", enrollment.student_id)
      .eq("slot_id", enrollment.slot_id);
  }

  const { error } = await supabase
    .from("enrollments")
    .update({
      status: to,
      offered_slot_id: null,
      offer_token: null,
      offer_expires_at: null,
      ...(to === "cancelled" || to === "rejected" ? { decision_note: note } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) fail(id, "Status belum dapat disimpan.");

  revalidatePath(back(id));
  revalidatePath("/admin/pendaftar");
  redirect(back(id));
}

async function offerScheduleImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const slotId = String(formData.get("slot_id") ?? "");
  if (!slotId) fail(id, "Pilih jadwal yang akan ditawarkan.");

  const { supabase, enrollment } = await loadEnrollment(id);
  if (!enrollment) fail(id, "Pendaftaran tidak ditemukan.");
  const from = enrollment.status as EnrollmentStatus;
  if (from !== "schedule_offered" && !adminCanMove(from, "schedule_offered")) {
    fail(id, "Jadwal tidak dapat ditawarkan pada status ini.");
  }

  const { data: slot } = await supabase
    .from("class_slots")
    .select("id, program_id, capacity, day_of_week, start_time, location")
    .eq("id", slotId)
    .maybeSingle();
  if (!slot || slot.program_id !== enrollment.program_id) {
    fail(id, "Jadwal ini bukan untuk program pendaftar.");
  }

  // A soft check so the admin does not offer a full slot; the real, atomic
  // check happens when the participant approves.
  const { data: availability } = await supabase.rpc("get_slot_availability");
  const filled = Number((availability ?? []).find((a: { slot_id: string; filled: number }) => a.slot_id === slotId)?.filled ?? 0);
  if (remainingSeats(slot.capacity, filled) === 0) {
    fail(id, "Slot ini sudah penuh. Pilih jadwal lain.");
  }

  const token = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + OFFER_VALID_HOURS * 3600 * 1000).toISOString();

  const { error } = await supabase
    .from("enrollments")
    .update({
      status: "schedule_offered",
      offered_slot_id: slotId,
      offered_at: new Date().toISOString(),
      offer_token: token,
      offer_expires_at: expires,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) fail(id, "Penawaran belum dapat disimpan.");

  const student = enrollment.student as unknown as { full_name: string; parent_id: string; phone: string | null } | null;
  const program = enrollment.program as unknown as { name: string } | null;
  const { data: user } = await supabase
    .from("users")
    .select("phone")
    .eq("id", student?.parent_id ?? "")
    .maybeSingle();

  const origin = await getSiteOrigin();
  // the offer goes to the PARTICIPANT's own WhatsApp (a spouse registered by
  // someone else answers for themselves); the account's number is the fallback
  await sendWhatsApp(
    student?.phone || user?.phone,
    scheduleOfferMessage({
      name: (student?.full_name ?? "").split(" ")[0] || "Peserta",
      program: program?.name ?? "Kelas",
      slot,
      link: `${origin}/jadwal/${token}`,
    })
  );

  revalidatePath(back(id));
  revalidatePath("/admin/pendaftar");
  redirect(back(id));
}

async function saveNoteImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("adjustment_note") ?? "").trim().slice(0, 300) || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("enrollments")
    .update({ adjustment_note: note, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(id, "Catatan belum dapat disimpan.");

  revalidatePath(back(id));
  redirect(back(id));
}

// Who pays this enrollment's invoices: the family account that registered, or
// the participant's own account. An invoice always has exactly one billing
// account, so changing it also moves the invoices that were not sent yet;
// invoices already sent stay with whoever received them.
async function setBillingPayerImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const payer = String(formData.get("payer") ?? "");
  if (payer !== "requester" && payer !== "participant") fail(id, "Pilih penanggung jawab pembayaran.");

  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, student:student_id(parent_id, user_id)")
    .eq("id", id)
    .maybeSingle();
  if (!enrollment) fail(id, "Pendaftaran tidak ditemukan.");

  const student = enrollment.student as unknown as { parent_id: string; user_id: string | null } | null;
  const account = payer === "participant" ? student?.user_id : student?.parent_id;
  if (!account) {
    fail(id, "Peserta belum memiliki akun sendiri. Minta peserta membuka undangan terlebih dahulu.");
  }

  const { count: inFlight } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", id)
    .in("status", ["sent", "processing"]);
  if ((inFlight ?? 0) > 0) {
    fail(id, "Ada tagihan yang sudah dikirim atau sedang diverifikasi. Selesaikan tagihan itu dulu sebelum mengganti penanggung jawab.");
  }

  const { error } = await supabase
    .from("enrollments")
    .update({ billing_mode: payer, billing_contact_user_id: account, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(id, "Penanggung jawab pembayaran belum dapat disimpan.");

  await supabase
    .from("invoices")
    .update({ billing_account_id: account })
    .eq("enrollment_id", id)
    .in("status", ["draft", "approved"]);

  revalidatePath(back(id));
  redirect(back(id));
}

export const setBillingPayerAction = safeAction(setBillingPayerImpl, "Penanggung jawab pembayaran diperbarui");
export const setEnrollmentStatusAction = safeAction(setStatusImpl, "Status pendaftaran diperbarui");
export const offerScheduleAction = safeAction(offerScheduleImpl, "Penawaran jadwal dikirim ke peserta");
export const saveAdjustmentNoteAction = safeAction(saveNoteImpl, "Catatan penyesuaian disimpan");
