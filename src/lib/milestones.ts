import type { MetricType, PerformanceRecordRow } from "@/lib/performance";

export const TIERS = ["bronze", "silver", "gold"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  bronze: "Perunggu",
  silver: "Perak",
  gold: "Emas",
};


export const TIER_RANK: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3 };

// Milestones live in the database (admin-managed). Badge rule: a badge is
// decided when a record is saved, against the targets in force at that time
// (stored in performance_records.awards). Changing a target later never
// removes an earned badge; it only applies to records saved afterwards.
export type Milestone = {
  id: string;
  label: string;
  level: string;
  metric_type: MetricType;
  stroke: string | null;
  distance_m: number | null;
  bronze: number;
  silver: number;
  gold: number;
  sort_order: number;
  active: boolean;
};

function isFaster(a: number, b: number) {
  return a <= b;
}
function isFurtherOrLonger(a: number, b: number) {
  return a >= b;
}

export function tierForValue(milestone: Milestone, value: number): Tier | null {
  const meets = milestone.metric_type === "waktu_tempuh" ? isFaster : isFurtherOrLonger;
  if (meets(value, Number(milestone.gold))) return "gold";
  if (meets(value, Number(milestone.silver))) return "silver";
  if (meets(value, Number(milestone.bronze))) return "bronze";
  return null;
}

export function recordMeasure(
  metric: MetricType,
  r: { distance_m: number | null; duration_seconds: number | null }
): number | null {
  const raw = metric === "jarak_tempuh" ? r.distance_m : r.duration_seconds;
  return raw === null || raw === undefined ? null : Number(raw);
}

export function matchesMilestone(
  m: Milestone,
  r: {
    metric_type: MetricType;
    stroke: string | null;
    distance_m: number | null;
  }
): boolean {
  if (r.metric_type !== m.metric_type) return false;
  if (m.stroke && r.stroke !== m.stroke) return false;
  if (m.metric_type === "waktu_tempuh" && Number(r.distance_m) !== Number(m.distance_m)) {
    return false;
  }
  return true;
}

// Tiers a record earns right now, against the ACTIVE milestones' current
// targets. Called when a record is saved; the result is what gets frozen.
export function computeAwards(
  record: {
    metric_type: MetricType;
    stroke: string | null;
    distance_m: number | null;
    duration_seconds: number | null;
  },
  milestones: Milestone[]
): Record<string, Tier> {
  const awards: Record<string, Tier> = {};
  const value = recordMeasure(record.metric_type, record);
  if (value === null) return awards;
  for (const m of milestones) {
    if (!m.active || !matchesMilestone(m, record)) continue;
    const tier = tierForValue(m, value);
    if (tier) awards[m.id] = tier;
  }
  return awards;
}

export type MilestoneStatus = {
  milestone: Milestone;
  bestValue: number | null;
  tier: Tier | null;
  achievedAt: string | null;
  // milestone was deactivated but still holds earned badges
  archived: boolean;
};

export function computeMilestoneStatuses(
  records: PerformanceRecordRow[],
  milestones: Milestone[]
): MilestoneStatus[] {
  const statuses: MilestoneStatus[] = [];

  for (const m of milestones) {
    const better = m.metric_type === "waktu_tempuh" ? isFaster : isFurtherOrLonger;
    let bestValue: number | null = null;
    let bestTier: Tier | null = null;
    let achievedAt: string | null = null;
    let bestRecordValue: number | null = null;

    for (const r of records) {
      const value = recordMeasure(r.metric_type, r);
      const matches = matchesMilestone(m, r);

      if (matches && value !== null && (bestValue === null || better(value, bestValue))) {
        bestValue = value;
      }

      // Frozen awards win; legacy records (awards == null) are evaluated
      // against current targets until an admin edit freezes them.
      const tier: Tier | null =
        r.awards != null
          ? (r.awards[m.id] ?? null)
          : m.active && matches && value !== null
            ? tierForValue(m, value)
            : null;
      if (!tier) continue;

      const rankDiff = bestTier ? TIER_RANK[tier] - TIER_RANK[bestTier] : 1;
      const isBetterRecord =
        rankDiff > 0 ||
        (rankDiff === 0 &&
          value !== null &&
          (bestRecordValue === null || better(value, bestRecordValue)));
      if (isBetterRecord) {
        bestTier = tier;
        achievedAt = r.recorded_at;
        bestRecordValue = value;
      }
    }

    if (!m.active && !bestTier) continue;
    statuses.push({ milestone: m, bestValue, tier: bestTier, achievedAt, archived: !m.active });
  }

  return statuses;
}

