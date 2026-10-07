import type { CurriculumIndicator, CurriculumReport, Level } from "./types";

export type TechniqueSummary = {
  // indicators that count for this report (required, not marked tidak berlaku)
  required: number;
  assessed: number;
  // jumlah skor / (5 x indikator wajib yang dinilai) x 100; null if nothing assessed
  percent: number | null;
  // every counted indicator was assessed -> safe to compare with other sessions
  complete: boolean;
};

// The set of indicators a report is judged against for one skill (+ level):
// required ones, still active OR already scored in this report (so retiring
// an indicator later never rewrites what an old report covered), minus the
// ones the pengajar marked tidak berlaku.
export function reportIndicators(
  indicators: CurriculumIndicator[],
  skillId: string,
  level: Level | null,
  report: Pick<CurriculumReport, "scores" | "context">
): CurriculumIndicator[] {
  return indicators.filter(
    (i) =>
      i.skillId === skillId &&
      i.level === level &&
      i.required &&
      (i.active || typeof report.scores[i.key] === "number") &&
      !report.context.na?.[i.key]
  );
}

export function techniqueSummary(
  indicators: CurriculumIndicator[],
  skillId: string,
  level: Level | null,
  report: Pick<CurriculumReport, "scores" | "context">
): TechniqueSummary {
  const counted = reportIndicators(indicators, skillId, level, report);
  const assessed = counted.filter((i) => typeof report.scores[i.key] === "number");
  const sum = assessed.reduce((n, i) => n + report.scores[i.key], 0);
  return {
    required: counted.length,
    assessed: assessed.length,
    percent: assessed.length > 0 ? Math.round((sum / (5 * assessed.length)) * 100) : null,
    complete: counted.length > 0 && assessed.length === counted.length,
  };
}

export function coverageLabel(s: TechniqueSummary): string {
  return s.complete
    ? `${s.assessed}/${s.required} indikator dinilai`
    : `Penilaian belum lengkap: ${s.assessed}/${s.required} indikator`;
}

export type SeriesPoint = {
  // true for a point taken from a report written before the level curriculum
  legacy?: boolean;
  reportId: string;
  date: string;
  level: Level | null;
  percent: number;
  assessed: number;
  required: number;
  complete: boolean;
};

export type SeriesSegment = { level: Level | null; points: SeriesPoint[]; legacy?: boolean };

function asLevel(n: number | undefined): Level | null {
  return n === 1 || n === 2 || n === 3 ? n : null;
}

// Technique history of one skill. Reports are grouped into one SEGMENT per
// level (never joined across levels, so moving from 100% at Level 1 to 30% at
// Level 2 is a new rubric, not a decline), and only sessions that actually
// assessed something produce a point.
export function techniqueSeries(
  indicators: CurriculumIndicator[],
  skillId: string,
  reports: CurriculumReport[]
): SeriesSegment[] {
  const ordered = reports
    .filter((r) => r.curriculumVersion !== null)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

  const segments: SeriesSegment[] = [];
  for (const r of ordered) {
    const ctx = r.context.skills?.[skillId];
    const touched =
      ctx !== undefined || indicators.some((i) => i.skillId === skillId && typeof r.scores[i.key] === "number");
    if (!touched) continue;

    const level = asLevel(ctx?.level);
    const s = techniqueSummary(indicators, skillId, level, r);
    if (s.percent === null) continue;

    const point: SeriesPoint = {
      reportId: r.id,
      date: r.sessionDate,
      level,
      percent: s.percent,
      assessed: s.assessed,
      required: s.required,
      complete: s.complete,
    };
    const last = segments[segments.length - 1];
    if (last && last.level === level) last.points.push(point);
    else segments.push({ level, points: [point] });
  }
  return segments;
}
