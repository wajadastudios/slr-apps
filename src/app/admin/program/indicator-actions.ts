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

  const { data: created, error } = await supabase
    .from("indicator_groups")
    .insert({ program_id: programId, name, sort_order: nextSortOrder(siblings ?? []) })
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
  const { data: siblings, error: readError } = await supabase
    .from("indicators")
    .select("sort_order")
    .eq("group_id", groupId);
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
    .select("group_id")
    .eq("id", id)
    .single();
  if (readError || !current) fail(programId, "Indikator tidak ditemukan.");

  const patch: Record<string, unknown> = { label };
  if (groupId && groupId !== current.group_id) {
    const { data: siblings } = await supabase.from("indicators").select("sort_order").eq("group_id", groupId);
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("indicators")
    .select("id, sort_order")
    .eq("group_id", groupId)
    .order("sort_order");
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
        ? "Indikator ini sudah pernah dipakai pada laporan, jadi tidak bisa dihapus. Nonaktifkan saja agar riwayat nilai tetap aman."
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
