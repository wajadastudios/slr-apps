import type { CurriculumData, CurriculumIndicator, CurriculumSkill, Level } from "./types";
import { currentLevel } from "./levels";
import { attended, halves, mappedTargets } from "./legacy-view";
import { canonicalName } from "./legacy-map";

// Progress % -- what a parent reads.
//
//   Skill -> Level (strokes only) -> Indicator -> stars 1-5 -> Progress %
//
// Stars stay the pengajar's own assessment. Progress % is computed here:
//
//   sum of the LATEST star of every indicator assessed
//   / (number of indicators assessed x 5) x 100
//
// An indicator that was never assessed is not a 0 (it is simply not counted;
// the coverage says "4 dari 6 indikator sudah dinilai"). Scores from reports
// written before the level curriculum take part through the explicit mapping,
// by their original dates. A legacy 0 is not an assessment (the old form posted
// every indicator with a default 0), so it is skipped; a 0 given in the level
// curriculum is a real "belum mampu" and counts.

export const MIN_SESSIONS = 3;
export const MIN_COVERAGE = 0.5;

export type HistoryPoint = { date: string; score: number };

// Every dated assessment of every indicator, oldest first.
export function indicatorHistory(data: CurriculumData): Map<string, HistoryPoint[]> {
  const out = new Map<string, HistoryPoint[]>();
  const add = (key: string, point: HistoryPoint) => out.set(key, [...(out.get(key) ?? []), point]);

  // old reports, through the mapping (several old indicators on one new one: average)
  const map = mappedTargets(data);
  for (const report of data.legacy?.reports ?? []) {
    if (!attended(report)) continue;
    const perTarget = new Map<string, number[]>();
    for (const [legacyKey, m] of map) {
      const v = report.scores[legacyKey];
      if (typeof v !== "number" || v <= 0) continue;
      perTarget.set(m.target.key, [...(perTarget.get(m.target.key) ?? []), v]);
    }
    for (const [key, list] of perTarget) add(key, { date: report.sessionDate, score: halves(list.reduce((n, v) => n + v, 0) / list.length) });
  }

  // reports written on the level curriculum
  const known = new Set(data.indicators.map((i) => i.key));
  for (const report of data.reports) {
    if (report.curriculumVersion === null || !attended(report)) continue;
    for (const [key, v] of Object.entries(report.scores)) {
      if (known.has(key) && typeof v === "number") add(key, { date: report.sessionDate, score: v });
    }
  }

  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export type UnitStatus = "belum_dimulai" | "baru_dimulai" | "sedang_dilatih" | "berkembang_baik" | "sudah_dikuasai";

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  belum_dimulai: "Belum dimulai",
  baru_dimulai: "Baru dimulai",
  sedang_dilatih: "Sedang dilatih",
  berkembang_baik: "Berkembang baik",
  sudah_dikuasai: "Sudah dikuasai",
};

export type UnitItem = { indicator: CurriculumIndicator; score: number; date: string };

// One skill at the level the child is working on (Dasar and Water Safety have no level).
export type Unit = {
  skill: CurriculumSkill;
  level: Level | null;
  indicators: CurriculumIndicator[];
  items: UnitItem[]; // assessed indicators with their latest score
  assessed: number;
  total: number;
  percent: number | null;
  sessions: number;
  eligible: boolean; // enough to count towards Overall
  status: UnitStatus;
  lastDate: string | null;
  series: { date: string; percent: number }[];
};

// The level a stroke is worked at: the recorded one, otherwise the lowest level
// that has any assessment (so a child whose history sits on Level 1 is a Level 1
// child even before a level was formally recorded).
export function activeLevel(data: CurriculumData, skill: CurriculumSkill, history = indicatorHistory(data)): Level | null {
  if (!skill.hasLevels) return null;
  const recorded = currentLevel(skill.id, data.levelEvents)?.level;
  if (recorded) return recorded;
  const levels = data.indicators.filter((i) => i.skillId === skill.id && i.level !== null && history.has(i.key)).map((i) => i.level as Level);
  return levels.length ? (Math.min(...levels) as Level) : null;
}

function percentOf(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((n, v) => n + v, 0) / (scores.length * 5)) * 100);
}

export function statusOf(args: { assessed: number; total: number; percent: number | null; sessions: number }): { status: UnitStatus; eligible: boolean } {
  const { assessed, total, percent, sessions } = args;
  if (assessed === 0 || percent === null) return { status: "belum_dimulai", eligible: false };
  const eligible = sessions >= MIN_SESSIONS || (total > 0 && assessed / total >= MIN_COVERAGE);
  if (!eligible) return { status: "baru_dimulai", eligible: false };
  if (percent >= 90 && assessed === total) return { status: "sudah_dikuasai", eligible: true };
  if (percent >= 70) return { status: "berkembang_baik", eligible: true };
  return { status: "sedang_dilatih", eligible: true };
}

