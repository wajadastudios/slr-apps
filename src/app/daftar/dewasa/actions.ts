"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/site-url";
import { sendWhatsApp } from "@/lib/whatsapp";
import { adminNewRegistrationMessage } from "@/lib/enrollment";
import { ACK_VERSION, parseAdultRegistration, preferenceSummary } from "@/lib/registration-input";

function fail(message: string): never {
  redirect(`/daftar/dewasa?error=${encodeURIComponent(message)}`);
}

// Public registration for adult / regular participants: creates the login
// account, then an enrollment in `pending_review` (no schedule, no class
// access), then tells the admin on WhatsApp.
export async function submitAdultRegistrationAction(formData: FormData) {
  const parsed = parseAdultRegistration({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
    program_id: formData.get("program_id"),
    preferred_schedule: formData.get("preferred_schedule"),
    preferred_location: formData.get("preferred_location"),
    acknowledged: formData.get("acknowledged"),
    website: formData.get("website"),
  });
  if (!parsed.ok) fail(parsed.error);
  const input = parsed.value;

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", ["registrasi_dewasa_aktif", "phone"]);
  if (settings?.find((s) => s.key === "registrasi_dewasa_aktif")?.value !== "true") {
    fail("Pendaftaran peserta dewasa belum dibuka.");
  }

  const { data: program } = await admin
    .from("programs")
    .select("id, name, active, self_registration, requires_acknowledgement")
    .eq("id", input.program_id)
    .maybeSingle();
  if (!program || !program.active || !program.self_registration) {
    fail("Program ini belum dibuka untuk pendaftaran mandiri.");
  }
  if (program.requires_acknowledgement && !input.acknowledged) {
    fail("Mohon setujui pernyataan konfirmasi terlebih dahulu.");
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, role: "ortu" },
  });
  if (createError || !created?.user) {
    fail(
      /already|registered|exists/i.test(createError?.message ?? "")
        ? "Email ini sudah terdaftar. Silakan masuk, lalu daftar kelas dari halaman Ringkasan."
        : "Akun belum dapat dibuat. Periksa data Anda lalu coba lagi."
    );
  }

  await admin.from("users").update({ phone: input.phone }).eq("id", created.user.id);

  // Sign the new account in so the enrollment is created as the participant.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (signInError) {
    redirect("/login?dibuat=1");
  }

  const { data: enrollmentId, error: enrollError } = await supabase.rpc("register_participant_enrollment", {
    p_program_id: program.id,
    p_preferred_schedule: input.preferred_schedule,
    p_preferred_location: input.preferred_location,
    p_ack_version: program.requires_acknowledgement ? ACK_VERSION : "",
  });
  if (enrollError || !enrollmentId) {
    redirect(`/ortu?error=${encodeURIComponent("Akun sudah dibuat, tetapi pendaftaran kelas belum tersimpan. Silakan daftar ulang dari halaman ini.")}`);
  }

  const origin = await getSiteOrigin();
  await sendWhatsApp(
    settings?.find((s) => s.key === "phone")?.value,
    adminNewRegistrationMessage({
      program: program.name,
      name: input.full_name,
      phone: input.phone,
      preferred: preferenceSummary(input.preferred_schedule, input.preferred_location),
      link: `${origin}/admin/pendaftar/kelas/${enrollmentId}`,
    })
  );

  redirect("/ortu?terdaftar=1");
}
