export const METRIC_TYPES = [
  "waktu_tempuh",
  "jarak_tempuh",
  "tahan_nafas",
  "treading_water",
] as const;

export type MetricType = (typeof METRIC_TYPES)[number];

export const METRIC_LABELS: Record<MetricType, string> = {
  waktu_tempuh: "Waktu Tempuh",
  jarak_tempuh: "Jarak Tempuh",
  tahan_nafas: "Tahan Nafas",
  treading_water: "Treading Water",
};

export const STROKES = ["Bebas", "Dada", "Punggung", "Kupu-kupu"] as const;
export type Stroke = (typeof STROKES)[number];

// Lower is better for waktu_tempuh (faster); higher is better for the rest
// (further distance, longer breath-hold / treading time).
export function isBetter(metricType: MetricType, a: number, b: number): boolean {
  return metricType === "waktu_tempuh" ? a < b : a > b;
}

// milestone id -> tier, frozen when the record was saved (null = legacy).
export type RecordAwards = Record<string, "bronze" | "silver" | "gold">;

export type PerformanceRecordRow = {
  id: string;
  metric_type: MetricType;
  stroke: string | null;
  distance_m: number | null;
  duration_seconds: number | null;
  recorded_at: string;
  // Who owns the record for edit/delete purposes (null = admin-only).
  pelatih_id?: string | null;
  awards?: RecordAwards | null;
};

export type AnnotatedRecord = PerformanceRecordRow & { isPersonalBest: boolean };

function groupKey(r: PerformanceRecordRow): string {
  const distancePart = r.metric_type === "waktu_tempuh" ? (r.distance_m ?? "-") : "-";
  return [r.metric_type, r.stroke ?? "-", distancePart].join("|");
}

function recordValue(r: PerformanceRecordRow): number | null {
  if (r.metric_type === "jarak_tempuh") return r.distance_m;
  return r.duration_seconds;
}

// Walks records oldest-first per group and flags whichever entries set a new
// best at the time they were recorded — mirrors "Personal Best auto-detect".
export function annotatePersonalBests(
  records: PerformanceRecordRow[]
): AnnotatedRecord[] {
  const sorted = [...records].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  const bestByGroup = new Map<string, number>();
  const flagged = new Map<string, boolean>();

  for (const r of sorted) {
    const value = recordValue(r);
    if (value === null) continue;
    const key = groupKey(r);
    const currentBest = bestByGroup.get(key);
    if (currentBest === undefined || isBetter(r.metric_type, value, currentBest)) {
      bestByGroup.set(key, value);
      flagged.set(r.id, true);
    } else {
      flagged.set(r.id, false);
    }
  }

  return records.map((r) => ({ ...r, isPersonalBest: flagged.get(r.id) ?? false }));
}

export function formatMetricLabel(r: {
  metric_type: MetricType;
  stroke: string | null;
  distance_m: number | null;
}): string {
  switch (r.metric_type) {
    case "waktu_tempuh":
      return `Waktu ${r.distance_m ?? "-"}m Gaya ${r.stroke ?? "-"}`;
    case "jarak_tempuh":
      return `Jarak Meluncur${r.stroke ? ` Gaya ${r.stroke}` : ""}`;
    case "tahan_nafas":
      return "Tahan Nafas";
    case "treading_water":
      return "Treading Water (Mengapung Berdiri)";
  }
}

export function formatMetricValue(r: {
  metric_type: MetricType;
  distance_m: number | null;
  duration_seconds: number | null;
}): string {
  if (r.metric_type === "jarak_tempuh") return `${r.distance_m ?? "-"} m`;
  const seconds = r.duration_seconds ?? 0;
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${seconds} detik`;
}

// Age is contextual info only, never a gate for level/skill progression —
// swim-school leveling standards (Swim England, Red Cross) advance children
// by demonstrated ability, not age.
export function formatAge(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0) return `${months} bulan`;
  if (months === 0) return `${years} tahun`;
  return `${years} tahun ${months} bulan`;
}
