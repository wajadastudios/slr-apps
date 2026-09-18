import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth";

export async function requireAdmin() {
  const session = await getUserWithRole();
  if (!session || session.role !== "admin") {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requirePelatih() {
  const session = await getUserWithRole();
  if (!session || session.role !== "pelatih") {
    throw new Error("Unauthorized");
  }
  return session;
}

// Account-recovery helper for admins: lets support fix a login (wrong email
// typo, lost access, forgotten password) without the account holder needing
// their own working inbox to reset it themselves.
export async function updateAccountCredentials(
  role: "pelatih" | "ortu",
  formData: FormData
): Promise<{ error: string | null }> {
  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!id || !email) {
    return { error: "Email wajib diisi." };
  }
  if (password && password.length < 6) {
    return { error: "Password baru minimal 6 karakter." };
  }

  const supabase = createAdminClient();
  const { data: target } = await supabase
    .from("users")
    .select("role")
    .eq("id", id)
    .single();

  if (target?.role !== role) {
    return { error: "Akun tidak ditemukan." };
  }

  const { error } = await supabase.auth.admin.updateUserById(id, {
    email,
    email_confirm: true,
    ...(password ? { password } : {}),
  });

  if (error) {
    return { error: error.message };
  }

  await supabase.from("users").update({ email }).eq("id", id);

  return { error: null };
}

export async function createAccount(
  role: "pelatih" | "ortu",
  formData: FormData
) {
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!full_name || !email || !password) {
    return { error: "Nama, email, dan password wajib diisi." };
  }
  if (password.length < 6) {
    return { error: "Password minimal 6 karakter." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
