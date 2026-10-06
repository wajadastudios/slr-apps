"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

const back = (programId: string) => `/admin/penilaian?program=${encodeURIComponent(programId)}&tab=kurikulum`;

function fail(programId: string, message: string): never {
  redirect(`${back(programId)}&error=${encodeURIComponent(message)}`);
}

const str = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const flag = (fd: FormData, name: string) => fd.get(name) === "on";

// Any change to the curriculum bumps the program's version, which every new
// report records next to its indicator snapshot (same convention as the
// indicator editor).
async function finish(supabase: Db, programId: string): Promise<never> {
  const { data } = await supabase.from("programs").select("template_version").eq("id", programId).maybeSingle();
  if (data && typeof data.template_version === "number") {
    await supabase.from("programs").update({ template_version: data.template_version + 1 }).eq("id", programId);
  }
  revalidatePath("/admin/penilaian");
  revalidatePath("/admin/program/setup");
  revalidatePath("/pelatih");
  revalidatePath("/ortu");
  redirect(back(programId));
}

// While a program is still on the old model its curriculum indicators must stay
// dormant: switching them on is the job of set_curriculum_mode, never of an
// individual edit.
async function inLevelsMode(supabase: Db, programId: string): Promise<boolean> {
  const { data } = await supabase.from("programs").select("curriculum_mode").eq("id", programId).maybeSingle();
  return data?.curriculum_mode === "levels_v1";
}

// ---- the one-time switch between the old model and the level curriculum ----
async function setModeImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const mode = str(formData, "mode");
  if (!programId || (mode !== "legacy" && mode !== "levels_v1")) fail(programId, "Pengaturan tidak valid.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_curriculum_mode", { p_program_id: programId, p_mode: mode });
  if (error) {
    fail(
      programId,
      /not prepared/.test(error.message)
        ? "Kurikulum level belum disiapkan untuk program ini. Jalankan migrasi 0048 dan 0049 terlebih dahulu."
        : "Perubahan belum tersimpan. Silakan coba lagi."
    );
  }
  revalidatePath("/admin/penilaian");
  revalidatePath("/admin/program/setup");
  revalidatePath("/pelatih");
  revalidatePath("/ortu");
  redirect(back(programId));
}

// ---- pass rules ----
async function saveRuleImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const groupId = str(formData, "group_id");
  const levelRaw = str(formData, "level");
  const level = levelRaw === "" ? null : Number(levelRaw);
  const min = Number(str(formData, "mastery_min_score"));
  const sessions = Math.trunc(Number(str(formData, "min_evidence_sessions")));
  if (!groupId || (level !== null && ![1, 2, 3].includes(level))) fail(programId, "Aturan tidak valid.");
  if (!Number.isFinite(min) || min < 0 || min > 5) fail(programId, "Batas skor harus antara 0 dan 5.");
  if (!Number.isFinite(sessions) || sessions < 1 || sessions > 20) fail(programId, "Jumlah sesi bukti harus minimal 1.");

  const supabase = await createClient();
  const values = { mastery_min_score: min, min_evidence_sessions: sessions, requires_test: flag(formData, "requires_test") };

  let query = supabase.from("skill_rules").select("id").eq("group_id", groupId);
  query = level === null ? query.is("level", null) : query.eq("level", level);
  const { data: existing } = await query.maybeSingle();
  const { error } = existing
    ? await supabase.from("skill_rules").update(values).eq("id", existing.id)
    : await supabase.from("skill_rules").insert({ group_id: groupId, level, ...values });
  if (error) fail(programId, "Aturan belum tersimpan. Silakan coba lagi.");
  await finish(supabase, programId);
}

// ---- targets: a change is always a NEW version ----
async function newTargetVersionImpl(formData: FormData) {
  const session = await requireAdmin();
  const programId = str(formData, "program_id");
  const typeId = str(formData, "test_type_id");
  const levelRaw = str(formData, "level");
  const level = levelRaw === "" ? null : Number(levelRaw);
  const value = Number(str(formData, "target_value").replace(",", "."));
  if (!typeId || (level !== null && ![1, 2, 3].includes(level))) fail(programId, "Target tidak valid.");
  if (!Number.isFinite(value) || value <= 0 || value > 10000) fail(programId, "Target harus berupa angka lebih dari 0.");

  const supabase = await createClient();
  let query = supabase.from("skill_test_targets").select("id, version, active").eq("test_type_id", typeId);
  query = level === null ? query.is("level", null) : query.eq("level", level);
  const { data: existing } = await query;
  const nextVersion = Math.max(0, ...(existing ?? []).map((t) => Number(t.version))) + 1;

  const activeIds = (existing ?? []).filter((t) => t.active).map((t) => t.id as string);
  if (activeIds.length > 0) {
    const { error: offError } = await supabase.from("skill_test_targets").update({ active: false }).in("id", activeIds);
    if (offError) fail(programId, "Target belum tersimpan. Silakan coba lagi.");
  }
  const { error } = await supabase.from("skill_test_targets").insert({
    test_type_id: typeId,
    level,
    target_value: value,
    requires_unassisted: flag(formData, "requires_unassisted"),
    requires_technique: flag(formData, "requires_technique"),
    version: nextVersion,
    active: true,
    created_by: session.user.id,
  });
  if (error) fail(programId, "Target belum tersimpan. Silakan coba lagi.");
  await finish(supabase, programId);
}

