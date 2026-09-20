import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MILESTONES } from "@/lib/default-milestones";
import type { Milestone } from "@/lib/milestones";

// Milestones belong to a program. Pass the program to get only its set; without
// one, every program's milestones come back (admin bookkeeping only).
export async function loadMilestones(
  supabase: SupabaseClient,
  programId?: string | null
): Promise<Milestone[]> {
  let query = supabase
    .from("milestones")
    .select("id, label, level, metric_type, stroke, distance_m, bronze, silver, gold, sort_order, active, program_id")
    .order("sort_order")
    .order("created_at");
  if (programId) query = query.eq("program_id", programId);
  const { data, error } = await query;

  // Table missing (migration not applied yet) -> the built-in seed list.
  if (error) return DEFAULT_MILESTONES;

  return (data ?? []).map((m) => ({
    ...m,
    distance_m: m.distance_m === null ? null : Number(m.distance_m),
    bronze: Number(m.bronze),
    silver: Number(m.silver),
    gold: Number(m.gold),
  })) as Milestone[];
}
