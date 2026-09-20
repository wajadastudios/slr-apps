"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requirePelatih } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { loadMilestones } from "@/lib/milestone-loader";
import { parseRecordInput } from "@/lib/record-input";
import { buildRecordPatch } from "@/lib/record-update";
import { deleteRecord, updateRecord } from "@/lib/record-db";
import type { MetricType } from "@/lib/performance";

// Pengajar may only change records they entered themselves. That is enforced
// three times: here (explicit owner check), in the query (.eq pelatih_id) and
// by RLS ("pelatih can update/delete own records" -> pelatih_id = auth.uid()
// AND the student is one they teach). Records without an owner are admin-only.

function back(studentId: string, program = "") {
  return `/pelatih/murid/${studentId}${program ? `?program=${program}` : ""}`;
}

function fail(studentId: string, message: string, program = ""): never {
  const url = back(studentId, program);
  redirect(`${url}${url.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

async function updatePerformanceRecordActionImpl(formData: FormData) {
  const session = await requirePelatih();
  const id = String(formData.get("id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!id || !studentId) fail(studentId, "Rekor tidak ditemukan.");

  const parsed = parseRecordInput({
    metric_type: formData.get("metric_type"),
    stroke: formData.get("stroke"),
    distance_m: formData.get("distance_m"),
    duration_seconds: formData.get("duration_seconds"),
    recorded_at: formData.get("recorded_at"),
  });
  if (!parsed.ok) fail(studentId, parsed.error);

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("performance_records")
    .select("*")
    .eq("id", id)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!existing) fail(studentId, "Rekor tidak ditemukan.");
  if (existing.pelatih_id !== session.user.id) {
    fail(studentId, "Rekor ini bukan milik Anda, jadi tidak bisa diubah.");
  }

  const patch = buildRecordPatch(
    {
      metric_type: existing.metric_type as MetricType,
      stroke: existing.stroke,
      distance_m: existing.distance_m === null ? null : Number(existing.distance_m),
      duration_seconds: existing.duration_seconds === null ? null : Number(existing.duration_seconds),
    },
    parsed.value,
    // a record is judged against ITS program's milestones only
    await loadMilestones(supabase, existing.program_id)
  );

  const error = await updateRecord(supabase, id, patch, session.user.id);
  if (error) fail(studentId, error.message);

  revalidatePath(`/pelatih/murid/${studentId}`);
  redirect(back(studentId, String(formData.get("program") ?? "")));
}

async function deletePerformanceRecordActionImpl(formData: FormData) {
  const session = await requirePelatih();
  const id = String(formData.get("id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!id || !studentId) fail(studentId, "Rekor tidak ditemukan.");

  const supabase = await createClient();
  const error = await deleteRecord(supabase, id, session.user.id);
  if (error) fail(studentId, error.message);

  revalidatePath(`/pelatih/murid/${studentId}`);
  redirect(back(studentId, String(formData.get("program") ?? "")));
}

export const updatePerformanceRecordAction = safeAction(updatePerformanceRecordActionImpl, "Rekor performa berhasil diperbarui");
export const deletePerformanceRecordAction = safeAction(deletePerformanceRecordActionImpl, "Rekor performa berhasil dihapus");
