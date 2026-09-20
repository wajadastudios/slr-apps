"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { addGoalEntry, archiveGoal, createGoal, deleteGoalEntry } from "@/lib/goal-db";

function back(formData: FormData) {
  return `/admin/laporan?id=${encodeURIComponent(String(formData.get("enrollment_id") ?? formData.get("back_id") ?? ""))}`;
}

function done(formData: FormData, error: string | null): never {
  const url = back(formData);
  if (error) redirect(`${url}&error=${encodeURIComponent(error)}`);
  revalidatePath("/admin/laporan");
  redirect(url);
}

async function createGoalImpl(formData: FormData) {
  const session = await requireAdmin();
  done(formData, await createGoal(await createClient(), formData, session.user.id));
}
async function addEntryImpl(formData: FormData) {
  const session = await requireAdmin();
  done(formData, await addGoalEntry(await createClient(), formData, session.user.id));
}
async function deleteEntryImpl(formData: FormData) {
  await requireAdmin();
  done(formData, await deleteGoalEntry(await createClient(), formData));
}
async function archiveGoalImpl(formData: FormData) {
  await requireAdmin();
  done(formData, await archiveGoal(await createClient(), formData));
}

export const createPersonalGoalAction = safeAction(createGoalImpl, "Target pribadi ditambahkan");
export const addGoalEntryAction = safeAction(addEntryImpl, "Catatan pencapaian disimpan");
export const deleteGoalEntryAction = safeAction(deleteEntryImpl, "Catatan dihapus");
export const archiveGoalAction = safeAction(archiveGoalImpl, "Target diarsipkan");
