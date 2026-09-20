import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAwards, matchesMilestone, recordMeasure, tierForValue, type Milestone } from "@/lib/milestones";
import type { MetricType } from "@/lib/performance";

type RecordDb = {
  id: string;
  metric_type: MetricType;
  stroke: string | null;
  distance_m: number | string | null;
  duration_seconds: number | string | null;
  awards: Record<string, string> | null;
  program_id?: string | null;
};

const toNum = (v: number | string | null) => (v === null ? null : Number(v));

// Legacy records (awards IS NULL) are evaluated on the fly against whatever
// the targets are. Before ANY milestone change they are frozen against the
// targets in force right now, so an edit can never silently take a badge
// away. Requires an admin (service) client.
export async function freezeLegacyAwards(
  admin: SupabaseClient,
  milestones: Milestone[]
): Promise<void> {
  const { data, error } = await admin
    .from("performance_records")
    .select("id, metric_type, stroke, distance_m, duration_seconds, awards, program_id")
    .is("awards", null);
  if (error || !data) return; // column missing = nothing to freeze

  for (const r of data as RecordDb[]) {
    // a record is only ever judged against ITS program's milestones
    const own = milestones.filter((m) => !r.program_id || m.program_id === r.program_id);
    const awards = computeAwards(
      {
        metric_type: r.metric_type,
        stroke: r.stroke,
        distance_m: toNum(r.distance_m),
        duration_seconds: toNum(r.duration_seconds),
      },
      own
    );
    await admin.from("performance_records").update({ awards }).eq("id", r.id);
  }
}

// A brand-new milestone is evaluated once against the records that already
// exist (so history is not ignored); after that its targets never change
// what those records earned.
export async function awardMilestoneToExisting(
  admin: SupabaseClient,
  milestone: Milestone
): Promise<void> {
  const { data, error } = await admin
    .from("performance_records")
    .select("id, metric_type, stroke, distance_m, duration_seconds, awards, program_id");
  if (error || !data) return;

  for (const r of data as RecordDb[]) {
    if (r.program_id && milestone.program_id && r.program_id !== milestone.program_id) continue;
    const record = {
      metric_type: r.metric_type,
      stroke: r.stroke,
      distance_m: toNum(r.distance_m),
      duration_seconds: toNum(r.duration_seconds),
    };
    if (!matchesMilestone(milestone, record)) continue;
    const value = recordMeasure(record.metric_type, record);
    if (value === null) continue;
    const tier = tierForValue(milestone, value);
    if (!tier) continue;
    await admin
      .from("performance_records")
      .update({ awards: { ...(r.awards ?? {}), [milestone.id]: tier } })
      .eq("id", r.id);
  }
}
