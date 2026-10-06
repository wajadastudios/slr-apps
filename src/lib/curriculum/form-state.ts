import type {
  CurriculumData,
  CurriculumIndicator,
  CurriculumReport,
  CurriculumSkill,
  Level,
  TestResult,
  TestType,
  ValidationStatus,
} from "./types";
import { isLevel } from "./types";
import { techniqueSummary, type TechniqueSummary } from "./summary";
import { currentLevel, levelEligibility, type Eligibility } from "./levels";
import { previewResult, type TargetCheck } from "./results";

// The pengajar's report form as plain data, so validation, the payload sent to
// the server, and the live preview (technique summary, record/target/level
// status) are all pure functions that can be tested without a browser.
//
// Nothing here assumes an indicator was assessed: every indicator starts as
// "unset" and only becomes a score when the pengajar explicitly marks it
// "dinilai". An opened panel never assesses anything by itself.

export type ItemMode = "unset" | "dinilai" | "na";
// score stays null after "Dinilai" is pressed until the pengajar actually picks
// stars (or the explicit "0"), so pressing the button can never record a 0.
export type ItemState = { mode: ItemMode; score: number | null; reason: string };

export type SkillState = {
  selected: boolean;
  // chosen in the form when the child has no recorded level for this stroke yet
  placementLevel: Level | null;
  items: Record<string, ItemState>;
};

export type TestState = {
  enabled: boolean;
  distance: string;
  duration: string;
  time: string;
  assisted: boolean;
  assistanceNote: string;
  conditions: string;
  comparable: boolean;
  techniqueMet: boolean | null;
  steps: boolean[];
  validation: ValidationStatus;
  notes: string;
};

export type FormState = {
  skills: Record<string, SkillState>;
  tests: Record<string, TestState>;
};

export const EMPTY_ITEM: ItemState = { mode: "unset", score: null, reason: "" };

export function emptyTest(type: Pick<TestType, "steps">): TestState {
  return {
    enabled: false,
    distance: "",
    duration: "",
    time: "",
    assisted: false,
    assistanceNote: "",
    conditions: "",
    comparable: true,
    techniqueMet: null,
    steps: (type.steps ?? []).map(() => false),
    validation: "divalidasi",
    notes: "",
  };
}

export function initialFormState(data: CurriculumData): FormState {
  return {
    skills: Object.fromEntries(data.skills.map((s) => [s.id, { selected: false, placementLevel: null, items: {} }])),
    tests: Object.fromEntries(data.testTypes.map((t) => [t.id, emptyTest(t)])),
  };
}

// Editing a saved report (or resuming a draft): rebuild the form from what was
// stored. Only keys present in `scores`/`na` become dinilai/na; everything else
// stays unset, exactly as it was left.
export function stateFromReport(
  data: CurriculumData,
  report: Pick<CurriculumReport, "scores" | "context">,
  results: TestResult[]
): FormState {
  const state = initialFormState(data);
  const keySkill = new Map(data.indicators.map((i) => [i.key, i.skillId]));

  for (const id of Object.keys(report.context.skills ?? {})) {
    if (state.skills[id]) state.skills[id].selected = true;
  }
  for (const [key, score] of Object.entries(report.scores)) {
    const skillId = keySkill.get(key);
    if (!skillId || !state.skills[skillId]) continue;
    state.skills[skillId].selected = true;
    state.skills[skillId].items[key] = { mode: "dinilai", score, reason: "" };
  }
  for (const [key, reason] of Object.entries(report.context.na ?? {})) {
    const skillId = keySkill.get(key);
    if (!skillId || !state.skills[skillId]) continue;
    state.skills[skillId].selected = true;
    state.skills[skillId].items[key] = { mode: "na", score: null, reason };
  }

  for (const r of results) {
    const type = data.testTypes.find((t) => t.id === r.testTypeId);
    if (!type) continue;
    state.tests[type.id] = {
      enabled: true,
      distance: r.distanceM === null ? "" : String(r.distanceM),
      duration: r.durationS === null ? "" : String(r.durationS),
      time: r.timeS === null ? "" : String(r.timeS),
      assisted: r.assisted,
      assistanceNote: r.assistanceNote ?? "",
      conditions: r.conditions ?? "",
      comparable: r.conditionsComparable,
      techniqueMet: r.techniqueMet,
      steps: r.stepsPassed ?? (type.steps ?? []).map(() => false),
      validation: r.validation,
      notes: r.notes ?? "",
    };
  }
  return state;
}

