"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMilestones } from "@/lib/milestone-loader";
import { freezeLegacyAwards, awardMilestoneToExisting } from "@/lib/milestone-awards";
import { parseMilestoneInput } from "@/lib/record-input";
import { computeReorderInGroup, nextSortOrder } from "@/lib/reorder";

// Milestones belong to one program. Every form carries `program_id`, and every
// redirect returns to that program's "Rekor & Milestone" tab.

function backUrl(formData: FormData, selected?: string) {
  const program = String(formData.get("program_id") ?? "");
  const sel = selected ? `&sel=${selected}` : "";
  return `/admin/penilaian?program=${encodeURIComponent(program)}&tab=rekor${sel}`;
}

function fail(formData: FormData, message: string): never {
  redirect(`${backUrl(formData)}&error=${encodeURIComponent(message)}`);
}

function rawInput(formData: FormData) {
  return {
    label: formData.get("label"),
    level: formData.get("level"),
    metric_type: formData.get("metric_type"),
    stroke: formData.get("stroke"),
    distance_m: formData.get("distance_m"),
    bronze: formData.get("bronze"),
    silver: formData.get("silver"),
    gold: formData.get("gold"),
  };
}

async function milestoneUsed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
): Promise<boolean> {
  const { data } = await supabase
    .from("performance_records")
    .select("awards")
    .not("awards", "is", null);
  return (data ?? []).some((r) => {
    const awards = r.awards as Record<string, string> | null;
    return awards ? id in awards : false;
  });
}

// Only programs that award medals may have milestones.
async function requireMedalProgram(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData
): Promise<string> {
  const programId = String(formData.get("program_id") ?? "");
  const { data } = await supabase
    .from("programs")
    .select("id, records_mode")
    .eq("id", programId)
    .maybeSingle();
  if (!data) fail(formData, "Program tidak ditemukan.");
  if (data.records_mode !== "medals") {
    fail(formData, "Program ini tidak memakai medali, jadi tidak punya milestone.");
  }
  return data.id;
}

async function createMilestoneActionImpl(formData: FormData) {
  await requireAdmin();
  const parsed = parseMilestoneInput(rawInput(formData));
  if (!parsed.ok) fail(formData, parsed.error);

  const supabase = await createClient();
  const admin = createAdminClient();
  const programId = await requireMedalProgram(supabase, formData);

  // Freeze what existing records already earned before anything changes --
  // a failure here must stop the milestone from being created at all, since
  // creating it anyway means new records could be judged before old ones
  // were ever locked in.
  const freezeError = await freezeLegacyAwards(admin, await loadMilestones(supabase));
  if (freezeError) fail(formData, freezeError);

  const existing = await loadMilestones(supabase, programId);
  const { data: created, error } = await supabase
    .from("milestones")
    .insert({ ...parsed.value, program_id: programId, sort_order: nextSortOrder(existing) })
    .select("id, label, level, metric_type, stroke, distance_m, bronze, silver, gold, sort_order, active, program_id")
    .single();
  if (error || !created) {
    fail(formData, error?.message ?? "Milestone gagal dibuat.");
  }

  const awardError = await awardMilestoneToExisting(admin, {
    ...created,
    distance_m: created.distance_m === null ? null : Number(created.distance_m),
    bronze: Number(created.bronze),
    silver: Number(created.silver),
    gold: Number(created.gold),
  });

  revalidatePath("/admin/penilaian");
  revalidatePath("/admin/laporan");
  // Milestone itself is already saved at this point -- a retroactive-award
  // failure is reported, not hidden, but does not roll back the creation.
  const sel = `&sel=${created.id}`;
  if (awardError) {
    redirect(
      `${backUrl(formData)}${sel}&error=${encodeURIComponent(
        `Milestone dibuat, tetapi gagal memberi lencana retroaktif ke rekor lama: ${awardError}`
      )}`
    );
  }
  // open the new milestone in the editor
  redirect(backUrl(formData, created.id));
}

