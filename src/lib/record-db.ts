import type { SupabaseClient } from "@supabase/supabase-js";

// Columns added by migration 0031. If it has not been applied yet the write
// is retried without them, so saving a record keeps working during rollout.
const NEW_COLUMNS = ["awards", "created_by"] as const;

function isMissingNewColumn(message: string) {
  return NEW_COLUMNS.some((c) => message.includes(c)) && /column|schema cache/i.test(message);
}

function stripNewColumns<T extends Record<string, unknown>>(row: T) {
  const legacy: Record<string, unknown> = { ...row };
  for (const c of NEW_COLUMNS) delete legacy[c];
  return legacy;
}

export async function insertRecords(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<{ message: string } | null> {
  if (rows.length === 0) return null;
  const { error } = await supabase.from("performance_records").insert(rows);
  if (error && isMissingNewColumn(error.message)) {
    const retry = await supabase.from("performance_records").insert(rows.map(stripNewColumns));
    return retry.error;
  }
  return error;
}

export async function updateRecord(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  ownerId?: string
): Promise<{ message: string } | null> {
  const run = (values: Record<string, unknown>) => {
    let q = supabase.from("performance_records").update(values).eq("id", id);
    if (ownerId) q = q.eq("pelatih_id", ownerId);
    return q.select("id");
  };

  let res = await run(patch);
  if (res.error && isMissingNewColumn(res.error.message)) res = await run(stripNewColumns(patch));
  if (res.error) return res.error;
  // RLS filters a row you may not touch out silently instead of erroring.
  if (!res.data || res.data.length === 0) {
    return { message: "Rekor tidak ditemukan atau Anda tidak berhak mengubahnya." };
  }
  return null;
}

export async function deleteRecord(
  supabase: SupabaseClient,
  id: string,
  ownerId?: string
): Promise<{ message: string } | null> {
  let q = supabase.from("performance_records").delete().eq("id", id);
  if (ownerId) q = q.eq("pelatih_id", ownerId);
  const { data, error } = await q.select("id");
  if (error) return error;
  if (!data || data.length === 0) {
    return { message: "Rekor tidak ditemukan atau Anda tidak berhak menghapusnya." };
  }
  return null;
}