export function parseNumber(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// The level a skill is assessed at: the child's recorded level, or the
// placement chosen in this form. Skills without levels have none.
export function skillLevel(data: CurriculumData, skill: CurriculumSkill, state: FormState): Level | null {
  if (!skill.hasLevels) return null;
  return currentLevel(skill.id, data.levelEvents)?.level ?? state.skills[skill.id]?.placementLevel ?? null;
}

export function liveIndicators(data: CurriculumData, skillId: string, level: Level | null): CurriculumIndicator[] {
  return data.indicators
    .filter((i) => i.skillId === skillId && i.level === level && i.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function skillTests(data: CurriculumData, skillId: string): TestType[] {
  return data.testTypes.filter((t) => t.skillId === skillId && t.active).sort((a, b) => a.sortOrder - b.sortOrder);
}

function itemsOf(data: CurriculumData, skill: CurriculumSkill, state: FormState) {
  const level = skillLevel(data, skill, state);
  const items = state.skills[skill.id]?.items ?? {};
  return { level, indicators: liveIndicators(data, skill.id, level), items };
}

// ---------- validation ----------
export type FormIssues = { errors: string[]; warnings: string[] };

export function validateForm(data: CurriculumData, state: FormState): FormIssues {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const skill of [...data.skills].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const ss = state.skills[skill.id];
    if (!ss?.selected) continue;
    const { level, indicators, items } = itemsOf(data, skill, state);

    if (skill.hasLevels && level === null) {
      errors.push(`${skill.name}: pilih level awal (asesmen penempatan) sebelum menilai.`);
      continue;
    }

    let assessed = 0;
    for (const ind of indicators) {
      const it = items[ind.key];
      if (it?.mode === "dinilai") {
        if (it.score === null) errors.push(`${skill.name}: pilih bintang untuk ${ind.label}, atau ubah ke "Tidak dinilai".`);
        else assessed++;
      }
      if (it?.mode === "na" && !it.reason.trim()) {
        errors.push(`${skill.name}: isi alasan "Tidak berlaku" untuk ${ind.label}.`);
      }
    }
    if (assessed === 0) {
      errors.push(`${skill.name}: nilai minimal satu indikator, atau lepaskan skill ini dari laporan.`);
    } else {
      const required = indicators.filter((i) => i.required).length - indicators.filter((i) => i.required && items[i.key]?.mode === "na").length;
      const assessedRequired = indicators.filter((i) => i.required && items[i.key]?.mode === "dinilai" && items[i.key].score !== null).length;
      if (assessedRequired < required) {
        warnings.push(`${skill.name}: penilaian belum lengkap (${assessedRequired}/${required} indikator). Akan ditandai parsial.`);
      }
    }

    for (const type of skillTests(data, skill.id)) {
      const t = state.tests[type.id];
      if (!t?.enabled) continue;
      if (type.levelSpecific && level === null) continue;
      if (type.measure === "distance_m") {
        const d = parseNumber(t.distance);
        if (d === null || d <= 0) errors.push(`${type.label}: isi jarak aktual (meter).`);
        if (t.time.trim() && (parseNumber(t.time) ?? 0) <= 0) errors.push(`${type.label}: waktu tempuh harus lebih dari 0.`);
      } else if (type.measure === "duration_s") {
        const d = parseNumber(t.duration);
        if (d === null || d <= 0) errors.push(`${type.label}: isi durasi (detik).`);
      } else if (t.steps.length === 0) {
        errors.push(`${type.label}: langkah rangkaian belum tersedia.`);
      }
      if (type.measure !== "checklist" && t.techniqueMet === null) {
        errors.push(`${type.label}: pilih apakah syarat pelaksanaan/teknik terpenuhi.`);
      }
      if (t.assisted && !t.assistanceNote.trim()) {
        warnings.push(`${type.label}: sebutkan bantuan/alat yang dipakai.`);
      }
    }
  }
  return { errors, warnings };
}

// ---------- payload ----------
export type TestPayload = {
  test_type_id: string;
  level: number | null;
  distance_m: number | null;
  duration_s: number | null;
  time_s: number | null;
  assisted: boolean;
  assistance_note: string;
  conditions: string;
  conditions_comparable: boolean;
  technique_met: boolean;
  steps_passed: boolean[] | null;
  validation: ValidationStatus;
  notes: string;
};

export type FormPayload = {
  scores: { name: string; score: number }[];
  assessment: {
    skills: Record<string, { level?: number }>;
    na: Record<string, string>;
    placements: Record<string, number>;
  };
  tests: TestPayload[];
};

export function toPayload(data: CurriculumData, state: FormState): FormPayload {
  const payload: FormPayload = { scores: [], assessment: { skills: {}, na: {}, placements: {} }, tests: [] };

  for (const skill of data.skills) {
    const ss = state.skills[skill.id];
    if (!ss?.selected) continue;
    const { level, indicators, items } = itemsOf(data, skill, state);
    payload.assessment.skills[skill.id] = level === null ? {} : { level };
    if (skill.hasLevels && level !== null && !currentLevel(skill.id, data.levelEvents) && ss.placementLevel) {
      payload.assessment.placements[skill.id] = ss.placementLevel;
    }
    for (const ind of indicators) {
      const it = items[ind.key];
      if (it?.mode === "dinilai" && it.score !== null) payload.scores.push({ name: ind.key, score: it.score });
      else if (it?.mode === "na") payload.assessment.na[ind.key] = it.reason.trim();
    }
    for (const type of skillTests(data, skill.id)) {
      const t = state.tests[type.id];
      if (!t?.enabled) continue;
      if (type.levelSpecific && level === null) continue;
      payload.tests.push({
        test_type_id: type.id,
        level: type.levelSpecific ? level : null,
        distance_m: type.measure === "distance_m" ? parseNumber(t.distance) : null,
        duration_s: type.measure === "duration_s" ? parseNumber(t.duration) : null,
        time_s: type.measure === "distance_m" ? parseNumber(t.time) : null,
        assisted: t.assisted,
        assistance_note: t.assistanceNote.trim(),
        conditions: t.conditions.trim(),
        conditions_comparable: t.comparable,
        technique_met: type.measure === "checklist" ? t.steps.length > 0 && t.steps.every(Boolean) : t.techniqueMet === true,
        steps_passed: type.measure === "checklist" ? t.steps : null,
        validation: t.validation,
        notes: t.notes.trim(),
      });
    }
  }
  return payload;
}

// ---------- live preview ----------
export type TestPreview = {
  type: TestType;
  newPersonalRecord: boolean;
  previousBest: number | null;
  target: TargetCheck | null;
};

export type SkillPreview = {
  skill: CurriculumSkill;
  level: Level | null;
  summary: TechniqueSummary | null;
  tests: TestPreview[];
  eligibility: Eligibility | null;
};

// What saving the form as it stands would produce. `editingReportId` removes
// the report being edited (and its results) from history so the preview
// compares against everything ELSE, not against its own earlier version.
export function previewForm(
  data: CurriculumData,
  state: FormState,
  opts: { date: string; editingReportId?: string | null }
): SkillPreview[] {
  const payload = toPayload(data, state);
  const scores = Object.fromEntries(payload.scores.map((s) => [s.name, s.score]));
  const hypothetical: CurriculumReport = {
    id: opts.editingReportId ?? "__new__",
    sessionDate: opts.date,
    attendance: "hadir",
    scores,
    curriculumVersion: 1,
    context: { skills: payload.assessment.skills, na: payload.assessment.na },
    authorName: null,
    notes: null,
  };

  const history = {
    reports: data.reports.filter((r) => r.id !== opts.editingReportId),
    results: data.results.filter((r) => r.reportId !== opts.editingReportId),
  };

  const candidates: TestResult[] = payload.tests.map((t, n) => {
    const target = data.targets.find((g) => g.testTypeId === t.test_type_id && g.active && g.level === t.level) ?? null;
    return {
      id: `__candidate_${n}`,
      reportId: hypothetical.id,
      sessionDate: opts.date,
      testTypeId: t.test_type_id,
      level: isLevel(t.level) ? t.level : null,
      distanceM: t.distance_m,
      durationS: t.duration_s,
      timeS: t.time_s,
      assisted: t.assisted,
      assistanceNote: t.assistance_note || null,
      conditions: t.conditions || null,
      conditionsComparable: t.conditions_comparable,
      techniqueMet: t.technique_met,
      stepsPassed: t.steps_passed,
      validation: t.validation,
      targetId: target?.id ?? null,
      notes: t.notes || null,
    };
  });

  return data.skills
    .filter((s) => state.skills[s.id]?.selected)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((skill) => {
      const level = skillLevel(data, skill, state);
      const summary = level === null && skill.hasLevels ? null : techniqueSummary(data.indicators, skill.id, level, hypothetical);
      const mine = candidates.filter((c) => data.testTypes.find((t) => t.id === c.testTypeId)?.skillId === skill.id);
      const tests: TestPreview[] = mine.flatMap((c) => {
        const type = data.testTypes.find((t) => t.id === c.testTypeId);
        if (!type) return [];
        const target = data.targets.find((g) => g.id === c.targetId) ?? null;
        const p = previewResult(history.results, c, type, target);
        return [{ type, newPersonalRecord: p.newPersonalRecord, previousBest: p.previousBest, target: p.target }];
      });

      const eligibility =
        skill.hasLevels && level !== null
          ? levelEligibility({
              skill,
              level,
              indicators: data.indicators,
              reports: [...history.reports, hypothetical],
              results: [...history.results, ...mine],
              testTypes: data.testTypes,
              targets: data.targets,
              rules: data.rules,
            })
          : null;
      return { skill, level, summary, tests, eligibility };
    });
}
