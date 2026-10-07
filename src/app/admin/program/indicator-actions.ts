"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { computeReorder, nextSortOrder } from "@/lib/reorder";

type Db = Awaited<ReturnType<typeof createClient>>;

function back(programId: string, selected?: string) {
  return `/admin/penilaian?program=${encodeURIComponent(programId)}&tab=indikator${
    selected ? `&sel=${encodeURIComponent(selected)}` : ""
  }`;
}

function fail(programId: string, message: string): never {
  redirect(`${back(programId)}&error=${encodeURIComponent(message)}`);
}

// Any structural change bumps the program's template version, which every new
// report records next to its indicator snapshot.
async function done(programId: string, selected?: string): Promise<never> {
  const supabase = await createClient();
  const { data } = await supabase.from("programs").select("template_version").eq("id", programId).maybeSingle();
  if (data && typeof data.template_version === "number") {
    await supabase.from("programs").update({ template_version: data.template_version + 1 }).eq("id", programId);
  }
  revalidatePath("/admin/penilaian");
  revalidatePath("/admin/laporan");
  revalidatePath("/pelatih");
  redirect(back(programId, selected));
}

function str(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

// Once a program is on the level curriculum its indicators are the curriculum's
// (seed_key set) and the old ones are an archive.
async function inLevelsMode(supabase: Db, programId: string): Promise<boolean> {
  const { data } = await supabase.from("programs").select("curriculum_mode").eq("id", programId).maybeSingle();
  return data?.curriculum_mode === "levels_v1";
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "skill"
  );
}

const MIGRATION_HINT =
  "Struktur indikator belum aktif di database. Jalankan migrasi 0030_indicator_groups.sql di Supabase SQL Editor terlebih dahulu.";

function dbError(programId: string, error: { message: string }): never {
  fail(
    programId,
    /indicator_groups|indicators|schema cache|relation/i.test(error.message)
      ? MIGRATION_HINT
      : error.message
  );
}

async function reorder(
  supabase: Db,
  table: "indicator_groups" | "indicators",
  siblings: { id: string; sort_order: number }[],
  id: string,
  direction: "up" | "down",
  programId: string
) {
  for (const change of computeReorder(siblings, id, direction) ?? []) {
    const { error } = await supabase
      .from(table)
      .update({ sort_order: change.sort_order })
      .eq("id", change.id);
    if (error) dbError(programId, error);
  }
}

// ---------------- groups ----------------

async function createGroupActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const name = str(formData, "name");
  if (!programId) redirect("/admin/penilaian");
  if (!name) fail(programId, "Nama kelompok wajib diisi.");

  const supabase = await createClient();
  const { data: siblings, error: readError } = await supabase
    .from("indicator_groups")
    .select("sort_order")
    .eq("program_id", programId);
  if (readError) dbError(programId, readError);

  // On the level curriculum a new group is a new SKILL (it needs a slug, which is
  // what makes the curriculum screens pick it up).
  let skill: Record<string, unknown> = {};
  if (await inLevelsMode(supabase, programId)) {
    const { data: slugs } = await supabase.from("indicator_groups").select("slug").eq("program_id", programId).not("slug", "is", null);
    const taken = new Set((slugs ?? []).map((r) => r.slug as string));
    let slug = slugify(name);
    for (let n = 2; taken.has(slug); n++) slug = `${slugify(name)}_${n}`;
    skill = { slug, skill_kind: "foundation", has_levels: formData.get("has_levels") === "on" };
  }

  const { data: created, error } = await supabase
    .from("indicator_groups")
    .insert({ program_id: programId, name, sort_order: nextSortOrder(siblings ?? []), ...skill })
    .select("id")
    .single();
  if (error) dbError(programId, error);
  await done(programId, created ? `g:${created.id}` : undefined);
}

async function renameGroupActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!name) fail(programId, "Nama kelompok wajib diisi.");

  const supabase = await createClient();
  const { error } = await supabase.from("indicator_groups").update({ name }).eq("id", id);
  if (error) dbError(programId, error);
  await done(programId);
}

async function toggleGroupActiveActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");
  const nextActive = str(formData, "next_active") === "true";

  const supabase = await createClient();
  // Only the flag changes: indicators and every stored score stay untouched.
  const { error } = await supabase.from("indicator_groups").update({ active: nextActive }).eq("id", id);
  if (error) dbError(programId, error);
  await done(programId);
}

