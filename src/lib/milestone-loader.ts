import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MILESTONES } from "@/lib/default-milestones";
import type { Milestone } from "@/lib/milestones";

export async function loadMilestones(supabase: SupabaseClient): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from("milestones")
    .select("id, label, level, metric_type, stroke, distance_m, bronze, silver, gold, sort_order, active")
    .order("sort_order")
    .order("created_at");

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
