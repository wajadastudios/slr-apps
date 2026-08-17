"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createProgramAction(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    redirect(
      `/admin/program?error=${encodeURIComponent("Nama kategori wajib diisi.")}`
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .insert({ name, description: description || null })
    .select("id")
    .single();

  revalidatePath("/admin/program");
  redirect(`/admin/program${data ? `?id=${data.id}` : ""}`);
}

export async function updateSkillTemplateAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const badge = String(formData.get("badge") ?? "").trim();

  if (!name) {
    redirect(
      `/admin/program?id=${id}&error=${encodeURIComponent("Nama program wajib diisi.")}`
    );
  }

  let skills: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("skill_template") ?? "[]"));
    if (Array.isArray(parsed)) skills = parsed.filter((s) => typeof s === "string");
  } catch {
    skills = [];
  }

  const supabase = await createClient();
  await supabase
    .from("programs")
    .update({
      name,
      description: description || null,
      skill_template: skills,
      badge: badge || null,
    })
    .eq("id", id);

  revalidatePath("/admin/program");
  redirect(`/admin/program?id=${id}`);
}

export async function toggleProgramActiveAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const next_active = String(formData.get("next_active") ?? "") === "true";

  const supabase = await createClient();
  await supabase.from("programs").update({ active: next_active }).eq("id", id);

  revalidatePath("/admin/program");
  redirect(`/admin/program?id=${id}`);
}

export async function deleteProgramAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("programs").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      redirect(
        `/admin/program?error=${encodeURIComponent(
          "Tidak bisa dihapus — program ini masih dipakai oleh slot jadwal, siswa, atau pendaftar. Nonaktifkan saja, atau hapus/alihkan data terkait dulu."
        )}`
      );
    }
    redirect(`/admin/program?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/program");
  redirect("/admin/program");
}
