import type { CurriculumData, CurriculumIndicator, CurriculumSkill, Level } from "./types";
import { indicatorStatus, skillStarted, type IndicatorStatus } from "./status";
import { currentLevel, masteryStats, type MasteryStats } from "./levels";
import { checkTarget, formatMeasure, personalRecords, targetOf, type PersonalRecord, type TargetCheck } from "./results";

// One entry per skill, side by side. There is deliberately NO combined or
// average figure across skills: adding a skill must never lower what a child
// already shows for the others.

export type LatestTest = {
  label: string;
  value: string;
  date: string;
  assisted: boolean;
  check: TargetCheck | null;
  targetValue: number | null;
};

export type SkillProfile = {
  skill: CurriculumSkill;
  started: boolean;
  lastAssessed: string | null;
  // Dasar / Water Safety
  mastery: MasteryStats | null;
  // strokes
  level: { level: Level; since: string; kind: "placement" | "promotion" } | null;
  latestTest: LatestTest | null;
  bestDistance: PersonalRecord | null;
};

function skillKeys(indicators: CurriculumIndicator[], skillId: string): string[] {
  return indicators.filter((i) => i.skillId === skillId).map((i) => i.key);
}

export function lastAssessedDate(data: CurriculumData, skillId: string): string | null {
  const keys = new Set(skillKeys(data.indicators, skillId));
  let last: string | null = null;
  for (const r of data.reports) {
    if (r.curriculumVersion === null) continue;
    const touched = Object.keys(r.scores).some((k) => keys.has(k));
    if (touched && (!last || r.sessionDate > last)) last = r.sessionDate;
  }
  return last;
}

export function buildProfile(data: CurriculumData): SkillProfile[] {
  const skills = [...data.skills].sort((a, b) => a.sortOrder - b.sortOrder);
  const records = personalRecords(data.results, data.testTypes);

  return skills.map((skill) => {
    const keys = skillKeys(data.indicators, skill.id);
    const started = skillStarted(skill.id, keys, data.reports, data.levelEvents);
    const base: SkillProfile = {
      skill,
      started,
      lastAssessed: lastAssessedDate(data, skill.id),
      mastery: null,
      level: null,
      latestTest: null,
      bestDistance: null,
    };

    if (!skill.hasLevels) {
      return { ...base, mastery: masteryStats(skill, data.indicators, data.reports, data.rules) };
    }

    const types = data.testTypes.filter((t) => t.skillId === skill.id && t.measure === "distance_m");
    const typeIds = new Set(types.map((t) => t.id));
    const newest = data.results
      .filter((r) => typeIds.has(r.testTypeId))
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.id.localeCompare(a.id))[0];
    const type = newest ? types.find((t) => t.id === newest.testTypeId) : undefined;
    const target = newest ? targetOf(newest, data.targets) : null;

    return {
      ...base,
      level: currentLevel(skill.id, data.levelEvents),
      latestTest:
        newest && type
          ? {
              label: type.label,
              value: formatMeasure(newest, type),
              date: newest.sessionDate,
              assisted: newest.assisted,
              check: checkTarget(newest, type, target),
              targetValue: target?.value ?? null,
            }
          : null,
      bestDistance: records.find((r) => r.kind === "jarak" && !r.assisted && typeIds.has(r.testTypeId)) ?? null,
    };
  });
}

export type CurrentAssessmentItem = { indicator: CurriculumIndicator; status: IndicatorStatus };

// "Keadaan terkini": the latest assessment of each indicator with its date.
// Because indicators may have been assessed in different sessions, the result
// says so (and which entries are older) instead of presenting it as one
// session.
export function currentAssessment(
  data: CurriculumData,
  skill: CurriculumSkill,
  level: Level | null
): { items: CurrentAssessmentItem[]; newestDate: string | null; multipleSessions: boolean } {
  const keys = skillKeys(data.indicators, skill.id);
  const started = skillStarted(skill.id, keys, data.reports, data.levelEvents);
  const items = data.indicators
    .filter((i) => i.skillId === skill.id && i.level === level && i.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((indicator) => ({ indicator, status: indicatorStatus(indicator, data.reports, started) }));

  const dates = items.flatMap((i) => (i.status.state === "dinilai" ? [i.status.date] : []));
  const newestDate = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  return { items, newestDate, multipleSessions: new Set(dates).size > 1 };
}