async function moveGroupActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");
  const direction = str(formData, "direction") === "up" ? "up" : "down";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("indicator_groups")
    .select("id, sort_order")
    .eq("program_id", programId)
    .order("sort_order");
  if (error) dbError(programId, error);
  await reorder(supabase, "indicator_groups", data ?? [], id, direction, programId);
  await done(programId);
}

// ---------------- indicators ----------------

async function createIndicatorActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const groupId = str(formData, "group_id");
  const label = str(formData, "label");
  if (!label) fail(programId, "Nama indikator wajib diisi.");

  const supabase = await createClient();
  const { data: group } = await supabase.from("indicator_groups").select("slug, has_levels").eq("id", groupId).maybeSingle();
  if (!group) fail(programId, "Kelompok tidak ditemukan.");

  // A skill of the level curriculum gets a curriculum indicator (with a level
  // when the skill has levels); anything else is an old-model indicator.
  const curriculum = !!group.slug && (await inLevelsMode(supabase, programId));
  const levelRaw = str(formData, "level");
  const level = levelRaw === "" ? null : Number(levelRaw);
  if (curriculum) {
    if (group.has_levels && (level === null || ![1, 2, 3].includes(level))) fail(programId, "Skill ini memakai level: pilih level untuk indikator.");
    if (!group.has_levels && level !== null) fail(programId, "Skill ini tidak memakai level.");
  }

  let siblingQuery = supabase.from("indicators").select("sort_order").eq("group_id", groupId);
  if (curriculum) siblingQuery = level === null ? siblingQuery.is("level", null) : siblingQuery.eq("level", level);
  const { data: siblings, error: readError } = await siblingQuery;
  if (readError) dbError(programId, readError);

  // The key is what report scores are stored under: generated once, never
  // derived from the label, so renaming can't orphan any score.
  const key = `ind_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const { data: created, error } = await supabase
    .from("indicators")
    .insert({
      program_id: programId,
      group_id: groupId,
      key,
      label,
      sort_order: nextSortOrder(siblings ?? []),
      ...(curriculum
        ? {
            level,
            seed_key: key,
            active: true,
            description: str(formData, "description") || null,
            rubric: str(formData, "rubric") || null,
            required: formData.get("required") === "on",
          }
        : {}),
    })
    .select("id")
    .single();
  if (error) dbError(programId, error);
  await done(programId, created ? `i:${created.id}` : undefined);
}

async function renameIndicatorActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");
  const label = str(formData, "label");
  if (!label) fail(programId, "Nama indikator wajib diisi.");

  const supabase = await createClient();
  // label only -- `key` is never written here.
  const { error } = await supabase.from("indicators").update({ label }).eq("id", id);
  if (error) dbError(programId, error);
  await done(programId);
}

// One save for the indicator editor: label and (optionally) its group. The key
// never changes; moving to another group puts it at the end of that group.
async function updateIndicatorActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");
  const label = str(formData, "label");
  const groupId = str(formData, "group_id");
  if (!label) fail(programId, "Nama indikator wajib diisi.");

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("indicators")
    .select("group_id, level, seed_key")
    .eq("id", id)
    .single();
  if (readError || !current) fail(programId, "Indikator tidak ditemukan.");

  const patch: Record<string, unknown> = { label };
  const seeded = !!current.seed_key;
  // rubric fields exist only on curriculum indicators; nothing here touches a score
  if (seeded && str(formData, "curriculum") === "1") {
    patch.description = str(formData, "description") || null;
    patch.rubric = str(formData, "rubric") || null;
    patch.required = formData.get("required") === "on";
  }
  if (groupId && groupId !== current.group_id) {
    const { data: from } = await supabase.from("indicator_groups").select("has_levels").eq("id", current.group_id).maybeSingle();
    const { data: to } = await supabase.from("indicator_groups").select("slug, has_levels").eq("id", groupId).maybeSingle();
    if (!to) fail(programId, "Kelompok tujuan tidak ditemukan.");
    if (seeded && (!to.slug || to.has_levels !== from?.has_levels)) {
      fail(programId, "Indikator kurikulum hanya bisa dipindah ke skill yang sejenis (sama-sama memakai level atau tidak).");
    }
    let sib = supabase.from("indicators").select("sort_order").eq("group_id", groupId);
    if (seeded) sib = current.level === null ? sib.is("level", null) : sib.eq("level", current.level);
    const { data: siblings } = await sib;
    patch.group_id = groupId;
    patch.sort_order = nextSortOrder(siblings ?? []);
  }

  const { error } = await supabase.from("indicators").update(patch).eq("id", id);
  if (error) dbError(programId, error);
  await done(programId, `i:${id}`);
}

async function moveIndicatorToGroupActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");
  const targetGroupId = str(formData, "group_id");
  if (!targetGroupId) fail(programId, "Pilih kelompok tujuan.");

  const supabase = await createClient();
  const { data: siblings, error: readError } = await supabase
    .from("indicators")
    .select("sort_order")
    .eq("group_id", targetGroupId);
  if (readError) dbError(programId, readError);

  const { error } = await supabase
    .from("indicators")
    .update({ group_id: targetGroupId, sort_order: nextSortOrder(siblings ?? []) })
    .eq("id", id);
  if (error) dbError(programId, error);
  await done(programId);
}

async function moveIndicatorActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");
  const groupId = str(formData, "group_id");
  const direction = str(formData, "direction") === "up" ? "up" : "down";
  // order is kept within the same level, and curriculum indicators never trade
  // places with the old archive
  const levelRaw = str(formData, "level");
  const scope = str(formData, "scope");

  const supabase = await createClient();
  let query = supabase.from("indicators").select("id, sort_order").eq("group_id", groupId);
  if (scope === "seeded") query = query.not("seed_key", "is", null);
  else if (scope === "old") query = query.is("seed_key", null);
  if (scope) query = levelRaw === "" ? query.is("level", null) : query.eq("level", Number(levelRaw));
  const { data, error } = await query.order("sort_order");
  if (error) dbError(programId, error);
  await reorder(supabase, "indicators", data ?? [], id, direction, programId);
  await done(programId);
}

async function toggleIndicatorActiveActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");
  const nextActive = str(formData, "next_active") === "true";

  const supabase = await createClient();
  if (nextActive) {
    // switching a curriculum indicator on while the program is still on the old
    // model would put it into the old form; that is the mode switch's job.
    const { data: ind } = await supabase.from("indicators").select("seed_key").eq("id", id).maybeSingle();
    const levels = await inLevelsMode(supabase, programId);
    if (ind?.seed_key && !levels) fail(programId, "Indikator kurikulum level baru aktif setelah kurikulum level diaktifkan (tab Kurikulum Level).");
    if (!ind?.seed_key && levels) fail(programId, "Indikator kurikulum lama disimpan sebagai arsip dan tidak dipakai untuk laporan baru.");
  }
  const { error } = await supabase.from("indicators").update({ active: nextActive }).eq("id", id);
  if (error) dbError(programId, error);
  await done(programId);
}

async function deleteIndicatorActionImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");

  const supabase = await createClient();
  // Atomic in the database: refuses if any report ever scored this key.
  const { error } = await supabase.rpc("admin_delete_indicator", { p_id: id });
  if (error) {
    fail(
      programId,
      error.message.includes("indicator in use")
        ? "Indikator ini punya riwayat (dipakai pada laporan atau menampilkan nilai lama), jadi tidak bisa dihapus permanen. Nonaktifkan saja agar riwayat tetap aman."
        : /admin_delete_indicator|schema cache/i.test(error.message)
          ? MIGRATION_HINT
          : error.message
    );
  }
  await done(programId);
}

export const createGroupAction = safeAction(createGroupActionImpl, "Kelompok berhasil ditambahkan");
export const renameGroupAction = safeAction(renameGroupActionImpl, "Nama kelompok berhasil diperbarui");
export const toggleGroupActiveAction = safeAction(toggleGroupActiveActionImpl, "Status kelompok berhasil diperbarui");
export const moveGroupAction = safeAction(moveGroupActionImpl, "Urutan kelompok berhasil diperbarui");
export const createIndicatorAction = safeAction(createIndicatorActionImpl, "Indikator berhasil ditambahkan");
export const updateIndicatorAction = safeAction(updateIndicatorActionImpl, "Indikator berhasil disimpan");
export const renameIndicatorAction = safeAction(renameIndicatorActionImpl, "Nama indikator berhasil diperbarui");
export const moveIndicatorToGroupAction = safeAction(moveIndicatorToGroupActionImpl, "Indikator berhasil dipindahkan");
export const moveIndicatorAction = safeAction(moveIndicatorActionImpl, "Urutan indikator berhasil diperbarui");
export const toggleIndicatorActiveAction = safeAction(toggleIndicatorActiveActionImpl, "Status indikator berhasil diperbarui");
export const deleteIndicatorAction = safeAction(deleteIndicatorActionImpl, "Indikator berhasil dihapus");
