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

// Same 4 stages as AssessmentGuideCard, in training order.
export const LEVELS = ["Dasar 1", "Dasar 2", "Menengah", "Mahir"] as const;
export type Level = (typeof LEVELS)[number];

export type Milestone = {
  id: string;
  level: Level;
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

// One flagship, quantifiable record per training stage (Dasar 1 = pemula),
// scaled to what's realistic to attempt at that stage — a beginner isn't
// timed over 25m, and an advanced swimmer isn't scored on a 3-second
// breath-hold. Mahir carries the per-stroke 25m targets since it's the
// stage where multiple strokes are expected. Adapted from the Swim England
// / Red Cross research earlier in this project (5m/10m glide at Stage 2-3,
// 25m swims at Stage 6-7, 30s treading water at Stage 5).
export const MILESTONES: Milestone[] = [
  {
    id: "tahan-nafas",
    level: "Dasar 1",
    metric_type: "tahan_nafas",
    label: "Tahan Nafas",
    stroke: null,
    distance_m: null,
    tiers: { bronze: 3, silver: 5, gold: 8 },
  },
  {
    id: "jarak-meluncur",
    level: "Dasar 2",
    metric_type: "jarak_tempuh",
    label: "Jarak Meluncur",
    stroke: null,
    distance_m: null,
    tiers: { bronze: 5, silver: 8, gold: 10 },
  },
  {
    id: "waktu-25m-bebas",
    level: "Menengah",
    metric_type: "waktu_tempuh",
    label: "Waktu 25m Gaya Bebas",
    stroke: "Bebas",
    distance_m: 25,
    tiers: { bronze: 60, silver: 50, gold: 40 },
  },
  {
    id: "treading-water",
    level: "Mahir",
    metric_type: "treading_water",
    label: "Treading Water",
    stroke: null,
    distance_m: null,
    tiers: { bronze: 15, silver: 22, gold: 30 },
  },
  {
    id: "waktu-25m-punggung",
    level: "Mahir",
    metric_type: "waktu_tempuh",
    label: "25m Gaya Punggung",
    stroke: "Punggung",
    distance_m: 25,
    tiers: { bronze: 65, silver: 50, gold: 35 },
  },
  {
    id: "waktu-25m-dada",
    level: "Mahir",
    metric_type: "waktu_tempuh",
    label: "25m Gaya Dada",
    stroke: "Dada",
    distance_m: 25,
    tiers: { bronze: 70, silver: 55, gold: 40 },
  },
  {
    id: "waktu-25m-kupu",
    level: "Mahir",
    metric_type: "waktu_tempuh",
    label: "25m Gaya Kupu-kupu",
    stroke: "Kupu-kupu",
    distance_m: 25,
    tiers: { bronze: 80, silver: 60, gold: 45 },
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

export function groupStatusesByLevel(
  statuses: MilestoneStatus[]
): { level: Level; statuses: MilestoneStatus[] }[] {
  return LEVELS.map((level) => ({
    level,
    statuses: statuses.filter((s) => s.milestone.level === level),
  }));
}