async function setTestActiveImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const typeId = str(formData, "test_type_id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("skill_test_types")
    .update({ active: str(formData, "active") === "1" })
    .eq("id", typeId);
  if (error) fail(programId, "Perubahan belum tersimpan. Silakan coba lagi.");
  await finish(supabase, programId);
}

// ---- indicators (rubric fields live here; structure edits stay in the
// regular indicator editor) ----
async function saveIndicatorImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const id = str(formData, "id");
  const label = str(formData, "label");
  if (!id || !label) fail(programId, "Nama indikator wajib diisi.");
  const sort = Math.trunc(Number(str(formData, "sort_order")));

  const supabase = await createClient();
  const live = await inLevelsMode(supabase, programId);
  const { error } = await supabase
    .from("indicators")
    .update({
      label,
      description: str(formData, "description") || null,
      rubric: str(formData, "rubric") || null,
      required: flag(formData, "required"),
      ...(live ? { active: flag(formData, "active") } : {}),
      ...(Number.isFinite(sort) ? { sort_order: sort } : {}),
    })
    .eq("id", id);
  if (error) fail(programId, "Indikator belum tersimpan. Silakan coba lagi.");
  await finish(supabase, programId);
}

async function addIndicatorImpl(formData: FormData) {
  await requireAdmin();
  const programId = str(formData, "program_id");
  const groupId = str(formData, "group_id");
  const label = str(formData, "label");
  const levelRaw = str(formData, "level");
  const level = levelRaw === "" ? null : Number(levelRaw);
  if (!groupId || !label) fail(programId, "Pilih skill dan isi nama indikator.");
  if (level !== null && ![1, 2, 3].includes(level)) fail(programId, "Level tidak valid.");

  const supabase = await createClient();
  const { data: group } = await supabase.from("indicator_groups").select("has_levels").eq("id", groupId).maybeSingle();
  if (!group) fail(programId, "Skill tidak ditemukan.");
  if (group.has_levels && level === null) fail(programId, "Skill gaya memerlukan level untuk setiap indikator.");
  if (!group.has_levels && level !== null) fail(programId, "Skill ini tidak memakai level.");

  let sib = supabase.from("indicators").select("sort_order").eq("group_id", groupId);
  sib = level === null ? sib.is("level", null) : sib.eq("level", level);
  const { data: siblings } = await sib;
  const nextSort = Math.max(0, ...(siblings ?? []).map((s) => Number(s.sort_order))) + 1;

  const key = `ind_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const { error } = await supabase.from("indicators").insert({
    program_id: programId,
    group_id: groupId,
    key,
    label,
    level,
    description: str(formData, "description") || null,
    rubric: str(formData, "rubric") || null,
    required: flag(formData, "required"),
    sort_order: nextSort,
    // a seed_key marks it as part of the level curriculum; the switch and the
    // loader both key off it
    seed_key: key,
    active: await inLevelsMode(supabase, programId),
  });
  if (error) fail(programId, "Indikator belum tersimpan. Silakan coba lagi.");
  await finish(supabase, programId);
}

export const setCurriculumModeAction = safeAction(setModeImpl, "Mode kurikulum diperbarui");
export const saveSkillRuleAction = safeAction(saveRuleImpl, "Aturan kelulusan tersimpan");
export const newTargetVersionAction = safeAction(newTargetVersionImpl, "Target versi baru tersimpan");
export const setTestActiveAction = safeAction(setTestActiveImpl, "Status tes diperbarui");
export const saveCurriculumIndicatorAction = safeAction(saveIndicatorImpl, "Indikator tersimpan");
export const addCurriculumIndicatorAction = safeAction(addIndicatorImpl, "Indikator ditambahkan");
