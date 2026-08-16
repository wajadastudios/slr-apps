"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function submitRegistrationAction(formData: FormData) {
  const child_name = String(formData.get("child_name") ?? "").trim();
  const parent_name = String(formData.get("parent_name") ?? "").trim();
  const parent_email = String(formData.get("parent_email") ?? "").trim();
  const parent_phone = String(formData.get("parent_phone") ?? "").trim();
  const program_id = String(formData.get("program_id") ?? "");
  const preferred_schedule = String(
    formData.get("preferred_schedule") ?? ""
  ).trim();

  if (!child_name || !parent_name || !parent_email || !program_id) {
    redirect(
      `/daftar?error=${encodeURIComponent(
        "Nama anak, nama orang tua, email, dan program wajib diisi."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("registrations").insert({
    child_name,
    parent_name,
    parent_email,
    parent_phone: parent_phone || null,
    program_id,
    preferred_schedule: preferred_schedule || null,
  });

  if (error) {
    redirect(`/daftar?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/daftar?success=1");
}
