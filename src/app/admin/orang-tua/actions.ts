"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, createAccount } from "@/lib/create-account";

export async function createOrangTuaAction(formData: FormData) {
  await requireAdmin();

  const { error } = await createAccount("ortu", formData);
  if (error) {
    redirect(`/admin/orang-tua?error=${encodeURIComponent(error)}`);
  }

  revalidatePath("/admin/orang-tua");
  redirect("/admin/orang-tua");
}
