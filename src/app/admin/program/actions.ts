"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function updateSkillTemplateAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("skill_template") ?? "");
  const skills = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const supabase = await createClient();
  await supabase
    .from("programs")
    .update({ skill_template: skills })
    .eq("id", id);

  revalidatePath("/admin/program");
}
