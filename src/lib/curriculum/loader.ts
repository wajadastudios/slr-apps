import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssessmentContext,
  CurriculumData,
  CurriculumIndicator,
  CurriculumReport,
  CurriculumSkill,
  Level,
  LevelEvent,
  SkillKind,
  SkillRule,
  TestResult,
  TestTarget,
  TestType,
  ValidationStatus,
} from "./types";
import { isLevel } from "./types";

export type CurriculumMode = "legacy" | "levels_v1";

// Deliberately NOT part of PROGRAM_SELECT: if the migration has not run yet,
// every program page must keep working, so a missing column or table simply
// means "legacy" here instead of breaking unrelated screens.
export async function loadCurriculumMode(supabase: SupabaseClient, programId: string | null | undefined): Promise<CurriculumMode> {
  if (!programId) return "legacy";
  const { data, error } = await supabase.from("programs").select("curriculum_mode").eq("id", programId).maybeSingle();
  if (error) return "legacy";
  return data?.curriculum_mode === "levels_v1" ? "levels_v1" : "legacy";
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const RESULT_COLUMNS =
  "id, progress_report_id, test_type_id, level, distance_m, duration_s, time_s, assisted, assistance_note, conditions, conditions_comparable, technique_met, steps_passed, validation, target_id, notes, created_at";

function mapResult(r: Record<string, unknown>, sessionDate: string): TestResult {
  return {
    id: r.id as string,
    reportId: r.progress_report_id as string,
    sessionDate,
    testTypeId: r.test_type_id as string,
    level: lvl(r.level),
    distanceM: num(r.distance_m),
    durationS: num(r.duration_s),
    timeS: num(r.time_s),
    assisted: r.assisted === true,
    assistanceNote: (r.assistance_note as string | null) ?? null,
    conditions: (r.conditions as string | null) ?? null,
    conditionsComparable: r.conditions_comparable !== false,
    techniqueMet: r.technique_met === true,
    stepsPassed: Array.isArray(r.steps_passed) ? (r.steps_passed as boolean[]) : null,
    validation: r.validation as ValidationStatus,
    targetId: (r.target_id as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

// The tests of ONE report, final or not -- used to reopen a draft or edit a
// saved report (loadCurriculumData only returns results of final reports).
export async function loadReportTestResults(supabase: SupabaseClient, reportId: string, sessionDate: string): Promise<TestResult[]> {
  const { data } = await supabase.from("skill_test_results").select(RESULT_COLUMNS).eq("progress_report_id", reportId);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => mapResult(r, sessionDate));
}
const lvl = (v: unknown): Level | null => (isLevel(Number(v)) ? (Number(v) as Level) : null);

// Everything the level curriculum needs for ONE enrollment (a participant in
// one program). RLS already limits what the caller can read; reports passed to
// the logic are final-only (a draft is its author's private work in progress).
export async function loadCurriculumData(
  supabase: SupabaseClient,
  args: { programId: string; enrollmentId: string }
): Promise<CurriculumData> {
  const { programId, enrollmentId } = args;

  const [groupsRes, indicatorsRes, typesRes, reportsRes, resultsRes, eventsRes] = await Promise.all([
    supabase
      .from("indicator_groups")
      .select("id, slug, name, skill_kind, has_levels, sort_order")
      .eq("program_id", programId)
      .not("slug", "is", null),
    supabase
      .from("indicators")
      .select("id, key, group_id, level, label, description, rubric, required, active, sort_order")
      .eq("program_id", programId)
      .not("seed_key", "is", null),
    supabase
      .from("skill_test_types")
      .select("id, group_id, code, label, measure, level_specific, steps, active, sort_order")
      .eq("program_id", programId),
    supabase
      .from("progress_reports")
      .select("id, session_date, attendance, scores, curriculum_version, assessment_context, notes, pelatih_id")
      .eq("enrollment_id", enrollmentId)
      .eq("status", "final")
      .order("session_date", { ascending: false }),
    supabase.from("skill_test_results").select(RESULT_COLUMNS).eq("enrollment_id", enrollmentId),
    supabase
      .from("skill_level_events")
      .select("id, group_id, level, kind, effective_on, created_at, note")
      .eq("enrollment_id", enrollmentId),
  ]);

  const skills: CurriculumSkill[] = (groupsRes.data ?? []).map((g) => ({
    id: g.id as string,
    slug: g.slug as string,
    name: g.name as string,
    kind: ((g.skill_kind as SkillKind | null) ?? "foundation") as SkillKind,
    hasLevels: g.has_levels === true,
    sortOrder: Number(g.sort_order ?? 0),
  }));
  const skillIds = skills.map((s) => s.id);

  const indicators: CurriculumIndicator[] = (indicatorsRes.data ?? []).map((i) => ({
    id: i.id as string,
    key: i.key as string,
    skillId: i.group_id as string,
    level: lvl(i.level),
    label: i.label as string,
    description: (i.description as string | null) ?? null,
    rubric: (i.rubric as string | null) ?? null,
    required: i.required !== false,
    active: i.active === true,
    sortOrder: Number(i.sort_order ?? 0),
  }));

  const testTypes: TestType[] = (typesRes.data ?? []).map((t) => ({
    id: t.id as string,
    skillId: t.group_id as string,
    code: t.code as string,
    label: t.label as string,
    measure: t.measure as TestType["measure"],
    levelSpecific: t.level_specific === true,
    steps: Array.isArray(t.steps) ? (t.steps as string[]) : null,
    active: t.active !== false,
    sortOrder: Number(t.sort_order ?? 0),
  }));
  const typeIds = testTypes.map((t) => t.id);

  const [rulesRes, targetsRes] = await Promise.all([
    skillIds.length
      ? supabase
          .from("skill_rules")
          .select("group_id, level, mastery_min_score, min_evidence_sessions, requires_test")
          .in("group_id", skillIds)
      : Promise.resolve({ data: [] as never[] }),
    typeIds.length
      ? supabase
          .from("skill_test_targets")
          .select("id, test_type_id, level, target_value, requires_unassisted, requires_technique, version, active")
          .in("test_type_id", typeIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const rules: SkillRule[] = ((rulesRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    skillId: r.group_id as string,
    level: lvl(r.level),
    masteryMinScore: Number(r.mastery_min_score),
    minEvidenceSessions: Number(r.min_evidence_sessions),
    requiresTest: r.requires_test === true,
  }));

  const targets: TestTarget[] = ((targetsRes.data ?? []) as Record<string, unknown>[]).map((t) => ({
    id: t.id as string,
    testTypeId: t.test_type_id as string,
    level: lvl(t.level),
    value: Number(t.target_value),
    requiresUnassisted: t.requires_unassisted !== false,
    requiresTechnique: t.requires_technique !== false,
    version: Number(t.version),
    active: t.active !== false,
  }));

  const reportRows = (reportsRes.data ?? []) as Record<string, unknown>[];
  const reports: CurriculumReport[] = reportRows.map((r) => ({
    id: r.id as string,
    sessionDate: r.session_date as string,
    attendance: (r.attendance as string | null) ?? null,
    scores: (r.scores && typeof r.scores === "object" ? (r.scores as Record<string, number>) : {}) ?? {},
    curriculumVersion: num(r.curriculum_version),
    context: (r.assessment_context && typeof r.assessment_context === "object" ? (r.assessment_context as AssessmentContext) : {}) ?? {},
    authorName: null,
    notes: (r.notes as string | null) ?? null,
  }));
  const dateByReport = new Map(reports.map((r) => [r.id, r.sessionDate]));

  // results of reports that are not final (or not visible) are dropped, so a
  // draft can never contribute a record or an achievement
  const results: TestResult[] = ((resultsRes.data ?? []) as Record<string, unknown>[])
    .filter((r) => dateByReport.has(r.progress_report_id as string))
    .map((r) => mapResult(r, dateByReport.get(r.progress_report_id as string)!));

  const levelEvents: LevelEvent[] = ((eventsRes.data ?? []) as Record<string, unknown>[])
    .filter((e) => isLevel(Number(e.level)))
    .map((e) => ({
      id: e.id as string,
      skillId: e.group_id as string,
      level: Number(e.level) as Level,
      kind: e.kind as LevelEvent["kind"],
      effectiveOn: e.effective_on as string,
      createdAt: e.created_at as string,
      note: (e.note as string | null) ?? null,
    }));

  return { skills, indicators, rules, testTypes, targets, reports, results, levelEvents };
}
