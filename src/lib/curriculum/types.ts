// Plain, serializable shapes shared by the loader, the pure logic and the UI.
// Dates are ISO "YYYY-MM-DD" strings (they sort lexicographically).

export type Level = 1 | 2 | 3;
export type SkillKind = "foundation" | "safety" | "stroke";

export type CurriculumSkill = {
  id: string; // indicator_groups.id
  slug: string;
  name: string;
  kind: SkillKind;
  hasLevels: boolean;
  sortOrder: number;
};

export type CurriculumIndicator = {
  id: string;
  key: string;
  skillId: string;
  level: Level | null;
  label: string;
  description: string | null;
  rubric: string | null;
  required: boolean;
  active: boolean;
  sortOrder: number;
};

export type SkillRule = {
  skillId: string;
  level: Level | null;
  masteryMinScore: number;
  minEvidenceSessions: number;
  requiresTest: boolean;
};

export type TestMeasure = "distance_m" | "duration_s" | "checklist";

export type TestType = {
  id: string;
  skillId: string;
  code: string;
  label: string;
  measure: TestMeasure;
  levelSpecific: boolean;
  steps: string[] | null;
  active: boolean;
  sortOrder: number;
};

export type TestTarget = {
  id: string;
  testTypeId: string;
  level: Level | null;
  value: number;
  requiresUnassisted: boolean;
  requiresTechnique: boolean;
  version: number;
  active: boolean;
};

export type AssessmentContext = {
  skills?: Record<string, { level?: number }>;
  na?: Record<string, string>;
};

// A saved report as the curriculum logic needs it. Only FINAL reports are
// ever passed in (drafts are the author's private work in progress).
export type CurriculumReport = {
  id: string;
  sessionDate: string;
  attendance: string | null;
  scores: Record<string, number>;
  // null = written before the level curriculum: 0 cannot be told apart from
  // "not touched" in such reports
  curriculumVersion: number | null;
  context: AssessmentContext;
  authorName: string | null;
  notes: string | null;
};

export type ValidationStatus = "divalidasi" | "belum_divalidasi" | "tidak_valid";

export type TestResult = {
  id: string;
  reportId: string;
  sessionDate: string;
  testTypeId: string;
  level: Level | null;
  distanceM: number | null;
  durationS: number | null;
  timeS: number | null;
  assisted: boolean;
  assistanceNote: string | null;
  conditions: string | null;
  conditionsComparable: boolean;
  techniqueMet: boolean;
  stepsPassed: boolean[] | null;
  validation: ValidationStatus;
  targetId: string | null;
  notes: string | null;
};

export type LevelEvent = {
  id: string;
  skillId: string;
  level: Level;
  kind: "placement" | "promotion";
  effectiveOn: string;
  createdAt: string;
  note: string | null;
};

export type CurriculumData = {
  skills: CurriculumSkill[];
  indicators: CurriculumIndicator[];
  rules: SkillRule[];
  testTypes: TestType[];
  targets: TestTarget[];
  reports: CurriculumReport[];
  results: TestResult[];
  levelEvents: LevelEvent[];
};

export const LEVEL_NAMES: Record<Level, string> = {
  1: "Dasar",
  2: "Pengembangan",
  3: "Penguasaan",
};

export function levelLabel(level: Level): string {
  return `Level ${level} — ${LEVEL_NAMES[level]}`;
}

export function isLevel(n: unknown): n is Level {
  return n === 1 || n === 2 || n === 3;
}
