"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { loadMappingState, reviewRows } from "@/lib/curriculum/legacy-source";
import { isLevel } from "@/lib/curriculum/types";

// Mapping of old indicators to the new curriculum. These actions only write
// rows of legacy_indicator_map. They never touch a report, a score, a date, a
// note, an author or an indicator.

const back = (programId: string) => `/admin/penilaian?program=${encodeURIComponent(programId)}&tab=riwayat`;
const str = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

function fail(programId: string, message: string): never {
  redirect(`${back(programId)}&error=${encodeURIComponent(message)}`);
}

function refresh(programId: string): never {
  revalidatePath("/admin/penilaian");
  revalidatePath("/ortu");
  revalidatePath("/pelatih");
  revalidatePath("/admin/laporan");
  redirect(back(programId));
}

const NOT_READY = "Tabel pemetaan belum ada. Jalankan migrasi 0050 di Supabase SQL Editor terlebih dahulu.";

// Stores every unambiguous proposal. Safe to run again: an old indicator that
// already has a row is left alone, except one still waiting for review that now
// has a safe match (for instance after the admin added the missing indicator).
async function applyAutoImpl(formData: FormData) {
  const session = await requireAdmin();
  const programId = str(formData, "program_id");
  if (!programId) redirect("/admin/penilaian");

  const supabase = await createClient();
  const state = await loadMappingState(supabase, programId);
  if (!state.ready) fail(programId, NOT_READY);

  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];
  for (const row of reviewRows(state)) {
    const { proposal, saved, key } = row;
    const auto = proposal.status === "auto" && proposal.target;
    if (!saved) {
      inserts.push({
        program_id: programId,
        legacy_key: key.key,
        legacy_label: key.label,
        legacy_group: key.group,
        status: auto ? "auto" : "review",
        target_indicator_id: auto ? proposal.target!.id : null,
        method: auto ? proposal.method : null,
        note: proposal.reason,
        legacy_indicator_id: state.legacyIndicatorIds[key.key] ?? null,
        decided_by: auto ? session.user.id : null,
        decided_at: auto ? now : null,
      });
    } else if (saved.status === "review" && auto) {
      const { error } = await supabase
        .from("legacy_indicator_map")
        .update({ status: "auto", target_indicator_id: proposal.target!.id, method: proposal.method, note: proposal.reason, decided_by: session.user.id, decided_at: now, updated_at: now })
        .eq("program_id", programId)
        .eq("legacy_key", key.key)
        .eq("status", "review");
      if (error) fail(programId, "Pemetaan belum tersimpan. Silakan coba lagi.");
    }
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from("legacy_indicator_map").upsert(inserts, { onConflict: "program_id,legacy_key", ignoreDuplicates: true });
    if (error) fail(programId, "Pemetaan belum tersimpan. Silakan coba lagi.");
  }
  refresh(programId);
}

// One old indicator -> the admin's choice. target = an indicator id, "skip"
// (do not map: stays in the history list) or "reset" (back to waiting).
async function setMappingImpl(formData: FormData) {
  const session = await requireAdmin();
  const programId = str(formData, "program_id");
  const legacyKey = str(formData, "legacy_key");
  const target = str(formData, "target");
  if (!programId || !legacyKey) redirect("/admin/penilaian");
  if (!target) fail(programId, "Pilih indikator tujuan terlebih dahulu.");

  const supabase = await createClient();
  const state = await loadMappingState(supabase, programId);
  if (!state.ready) fail(programId, NOT_READY);
  const key = state.keys.find((k) => k.key === legacyKey) ?? state.rows.find((r) => r.legacyKey === legacyKey) ;
  if (!key) fail(programId, "Indikator lama tidak ditemukan.");
  const label = "label" in key ? key.label : key.legacyLabel;
  const group = "group" in key ? key.group : key.legacyGroup;

  const now = new Date().toISOString();
  let values: Record<string, unknown>;
  if (target === "skip") {
    values = { status: "skipped", target_indicator_id: null, method: null };
  } else if (target === "reset") {
    values = { status: "review", target_indicator_id: null, method: null };
  } else {
    if (!state.targets.some((t) => t.id === target)) fail(programId, "Indikator tujuan tidak valid untuk program ini.");
    values = { status: "manual", target_indicator_id: target, method: "manual" };
  }
  const { error } = await supabase.from("legacy_indicator_map").upsert(
    {
      program_id: programId,
      legacy_key: legacyKey,
      legacy_label: label,
      legacy_group: group,
      legacy_indicator_id: state.legacyIndicatorIds[legacyKey] ?? null,
      note: target === "skip" || target === "reset" ? null : "Dipilih admin.",
      decided_by: session.user.id,
      decided_at: now,
      updated_at: now,
      ...values,
    },
    { onConflict: "program_id,legacy_key" }
  );
  if (error) fail(programId, "Pemetaan belum tersimpan. Silakan coba lagi.");
  refresh(programId);
}

// A gaya's old indicators have no level. Admin states the level they should be
// shown at; every old indicator of that skill still waiting is mapped to the
// same aspect at that level (decisions already made are not overwritten).
async function setSkillLevelImpl(formData: FormData) {
  const session = await requireAdmin();
  const programId = str(formData, "program_id");
  const skillId = str(formData, "skill_id");
  const level = Number(str(formData, "level"));
  if (!programId || !skillId) redirect("/admin/penilaian");
  if (!isLevel(level)) fail(programId, "Pilih level 1, 2, atau 3.");

  const supabase = await createClient();
  const state = await loadMappingState(supabase, programId);
  if (!state.ready) fail(programId, NOT_READY);

  const now = new Date().toISOString();
  const upserts: Record<string, unknown>[] = [];
  for (const { proposal, saved, key } of reviewRows(state)) {
    if (proposal.skillId !== skillId || !proposal.needsLevel) continue;
    if (saved && saved.status !== "review") continue;
    const target = proposal.candidates.find((c) => c.level === level);
    if (!target) continue;
    upserts.push({
      program_id: programId,
      legacy_key: key.key,
      legacy_label: key.label,
      legacy_group: key.group,
      status: "manual",
      target_indicator_id: target.id,
      method: "manual",
      note: `Dipilih admin: seluruh indikator ${proposal.candidates[0]?.skillName ?? "gaya"} ke Level ${level}.`,
      legacy_indicator_id: state.legacyIndicatorIds[key.key] ?? null,
      decided_by: session.user.id,
      decided_at: now,
      updated_at: now,
    });
  }
  if (upserts.length === 0) fail(programId, "Tidak ada indikator yang menunggu untuk skill ini.");
  const { error } = await supabase.from("legacy_indicator_map").upsert(upserts, { onConflict: "program_id,legacy_key" });
  if (error) fail(programId, "Pemetaan belum tersimpan. Silakan coba lagi.");
  refresh(programId);
}

export const applyAutoMappingAction = safeAction(applyAutoImpl, "Pemetaan otomatis diterapkan");
export const setLegacyMappingAction = safeAction(setMappingImpl, "Pemetaan tersimpan");
export const setSkillLevelMappingAction = safeAction(setSkillLevelImpl, "Pemetaan level tersimpan");
