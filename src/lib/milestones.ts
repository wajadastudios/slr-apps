import type { MetricType, PerformanceRecordRow, Stroke } from "@/lib/performance";

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

export type Milestone = {
  id: string;
  metric_type: MetricType;
  label: string;
  stroke: Stroke | null;
  // Only meaningful for waktu_tempuh, where the same stroke can have
  // milestones at multiple target distances.
  distance_m: number | null;
  // waktu_tempuh: seconds, lower is better. jarak_tempuh: meters, higher is
  // better. tahan_nafas / treading_water: seconds, higher is better.
  tiers: Record<Tier, number>;
};

// Defaults adapted from the Swim England / Red Cross research earlier in
// this project: 25m is the first "real distance" benchmark (Swim England
// Stage 6-7), 5m/10m glide distances (Stage 2-3), and 30s treading water
// (Stage 5). Times per stroke are scaled for beginner Kids Swim pace, not
// competitive splits.
export const MILESTONES: Milestone[] = [
  {
    id: "waktu-25m-bebas",
    metric_type: "waktu_tempuh",
    label: "25m Gaya Bebas",
    stroke: "Bebas",
    distance_m: 25,
    tiers: { bronze: 60, silver: 45, gold: 30 },
  },
  {
    id: "waktu-25m-punggung",
    metric_type: "waktu_tempuh",
    label: "25m Gaya Punggung",
    stroke: "Punggung",
    distance_m: 25,
    tiers: { bronze: 65, silver: 50, gold: 35 },
  },
  {
    id: "waktu-25m-dada",
    metric_type: "waktu_tempuh",
    label: "25m Gaya Dada",
    stroke: "Dada",
    distance_m: 25,
    tiers: { bronze: 70, silver: 55, gold: 40 },
  },
  {
    id: "waktu-25m-kupu",
    metric_type: "waktu_tempuh",
    label: "25m Gaya Kupu-kupu",
    stroke: "Kupu-kupu",
    distance_m: 25,
    tiers: { bronze: 80, silver: 60, gold: 45 },
  },
  {
    id: "jarak-meluncur",
    metric_type: "jarak_tempuh",
    label: "Jarak Meluncur",
    stroke: null,
    distance_m: null,
    tiers: { bronze: 5, silver: 10, gold: 15 },
  },
  {
    id: "tahan-nafas",
    metric_type: "tahan_nafas",
    label: "Tahan Nafas",
    stroke: null,
    distance_m: null,
    tiers: { bronze: 5, silver: 10, gold: 20 },
  },
  {
    id: "treading-water",
    metric_type: "treading_water",
    label: "Treading Water",
    stroke: null,
    distance_m: null,
    tiers: { bronze: 10, silver: 20, gold: 30 },
  },
];

function isFaster(a: number, b: number) {
  return a <= b;
}
function isFurtherOrLonger(a: number, b: number) {
  return a >= b;
}

export function tierForValue(milestone: Milestone, value: number): Tier | null {
  const meets = milestone.metric_type === "waktu_tempuh" ? isFaster : isFurtherOrLonger;
  if (meets(value, milestone.tiers.gold)) return "gold";
  if (meets(value, milestone.tiers.silver)) return "silver";
  if (meets(value, milestone.tiers.bronze)) return "bronze";
  return null;
}

function recordValue(m: Milestone, r: PerformanceRecordRow): number | null {
  return m.metric_type === "jarak_tempuh" ? r.distance_m : r.duration_seconds;
}

export function formatMilestoneValue(metricType: MetricType, value: number): string {
  if (metricType === "jarak_tempuh") return `${value} m`;
  if (value >= 60) {
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${value} detik`;
}

export type MilestoneStatus = {
  milestone: Milestone;
  bestValue: number | null;
  tier: Tier | null;
  achievedAt: string | null;
};

export function computeMilestoneStatuses(
  records: PerformanceRecordRow[]
): MilestoneStatus[] {
  return MILESTONES.map((m) => {
    const matching = records.filter((r) => {
      if (r.metric_type !== m.metric_type) return false;
      if (m.stroke && r.stroke !== m.stroke) return false;
      if (m.metric_type === "waktu_tempuh" && r.distance_m !== m.distance_m) return false;
      return true;
    });

    const meetsBetter = m.metric_type === "waktu_tempuh" ? isFaster : isFurtherOrLonger;
    let best: PerformanceRecordRow | null = null;
    let bestValue: number | null = null;

    for (const r of matching) {
      const value = recordValue(m, r);
      if (value === null) continue;
      if (bestValue === null || meetsBetter(value, bestValue)) {
        bestValue = value;
        best = r;
      }
    }

    return {
      milestone: m,
      bestValue,
      tier: bestValue !== null ? tierForValue(m, bestValue) : null,
      achievedAt: best?.recorded_at ?? null,
    };
  });
}
