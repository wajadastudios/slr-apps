import type { CurriculumData } from "./types";
import type { SeriesPoint, SeriesSegment } from "./summary";
import { attended, halves, mappedTargets } from "./legacy-view";

// "Overall" = the whole learning journey in one line. Each point is one
// session: the average of every indicator assessed that day, across all skills
// (sum of scores / (5 x indicators assessed) x 100). Only what was really
// assessed counts, so a session that touched two indicators and one that touched
// twelve are both honest, and adding a skill never lowers an earlier point.
//
// Old reports contribute through the explicit mapping (non-zero scores only; a
// legacy 0 cannot be told from "not assessed") and form their own, first
// segment so they are never joined to the new curriculum's line.

function point(reportId: string, date: string, scores: number[], legacy: boolean): SeriesPoint | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((n, v) => n + v, 0);
  return {
    legacy,
    reportId,
    date,
    level: null,
    percent: Math.round((sum / (5 * scores.length)) * 100),
    assessed: scores.length,
    required: scores.length,
    complete: true,
  };
}

export function overallSeries(data: CurriculumData): SeriesSegment[] {
  const known = new Set(data.indicators.map((i) => i.key));
  const out: SeriesSegment[] = [];

  // old reports, through the mapping
  const map = mappedTargets(data);
  const legacyPoints: SeriesPoint[] = [];
  for (const report of [...(data.legacy?.reports ?? [])].filter(attended).sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))) {
    const perTarget = new Map<string, number[]>();
    for (const [legacyKey, m] of map) {
      const v = report.scores[legacyKey];
      if (typeof v !== "number" || v <= 0) continue;
      perTarget.set(m.target.key, [...(perTarget.get(m.target.key) ?? []), v]);
    }
    const values = [...perTarget.values()].map((list) => halves(list.reduce((n, v) => n + v, 0) / list.length));
    const p = point(report.id, report.sessionDate, values, true);
    if (p) legacyPoints.push(p);
  }
  if (legacyPoints.length) out.push({ level: null, points: legacyPoints, legacy: true });

  // the level curriculum's own reports
  const own: SeriesPoint[] = [];
  for (const report of [...data.reports].filter((r) => r.curriculumVersion !== null && r.attendance === "hadir").sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))) {
    const values = Object.entries(report.scores)
      .filter(([key, v]) => known.has(key) && typeof v === "number")
      .map(([, v]) => v);
    const p = point(report.id, report.sessionDate, values, false);
    if (p) own.push(p);
  }
  if (own.length) out.push({ level: null, points: own });
  return out;
}