function trimNumber(v: number): string {
  return String(Math.round(Number(v) * 100) / 100);
}

function clock(seconds: number): string {
  const total = Math.round(Number(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Times read as m:ss (1:05), distances in meters, holds in seconds.
export function formatMilestoneValue(metricType: MetricType, value: number): string {
  if (metricType === "waktu_tempuh") return clock(value);
  if (metricType === "jarak_tempuh") return `${trimNumber(value)} meter`;
  return `${trimNumber(value)} detik`;
}

// "3 / 5 / 8 detik", "1:00 / 0:50 / 0:40", "3 / 5 / 8 meter"
export function formatMilestoneTargets(
  m: Pick<Milestone, "metric_type" | "bronze" | "silver" | "gold">
): string {
  const tiers = [m.bronze, m.silver, m.gold];
  if (m.metric_type === "waktu_tempuh") return tiers.map(clock).join(" / ");
  const unit = m.metric_type === "jarak_tempuh" ? "meter" : "detik";
  return `${tiers.map(trimNumber).join(" / ")} ${unit}`;
}

// Breath-hold is only ever assessed by the pengajar, supervised in session.
export function isSupervisedOnly(metricType: MetricType): boolean {
  return metricType === "tahan_nafas";
}

const NEXT_TIER: Record<Tier, Tier | null> = { bronze: "silver", silver: "gold", gold: null };

export type NextTarget = { status: MilestoneStatus; tier: Tier; value: number };

// The one goal worth showing first: the earliest milestone (admin order) that
// has not been unlocked at all; once everything is unlocked, the earliest one
// that can still be upgraded. null when every badge is gold.
export function pickNextTarget(statuses: MilestoneStatus[]): NextTarget | null {
  const open = [...statuses]
    .sort((a, b) => a.milestone.sort_order - b.milestone.sort_order)
    .filter((s) => !s.archived && s.tier !== "gold");
  const pick = open.find((s) => s.tier === null) ?? open[0];
  if (!pick) return null;
  const tier = pick.tier ? NEXT_TIER[pick.tier]! : "bronze";
  return { status: pick, tier, value: Number(pick.milestone[tier]) };
}

// A target counts as passed once the tier earned on the milestone is that
// tier or a higher one.
export function tierReached(earned: Tier | null, target: Tier): boolean {
  return earned !== null && TIER_RANK[earned] >= TIER_RANK[target];
}

// The highest medal the child holds; among equals the most recently earned.
export function latestTopMedal(statuses: MilestoneStatus[]): MilestoneStatus | null {
  let best: MilestoneStatus | null = null;
  for (const s of statuses) {
    if (!s.tier) continue;
    if (
      !best ||
      TIER_RANK[s.tier] > TIER_RANK[best.tier!] ||
      (TIER_RANK[s.tier] === TIER_RANK[best.tier!] && (s.achievedAt ?? "") > (best.achievedAt ?? ""))
    ) {
      best = s;
    }
  }
  return best;
}

// Levels are free-text categories; shown in the order of their first
// milestone's sort_order.
export function groupStatusesByLevel(
  statuses: MilestoneStatus[]
): { level: string; statuses: MilestoneStatus[] }[] {
  const levels: string[] = [];
  for (const s of [...statuses].sort((a, b) => a.milestone.sort_order - b.milestone.sort_order)) {
    if (!levels.includes(s.milestone.level)) levels.push(s.milestone.level);
  }
  return levels.map((level) => ({
    level,
    statuses: statuses
      .filter((s) => s.milestone.level === level)
      .sort((a, b) => a.milestone.sort_order - b.milestone.sort_order),
  }));
}
