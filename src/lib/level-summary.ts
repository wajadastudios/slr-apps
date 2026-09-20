import {
  activeGroups,
  resolveReportIndicators,
  type IndicatorConfig,
  type IndicatorSnapshot,
} from "@/lib/indicators";
import { levelLabel, type AssessmentType } from "@/lib/programs";

export type LevelItem = { key: string; label: string; value: number; levelText: string };

export type LevelGroup = {
  name: string;
  gorder: number;
  // belum_diamati: nothing observed in this group this session
  status: "diamati" | "belum_diamati";
  items: LevelItem[];
};

// One session, grouped like the pengajar's form. No averages and no ranking:
// support / observation levels are descriptions, not scores.
export function summarizeLevelGroups(
  scores: Record<string, number>,
  snapshot: IndicatorSnapshot | null | undefined,
  config: IndicatorConfig,
  type: AssessmentType
): LevelGroup[] {
  const byGroup = new Map<string, LevelGroup>();

  for (const r of resolveReportIndicators(scores, snapshot, config)) {
    let group = byGroup.get(r.group);
    if (!group) {
      group = { name: r.group, gorder: r.gorder, status: "belum_diamati", items: [] };
      byGroup.set(r.group, group);
    }
    group.items.push({ key: r.key, label: r.label, value: r.score, levelText: levelLabel(type, r.score) });
  }

  for (const g of activeGroups(config)) {
    if (!byGroup.has(g.name)) {
      byGroup.set(g.name, { name: g.name, gorder: g.sort_order, status: "belum_diamati", items: [] });
    }
  }

  const groups = [...byGroup.values()];
  for (const g of groups) {
    g.status = g.items.some((i) => i.value > 0) ? "diamati" : "belum_diamati";
  }
  return groups.sort((a, b) => a.gorder - b.gorder || a.name.localeCompare(b.name));
}

export type SupportChange = {
  key: string;
  label: string;
  group: string;
  first: number;
  latest: number;
  firstText: string;
  latestText: string;
  // true when the latest observation needed less support than the first one
  moreIndependent: boolean;
};

// Adaptive Swim progress: for each indicator observed at least once, the first
// and the latest observed level. Sessions where it was "belum diamati" (0) or
// that were missed do not count. Reports newest-first.
export function supportChanges(
  reports: {
    scores: unknown;
    attendance?: string | null;
    indicator_snapshot?: IndicatorSnapshot | null;
  }[],
  config: IndicatorConfig,
  type: AssessmentType
): SupportChange[] {
  const chronological = [...reports].reverse().filter((r) => r.attendance !== "izin" && r.attendance !== "sakit");
  const first = new Map<string, number>();
  const latest = new Map<string, number>();
  const meta = new Map<string, { label: string; group: string; gorder: number; order: number }>();

  for (const report of chronological) {
    const scores = (report.scores ?? {}) as Record<string, number>;
    for (const r of resolveReportIndicators(scores, report.indicator_snapshot, config)) {
      if (r.score <= 0) continue;
      if (!first.has(r.key)) first.set(r.key, r.score);
      latest.set(r.key, r.score);
      meta.set(r.key, { label: r.label, group: r.group, gorder: r.gorder, order: r.order });
    }
  }

  return [...latest.keys()]
    .map((key) => {
      const m = meta.get(key)!;
      const f = first.get(key)!;
      const l = latest.get(key)!;
      return {
        key,
        label: m.label,
        group: m.group,
        first: f,
        latest: l,
        firstText: levelLabel(type, f),
        latestText: levelLabel(type, l),
        moreIndependent: l > f,
        sort: [m.gorder, m.group, m.order] as const,
      };
    })
    .sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1].localeCompare(b.sort[1]) || a.sort[2] - b.sort[2])
    .map(({ sort, ...rest }) => {
      void sort;
      return rest;
    });
}
