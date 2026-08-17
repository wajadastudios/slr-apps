"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

const KEYS = [
  "address",
  "phone",
  "email",
  "operating_hours",
  "stat_families",
  "stat_years",
  "stat_rating",
  "about_text",
  "founder_certifications",
] as const;

export async function saveSiteSettingsAction(formData: FormData) {
  await requireAdmin();

  const supabase = await createClient();

  const rows = KEYS.map((key) => ({
    key,
    value: String(formData.get(key) ?? "").trim(),
  }));

  const { error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    redirect(`/admin/pengaturan?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/pengaturan");
  revalidatePath("/");
  redirect("/admin/pengaturan?saved=1");
}
