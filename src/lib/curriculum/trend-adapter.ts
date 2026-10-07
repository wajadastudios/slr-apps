import { buildIndicatorConfig, type IndicatorConfig, type IndicatorGroupRow, type IndicatorRow } from "@/lib/indicators";
import type { CurriculumData } from "./types";
import { currentLevel } from "./levels";
import { attended, halves, mappedTargets } from "./legacy-view";

// The parent's familiar per-indicator charts (ProgressOverview / ProgressTrend)
// read "reports with scores per indicator key" and an indicator structure. On
// the level curriculum those inputs are rebuilt here from the curriculum's
// indicators and from old reports through the explicit mapping, so the charts
// look exactly as before while including history from before the update.
//
// Read-only: no report, score or date is altered. A legacy 0 is left out
// (it cannot be told from "not assessed").

export type RawReport = {
  session_date: string;
  session_number?: number | null;
  attendance?: string | null;
  notes?: string | null;
  next_focus?: string | null;
  scores: unknown;
  curriculum_version?: number | null;
};

export type TrendReport = {
  session_date: string;
  session_number: number | null;
  attendance: string | null;
  notes: string | null;
  next_focus: string | null;
  scores: Record<string, number> | null;
};

const asScores = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(raw);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
};

// `skillId` narrows everything to one skill (the detail of one skill card).
export function trendInput(
  data: CurriculumData,
  raw: RawReport[],
  opts: { skillId?: string } = {}
): { config: IndicatorConfig; reports: TrendReport[] } {
  const scope = opts.skillId ? data.indicators.filter((i) => i.skillId === opts.skillId) : data.indicators;
  const known = new Set(scope.map((i) => i.key));
  const map = mappedTargets(data);

  const reports: TrendReport[] = raw.map((r) => {
    const base = {
      session_date: r.session_date,
      session_number: r.session_number ?? null,
      attendance: r.attendance ?? null,
      notes: r.notes ?? null,
      next_focus: r.next_focus ?? null,
    };
    if (!attended(base)) return { ...base, scores: null };

    const scores = asScores(r.scores);
    if (r.curriculum_version !== null && r.curriculum_version !== undefined) {
      return { ...base, scores: Object.fromEntries(Object.entries(scores).filter(([k]) => known.has(k))) };
    }
    const perTarget = new Map<string, number[]>();
    for (const [legacyKey, m] of map) {
      if (!known.has(m.target.key)) continue;
      const v = scores[legacyKey];
      if (typeof v !== "number" || v <= 0) continue;
      perTarget.set(m.target.key, [...(perTarget.get(m.target.key) ?? []), v]);
    }
    return { ...base, scores: Object.fromEntries([...perTarget].map(([k, list]) => [k, halves(list.reduce((n, v) => n + v, 0) / list.length)])) };
  });

  // one skill: only the sessions that assessed it (a chart of nothing is not shown)
  if (opts.skillId) {
    for (let i = reports.length - 1; i >= 0; i--) if (Object.keys(reports[i].scores ?? {}).length === 0) reports.splice(i, 1);
  }
  const used = new Set(reports.flatMap((r) => Object.keys(r.scores ?? {})));
  const skillById = new Map(data.skills.map((s) => [s.id, s]));
  const levelOf = new Map(data.skills.map((s) => [s.id, currentLevel(s.id, data.levelEvents)?.level ?? null]));

  // what shows up: everything that has a score, plus what the child is working on now
  const include = scope.filter((i) => {
    if (used.has(i.key)) return true;
    const skill = skillById.get(i.skillId);
    if (!skill || !i.active) return false;
    return skill.hasLevels ? i.level !== null && i.level === levelOf.get(skill.id) : i.level === null;
  });

  const groupRows: IndicatorGroupRow[] = data.skills
    .filter((s) => include.some((i) => i.skillId === s.id))
    .map((s) => ({ id: s.id, name: s.name, sort_order: s.sortOrder, active: true }));
  const indicatorRows: IndicatorRow[] = include.map((i) => ({
    id: i.id,
    key: i.key,
    // the same aspect exists at three levels: say which one this line is
    label: !opts.skillId && skillById.get(i.skillId)?.hasLevels && i.level ? `${i.label} · Level ${i.level}` : i.label,
    group_id: i.skillId,
    sort_order: (i.level ?? 0) * 100 + i.sortOrder,
    active: i.active || used.has(i.key),
  }));

  return { config: buildIndicatorConfig(groupRows, indicatorRows), reports };
}
