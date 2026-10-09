import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { INDICATORS as KIDS } from "../src/lib/curriculum/definition";
import { ADULT_INDICATORS as ADULT, ADULT_RULES, ADULT_TARGETS, ADULT_TEST_TYPES, adultSeedKey } from "../src/lib/curriculum/definition-adult";
import { ADULT_SPEC, buildSeedSql } from "../src/lib/curriculum/seed-sql";
import { recordsFromResults } from "../src/lib/curriculum/record-bridge";
import { makeData } from "./helpers/curriculum-fixture";
import type { TestResult } from "../src/lib/curriculum/types";

test("0054 seed migration is in sync with the Teen & Adult definition", () => {
  const file = readFileSync(path.resolve(__dirname, "../supabase/migrations/0054_curriculum_adult_seed.sql"), "utf8");
  assert.equal(file.replace(/\r\n/g, "\n"), buildSeedSql(ADULT_SPEC), "run: npx tsx scripts/gen-curriculum-seed.ts");
});

const of = (skill: string, level: number | null = null) => ADULT.filter((i) => i.skill === skill && i.level === level);

test("the structure that was agreed: 7 + 8 indicators and the strokes at three levels (90 in all)", () => {
  assert.equal(of("dasar").length, 7);
  assert.equal(of("water_safety").length, 8);
  assert.equal(ADULT.length, 90);
  assert.deepEqual(of("bebas", 1).length + of("bebas", 2).length + of("bebas", 3).length, 5 + 6 + 7);
  assert.deepEqual([of("dada", 1).length, of("dada", 2).length, of("dada", 3).length], [6, 7, 8], "Dada keeps Timing");
});

test("Dasar and Water Safety follow the brief, and the childish names are gone", () => {
  const labels = (skill: string) => of(skill).map((i) => i.label);
  assert.ok(labels("dasar").includes("Kenyamanan dan Kepercayaan Diri di Air"));
  assert.ok(!labels("dasar").includes("Sikap dan Keberanian"));
  for (const wanted of ["Adaptasi di Air", "Kontrol Napas (bubbling)", "Mengapung", "Meluncur", "Posisi Tubuh di Air", "Bergerak Mandiri di Air"]) assert.ok(labels("dasar").includes(wanted), wanted);
  for (const wanted of ["Masuk Air dengan Aman", "Floating dan Istirahat di Air", "Treading Water", "Bergerak ke Tepi dan Berpegangan", "Keluar dari Air dengan Aman"]) assert.ok(labels("water_safety").includes(wanted), wanted);
});

test("no text speaks to children", () => {
  const text = ADULT.map((i) => `${i.label} ${i.description} ${i.rubric}`).join(" ").toLowerCase();
  assert.ok(!/\banak\b|\bbalita\b|\badik\b|\bkakak\b/.test(text));
});

test("the technique indicators of every stroke are the Kids ones, unchanged (same aspect, same rubric)", () => {
  const core = ADULT.filter((i) => i.level !== null && !/ritme_konsistensi|teknik_jarak/.test(i.slug));
  const kids = KIDS.filter((i) => i.level !== null);
  assert.equal(core.length, kids.length);
  for (const k of kids) {
    const a = core.find((i) => i.skill === k.skill && i.level === k.level && i.slug === k.slug);
    assert.ok(a, `${k.skill} L${k.level} ${k.slug}`);
    assert.equal(a!.label, k.label);
    assert.equal(a!.rubric, k.rubric);
  }
});

test("the practical extras exist at Level 2 and 3 only, for all four strokes", () => {
  for (const skill of ["bebas", "dada", "punggung", "kupu"]) {
    assert.equal(of(skill, 1).filter((i) => /ritme|teknik_jarak/.test(i.slug)).length, 0);
    assert.deepEqual(of(skill, 2).filter((i) => /ritme|teknik_jarak/.test(i.slug)).map((i) => i.slug), ["l2_ritme_konsistensi"]);
    assert.deepEqual(of(skill, 3).filter((i) => /ritme|teknik_jarak/.test(i.slug)).map((i) => i.slug), ["l3_ritme_konsistensi", "l3_teknik_jarak"]);
  }
});

test("slugs are unique per skill and level, and every seed key is unique and prefixed ta1", () => {
  const keys = ADULT.map(adultSeedKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((k) => k.startsWith("ta1_")));
  assert.ok(ADULT.every((i) => i.description.length > 10 && i.rubric.startsWith("Contoh bintang 5:")));
});

test("level targets as agreed: Bebas/Dada/Punggung 10-25-50 m, Kupu-kupu 5-10-25 m; durations and Meluncur have no target", () => {
  const values = (code: string) => ADULT_TARGETS.filter((t) => t.testCode === code).map((t) => [t.level, t.value]);
  for (const code of ["jarak_bebas", "jarak_dada", "jarak_punggung"]) assert.deepEqual(values(code), [[1, 10], [2, 25], [3, 50]]);
  assert.deepEqual(values("jarak_kupu"), [[1, 5], [2, 10], [3, 25]]);
  for (const code of ["jarak_meluncur", "floating", "treading_water", "rangkaian_keselamatan"]) assert.deepEqual(values(code), []);
  assert.ok(ADULT_TEST_TYPES.some((t) => t.code === "jarak_meluncur" && t.measure === "distance_m" && !t.levelSpecific));
});

