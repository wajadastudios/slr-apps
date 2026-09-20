"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { sendWhatsApp } from "@/lib/whatsapp";
import { DAYS } from "@/lib/days";
import { offerOutcomeMessage } from "@/lib/enrollment";
import { notifyOfferOutcome } from "@/lib/enrollment-server";
import { parseEnrollmentRequest } from "@/lib/registration-input";
import { submitEnrollmentRequest } from "@/lib/enrollment-register";

// A signed-in account asks to enrol somebody in a program -- itself ("Saya
// sendiri") or a spouse / family member. Only creates a `pending_review`
// enrollment: no schedule and no class access until admin has offered a slot
// and it was approved.
async function requestEnrollmentActionImpl(formData: FormData) {
  const session = await getUserWithRole();
  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  const request = parseEnrollmentRequest({
    for: formData.get("for"),
    program_id: formData.get("program_id"),
    participant_name: formData.get("participant_name"),
    participant_phone: formData.get("participant_phone"),
    birth_date: formData.get("birth_date"),
    gender: formData.get("gender"),
    relationship: formData.get("relationship"),
    preferred_schedule: formData.get("preferred_schedule"),
    preferred_location: formData.get("preferred_location"),
    acknowledged: formData.get("acknowledged"),
  });
  if (!request.ok) {
    redirect(`/ortu?error=${encodeURIComponent(request.error)}`);
  }

  const supabase = await createClient();
  const result = await submitEnrollmentRequest(
    supabase,
    { id: session.user.id, fullName: session.fullName ?? session.user.email ?? "Pendaftar" },
    request.value
  );
  if (!result.ok) {
    redirect(`/ortu?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/ortu");
  redirect("/ortu");
}

// Answer (approve / decline) a schedule the admin offered.
async function respondScheduleOfferActionImpl(formData: FormData) {
  const session = await getUserWithRole();
  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  const enrollment_id = String(formData.get("enrollment_id") ?? "");
  const accept = String(formData.get("decision") ?? "") === "accept";

  const supabase = await createClient();
  const { data: outcome, error } = await supabase.rpc("respond_schedule_offer_for_me", {
    p_enrollment_id: enrollment_id,
    p_accept: accept,
  });
  if (error || typeof outcome !== "string") {
    redirect(`/ortu?error=${encodeURIComponent("Jawaban belum dapat disimpan. Coba lagi.")}`);
  }

  await notifyOfferOutcome(outcome, enrollment_id);

  const result = offerOutcomeMessage(outcome);
  revalidatePath("/ortu");
  if (!result.ok) {
    redirect(`/ortu?error=${encodeURIComponent(result.message)}`);
  }
  redirect("/ortu");
}

async function cancelEnrollmentActionImpl(formData: FormData) {
  const session = await getUserWithRole();
  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: outcome } = await supabase.rpc("cancel_my_enrollment", {
    p_enrollment_id: String(formData.get("enrollment_id") ?? ""),
  });
  if (outcome !== "cancelled") {
    redirect(`/ortu?error=${encodeURIComponent("Pendaftaran ini tidak dapat dibatalkan.")}`);
  }

  revalidatePath("/ortu");
  redirect("/ortu");
}

async function addChildAndRegisterActionImpl(formData: FormData) {
  const session = await getUserWithRole();
  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  const full_name = String(formData.get("full_name") ?? "").trim();
  const birth_date = String(formData.get("birth_date") ?? "") || null;
  const slot_id = String(formData.get("slot_id") ?? "");

  if (!full_name || !slot_id) {
    redirect(
      `/ortu?error=${encodeURIComponent(
        "Nama anak dan jadwal wajib diisi."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("ortu_add_child_and_register", {
    p_full_name: full_name,
    p_birth_date: birth_date,
    p_slot_id: slot_id,
  });

  if (error) {
    redirect(
      `/ortu?error=${encodeURIComponent(
        error.message.includes("slot is full")
          ? "Maaf, slot jadwal ini baru saja penuh. Silakan pilih jadwal lain."
          : error.message
      )}`
    );
  }

  const { data: slot } = await supabase
    .from("class_slots")
    .select("day_of_week, start_time, label, program:program_id(name)")
    .eq("id", slot_id)
    .single();

  const { data: adminPhone } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "phone")
    .single();

  if (slot) {
    const program = slot.program as unknown as { name: string } | null;
    await sendWhatsApp(
      adminPhone?.value,
      `Pendaftaran baru dari ${session.fullName ?? "orang tua"} untuk anak ${full_name}. Permintaan jadwal: ${DAYS[slot.day_of_week]}, ${slot.start_time.slice(0, 5)} WIB${
        program?.name ? ` — ${program.name}` : ""
      }${slot.label ? ` (${slot.label})` : ""}. Mohon di-follow up.`
    );
  }

  revalidatePath("/ortu");
  redirect("/ortu?child_added=1");
}

export const requestEnrollmentAction = safeAction(requestEnrollmentActionImpl, "Pendaftaran terkirim. Admin akan menghubungi Anda");
export const respondScheduleOfferAction = safeAction(respondScheduleOfferActionImpl, "Jawaban Anda sudah disimpan");
export const cancelEnrollmentAction = safeAction(cancelEnrollmentActionImpl, "Pendaftaran dibatalkan");
export const addChildAndRegisterAction = safeAction(addChildAndRegisterActionImpl, "Pendaftaran berhasil! Admin akan segera menghubungi Anda");
