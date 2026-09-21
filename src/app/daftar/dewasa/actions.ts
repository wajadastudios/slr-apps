"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitEnrollmentRequest } from "@/lib/enrollment-register";
import {
  checkRequestAgainstProgram,
  parseAccountInput,
  parseEnrollmentRequest,
} from "@/lib/registration-input";

function fail(message: string, programId = ""): never {
  redirect(
    `/daftar/dewasa?error=${encodeURIComponent(message)}${programId ? `&program=${encodeURIComponent(programId)}` : ""}`
  );
}

// Public registration: creates the ACCOUNT (the person filling in the form),
// then a participant + an enrollment in `pending_review` -- for the account
// holder ("Saya sendiri") or for someone else ("Pasangan / anggota keluarga").
// No schedule and no class access until the admin has offered a slot and it
// was approved. Everything that can be wrong is checked before the account is
// created.
export async function submitAdultRegistrationAction(formData: FormData) {
  const account = parseAccountInput({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
    website: formData.get("website"),
  });
  const programId = String(formData.get("program_id") ?? "");
  if (!account.ok) fail(account.error, programId);

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
  if (!request.ok) fail(request.error, programId);

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("site_settings")
    .select("key, value")
    .eq("key", "registrasi_dewasa_aktif");
  if (settings?.find((s) => s.key === "registrasi_dewasa_aktif")?.value !== "true") {
    fail("Pendaftaran kelas dewasa belum dibuka.", programId);
  }

  const { data: program } = await admin
    .from("programs")
    .select("id, name, active, self_registration, requires_acknowledgement, intended_gender, audience, registration_open")
    .eq("id", request.value.program_id)
    .maybeSingle();
  const problem = checkRequestAgainstProgram(
    program
      ? { ...program, intended_gender: program.intended_gender ?? null, audience: program.audience, registration_open: program.registration_open }
      : null,
    request.value
  );
  if (problem) fail(problem, programId);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: account.value.email,
    password: account.value.password,
    email_confirm: true,
    user_metadata: { full_name: account.value.full_name, role: "ortu" },
  });
  if (createError || !created?.user) {
    fail(
      /already|registered|exists/i.test(createError?.message ?? "")
        ? "Email ini sudah terdaftar. Silakan masuk, lalu daftar kelas dari halaman Ringkasan."
        : "Akun belum dapat dibuat. Periksa data Anda lalu coba lagi.",
      programId
    );
  }

  await admin.from("users").update({ phone: account.value.phone }).eq("id", created.user.id);

  // Sign the new account in so the registration is made as that account.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: account.value.email,
    password: account.value.password,
  });
  if (signInError) {
    redirect("/login?dibuat=1");
  }

  const result = await submitEnrollmentRequest(
    supabase,
    { id: created.user.id, fullName: account.value.full_name },
    request.value
  );
  if (!result.ok) {
    redirect(`/ortu?error=${encodeURIComponent(`Akun sudah dibuat, tetapi pendaftaran kelas belum tersimpan. ${result.error}`)}`);
  }

  redirect("/ortu?terdaftar=1");
}
