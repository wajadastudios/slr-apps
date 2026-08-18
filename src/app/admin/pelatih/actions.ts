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

export async function togglePelatihActiveAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("users").update({ active: nextActive }).eq("id", id);

  revalidatePath("/admin/pelatih");
  revalidatePath("/admin/slot-jadwal");
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

  // Reports outlive the account: deleting one now nulls its author
  // (0021 changed the FK to ON DELETE SET NULL) rather than destroying the
  // student's history, but an anonymous report is still a loss. Push the
  // admin towards deactivating instead, which keeps attribution intact.
  const { count: reportCount } = await supabase
    .from("progress_reports")
    .select("*", { count: "exact", head: true })
    .eq("pelatih_id", id);

  if ((reportCount ?? 0) > 0) {
    redirect(
      `/admin/pelatih?error=${encodeURIComponent(
        `Pengajar ini sudah menulis ${reportCount} laporan. Nonaktifkan saja agar riwayat laporan siswa tetap utuh beserta nama penulisnya.`
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