async function updateMilestoneActionImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) fail(formData, "Milestone tidak ditemukan.");

  const parsed = parseMilestoneInput(rawInput(formData));
  if (!parsed.ok) fail(formData, parsed.error);

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: current } = await supabase
    .from("milestones")
    .select("metric_type, stroke, distance_m")
    .eq("id", id)
    .single();
  if (!current) fail(formData, "Milestone tidak ditemukan.");

  const currentDistance = current.distance_m === null ? null : Number(current.distance_m);
  const definitionChanged =
    current.metric_type !== parsed.value.metric_type ||
    (current.stroke ?? null) !== parsed.value.stroke ||
    currentDistance !== parsed.value.distance_m;

  if (definitionChanged && (await milestoneUsed(supabase, id))) {
    fail(
      formData,
      "Jenis metrik, gaya, dan jarak tidak bisa diubah karena milestone ini sudah menghasilkan lencana. Nonaktifkan lalu buat milestone baru."
    );
  }

  // Lock in earned badges against the OLD targets before changing them --
  // a failure here must stop the update, or the change would apply on top
  // of history that was never actually frozen.
  const freezeError = await freezeLegacyAwards(admin, await loadMilestones(supabase));
  if (freezeError) fail(formData, freezeError);

  const { error } = await supabase.from("milestones").update(parsed.value).eq("id", id);
  if (error) fail(formData, error.message);

  revalidatePath("/admin/penilaian");
  revalidatePath("/admin/laporan");
  redirect(backUrl(formData, id));
}

async function toggleMilestoneActiveActionImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";
  if (!id) return;

  const supabase = await createClient();
  const freezeError = await freezeLegacyAwards(createAdminClient(), await loadMilestones(supabase));
  if (freezeError) fail(formData, freezeError);

  const { error } = await supabase.from("milestones").update({ active: nextActive }).eq("id", id);
  if (error) fail(formData, error.message);

  revalidatePath("/admin/penilaian");
  revalidatePath("/admin/laporan");
  redirect(backUrl(formData, id));
}

async function moveMilestoneActionImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "") === "up" ? "up" : "down";
  const programId = String(formData.get("program_id") ?? "");

  const supabase = await createClient();
  const { data } = await supabase
    .from("milestones")
    .select("id, sort_order, level")
    .eq("program_id", programId)
    .order("sort_order");
  // moves within its level (Dasar / Menengah / Mahir), never across levels
  const changes = computeReorderInGroup(
    (data ?? []).map((m) => ({ id: m.id, sort_order: m.sort_order, group: m.level })),
    id,
    direction
  );

  for (const change of changes ?? []) {
    const { error } = await supabase
      .from("milestones")
      .update({ sort_order: change.sort_order })
      .eq("id", change.id);
    if (error) fail(formData, error.message);
  }

  revalidatePath("/admin/penilaian");
  redirect(backUrl(formData));
}

async function deleteMilestoneActionImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const freezeError = await freezeLegacyAwards(createAdminClient(), await loadMilestones(supabase));
  if (freezeError) fail(formData, freezeError);

  const { error } = await supabase.rpc("admin_delete_milestone", { p_id: id });
  if (error) {
    fail(
      formData,
      error.message.includes("milestone in use")
        ? "Milestone ini sudah menghasilkan lencana siswa, jadi tidak bisa dihapus. Nonaktifkan saja agar riwayat lencana tetap aman."
        : error.message
    );
  }

  revalidatePath("/admin/penilaian");
  revalidatePath("/admin/laporan");
  redirect(backUrl(formData));
}

export const createMilestoneAction = safeAction(createMilestoneActionImpl, "Milestone berhasil ditambahkan");
export const updateMilestoneAction = safeAction(updateMilestoneActionImpl, "Milestone berhasil diperbarui");
export const toggleMilestoneActiveAction = safeAction(toggleMilestoneActiveActionImpl, "Status milestone berhasil diperbarui");
export const moveMilestoneAction = safeAction(moveMilestoneActionImpl, "Urutan milestone berhasil diperbarui");
export const deleteMilestoneAction = safeAction(deleteMilestoneActionImpl, "Milestone berhasil dihapus");
