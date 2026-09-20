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
    .select("id, status, program_id, student_id, slot_id, student:student_id(full_name, parent_id), program:program_id(name)")
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

  const student = enrollment.student as unknown as { full_name: string; parent_id: string } | null;
  const program = enrollment.program as unknown as { name: string } | null;
  const { data: user } = await supabase
    .from("users")
    .select("phone")
    .eq("id", student?.parent_id ?? "")
    .maybeSingle();

  const origin = await getSiteOrigin();
  await sendWhatsApp(
    user?.phone,
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

export const setEnrollmentStatusAction = safeAction(setStatusImpl, "Status pendaftaran diperbarui");
export const offerScheduleAction = safeAction(offerScheduleImpl, "Penawaran jadwal dikirim ke peserta");
export const saveAdjustmentNoteAction = safeAction(saveNoteImpl, "Catatan penyesuaian disimpan");
