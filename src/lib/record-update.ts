import type { RecordInput } from "@/lib/record-input";
import { computeAwards, type Milestone, type Tier } from "@/lib/milestones";
import type { MetricType } from "@/lib/performance";

type ExistingRecord = {
  metric_type: MetricType;
  stroke: string | null;
  distance_m: number | null;
  duration_seconds: number | null;
};

const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));

// What was measured (metric, gaya, jarak, durasi) decides the badges, so only
// a change to those re-evaluates awards. Fixing just the date, or re-saving
// unchanged values, must never touch a badge that was already earned.
export function measurementChanged(existing: ExistingRecord, next: RecordInput): boolean {
  return (
    existing.metric_type !== next.metric_type ||
    (existing.stroke ?? null) !== (next.stroke ?? null) ||
    num(existing.distance_m) !== num(next.distance_m) ||
    num(existing.duration_seconds) !== num(next.duration_seconds)
  );
}

export function buildRecordPatch(
  existing: ExistingRecord,
  next: RecordInput,
  milestones: Milestone[]
): RecordInput & { awards?: Record<string, Tier> } {
  if (measurementChanged(existing, next)) {
    return { ...next, awards: computeAwards(next, milestones) };
  }
  return { ...next };
}
