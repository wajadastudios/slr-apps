import { INDICATORS, RULES, SKILLS, TARGETS, TEST_TYPES, indicatorSeedKey } from "../../src/lib/curriculum/definition";
import type {
  CurriculumData,
  CurriculumIndicator,
  CurriculumSkill,
  SkillRule,
  TestTarget,
  TestType,
} from "../../src/lib/curriculum/types";

// The real starting curriculum, shaped like the loader returns it.
export const skills: CurriculumSkill[] = SKILLS.map((s) => ({
  id: `g_${s.slug}`,
  slug: s.slug,
  name: s.name,
  kind: s.kind,
  hasLevels: s.hasLevels,
  sortOrder: s.sortOrder,
}));

export const indicators: CurriculumIndicator[] = INDICATORS.map((i, n) => ({
  id: `i${n}`,
  key: indicatorSeedKey(i),
  skillId: `g_${i.skill}`,
  level: i.level,
  label: i.label,
  description: i.description,
  rubric: i.rubric,
  required: true,
  active: true,
  sortOrder: i.sortOrder,
}));

export const testTypes: TestType[] = TEST_TYPES.map((t, n) => ({
  id: `tt_${t.code}`,
  skillId: `g_${t.skill}`,
  code: t.code,
  label: t.label,
  measure: t.measure,
  levelSpecific: t.levelSpecific,
  steps: t.steps ?? null,
  active: true,
  sortOrder: n,
}));

export const targets: TestTarget[] = TARGETS.map((t) => ({
  id: `tg_${t.testCode}_${t.level}`,
  testTypeId: `tt_${t.testCode}`,
  level: t.level,
  value: t.value,
  requiresUnassisted: true,
  requiresTechnique: true,
  version: 1,
  active: true,
}));

export const rules: SkillRule[] = RULES.map((r) => ({
  skillId: `g_${r.skill}`,
  level: r.level,
  masteryMinScore: r.masteryMinScore,
  minEvidenceSessions: r.minEvidenceSessions,
  requiresTest: r.requiresTest,
}));

export const key = (skill: string, slug: string) => `k1_${skill}_${slug}`;

export function makeData(over: Partial<CurriculumData> = {}): CurriculumData {
  return { skills, indicators, rules, testTypes, targets, reports: [], results: [], levelEvents: [], ...over };
}
