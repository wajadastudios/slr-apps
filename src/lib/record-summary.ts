import {
  computeMilestoneStatuses,
  formatMilestoneValue,
  latestTopMedal,
  pickNextTarget,
  type Milestone,
  type Tier,
} from "@/lib/milestones";
import type { PerformanceRecordRow } from "@/lib/performance";

export type RecordSummary = {
  total: number;
  unlocked: number;
  // highest medal held (the newest one among equals)
  top: { tier: Tier; label: string; valueText: string } | null;
  // shown while nothing is unlocked yet: a first goal, never a "negative" status
  first: { tier: Tier; label: string; valueText: string } | null;
};

// The compact Record Unlock block on a participant's summary card. Null when
// the admin has not configured any active milestone for the program, so the
// block is hidden instead of showing an empty "0 dari 0".
export function summarizeRecordUnlock(
  records: PerformanceRecordRow[],
  milestones: Milestone[]
): RecordSummary | null {
  const statuses = computeMilestoneStatuses(records, milestones);
  if (statuses.length === 0) return null;

  const top = latestTopMedal(statuses);
  const unlocked = statuses.filter((s) => s.tier).length;
  const next = unlocked === 0 ? pickNextTarget(statuses) : null;

  return {
    total: statuses.length,
    unlocked,
    top:
      top && top.tier
        ? {
            tier: top.tier,
            label: top.milestone.label,
            valueText:
              top.bestValue !== null ? formatMilestoneValue(top.milestone.metric_type, top.bestValue) : "",
          }
        : null,
    first: next
      ? {
          tier: next.tier,
          label: next.status.milestone.label,
          valueText: formatMilestoneValue(next.status.milestone.metric_type, next.value),
        }
      : null,
  };
}
