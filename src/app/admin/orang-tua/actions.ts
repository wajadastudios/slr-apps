"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  requireAdmin,
  createAccount,
  updateAccountCredentials,
} from "@/lib/create-account";

async function createOrangTuaActionImpl(formData: FormData) {
  await requireAdmin();

  const { error } = await createAccount("ortu", formData);
  if (error) {
    redirect(`/admin/orang-tua?error=${encodeURIComponent(error)}`);
  }

  revalidatePath("/admin/orang-tua");
  redirect("/admin/orang-tua");
}

async function updateOrtuAccountActionImpl(formData: FormData) {
  await requireAdmin();

  const { error } = await updateAccountCredentials("ortu", formData);
  if (error) {
    redirect(`/admin/orang-tua?error=${encodeURIComponent(error)}`);
  }

  revalidatePath("/admin/orang-tua");
  redirect("/admin/orang-tua?account_updated=1");
}

export const createOrangTuaAction = safeAction(createOrangTuaActionImpl, "Akun orang tua berhasil ditambahkan");
export const updateOrtuAccountAction = safeAction(updateOrtuAccountActionImpl, "Akun orang tua berhasil diperbarui");
