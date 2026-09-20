"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { offerOutcomeMessage } from "@/lib/enrollment";
import { notifyOfferOutcome } from "@/lib/enrollment-server";
import { parseChildRequest, parseEnrollmentRequest } from "@/lib/registration-input";
import { submitChildRegistration, submitEnrollmentRequest } from "@/lib/enrollment-register";

// "Daftar Kelas Baru": a signed-in account registers somebody. Adults (itself or
// a spouse / family member) only get a `pending_review` enrollment: no schedule
// and no class access until admin has offered a slot and it was approved. A
// child is booked straight into a free slot of a children's program.
async function requestEnrollmentActionImpl(formData: FormData) {
  const session = await getUserWithRole();
  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  if (String(formData.get("for") ?? "") === "child") {
    const child = parseChildRequest({
      child_id: formData.get("child_id"),
      child_name: formData.get("child_name"),
      birth_date: formData.get("birth_date"),
      program_id: formData.get("program_id"),
      slot_id: formData.get("slot_id"),
    });
    if (!child.ok) {
      redirect(`/ortu?error=${encodeURIComponent(child.error)}`);
    }
    const childResult = await submitChildRegistration(
      await createClient(),
      { fullName: session.fullName ?? session.user.email ?? "Orang tua" },
      child.value
    );
    if (!childResult.ok) {
      redirect(`/ortu?error=${encodeURIComponent(childResult.error)}`);
    }
    revalidatePath("/ortu");
    redirect("/ortu?child_added=1");
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
    account_mode: formData.get("account_mode"),
    billing: formData.get("billing"),
    report_access: formData.get("report_access"),
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

export const requestEnrollmentAction = safeAction(requestEnrollmentActionImpl, "Pendaftaran terkirim. Admin akan menghubungi Anda");
export const respondScheduleOfferAction = safeAction(respondScheduleOfferActionImpl, "Jawaban Anda sudah disimpan");
export const cancelEnrollmentAction = safeAction(cancelEnrollmentActionImpl, "Pendaftaran dibatalkan");
