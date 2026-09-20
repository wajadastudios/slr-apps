import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GOAL_UNITS } from "@/lib/personal-goals";

// Personal-goal writes shared by the pengajar and admin actions. RLS decides
// who may touch which enrollment; these only validate the input.

const num = (raw: FormDataEntryValue | null): number | null => {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function createGoal(
  supabase: SupabaseClient,
  formData: FormData,
  userId: string
): Promise<string | null> {
  const enrollmentId = String(formData.get("enrollment_id") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 120);
  const unit = String(formData.get("unit") ?? "");
  const baseline = num(formData.get("baseline"));
  const target = num(formData.get("target"));

  if (!enrollmentId) return "Peserta tidak ditemukan.";
  if (!label) return "Nama target wajib diisi.";
  if (!GOAL_UNITS.some((u) => u.id === unit)) return "Satuan tidak valid.";
  if (target === null || target <= 0) return "Target harus berupa angka lebih dari 0.";
  if (baseline !== null && baseline < 0) return "Baseline tidak boleh negatif.";

  const { error } = await supabase.from("personal_goals").insert({
    enrollment_id: enrollmentId,
    label,
    unit,
    baseline,
    target,
    created_by: userId,
  });
  return error ? "Target belum dapat disimpan." : null;
}

export async function addGoalEntry(
  supabase: SupabaseClient,
  formData: FormData,
  userId: string
): Promise<string | null> {
  const goalId = String(formData.get("goal_id") ?? "");
  const value = num(formData.get("value"));
  const date = String(formData.get("recorded_at") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  if (!goalId) return "Target tidak ditemukan.";
  if (value === null || value < 0) return "Isi angka pencapaian (0 atau lebih).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return "Tanggal tidak valid.";

  const { error } = await supabase
    .from("personal_goal_entries")
    .insert({ goal_id: goalId, value, recorded_at: date, note, created_by: userId });
  return error ? "Catatan belum dapat disimpan." : null;
}

export async function deleteGoalEntry(supabase: SupabaseClient, formData: FormData): Promise<string | null> {
  const id = String(formData.get("entry_id") ?? "");
  if (!id) return "Catatan tidak ditemukan.";
  const { data, error } = await supabase.from("personal_goal_entries").delete().eq("id", id).select("id");
  if (error || !data || data.length === 0) return "Catatan tidak ditemukan atau tidak dapat dihapus.";
  return null;
}

export async function archiveGoal(supabase: SupabaseClient, formData: FormData): Promise<string | null> {
  const id = String(formData.get("goal_id") ?? "");
  if (!id) return "Target tidak ditemukan.";
  const { data, error } = await supabase
    .from("personal_goals")
    .update({ status: "archived" })
    .eq("id", id)
    .select("id");
  if (error || !data || data.length === 0) return "Target tidak ditemukan atau tidak dapat diarsipkan.";
  return null;
}
