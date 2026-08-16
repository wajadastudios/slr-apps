"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createMuridAction(formData: FormData) {
  await requireAdmin();

  const full_name = String(formData.get("full_name") ?? "").trim();
  const birth_date = String(formData.get("birth_date") ?? "") || null;
  const parent_id = String(formData.get("parent_id") ?? "");
  const program_id = String(formData.get("program_id") ?? "") || null;

  if (!full_name || !parent_id) {
    redirect(
      `/admin/murid?error=${encodeURIComponent("Nama anak dan orang tua wajib diisi.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("students").insert({
    full_name,
    birth_date,
    parent_id,
    program_id,
  });

  if (error) {
    redirect(`/admin/murid?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/murid");
  redirect("/admin/murid");
}
