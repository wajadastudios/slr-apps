import type { AssessmentContext, CurriculumData, Level, ValidationStatus } from "./types";
import { isLevel } from "./types";
import { currentLevel } from "./levels";
import type { TestPayload } from "./form-state";

// The server never trusts the form: everything posted is re-checked against the
// curriculum as it is in the database. Pure, so it is unit tested.

export type RawSubmission = {
  scores: string;
  assessment: string;
  tests: string;
};

export type Placement = { skillId: string; level: Level };

export type ParsedSubmission = {
  scores: Record<string, number>;
  context: AssessmentContext;
  placements: Placement[];
  tests: TestPayload[];
};

export type SubmissionResult = { ok: true; value: ParsedSubmission } | { ok: false; error: string };

const VALIDATIONS: ValidationStatus[] = ["divalidasi", "belum_divalidasi", "tidak_valid"];

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw || "null");
  } catch {
    return null;
  }
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const EMPTY_SUBMISSION: ParsedSubmission = { scores: {}, context: {}, placements: [], tests: [] };

// `keepLevels` = the levels an already-saved report was written at (editing it
// must not silently move it to the child's current level).
export function parseSubmission(
  data: CurriculumData,
  raw: RawSubmission,
  opts: { assess: boolean; keepLevels?: Record<string, Level>; keepKeys?: string[] } = { assess: true }
): SubmissionResult {
  if (!opts.assess) return { ok: true, value: EMPTY_SUBMISSION };

  const scoresIn = parseJson(raw.scores);
  const assessIn = parseJson(raw.assessment);
  const testsIn = parseJson(raw.tests);
  if (!Array.isArray(scoresIn) || !isObj(assessIn) || !Array.isArray(testsIn)) {
    return { ok: false, error: "Data penilaian tidak terbaca. Muat ulang halaman lalu coba lagi." };
  }
  const skillsIn = isObj(assessIn.skills) ? assessIn.skills : {};
  const naIn = isObj(assessIn.na) ? assessIn.na : {};
  const placementsIn = isObj(assessIn.placements) ? assessIn.placements : {};

  const scores: Record<string, number> = {};
  const na: Record<string, string> = {};
  const context: AssessmentContext = { skills: {}, na: {} };
  const placements: Placement[] = [];
  const levelOf = new Map<string, Level | null>();

  // 1) which skills, and at which level
  for (const skill of data.skills) {
    if (!(skill.id in skillsIn)) continue;
    let level: Level | null = null;
    if (skill.hasLevels) {
      const kept = opts.keepLevels?.[skill.id];
      const recorded = currentLevel(skill.id, data.levelEvents)?.level;
      const chosen = placementsIn[skill.id] ?? (isObj(skillsIn[skill.id]) ? (skillsIn[skill.id] as { level?: unknown }).level : null);
      level = kept ?? recorded ?? (isLevel(Number(chosen)) ? (Number(chosen) as Level) : null);
      if (level === null) return { ok: false, error: `${skill.name}: pilih level awal (asesmen penempatan) sebelum menilai.` };
      if (!kept && !recorded) placements.push({ skillId: skill.id, level });
    }
    levelOf.set(skill.id, level);
    context.skills![skill.id] = level === null ? {} : { level };
  }

  // 2) scores and "tidak berlaku", only for indicators live at that level
  const live = new Map<string, string>(); // indicator key -> skill id
  for (const skill of data.skills) {
    if (!levelOf.has(skill.id)) continue;
    const level = levelOf.get(skill.id)!;
    for (const ind of data.indicators) {
      if (ind.skillId === skill.id && ind.level === level) live.set(ind.key, skill.id);
    }
  }
  // an indicator the report already scored stays valid even if retired since
  const keep = new Set(opts.keepKeys ?? []);
  const retired = new Set(data.indicators.filter((i) => !i.active && !keep.has(i.key)).map((i) => i.key));

  for (const item of scoresIn.slice(0, 120)) {
    if (!isObj(item)) continue;
    const key = text(item.name, 120);
    const value = num(item.score);
    if (!key || value === null || !live.has(key)) continue;
    if (retired.has(key)) continue;
    scores[key] = Math.min(5, Math.max(0, Math.round(value * 2) / 2));
  }
  for (const [key, reasonRaw] of Object.entries(naIn).slice(0, 120)) {
    if (!live.has(key) || key in scores || retired.has(key)) continue;
    const reason = text(reasonRaw, 200);
    if (!reason) return { ok: false, error: 'Isi alasan untuk setiap indikator "Tidak berlaku".' };
    na[key] = reason;
  }
  context.na = na;

  for (const skill of data.skills) {
    if (!levelOf.has(skill.id)) continue;
    const any = [...live.entries()].some(([key, skillId]) => skillId === skill.id && key in scores);
    if (!any) return { ok: false, error: `${skill.name}: nilai minimal satu indikator, atau lepaskan skill ini dari laporan.` };
  }

  // 3) tests
  const tests: TestPayload[] = [];
  const seen = new Set<string>();
  for (const item of testsIn.slice(0, 20)) {
    if (!isObj(item)) continue;
    const type = data.testTypes.find((t) => t.id === item.test_type_id && t.active);
    if (!type || seen.has(type.id) || !levelOf.has(type.skillId)) continue;
    const skillLevel = levelOf.get(type.skillId) ?? null;
    if (type.levelSpecific && skillLevel === null) continue;
    seen.add(type.id);

    const distance = type.measure === "distance_m" ? num(item.distance_m) : null;
    const duration = type.measure === "duration_s" ? num(item.duration_s) : null;
    const time = type.measure === "distance_m" ? num(item.time_s) : null;
    if (type.measure === "distance_m" && (distance === null || distance <= 0 || distance > 2000)) {
      return { ok: false, error: `${type.label}: jarak aktual harus lebih dari 0 meter.` };
    }
    if (type.measure === "duration_s" && (duration === null || duration <= 0 || duration > 7200)) {
      return { ok: false, error: `${type.label}: durasi harus lebih dari 0 detik.` };
    }
    if (time !== null && (time <= 0 || time > 36000)) {
      return { ok: false, error: `${type.label}: waktu tempuh harus lebih dari 0 detik.` };
    }

    let steps: boolean[] | null = null;
    if (type.measure === "checklist") {
      const stepCount = type.steps?.length ?? 0;
      const given = Array.isArray(item.steps_passed) ? item.steps_passed : [];
      if (stepCount === 0 || given.length !== stepCount) {
        return { ok: false, error: `${type.label}: daftar langkah tidak sesuai. Muat ulang halaman lalu coba lagi.` };
      }
      steps = given.map((v) => v === true);
    } else if (typeof item.technique_met !== "boolean") {
      return { ok: false, error: `${type.label}: pilih apakah syarat pelaksanaan/teknik terpenuhi.` };
    }

    const assisted = item.assisted === true;
    const validation = VALIDATIONS.includes(item.validation as ValidationStatus) ? (item.validation as ValidationStatus) : "divalidasi";
    tests.push({
      test_type_id: type.id,
      level: type.levelSpecific ? skillLevel : null,
      distance_m: distance,
      duration_s: duration,
      time_s: time,
      assisted,
      assistance_note: assisted ? text(item.assistance_note, 200) : "",
      conditions: text(item.conditions, 200),
      conditions_comparable: item.conditions_comparable !== false,
      technique_met: steps ? steps.every(Boolean) : item.technique_met === true,
      steps_passed: steps,
      validation,
      notes: text(item.notes, 500),
    });
  }

  return { ok: true, value: { scores, context, placements, tests } };
}

// Levels a saved report was written at, read from its stored context.
export function levelsOfContext(context: AssessmentContext | null | undefined): Record<string, Level> {
  const out: Record<string, Level> = {};
  for (const [id, v] of Object.entries(context?.skills ?? {})) {
    if (isLevel(v?.level)) out[id] = v.level;
  }
  return out;
}