export function buildUnit(data: CurriculumData, skill: CurriculumSkill, level: Level | null, history = indicatorHistory(data)): Unit {
  const indicators = data.indicators
    .filter((i) => i.skillId === skill.id && i.level === level && (i.active || history.has(i.key)))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const items: UnitItem[] = [];
  for (const indicator of indicators) {
    const list = history.get(indicator.key);
    const last = list?.[list.length - 1];
    if (last) items.push({ indicator, score: last.score, date: last.date });
  }
  const percent = percentOf(items.map((i) => i.score));

  // sessions that assessed anything in this unit, and the progress after each of them
  const dates = [...new Set(indicators.flatMap((i) => (history.get(i.key) ?? []).map((p) => p.date)))].sort();
  const series = dates.map((date) => {
    const latest: number[] = [];
    for (const indicator of indicators) {
      const upTo = (history.get(indicator.key) ?? []).filter((p) => p.date <= date);
      if (upTo.length) latest.push(upTo[upTo.length - 1].score);
    }
    return { date, percent: percentOf(latest) ?? 0 };
  });

  const { status, eligible } = statusOf({ assessed: items.length, total: indicators.length, percent, sessions: dates.length });
  return {
    skill,
    level,
    indicators,
    items,
    assessed: items.length,
    total: indicators.length,
    percent,
    sessions: dates.length,
    eligible,
    status,
    lastDate: dates[dates.length - 1] ?? null,
    series,
  };
}

export function buildUnits(data: CurriculumData): Unit[] {
  const history = indicatorHistory(data);
  return [...data.skills]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((skill) => buildUnit(data, skill, activeLevel(data, skill, history), history));
}

// Overall: the average Progress % of the skills/levels that are being learned
// AND measured enough. Not started, just started and anything not mapped never
// take part, so a new skill can never pull the figure down.
export function overallProgress(units: Unit[]): { percent: number; count: number } | null {
  const counted = units.filter((u) => u.eligible && u.percent !== null);
  if (counted.length === 0) return null;
  return { percent: Math.round(counted.reduce((n, u) => n + (u.percent as number), 0) / counted.length), count: counted.length };
}

export function coverageText(u: Pick<Unit, "assessed" | "total">): string {
  return `${u.assessed} dari ${u.total} indikator sudah dinilai`;
}

// ---------- focus ----------
export type RawNextFocus = { session_date: string; attendance?: string | null; next_focus?: string | null };

export type Focus = { text: string; skillId: string | null };

// The pengajar's own recommendation wins. Without one, the assessed indicator
// with the lowest latest star among the skills being learned. Never invented.
export function currentFocus(units: Unit[], reports: RawNextFocus[]): Focus | null {
  const written = [...reports]
    .filter((r) => (r.attendance ?? "hadir") === "hadir" && (r.next_focus ?? "").trim() !== "")
    .sort((a, b) => b.session_date.localeCompare(a.session_date))[0];
  if (written) {
    const text = (written.next_focus as string).trim();
    const canon = ` ${canonicalName(text)} `;
    const unit = units.find((u) => u.items.some((i) => canon.includes(` ${canonicalName(i.indicator.label)} `)));
    return { text, skillId: unit?.skill.id ?? null };
  }

  let best: { unit: Unit; item: UnitItem } | null = null;
  for (const unit of units) {
    if (unit.status === "belum_dimulai") continue;
    for (const item of unit.items) {
      if (item.score >= 5) continue;
      if (!best || item.score < best.item.score) best = { unit, item };
    }
  }
  return best ? { text: best.item.indicator.label, skillId: best.unit.skill.id } : null;
}

export function attendanceSummary(reports: { attendance?: string | null }[]): { present: number; total: number } {
  return { present: reports.filter((r) => r.attendance === "hadir").length, total: reports.length };
}

// ---------- which cards go on the main page ----------
export function orderUnits(units: Unit[], focus: Focus | null): { main: Unit[]; more: Unit[] } {
  const shown = units.filter((u) => u.status !== "belum_dimulai");
  const rank = (u: Unit) => (focus?.skillId === u.skill.id ? 0 : u.eligible ? 1 : 2);
  const sorted = [...shown].sort((a, b) => rank(a) - rank(b) || a.skill.sortOrder - b.skill.sortOrder);
  return { main: sorted.slice(0, 3), more: sorted.slice(3) };
}
