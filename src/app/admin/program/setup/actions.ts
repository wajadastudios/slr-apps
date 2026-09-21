"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { loadReadiness, PROGRAM_SETUP_COLUMNS } from "@/lib/admin/readiness-load";
import { readyBlockers } from "@/lib/admin/readiness";

const back = (id: string) => `/admin/program/setup/${id}`;

function fail(id: string, message: string): never {
  redirect(`${back(id)}?error=${encodeURIComponent(message)}`);
}

// Category decides which registration flow lists the program. Adult programs
// are opened through self registration, children's programs through the parent flow.
async function saveAudienceImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const audience = String(formData.get("audience") ?? "");
  if (!["child", "adult", "all"].includes(audience)) fail(id, "Pilih kategori program.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("programs")
    .update({ audience, self_registration: audience !== "child" })
    .eq("id", id);
  if (error) fail(id, "Kategori belum dapat disimpan.");

  revalidatePath(back(id));
  revalidatePath("/admin/program/setup");
  redirect(back(id));
}

// A program may only be opened for registrations when it has what it needs.
async function setRegistrationOpenImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const open = String(formData.get("open") ?? "") === "1";
  const supabase = await createClient();

  if (open) {
    const { data: program } = await supabase.from("programs").select(PROGRAM_SETUP_COLUMNS).eq("id", id).maybeSingle();
    if (!program) fail(id, "Program tidak ditemukan.");
    if (!program.active) fail(id, "Program nonaktif tidak dapat menerima pendaftar. Aktifkan programnya dulu.");
    const blockers = readyBlockers(await loadReadiness(supabase, program));
    if (blockers.length > 0) fail(id, `Program belum siap: ${blockers.join(" ")}`);
  }

  const { error } = await supabase.from("programs").update({ registration_open: open }).eq("id", id);
  if (error) fail(id, "Status pendaftaran belum dapat disimpan.");

  revalidatePath(back(id));
  revalidatePath("/admin/program/setup");
  revalidatePath("/ortu");
  revalidatePath("/daftar/dewasa");
  redirect(back(id));
}

export const saveAudienceAction = safeAction(saveAudienceImpl, "Kategori program disimpan");
export const setRegistrationOpenAction = safeAction(setRegistrationOpenImpl, "Status pendaftaran program diperbarui");
