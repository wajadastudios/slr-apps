"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requirePelatih } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { addGoalEntry, archiveGoal, createGoal, deleteGoalEntry } from "@/lib/goal-db";

// Pengajar manage personal goals only for enrollments assigned to them (RLS:
// pelatih_teaches_enrollment); no comparison between participants exists.

function back(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "");
  const program = String(formData.get("program") ?? "");
  return `/pelatih/murid/${studentId}${program ? `?program=${program}` : ""}`;
}

function done(formData: FormData, error: string | null): never {
  const url = back(formData);
  if (error) redirect(`${url}${url.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`);
  revalidatePath(url.split("?")[0]);
  redirect(url);
}

async function createGoalImpl(formData: FormData) {
  const session = await requirePelatih();
  done(formData, await createGoal(await createClient(), formData, session.user.id));
}
async function addEntryImpl(formData: FormData) {
  const session = await requirePelatih();
  done(formData, await addGoalEntry(await createClient(), formData, session.user.id));
}
async function deleteEntryImpl(formData: FormData) {
  await requirePelatih();
  done(formData, await deleteGoalEntry(await createClient(), formData));
}
async function archiveGoalImpl(formData: FormData) {
  await requirePelatih();
  done(formData, await archiveGoal(await createClient(), formData));
}

export const createPersonalGoalAction = safeAction(createGoalImpl, "Target pribadi ditambahkan");
export const addGoalEntryAction = safeAction(addEntryImpl, "Catatan pencapaian disimpan");
export const deleteGoalEntryAction = safeAction(deleteEntryImpl, "Catatan dihapus");
export const archiveGoalAction = safeAction(archiveGoalImpl, "Target diarsipkan");
