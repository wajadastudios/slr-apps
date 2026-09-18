"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  requireAdmin,
  createAccount,
  updateAccountCredentials,
} from "@/lib/create-account";

export async function createOrangTuaAction(formData: FormData) {
  await requireAdmin();

  const { error } = await createAccount("ortu", formData);
  if (error) {
    redirect(`/admin/orang-tua?error=${encodeURIComponent(error)}`);
  }

  revalidatePath("/admin/orang-tua");
  redirect("/admin/orang-tua");
}

export async function updateOrtuAccountAction(formData: FormData) {
  await requireAdmin();

  const { error } = await updateAccountCredentials("ortu", formData);
  if (error) {
    redirect(`/admin/orang-tua?error=${encodeURIComponent(error)}`);
  }

  revalidatePath("/admin/orang-tua");
  redirect("/admin/orang-tua?account_updated=1");
}
