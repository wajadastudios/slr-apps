import type { CurriculumData, CurriculumIndicator, CurriculumSkill, Level, LegacyMapEntry } from "./types";
import { techniqueSummary, type SeriesPoint, type SeriesSegment } from "./summary";

// How history from before the level curriculum is shown. Everything here only
// READS: old reports, their scores, dates, authors and notes stay exactly as
// stored, and nothing is presented as a new-curriculum session.
//
// A legacy 0 is not drawn: the old form posted every indicator with a default
// of 0, so a 0 cannot be told apart from "not assessed". It stays visible in
// the history list as "belum dapat dipastikan".

export const LEGACY_LABEL = "Riwayat sebelum pembaruan kurikulum";

type Mapped = { entry: LegacyMapEntry; target: CurriculumIndicator };

function mappedTargets(data: CurriculumData): Map<string, Mapped> {
  const byId = new Map(data.indicators.map((i) => [i.id, i]));
  const out = new Map<string, Mapped>();
  for (const entry of data.legacy?.map ?? []) {
    if ((entry.status === "auto" || entry.status === "manual") && entry.targetId) {
      const target = byId.get(entry.targetId);
      if (target) out.set(entry.legacyKey, { entry, target });
    }
  }
  return out;
}

const attended = (r: { attendance: string | null }) => r.attendance === "hadir";
const halves = (n: number) => Math.round(n * 2) / 2;

// Technique history of one skill taken from mapped old scores: one point per
// old report (and per level the mapped indicators sit at), through the same
// summary the new reports use. Partial coverage is honest: an old report that
// scored 1 of 6 mapped indicators gives a point marked partial.
export function legacySeries(data: CurriculumData, skill: CurriculumSkill): SeriesSegment[] {
  const map = mappedTargets(data);
  const history = data.legacy?.reports ?? [];
  const mine = [...map.values()].filter((m) => m.target.skillId === skill.id);
  if (mine.length === 0 || history.length === 0) return [];

  const points: (SeriesPoint & { sort: string })[] = [];
  for (const report of [...history].filter(attended).sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))) {
    const levels = new Set(mine.map((m) => m.target.level));
    for (const level of levels) {
      const sums = new Map<string, number[]>();
      for (const [legacyKey, m] of map) {
        if (m.target.skillId !== skill.id || m.target.level !== level) continue;
        const value = report.scores[legacyKey];
        if (typeof value !== "number" || value <= 0) continue;
        const list = sums.get(m.target.key) ?? [];
        list.push(value);
        sums.set(m.target.key, list);
      }
      if (sums.size === 0) continue;
      const scores: Record<string, number> = {};
      for (const [key, list] of sums) scores[key] = halves(list.reduce((n, v) => n + v, 0) / list.length);
      const s = techniqueSummary(data.indicators, skill.id, level, { scores, context: {} });
      if (s.percent === null) continue;
      points.push({
        legacy: true,
        reportId: report.id,
        date: report.sessionDate,
        level,
        percent: s.percent,
        assessed: s.assessed,
        required: s.required,
        complete: s.complete,
        sort: `${report.sessionDate}|${level ?? 0}`,
      });
    }
  }

  const segments: SeriesSegment[] = [];
  for (const p of points.sort((a, b) => a.sort.localeCompare(b.sort))) {
    const { sort: _sort, ...point } = p;
    void _sort;
    const last = segments[segments.length - 1];
    if (last && last.level === point.level) last.points.push(point);
    else segments.push({ level: point.level, points: [point], legacy: true });
  }
  return segments;
}

// The newest non-zero old score of an indicator that was mapped to it.
export function legacyLatest(data: CurriculumData, indicatorKey: string): { score: number; date: string } | null {
  const map = mappedTargets(data);
  let best: { score: number; date: string } | null = null;
  for (const report of data.legacy?.reports ?? []) {
    if (!attended(report)) continue;
    const values: number[] = [];
    for (const [legacyKey, m] of map) {
      if (m.target.key !== indicatorKey) continue;
      const v = report.scores[legacyKey];
      if (typeof v === "number" && v > 0) values.push(v);
    }
    if (values.length === 0) continue;
    if (!best || report.sessionDate > best.date) best = { score: halves(values.reduce((n, v) => n + v, 0) / values.length), date: report.sessionDate };
  }
  return best;
}

export type LegacyRow = {
  key: string;
  label: string;
  group: string | null;
  mappedTo: { label: string; skillName: string; level: Level | null } | null;
  status: LegacyMapEntry["status"] | "belum_ada";
  entries: { date: string; score: number }[]; // non-zero, oldest first
  zeros: number;
  last: { date: string; score: number } | null;
};

// Every old indicator that has stored scores, with its history. Mapped ones
// carry the indicator they are drawn under; the rest are listed as they were.
export function legacyRows(data: CurriculumData): LegacyRow[] {
  const map = mappedTargets(data);
  const entryByKey = new Map((data.legacy?.map ?? []).map((m) => [m.legacyKey, m]));
  const skillName = new Map(data.skills.map((s) => [s.id, s.name]));
  const rows = new Map<string, LegacyRow>();

  for (const report of [...(data.legacy?.reports ?? [])].filter(attended).sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))) {
    for (const [key, score] of Object.entries(report.scores)) {
      const label = report.labels[key]?.label ?? entryByKey.get(key)?.legacyLabel ?? key;
      const group = report.labels[key]?.group ?? entryByKey.get(key)?.legacyGroup ?? null;
      const m = map.get(key);
      const row =
        rows.get(key) ??
        ({
          key,
          label,
          group,
          mappedTo: m ? { label: m.target.label, skillName: skillName.get(m.target.skillId) ?? "", level: m.target.level } : null,
          status: entryByKey.get(key)?.status ?? "belum_ada",
          entries: [],
          zeros: 0,
          last: null,
        } as LegacyRow);
      row.label = label;
      row.group = group;
      if (score > 0) {
        row.entries.push({ date: report.sessionDate, score });
        row.last = { date: report.sessionDate, score };
      } else row.zeros += 1;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.label.localeCompare(b.label));
}

export function hasLegacyHistory(data: CurriculumData): boolean {
  return (data.legacy?.reports ?? []).some((r) => attended(r) && Object.keys(r.scores).length > 0);
}

// Does this skill have mapped history (for "belum dimulai" vs "ada riwayat")?
export function skillHasLegacy(data: CurriculumData, skill: CurriculumSkill): boolean {
  return legacySeries(data, skill).length > 0;
}
