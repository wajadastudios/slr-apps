"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

async function createProgramActionImpl(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    redirect(
      `/admin/program?error=${encodeURIComponent("Nama kategori wajib diisi.")}`
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("programs")
    .insert({ name, description: description || null })
    .select("id")
    .single();
  if (error) {
    redirect(`/admin/program?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/program");
  redirect(`/admin/program${data ? `?id=${data.id}` : ""}`);
}

async function updateSkillTemplateActionImpl(formData: FormData) {
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

  const patch: Record<string, unknown> = {
    name,
    description: description || null,
    badge: badge || null,
  };

  // Indicators are managed as groups (see indicator-actions.ts). The legacy
  // flat list is only still submitted while that migration is not applied.
  if (formData.has("skill_template")) {
    let skills: string[] = [];
    try {
      const parsed = JSON.parse(String(formData.get("skill_template") ?? "[]"));
      if (Array.isArray(parsed)) skills = parsed.filter((s) => typeof s === "string");
    } catch {
      skills = [];
    }
    patch.skill_template = skills;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("programs").update(patch).eq("id", id);
  if (error) {
    redirect(`/admin/program?id=${id}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/program");
  redirect(`/admin/program?id=${id}`);
}

async function toggleProgramActiveActionImpl(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const next_active = String(formData.get("next_active") ?? "") === "true";

  const supabase = await createClient();
  const { error: mutationError } = await supabase.from("programs").update({ active: next_active }).eq("id", id);
  if (mutationError) {
    redirect(`/admin/program?error=${encodeURIComponent(mutationError.message)}`);
  }

  revalidatePath("/admin/program");
  redirect(`/admin/program?id=${id}`);
}

async function deleteProgramActionImpl(formData: FormData) {
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

export const createProgramAction = safeAction(createProgramActionImpl, "Program berhasil ditambahkan");
export const updateSkillTemplateAction = safeAction(updateSkillTemplateActionImpl, "Program berhasil diperbarui");
export const toggleProgramActiveAction = safeAction(toggleProgramActiveActionImpl, "Status program berhasil diperbarui");
export const deleteProgramAction = safeAction(deleteProgramActionImpl, "Program berhasil dihapus");
