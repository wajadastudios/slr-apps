"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, createAccount } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function approveRegistrationAction(formData: FormData) {
  await requireAdmin();

  const registration_id = String(formData.get("registration_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();

  if (!registration_id || !email) {
    redirect(
      `/admin/pendaftar?error=${encodeURIComponent("Data tidak lengkap.")}`
    );
  }

  const supabase = await createClient();

  const { data: registration } = await supabase
    .from("registrations")
    .select("child_name, parent_name, program_id")
    .eq("id", registration_id)
    .single();

  if (!registration) {
    redirect(
      `/admin/pendaftar?error=${encodeURIComponent("Pendaftar tidak ditemukan.")}`
    );
  }

  const { error: accountError } = await createAccount("ortu", formData);

  if (accountError) {
    redirect(`/admin/pendaftar?error=${encodeURIComponent(accountError)}`);
  }

  const { data: newUser } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!newUser) {
    redirect(
      `/admin/pendaftar?error=${encodeURIComponent("Akun dibuat, tapi murid gagal ditautkan. Tambahkan manual di halaman Murid.")}`
    );
  }

  await supabase.from("students").insert({
    full_name: registration!.child_name,
    parent_id: newUser.id,
    program_id: registration!.program_id,
  });

  await supabase
    .from("registrations")
    .update({ status: "approved" })
    .eq("id", registration_id);

  revalidatePath("/admin/pendaftar");
  redirect("/admin/pendaftar");
}

export async function rejectRegistrationAction(formData: FormData) {
  await requireAdmin();

  const registration_id = String(formData.get("registration_id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("registrations")
    .update({ status: "rejected" })
    .eq("id", registration_id);

  revalidatePath("/admin/pendaftar");
}
