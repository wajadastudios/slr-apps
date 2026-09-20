import {
  activeGroups,
  resolveReportIndicators,
  type IndicatorConfig,
  type IndicatorSnapshot,
} from "@/lib/indicators";

// Wording shared with the "Arti Skor Bintang" legend.
export const SCORE_LABELS = [
  "Belum bisa",
  "Baru mencoba",
  "Cukup baik",
  "Baik",
  "Sangat baik",
  "Mahir",
] as const;

// Half points read as the level they have reached (2,5 -> "Cukup baik").
export function scoreLabel(score: number): string {
  const index = Math.max(0, Math.min(5, Math.floor(score)));
  return SCORE_LABELS[index];
}

// 3 -> "3", 2.5 -> "2,5", 3.4666 -> "3,5"
export function formatScore(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

export type GroupSummary = {
  name: string;
  gorder: number;
  // belum_dinilai: the pengajar did not score this group in this report
  // belum_dimulai: scored, but everything is still 0
  status: "dinilai" | "belum_dimulai" | "belum_dinilai";
  average: number | null;
  items: { key: string; label: string; score: number }[];
};

// One summary per indicator group for a single report, in the admin's group
// order. Groups the report did not touch are still listed ("Belum dinilai") so
// a parent sees the whole picture; a group that was never scored is never
// shown as a score of 0.
export function summarizeReportGroups(
  scores: Record<string, number>,
  snapshot: IndicatorSnapshot | null | undefined,
  config: IndicatorConfig
): GroupSummary[] {
  const byGroup = new Map<string, GroupSummary>();

  for (const r of resolveReportIndicators(scores, snapshot, config)) {
    let group = byGroup.get(r.group);
    if (!group) {
      group = { name: r.group, gorder: r.gorder, status: "belum_dinilai", average: null, items: [] };
      byGroup.set(r.group, group);
    }
    group.items.push({ key: r.key, label: r.label, score: r.score });
  }

  for (const g of activeGroups(config)) {
    if (!byGroup.has(g.name)) {
      byGroup.set(g.name, {
        name: g.name,
        gorder: g.sort_order,
        status: "belum_dinilai",
        average: null,
        items: [],
      });
    }
  }

  const groups = [...byGroup.values()];
  for (const g of groups) {
    if (g.items.length === 0) continue;
    if (g.items.every((i) => i.score === 0)) {
      g.status = "belum_dimulai";
      continue;
    }
    g.status = "dinilai";
    g.average = g.items.reduce((sum, i) => sum + i.score, 0) / g.items.length;
  }

  return groups.sort((a, b) => a.gorder - b.gorder || a.name.localeCompare(b.name));
}
