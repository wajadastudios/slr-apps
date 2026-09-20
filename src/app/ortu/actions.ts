"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { sendWhatsApp } from "@/lib/whatsapp";
import { DAYS } from "@/lib/days";
import { getSiteOrigin } from "@/lib/site-url";
import { adminNewRegistrationMessage, offerOutcomeMessage } from "@/lib/enrollment";
import { notifyOfferOutcome } from "@/lib/enrollment-server";
import { ACK_VERSION, preferenceSummary } from "@/lib/registration-input";

// A logged-in participant (adult, or a parent registering themselves) asks to
// join a program. This only creates a `pending_review` enrollment: no
// schedule and no class access until admin has offered a slot and it was
// approved.
async function requestEnrollmentActionImpl(formData: FormData) {
  const session = await getUserWithRole();
  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  const program_id = String(formData.get("program_id") ?? "");
  if (!program_id) {
    redirect(`/ortu?error=${encodeURIComponent("Program wajib dipilih.")}`);
  }

  const supabase = await createClient();
  const { data: program } = await supabase
    .from("programs")
    .select("id, name, requires_acknowledgement")
    .eq("id", program_id)
    .maybeSingle();
  if (!program) {
    redirect(`/ortu?error=${encodeURIComponent("Program tidak ditemukan.")}`);
  }
  const acknowledged = formData.get("acknowledged") === "on";
  if (program.requires_acknowledgement && !acknowledged) {
    redirect(`/ortu?error=${encodeURIComponent("Mohon setujui pernyataan konfirmasi terlebih dahulu.")}`);
  }

  const preferred_schedule = String(formData.get("preferred_schedule") ?? "");
  const preferred_location = String(formData.get("preferred_location") ?? "");

  const { data: enrollmentId, error } = await supabase.rpc("register_participant_enrollment", {
    p_program_id: program_id,
    p_preferred_schedule: preferred_schedule,
    p_preferred_location: preferred_location,
    p_ack_version: program.requires_acknowledgement ? ACK_VERSION : "",
  });

  if (error || !enrollmentId) {
    redirect(
      `/ortu?error=${encodeURIComponent(
        error?.message.includes("already enrolled")
          ? `Anda sudah terdaftar di ${program.name}.`
          : error?.message.includes("not open")
            ? "Program ini belum dibuka untuk pendaftaran mandiri."
            : "Pendaftaran belum dapat disimpan. Coba lagi."
      )}`
    );
  }

  const [{ data: phoneSetting }, { data: me }] = await Promise.all([
    supabase.from("site_settings").select("value").eq("key", "phone").single(),
    supabase.from("users").select("phone").eq("id", session.user.id).maybeSingle(),
  ]);
  const origin = await getSiteOrigin();
  await sendWhatsApp(
    phoneSetting?.value,
    adminNewRegistrationMessage({
      program: program.name,
      name: session.fullName ?? session.user.email ?? "Peserta",
      phone: me?.phone ?? null,
      preferred: preferenceSummary(preferred_schedule, preferred_location),
      link: `${origin}/admin/pendaftar/kelas/${enrollmentId}`,
    })
  );

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
