"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, createAccount } from "@/lib/create-account";

export async function createPelatihAction(formData: FormData) {
  await requireAdmin();

  const { error } = await createAccount("pelatih", formData);
  if (error) {
    redirect(`/admin/pelatih?error=${encodeURIComponent(error)}`);
  }

  revalidatePath("/admin/pelatih");
  redirect("/admin/pelatih");
}