test("the pass rule is the one Kids uses: >= 4 stars on >= 2 sessions, and the level test for strokes", () => {
  assert.equal(ADULT_RULES.length, 14);
  assert.ok(ADULT_RULES.every((r) => r.masteryMinScore === 4 && r.minEvidenceSessions === 2));
  assert.ok(ADULT_RULES.filter((r) => r.level !== null).every((r) => r.requiresTest));
});

test("the records agreed for Teen & Adult are in the migration", () => {
  const sql = ADULT_SPEC.extraSql ?? "";
  for (const wanted of ["adult-meluncur-jarak", "adult-dada-jarak", "adult-punggung-jarak", "adult-kupu-jarak", "adult-tahan-nafas", "adult-mengapung", "adult-treading"]) assert.ok(sql.includes(wanted), wanted);
});

test("a Meluncur distance test is a record of Meluncur (no time record)", () => {
  const result: TestResult = {
    id: "m1", reportId: "r", sessionDate: "2026-10-06", testTypeId: "tt_jarak_meluncur", level: null, distanceM: 7, durationS: null, timeS: 9,
    assisted: false, assistanceNote: null, conditions: null, conditionsComparable: true, techniqueMet: true, stepsPassed: null, validation: "divalidasi", targetId: null, notes: null,
  };
  const base = makeData();
  const data = {
    ...base,
    testTypes: [...base.testTypes, { id: "tt_jarak_meluncur", skillId: "g_dasar", code: "jarak_meluncur", label: "Tes Jarak Meluncur", measure: "distance_m" as const, levelSpecific: false, steps: null, active: true, sortOrder: 1 }],
    results: [result],
  };
  assert.deepEqual(recordsFromResults(data).map((r) => [r.metric_type, r.stroke, r.distance_m]), [["jarak_tempuh", "Meluncur", 7]]);
});

// ---- the form, the progress and the level rule all work on the adult data ----
import { SKILLS } from "../src/lib/curriculum/definition";
import { initialFormState, previewForm, toPayload, validateForm } from "../src/lib/curriculum/form-state";
import { buildUnits } from "../src/lib/curriculum/progress";
import type { CurriculumData } from "../src/lib/curriculum/types";

function adultData(over: Partial<CurriculumData> = {}): CurriculumData {
  return {
    skills: SKILLS.map((s) => ({ id: `g_${s.slug}`, slug: s.slug, name: s.name, kind: s.kind, hasLevels: s.hasLevels, sortOrder: s.sortOrder })),
    indicators: ADULT.map((i, n) => ({ id: `i${n}`, key: adultSeedKey(i), skillId: `g_${i.skill}`, level: i.level, label: i.label, description: i.description, rubric: i.rubric, required: true, active: true, sortOrder: i.sortOrder })),
    rules: ADULT_RULES.map((r) => ({ skillId: `g_${r.skill}`, level: r.level, masteryMinScore: r.masteryMinScore, minEvidenceSessions: r.minEvidenceSessions, requiresTest: r.requiresTest })),
    testTypes: ADULT_TEST_TYPES.map((t, n) => ({ id: `tt_${t.code}`, skillId: `g_${t.skill}`, code: t.code, label: t.label, measure: t.measure, levelSpecific: t.levelSpecific, steps: t.steps ?? null, active: true, sortOrder: n })),
    targets: ADULT_TARGETS.map((t) => ({ id: `tg_${t.testCode}_${t.level}`, testTypeId: `tt_${t.testCode}`, level: t.level, value: t.value, requiresUnassisted: true, requiresTechnique: true, version: 1, active: true })),
    reports: [],
    results: [],
    levelEvents: [],
    ...over,
  };
}

test("the report form and Progress % run on the adult curriculum: Dasar 7 indicators, Bebas Level 1 at 10 m", () => {
  const data = adultData({ levelEvents: [{ id: "e", skillId: "g_bebas", level: 1, kind: "placement", effectiveOn: "2026-10-01", createdAt: "1", note: null }] });
  const s = initialFormState(data);
  s.skills["g_dasar"].selected = true;
  for (const i of data.indicators.filter((x) => x.skillId === "g_dasar")) s.skills["g_dasar"].items[i.key] = { mode: "dinilai", score: 3, reason: "" };
  s.skills["g_bebas"].selected = true;
  s.skills["g_bebas"].items[adultSeedKey({ skill: "bebas", slug: "l1_posisi_tubuh" })] = { mode: "dinilai", score: 4, reason: "" };
  s.tests["tt_jarak_bebas"] = { ...s.tests["tt_jarak_bebas"], enabled: true, distance: "10", techniqueMet: true };
  assert.deepEqual(validateForm(data, s).errors, []);
  const payload = toPayload(data, s);
  assert.equal(payload.scores.length, 8);
  assert.equal(payload.tests[0].level, 1);
  const bebas = previewForm(data, s, { date: "2026-10-06" }).find((p) => p.skill.slug === "bebas")!;
  assert.equal(bebas.tests[0].target?.met, true, "10 m reaches the Level 1 target");

  const units = buildUnits(
    adultData({
      reports: [{ id: "r", sessionDate: "2026-10-06", attendance: "hadir", scores: Object.fromEntries(payload.scores.map((x) => [x.name, x.score])), curriculumVersion: 1, context: {}, authorName: null, notes: null }],
    })
  );
  const dasar = units.find((u) => u.skill.slug === "dasar")!;
  assert.equal(dasar.total, 7);
  assert.equal(dasar.percent, 60);
});
