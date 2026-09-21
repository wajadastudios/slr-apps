"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { loadReadiness, PROGRAM_SETUP_COLUMNS } from "@/lib/admin/readiness-load";
import { readyBlockers } from "@/lib/admin/readiness";
import { isAudience, selfRegistrationFor } from "@/lib/program-audience";

const back = (id: string) => `/admin/program/setup/${id}`;

function fail(id: string, message: string): never {
  redirect(`${back(id)}?error=${encodeURIComponent(message)}`);
}

// The target group decides which registration form lists the program. It only
// touches the two columns that drive that (audience, and self registration
// which follows it): never participants, enrollments, schedules, invoices,
// reports or templates. The change is written to the activity log by the
// database (before, after, who, when).
async function saveAudienceImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const audience = formData.get("audience");
  if (!isAudience(audience)) fail(id, "Perubahan belum tersimpan. Silakan coba lagi.");

  const supabase = await createClient();
  const { data: current } = await supabase.from("programs").select("audience").eq("id", id).maybeSingle();
  if (!current) fail(id, "Perubahan belum tersimpan. Silakan coba lagi.");
  // nothing changed: nothing is written and nothing is logged
  if (current.audience === audience) redirect(back(id));

  const { error } = await supabase
    .from("programs")
    .update({ audience, self_registration: selfRegistrationFor(audience) })
    .eq("id", id);
  if (error) fail(id, "Perubahan belum tersimpan. Silakan coba lagi.");

  revalidatePath(back(id));
  revalidatePath("/admin/program/setup");
  revalidatePath("/ortu");
  revalidatePath("/daftar/dewasa");
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

export const saveAudienceAction = safeAction(saveAudienceImpl, "Jalur pendaftaran program berhasil diperbarui.");
export const setRegistrationOpenAction = safeAction(setRegistrationOpenImpl, "Status pendaftaran program diperbarui");
