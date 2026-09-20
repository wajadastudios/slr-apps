"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { loadMilestones } from "@/lib/milestone-loader";
import { computeAwards } from "@/lib/milestones";
import { parseRecordInput } from "@/lib/record-input";
import { buildRecordPatch } from "@/lib/record-update";
import { deleteRecord, insertRecords, updateRecord } from "@/lib/record-db";
import type { MetricType } from "@/lib/performance";

// Admin can manage every student's records. Records they add carry
// pelatih_id = NULL (so no trainer gains edit rights over them) and
// created_by = the admin.

function back(studentId: string) {
  return `/admin/laporan?id=${encodeURIComponent(studentId)}`;
}

function fail(studentId: string, message: string): never {
  redirect(`${back(studentId)}&error=${encodeURIComponent(message)}`);
}

function readInput(formData: FormData) {
  return parseRecordInput({
    metric_type: formData.get("metric_type"),
    stroke: formData.get("stroke"),
    distance_m: formData.get("distance_m"),
    duration_seconds: formData.get("duration_seconds"),
    recorded_at: formData.get("recorded_at"),
  });
}

async function addPerformanceRecordActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const studentId = String(formData.get("student_id") ?? "");
  if (!studentId) redirect("/admin/laporan");

  const parsed = readInput(formData);
  if (!parsed.ok) fail(studentId, parsed.error);

  const supabase = await createClient();
  const milestones = await loadMilestones(supabase);
  const error = await insertRecords(supabase, [
    {
      student_id: studentId,
      pelatih_id: null,
      created_by: session.user.id,
      ...parsed.value,
      awards: computeAwards(parsed.value, milestones),
    },
  ]);
  if (error) fail(studentId, error.message);

  revalidatePath("/admin/laporan");
  redirect(back(studentId));
}

async function updatePerformanceRecordActionImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!id || !studentId) fail(studentId, "Rekor tidak ditemukan.");

  const parsed = readInput(formData);
  if (!parsed.ok) fail(studentId, parsed.error);

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("performance_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!existing) fail(studentId, "Rekor tidak ditemukan.");

  const patch = buildRecordPatch(
    {
      metric_type: existing.metric_type as MetricType,
      stroke: existing.stroke,
      distance_m: existing.distance_m === null ? null : Number(existing.distance_m),
      duration_seconds: existing.duration_seconds === null ? null : Number(existing.duration_seconds),
    },
    parsed.value,
    await loadMilestones(supabase)
  );

  const error = await updateRecord(supabase, id, patch);
  if (error) fail(studentId, error.message);

  revalidatePath("/admin/laporan");
  redirect(back(studentId));
}

async function deletePerformanceRecordActionImpl(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!id || !studentId) fail(studentId, "Rekor tidak ditemukan.");

  const supabase = await createClient();
  const error = await deleteRecord(supabase, id);
  if (error) fail(studentId, error.message);

  revalidatePath("/admin/laporan");
  redirect(back(studentId));
}

export const addPerformanceRecordAction = safeAction(addPerformanceRecordActionImpl, "Rekor performa berhasil ditambahkan");
export const updatePerformanceRecordAction = safeAction(updatePerformanceRecordActionImpl, "Rekor performa berhasil diperbarui");
export const deletePerformanceRecordAction = safeAction(deletePerformanceRecordActionImpl, "Rekor performa berhasil dihapus");
