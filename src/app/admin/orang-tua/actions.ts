"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, createAccount } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createOrangTuaAction(formData: FormData) {
  await requireAdmin();

  const { error } = await createAccount("ortu", formData);
  if (error) {
    redirect(`/admin/orang-tua?error=${encodeURIComponent(error)}`);
  }

  revalidatePath("/admin/orang-tua");
  redirect("/admin/orang-tua");
}

// Account-recovery helper for admins: lets support fix a parent's login
// (wrong email typo, lost access) without the parent needing their own
// working inbox to reset a password themselves.
export async function updateOrtuAccountAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!id || !email) {
    redirect(
      `/admin/orang-tua?error=${encodeURIComponent("Email wajib diisi.")}`
    );
  }
  if (password && password.length < 6) {
    redirect(
      `/admin/orang-tua?error=${encodeURIComponent(
        "Password baru minimal 6 karakter."
      )}`
    );
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("users")
    .select("role")
    .eq("id", id)
    .single();

  if (target?.role !== "ortu") {
    redirect(
      `/admin/orang-tua?error=${encodeURIComponent("Akun tidak ditemukan.")}`
    );
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(id, {
    email,
    email_confirm: true,
    ...(password ? { password } : {}),
  });

  if (error) {
    redirect(`/admin/orang-tua?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.from("users").update({ email }).eq("id", id);

  revalidatePath("/admin/orang-tua");
  redirect("/admin/orang-tua?account_updated=1");
}
