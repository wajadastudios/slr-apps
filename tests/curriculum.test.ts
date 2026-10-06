import { test } from "node:test";
import assert from "node:assert/strict";
import { INDICATORS, SKILLS, TEST_TYPES, TARGETS, RULES, indicatorSeedKey } from "../src/lib/curriculum/definition";
import type {
  CurriculumData,
  CurriculumIndicator,
  CurriculumReport,
  CurriculumSkill,
  LevelEvent,
  TestResult,
  TestTarget,
  TestType,
} from "../src/lib/curriculum/types";
import { indicatorStatus, isAmbiguousLegacyZero, skillStarted } from "../src/lib/curriculum/status";
import { coverageLabel, techniqueSeries, techniqueSummary } from "../src/lib/curriculum/summary";
import { currentLevel, levelEligibility, masteryStats } from "../src/lib/curriculum/levels";
import { achievementTimeline, checkTarget, personalRecords, previewResult } from "../src/lib/curriculum/results";
import { buildProfile } from "../src/lib/curriculum/profile";

// ---- fixture built from the real starting curriculum ----
const skills: CurriculumSkill[] = SKILLS.map((s) => ({ id: `g_${s.slug}`, slug: s.slug, name: s.name, kind: s.kind, hasLevels: s.hasLevels, sortOrder: s.sortOrder }));
const indicators: CurriculumIndicator[] = INDICATORS.map((i, n) => ({
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
const testTypes: TestType[] = TEST_TYPES.map((t, n) => ({
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
const targets: TestTarget[] = TARGETS.map((t) => ({
  id: `tg_${t.testCode}_${t.level}`,
  testTypeId: `tt_${t.testCode}`,
  level: t.level,
  value: t.value,
  requiresUnassisted: true,
  requiresTechnique: true,
  version: 1,
  active: true,
}));
const rules = RULES.map((r) => ({
  skillId: `g_${r.skill}`,
  level: r.level,
  masteryMinScore: r.masteryMinScore,
  minEvidenceSessions: r.minEvidenceSessions,
  requiresTest: r.requiresTest,
}));

const keyOf = (skill: string, slug: string) => `k1_${skill}_${slug}`;
const bebasL = (level: 1 | 2 | 3) => indicators.filter((i) => i.skillId === "g_bebas" && i.level === level);

function report(id: string, date: string, scores: Record<string, number>, ctx: CurriculumReport["context"] = {}, version: number | null = 1): CurriculumReport {
  return { id, sessionDate: date, attendance: "hadir", scores, curriculumVersion: version, context: ctx, authorName: "Coach", notes: null };
}
function allScores(level: 1 | 2 | 3, score: number): Record<string, number> {
  return Object.fromEntries(bebasL(level).map((i) => [i.key, score]));
}
function result(id: string, date: string, over: Partial<TestResult> = {}): TestResult {
  return {
    id,
    reportId: `r_${id}`,
    sessionDate: date,
    testTypeId: "tt_jarak_bebas",
    level: 2,
    distanceM: 15,
    durationS: null,
    timeS: null,
    assisted: false,
    assistanceNote: null,
    conditions: null,
    conditionsComparable: true,
    techniqueMet: true,
    stepsPassed: null,
    validation: "divalidasi",
    targetId: "tg_jarak_bebas_2",
    notes: null,
    ...over,
  };
}
const data = (over: Partial<CurriculumData> = {}): CurriculumData => ({
  skills,
  indicators,
  rules,
  testTypes,
  targets,
  reports: [],
  results: [],
  levelEvents: [],
  ...over,
});

test("curriculum has six skills, 77 indicators and the agreed shape", () => {
  assert.equal(SKILLS.length, 6);
  assert.equal(INDICATORS.length, 77);
  const count = (skill: string, level: number | null) => INDICATORS.filter((i) => i.skill === skill && i.level === level).length;
  assert.equal(count("dasar", null), 6);
  assert.equal(count("water_safety", null), 8);
  for (const l of [1, 2, 3]) {
    assert.equal(count("bebas", l), 5);
    assert.equal(count("dada", l), 6, "Gaya Dada has Timing in addition");
    assert.equal(count("punggung", l), 5);
    assert.equal(count("kupu", l), 5);
  }
  assert.ok(INDICATORS.some((i) => i.skill === "dada" && i.slug === "l2_timing"));
  assert.ok(INDICATORS.every((i) => i.description.length > 10 && i.rubric.startsWith("Contoh bintang 5:")));
  assert.equal(new Set(INDICATORS.map(indicatorSeedKey)).size, 77, "seed keys are unique");
});

test("the safety sequence is a test, not a ninth indicator, and has no default target", () => {
  const seq = TEST_TYPES.find((t) => t.code === "rangkaian_keselamatan");
  assert.equal(seq?.measure, "checklist");
  assert.equal(seq?.steps?.length, 7);
  assert.equal(INDICATORS.filter((i) => i.skill === "water_safety").length, 8);
  assert.ok(!TARGETS.some((t) => ["floating", "treading_water", "rangkaian_keselamatan"].includes(t.testCode)));
});

test("starting targets: strokes 10/25/50 m, kupu-kupu 5/10/25 m", () => {
  const v = (code: string) => TARGETS.filter((t) => t.testCode === code).map((t) => t.value);
  assert.deepEqual(v("jarak_bebas"), [10, 25, 50]);
  assert.deepEqual(v("jarak_dada"), [10, 25, 50]);
  assert.deepEqual(v("jarak_punggung"), [10, 25, 50]);
  assert.deepEqual(v("jarak_kupu"), [5, 10, 25]);
});

// 1. skipped indicators are never read as zero
test("an indicator the pengajar skipped is 'belum dinilai', never 0", () => {
  const ind = indicators.find((i) => i.key === keyOf("water_safety", "floating"))!;
  const r = report("a", "2026-10-06", { [keyOf("water_safety", "floating")]: 4 }, { skills: { g_water_safety: {} } });
  const other = indicators.find((i) => i.key === keyOf("water_safety", "rotasi_orientasi"))!;
  assert.equal(indicatorStatus(ind, [r], true).state, "dinilai");
  assert.equal(indicatorStatus(other, [r], true).state, "dimulai_belum_dinilai");
  assert.equal(indicatorStatus(other, [], false).state, "belum_dimulai");
  const na = report("b", "2026-10-07", {}, { na: { [other.key]: "Kolam tidak punya tangga" } });
  const st = indicatorStatus(other, [r, na], true);
  assert.equal(st.state, "tidak_berlaku");
  if (st.state === "tidak_berlaku") assert.equal(st.reason, "Kolam tidak punya tangga");
});

test("an observed 0 is a real assessment and counts in the summary", () => {
  const l1 = bebasL(1);
  const scores = { [l1[0].key]: 0, [l1[1].key]: 5 };
  const s = techniqueSummary(indicators, "g_bebas", 1, { scores, context: {} });
  assert.equal(s.assessed, 2);
  assert.equal(s.percent, 50);
  assert.equal(indicatorStatus(l1[0], [report("a", "2026-10-01", scores)], true).state, "dinilai");
});

// 9. legacy history is not guessed at
test("legacy zeros are flagged as undeterminable, new-curriculum zeros are not", () => {
  assert.equal(isAmbiguousLegacyZero({ curriculumVersion: null }, 0), true);
  assert.equal(isAmbiguousLegacyZero({ curriculumVersion: null }, 3), false);
  assert.equal(isAmbiguousLegacyZero({ curriculumVersion: 1 }, 0), false);
  const legacy = report("old", "2026-08-01", { [keyOf("bebas", "l1_posisi_tubuh")]: 4 }, {}, null);
  assert.equal(indicatorStatus(indicators[0], [legacy], false).state, "belum_dimulai", "legacy reports never become level-curriculum status");
  assert.equal(techniqueSeries(indicators, "g_bebas", [legacy]).length, 0);
});

// technique summary
test("technique summary: sum / (5 x required) and an honest partial label", () => {
  const l2 = bebasL(2);
  const full = Object.fromEntries(l2.map((i, n) => [i.key, [4, 4, 3, 3, 3][n]]));
  const s = techniqueSummary(indicators, "g_bebas", 2, { scores: full, context: {} });
  assert.equal(s.percent, 68);
  assert.equal(s.complete, true);
  assert.equal(coverageLabel(s), "5/5 indikator dinilai");

  const partial = Object.fromEntries(l2.slice(0, 4).map((i) => [i.key, 4]));
  const p = techniqueSummary(indicators, "g_bebas", 2, { scores: partial, context: {} });
  assert.equal(p.complete, false);
  assert.equal(coverageLabel(p), "Penilaian belum lengkap: 4/5 indikator");

  // tidak berlaku is taken out of the denominator, not scored as 0
  const withNa = techniqueSummary(indicators, "g_bebas", 2, { scores: partial, context: { na: { [l2[4].key]: "tidak ada" } } });
  assert.equal(withNa.complete, true);
  assert.equal(withNa.required, 4);
});

// 4. level change is a new segment, not a decline
test("moving up a level starts a new segment instead of looking like a drop", () => {
  const reports = [
    report("a", "2026-09-01", allScores(1, 5), { skills: { g_bebas: { level: 1 } } }),
    report("b", "2026-09-08", allScores(1, 5), { skills: { g_bebas: { level: 1 } } }),
    report("c", "2026-10-06", { [bebasL(2)[0].key]: 2, [bebasL(2)[1].key]: 1, [bebasL(2)[2].key]: 1, [bebasL(2)[3].key]: 2, [bebasL(2)[4].key]: 1 }, { skills: { g_bebas: { level: 2 } } }),
  ];
  const segs = techniqueSeries(indicators, "g_bebas", reports);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs.map((s) => [s.level, s.points.length]), [[1, 2], [2, 1]]);
  assert.equal(segs[0].points[1].percent, 100);
  assert.equal(segs[1].points[0].percent, 28);
});

test("a skill that was not assessed in a session adds no point (no new data, no new point)", () => {
  const reports = [
    report("a", "2026-10-01", allScores(2, 4), { skills: { g_bebas: { level: 2 } } }),
    report("b", "2026-10-08", { [keyOf("water_safety", "floating")]: 3 }, { skills: { g_water_safety: {} } }),
  ];
  const segs = techniqueSeries(indicators, "g_bebas", reports);
  assert.equal(segs.flatMap((s) => s.points).length, 1);
});

test("a score is allowed to go down on a newer observation", () => {
  const reports = [
    report("a", "2026-10-01", allScores(2, 5), { skills: { g_bebas: { level: 2 } } }),
    report("b", "2026-10-08", allScores(2, 3), { skills: { g_bebas: { level: 2 } } }),
  ];
  const pts = techniqueSeries(indicators, "g_bebas", reports)[0].points;
  assert.deepEqual(pts.map((p) => p.percent), [100, 60]);
});

// 2. levels per stroke
test("Level 2 Bebas and Level 1 Dada coexist", () => {
  const events: LevelEvent[] = [
    { id: "e1", skillId: "g_bebas", level: 2, kind: "placement", effectiveOn: "2026-09-01", createdAt: "1", note: null },
    { id: "e2", skillId: "g_dada", level: 1, kind: "placement", effectiveOn: "2026-09-01", createdAt: "2", note: null },
  ];
  assert.equal(currentLevel("g_bebas", events)?.level, 2);
  assert.equal(currentLevel("g_dada", events)?.level, 1);
  assert.equal(currentLevel("g_punggung", events), null);
  const withPromotion = [...events, { id: "e3", skillId: "g_bebas", level: 3 as const, kind: "promotion" as const, effectiveOn: "2026-10-01", createdAt: "3", note: null }];
  assert.equal(currentLevel("g_bebas", withPromotion)?.level, 3);
  assert.equal(currentLevel("g_dada", withPromotion)?.level, 1, "another stroke's promotion does not move this one");
});

// 3. profile has no cross-skill aggregate
test("adding assessments in another skill never changes a skill's own profile entry", () => {
  const bebasReports = [report("a", "2026-10-01", allScores(2, 4), { skills: { g_bebas: { level: 2 } } })];
  const before = buildProfile(data({ reports: bebasReports })).find((p) => p.skill.slug === "bebas")!;
  const extra = report("b", "2026-10-02", Object.fromEntries(indicators.filter((i) => i.skillId === "g_dasar").map((i) => [i.key, 1])), { skills: { g_dasar: {} } });
  const after = buildProfile(data({ reports: [...bebasReports, extra] })).find((p) => p.skill.slug === "bebas")!;
  assert.deepEqual(after, before);
  const profile = buildProfile(data());
  assert.equal(profile.length, 6);
  assert.ok(profile.every((p) => !("overall" in p) && !("average" in p)));
  assert.deepEqual(profile.map((p) => p.skill.slug), ["dasar", "water_safety", "bebas", "dada", "punggung", "kupu"]);
});

test("Dasar and Water Safety mastery is counted per skill with its own rule", () => {
  const dasar = skills.find((s) => s.slug === "dasar")!;
  const k = (slug: string) => keyOf("dasar", slug);
  const reports = [
    report("a", "2026-10-01", { [k("adaptasi_di_air")]: 4, [k("pernapasan")]: 4, [k("meluncur")]: 2 }),
    report("b", "2026-10-08", { [k("adaptasi_di_air")]: 5, [k("pernapasan")]: 3, [k("meluncur")]: 2 }),
  ];
  const s = masteryStats(dasar, indicators, reports, rules);
  assert.equal(s.total, 6);
  assert.equal(s.mastered, 1, "only Adaptasi has 4+ twice with the latest still 4+");
  assert.deepEqual(s.masteredLabels, ["Adaptasi di Air"]);
  assert.ok(s.needsPractice.includes("Pernapasan (bubbling)") && s.needsPractice.includes("Meluncur"));
  assert.equal(s.notAssessed.length, 3);
  assert.equal(skillStarted("g_dasar", indicators.filter((i) => i.skillId === "g_dasar").map((i) => i.key), reports, []), true);
});

// 5/6. results and records
test("15 m is a valid personal record but does not open the 25 m target", () => {
  const r = result("1", "2026-10-06");
  const type = testTypes.find((t) => t.code === "jarak_bebas")!;
  const target = targets.find((t) => t.id === "tg_jarak_bebas_2")!;
  const records = personalRecords([r], testTypes);
  assert.equal(records.length, 1);
  assert.equal(records[0].value, 15);
  const check = checkTarget(r, type, target);
  assert.equal(check.met, false);
  assert.ok(check.reasons[0].includes("belum mencapai target 25 m"));
  const tl = achievementTimeline({ results: [r], testTypes, targets, skills, levelEvents: [] });
  assert.ok(tl.some((e) => e.kind === "rekor_pribadi" && e.title.includes("15 m")));
  assert.ok(!tl.some((e) => e.kind === "target"));
});

test("an assisted result never opens an unassisted target and never competes with unassisted records", () => {
  const type = testTypes.find((t) => t.code === "jarak_bebas")!;
  const target = targets.find((t) => t.id === "tg_jarak_bebas_2")!;
  const assisted = result("a", "2026-10-06", { distanceM: 30, assisted: true });
  const check = checkTarget(assisted, type, target);
  assert.equal(check.met, false);
  assert.ok(check.reasons.some((x) => x.includes("tanpa bantuan")));
  const unassisted = result("b", "2026-10-13", { distanceM: 15 });
  const records = personalRecords([assisted, unassisted], testTypes);
  assert.equal(records.length, 2);
  assert.equal(records.find((r) => r.assisted)?.value, 30);
  assert.equal(records.find((r) => !r.assisted)?.value, 15, "a 15 m unassisted result is not beaten by a 30 m assisted one");
  const tl = achievementTimeline({ results: [assisted, unassisted], testTypes, targets, skills, levelEvents: [] });
  assert.ok(!tl.some((e) => e.kind === "target"));
});

test("target opens only with distance, unassisted, technique and validation all in order", () => {
  const type = testTypes.find((t) => t.code === "jarak_bebas")!;
  const target = targets.find((t) => t.id === "tg_jarak_bebas_2")!;
  assert.equal(checkTarget(result("a", "d", { distanceM: 25 }), type, target).met, true);
  assert.equal(checkTarget(result("a", "d", { distanceM: 25, techniqueMet: false }), type, target).met, false);
  assert.equal(checkTarget(result("a", "d", { distanceM: 25, validation: "belum_divalidasi" }), type, target).met, false);
  assert.equal(checkTarget(result("a", "d", { distanceM: 25, conditionsComparable: false }), type, target).met, false);
  const tl = achievementTimeline({ results: [result("a", "2026-10-06", { distanceM: 26 })], testTypes, targets, skills, levelEvents: [] });
  assert.ok(tl.some((e) => e.kind === "target" && e.title.includes("25 m")));
});

test("unvalidated or non-comparable results never set a record", () => {
  const rs = [result("a", "2026-10-01", { distanceM: 40, validation: "belum_divalidasi" }), result("b", "2026-10-02", { distanceM: 35, conditionsComparable: false }), result("c", "2026-10-03", { distanceM: 12 })];
  assert.equal(personalRecords(rs, testTypes)[0].value, 12);
});

test("time records compare only the same stroke, distance and condition", () => {
  const a = result("a", "2026-10-01", { distanceM: 25, timeS: 60 });
  const b = result("b", "2026-10-08", { distanceM: 25, timeS: 52 });
  const c = result("c", "2026-10-15", { distanceM: 10, timeS: 20 });
  const waktu = personalRecords([a, b, c], testTypes).filter((r) => r.kind === "waktu");
  assert.equal(waktu.length, 2);
  assert.equal(waktu.find((r) => r.distanceM === 25)?.value, 52);
  assert.equal(waktu.find((r) => r.distanceM === 10)?.value, 20);
});

test("duration tests (floating) are measured in seconds with no distance and no default target", () => {
  const r = result("f", "2026-10-06", { testTypeId: "tt_floating", level: null, distanceM: null, durationS: 20, targetId: null });
  const rec = personalRecords([r], testTypes)[0];
  assert.equal(rec.kind, "durasi");
  assert.equal(rec.value, 20);
  const type = testTypes.find((t) => t.code === "floating")!;
  assert.equal(checkTarget(r, type, null).met, false);
});

// 8. edit / delete recompute
test("records and achievements are derived: removing or editing a result recomputes them", () => {
  const first = result("1", "2026-10-06", { distanceM: 15 });
  const second = result("2", "2026-10-13", { distanceM: 25 });
  const both = [first, second];
  assert.equal(personalRecords(both, testTypes)[0].value, 25);
  assert.ok(achievementTimeline({ results: both, testTypes, targets, skills, levelEvents: [] }).some((e) => e.kind === "target"));

  // the 25 m report is deleted -> its result goes with it
  assert.equal(personalRecords([first], testTypes)[0].value, 15);
  assert.ok(!achievementTimeline({ results: [first], testTypes, targets, skills, levelEvents: [] }).some((e) => e.kind === "target"));

  // the 25 m result is edited down to 20 m
  const edited = [first, { ...second, distanceM: 20 }];
  assert.equal(personalRecords(edited, testTypes)[0].value, 20);
  assert.ok(!achievementTimeline({ results: edited, testTypes, targets, skills, levelEvents: [] }).some((e) => e.kind === "target"));
});

test("a re-submitted identical result does not create a second achievement", () => {
  const r = result("1", "2026-10-06", { distanceM: 25 });
  const dup = { ...r, id: "1b" };
  const tl = achievementTimeline({ results: [r, dup], testTypes, targets, skills, levelEvents: [] });
  assert.equal(tl.filter((e) => e.kind === "target").length, 1);
  assert.equal(tl.filter((e) => e.kind === "rekor_pribadi").length, 1);
});

test("form preview: new personal record yes, target no, for 15 m after nothing", () => {
  const type = testTypes.find((t) => t.code === "jarak_bebas")!;
  const target = targets.find((t) => t.id === "tg_jarak_bebas_2")!;
  const p = previewResult([], result("n", "2026-10-06"), type, target);
  assert.equal(p.newPersonalRecord, true);
  assert.equal(p.previousBest, null);
  assert.equal(p.target?.met, false);
  const q = previewResult([result("old", "2026-09-01", { distanceM: 20 })], result("n", "2026-10-06"), type, target);
  assert.equal(q.newPersonalRecord, false, "15 m does not beat an earlier valid 20 m");
  assert.equal(q.previousBest, 20);
});

// 7. high technique alone never passes a level
test("a perfect technique score does not pass a level without the required test", () => {
  const skill = skills.find((s) => s.slug === "bebas")!;
  const ctx = { skills: { g_bebas: { level: 2 } } };
  const reports = [report("a", "2026-10-01", allScores(2, 5), ctx), report("b", "2026-10-08", allScores(2, 5), ctx)];
  const base = { skill, level: 2 as const, indicators, reports, testTypes, targets, rules };

  const noTest = levelEligibility({ ...base, results: [] });
  assert.equal(noTest.eligible, false);
  assert.ok(noTest.checks.filter((c) => c.key !== "tes").every((c) => c.ok), "every indicator is fine");
  assert.equal(noTest.checks.find((c) => c.key === "tes")?.ok, false);

  const short = levelEligibility({ ...base, results: [result("1", "2026-10-08", { distanceM: 15 })] });
  assert.equal(short.eligible, false, "15 m < 25 m");

  const assistedOnly = levelEligibility({ ...base, results: [result("1", "2026-10-08", { distanceM: 25, assisted: true })] });
  assert.equal(assistedOnly.eligible, false);

  const ok = levelEligibility({ ...base, results: [result("1", "2026-10-08", { distanceM: 25 })] });
  assert.equal(ok.eligible, true);
});

test("level eligibility needs repeated evidence at that level, and a later drop blocks it", () => {
  const skill = skills.find((s) => s.slug === "bebas")!;
  const ctx = { skills: { g_bebas: { level: 2 } } };
  const pass = result("1", "2026-10-08", { distanceM: 25 });
  const base = { skill, level: 2 as const, indicators, testTypes, targets, rules, results: [pass] };

  const once = levelEligibility({ ...base, reports: [report("a", "2026-10-08", allScores(2, 5), ctx)] });
  assert.equal(once.eligible, false, "one session is not enough evidence under the proposed rule");

  const dropped = levelEligibility({
    ...base,
    reports: [report("a", "2026-10-01", allScores(2, 5), ctx), report("b", "2026-10-08", allScores(2, 5), ctx), report("c", "2026-10-15", { ...allScores(2, 5), [bebasL(2)[0].key]: 2 }, ctx)],
  });
  assert.equal(dropped.eligible, false);

  const wrongLevel = levelEligibility({
    ...base,
    reports: [report("a", "2026-10-01", allScores(2, 5), { skills: { g_bebas: { level: 1 } } }), report("b", "2026-10-08", allScores(2, 5), { skills: { g_bebas: { level: 1 } } })],
  });
  assert.equal(wrongLevel.eligible, false, "sessions assessed at Level 1 do not count for Level 2");
});

test("pass rules are configurable, not hard-coded", () => {
  const skill = skills.find((s) => s.slug === "bebas")!;
  const ctx = { skills: { g_bebas: { level: 2 } } };
  const reports = [report("a", "2026-10-08", allScores(2, 3), ctx)];
  const lenient = rules.map((r) => (r.skillId === "g_bebas" && r.level === 2 ? { ...r, masteryMinScore: 3, minEvidenceSessions: 1, requiresTest: false } : r));
  assert.equal(levelEligibility({ skill, level: 2, indicators, reports, results: [], testTypes, targets, rules: lenient }).eligible, true);
  assert.equal(levelEligibility({ skill, level: 2, indicators, reports, results: [], testTypes, targets, rules }).eligible, false);
});

test("timeline lists level events alongside records and targets, newest first", () => {
  const events: LevelEvent[] = [{ id: "e", skillId: "g_bebas", level: 2, kind: "placement", effectiveOn: "2026-10-01", createdAt: "1", note: null }];
  const tl = achievementTimeline({ results: [result("1", "2026-10-06", { distanceM: 15 })], testTypes, targets, skills, levelEvents: events });
  assert.deepEqual(tl.map((e) => e.kind), ["rekor_pribadi", "level"]);
  assert.ok(tl[1].title.includes("Level 2"));
});
