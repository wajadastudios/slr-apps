import type { IndicatorConfig } from "@/lib/indicators";
import type { MilestoneStatus } from "@/lib/milestones";
import { TIER_LABELS } from "@/lib/milestones";
import { formatMilestoneValue } from "@/lib/milestones";
import type { CurriculumData, CurriculumSkill } from "./types";
import { levelLabel } from "./types";
import {
  UNIT_STATUS_LABEL,
  attendanceSummary,
  buildUnits,
  coverageText,
  currentFocus,
  orderUnits,
  overallProgress,
  type Focus,
  type RawNextFocus,
  type Unit,
  type UnitStatus,
} from "./progress";
import { trendInput, type RawReport, type TrendReport } from "./trend-adapter";

// Everything the parent's Perkembangan screen shows, prepared on the server as
// plain data. Nothing here mentions where a score came from: old and new
// assessments are one history.

export type UnitView = {
  key: string;
  name: string;
  levelText: string | null;
  percent: number | null;
  status: UnitStatus;
  statusLabel: string;
  coverage: string;
  // progress after each assessed session, on the ribbon's 0-5 scale (percent / 20)
  spark: { date: string; score: number }[];
  items: { label: string; stars: number; date: string }[];
  trend: { config: IndicatorConfig; reports: TrendReport[] };
  records: string[];
  focus: string | null;
};

export type ParentProgressModel = {
  overall: { percent: number; count: number } | null;
  focus: Focus | null;
  attendance: { present: number; total: number } | null;
  main: UnitView[];
  more: UnitView[];
  full: { config: IndicatorConfig; reports: TrendReport[] };
};

// Records (medals) that belong to a skill: the stroke's distance and time
// records, Water Safety's duration records, Dasar's breath-hold.
export function recordLinesFor(statuses: MilestoneStatus[], skill: CurriculumSkill): string[] {
  const strokeBySlug: Record<string, string> = { bebas: "Bebas", dada: "Dada", punggung: "Punggung", kupu: "Kupu-kupu" };
  const stroke = strokeBySlug[skill.slug] ?? null;
  return statuses
    .filter((s) => {
      if (!s.tier) return false;
      const m = s.milestone;
      if (stroke) return m.stroke === stroke;
      if (skill.slug === "water_safety") return m.metric_type === "treading_water" || m.metric_type === "mengapung_telentang";
      if (skill.slug === "dasar") return m.metric_type === "tahan_nafas" || m.stroke === "Meluncur";
      return false;
    })
    .map((s) => `${s.milestone.label} · Medali ${TIER_LABELS[s.tier!]}${s.bestValue !== null ? ` (${formatMilestoneValue(s.milestone.metric_type, s.bestValue)})` : ""}`);
}

function viewOf(data: CurriculumData, unit: Unit, raw: RawReport[], statuses: MilestoneStatus[], focus: Focus | null): UnitView {
  const trend = trendInput(data, raw, { skillId: unit.skill.id });
  return {
    key: unit.skill.id,
    name: unit.skill.name,
    levelText: unit.level ? levelLabel(unit.level) : null,
    percent: unit.percent,
    status: unit.status,
    statusLabel: UNIT_STATUS_LABEL[unit.status],
    coverage: coverageText(unit),
    spark: unit.series.map((p) => ({ date: p.date, score: Math.round((p.percent / 20) * 10) / 10 })),
    items: unit.items.map((i) => ({ label: i.indicator.label, stars: i.score, date: i.date })),
    trend,
    records: recordLinesFor(statuses, unit.skill),
    focus: focus && focus.skillId === unit.skill.id ? focus.text : null,
  };
}

export function buildParentProgress(
  data: CurriculumData,
  raw: (RawReport & RawNextFocus)[],
  statuses: MilestoneStatus[] = []
): ParentProgressModel {
  const units = buildUnits(data);
  const focus = currentFocus(units, raw);
  const { main, more } = orderUnits(units, focus);
  const attendance = attendanceSummary(raw);
  return {
    overall: overallProgress(units),
    focus,
    attendance: attendance.total > 0 ? attendance : null,
    main: main.map((u) => viewOf(data, u, raw, statuses, focus)),
    more: more.map((u) => viewOf(data, u, raw, statuses, focus)),
    full: trendInput(data, raw),
  };
}
