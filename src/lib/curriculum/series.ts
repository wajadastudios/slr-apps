import type { CurriculumData, Level, TestType } from "./types";
import { currentLevel } from "./levels";
import { checkTarget, isValidResult, personalRecords, targetOf } from "./results";

// Data behind the "kemampuan nyata" charts. Distance (meters) and duration
// (seconds) are never drawn on the same axis, and nothing here is scaled into
// a score: each series keeps its own unit.

export type AbilityPoint = {
  resultId: string;
  date: string;
  value: number;
  assisted: boolean;
  // validated and comparable: only these may draw the line or set a record
  valid: boolean;
  isRecord: boolean;
  level: Level | null;
  targetMet: boolean | null;
};

export type AbilitySeries = {
  type: TestType;
  unit: "m" | "detik";
  points: AbilityPoint[];
  // the target in force now for this skill's current level (versioned, active)
  target: { value: number; level: Level | null } | null;
  best: number | null;
};

export function abilitySeries(data: CurriculumData, skillId: string): AbilitySeries[] {
  const records = personalRecords(data.results, data.testTypes);
  const level = currentLevel(skillId, data.levelEvents)?.level ?? null;
  const out: AbilitySeries[] = [];

  const types = data.testTypes
    .filter((t) => t.skillId === skillId && (t.measure === "distance_m" || t.measure === "duration_s"))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const type of types) {
    const rows = data.results
      .filter((r) => r.testTypeId === type.id)
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.id.localeCompare(b.id));
    if (rows.length === 0) continue;

    const recordIds = new Set(
      records
        .filter((r) => r.testTypeId === type.id && (r.kind === "jarak" || r.kind === "durasi") && !r.assisted)
        .map((r) => r.resultId)
    );

    const points: AbilityPoint[] = [];
    for (const r of rows) {
      const value = type.measure === "distance_m" ? r.distanceM : r.durationS;
      if (value === null) continue;
      const target = targetOf(r, data.targets);
      points.push({
        resultId: r.id,
        date: r.sessionDate,
        value,
        assisted: r.assisted,
        valid: isValidResult(r),
        isRecord: recordIds.has(r.id),
        level: r.level,
        targetMet: target ? checkTarget(r, type, target).met : null,
      });
    }
    if (points.length === 0) continue;

    const active = data.targets
      .filter((t) => t.testTypeId === type.id && t.active && (type.levelSpecific ? t.level === level : t.level === null))
      .sort((a, b) => b.version - a.version)[0];
    const unassistedValid = points.filter((p) => p.valid && !p.assisted).map((p) => p.value);

    out.push({
      type,
      unit: type.measure === "distance_m" ? "m" : "detik",
      points,
      target: active ? { value: active.value, level: active.level } : null,
      best: unassistedValid.length ? Math.max(...unassistedValid) : null,
    });
  }
  return out;
}
