import type { MetricType, PerformanceRecordRow } from "@/lib/performance";

export const TIERS = ["bronze", "silver", "gold"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  bronze: "Perunggu",
  silver: "Perak",
  gold: "Emas",
};

export const TIER_ICONS: Record<Tier, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
};

const TIER_RANK: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3 };

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

export function formatMilestoneValue(metricType: MetricType, value: number): string {
  const v = Number(value);
  if (metricType === "jarak_tempuh") return `${v} m`;
  if (v >= 60) {
    const m = Math.floor(v / 60);
    const s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${v} detik`;
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
