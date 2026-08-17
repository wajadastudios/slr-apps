"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, createAccount } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createPelatihAction(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  const { error } = await createAccount("pelatih", formData);
  if (error) {
    redirect(`/admin/pelatih?error=${encodeURIComponent(error)}`);
  }

  if (title) {
    const supabase = await createClient();
    await supabase.from("users").update({ title }).eq("email", email);
  }

  revalidatePath("/admin/pelatih");
  redirect("/admin/pelatih");
}

export async function updatePelatihTitleAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim() || null;

  if (!id) return;

  const supabase = await createClient();
  await supabase.from("users").update({ title }).eq("id", id);

  revalidatePath("/admin/pelatih");
}

export async function deletePelatihAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { count } = await supabase
    .from("class_slots")
    .select("*", { count: "exact", head: true })
    .eq("pelatih_id", id);

  if ((count ?? 0) > 0) {
    redirect(
      `/admin/pelatih?error=${encodeURIComponent(
        `Pengajar ini masih mengajar ${count} slot jadwal aktif. Hapus atau alihkan slot tersebut dulu.`
      )}`
    );
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(id);

  if (error) {
    redirect(`/admin/pelatih?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/pelatih");
  redirect("/admin/pelatih");
}
