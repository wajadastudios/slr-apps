import { test } from "node:test";
import assert from "node:assert/strict";
import { key, makeData } from "./helpers/curriculum-fixture";
import {
  initialFormState,
  parseNumber,
  previewForm,
  stateFromReport,
  toPayload,
  validateForm,
  type FormState,
} from "../src/lib/curriculum/form-state";
import type { LevelEvent } from "../src/lib/curriculum/types";
import { starText } from "../src/lib/curriculum/stars";

const bebasL2Events: LevelEvent[] = [{ id: "e", skillId: "g_bebas", level: 2, kind: "placement", effectiveOn: "2026-09-01", createdAt: "1", note: null }];
const data = makeData({ levelEvents: bebasL2Events });

function mark(state: FormState, skillId: string, k: string, score: number) {
  state.skills[skillId].selected = true;
  state.skills[skillId].items[k] = { mode: "dinilai", score, reason: "" };
}

// the worked example of the brief (6 Oktober 2026)
function exampleState(): FormState {
  const s = initialFormState(data);
  mark(s, "g_water_safety", key("water_safety", "floating"), 4);
  mark(s, "g_water_safety", key("water_safety", "rotasi_orientasi"), 3);
  s.tests["tt_floating"] = { ...s.tests["tt_floating"], enabled: true, duration: "20", techniqueMet: true, notes: "Masih perlu arahan verbal untuk menjaga posisi kepala." };
  const l2 = (slug: string) => key("bebas", `l2_${slug}`);
  mark(s, "g_bebas", l2("posisi_tubuh"), 4);
  mark(s, "g_bebas", l2("gerakan_kaki"), 4);
  mark(s, "g_bebas", l2("gerakan_tangan"), 3);
  mark(s, "g_bebas", l2("pernapasan"), 3);
  mark(s, "g_bebas", l2("koordinasi"), 3);
  s.tests["tt_jarak_bebas"] = { ...s.tests["tt_jarak_bebas"], enabled: true, distance: "15", techniqueMet: true, notes: "Ritme napas mulai tidak stabil setelah 15 m." };
  return s;
}

test("an empty form is valid and sends nothing", () => {
  const s = initialFormState(data);
  assert.deepEqual(validateForm(data, s), { errors: [], warnings: [] });
  const p = toPayload(data, s);
  assert.deepEqual(p.scores, []);
  assert.deepEqual(p.assessment.skills, {});
  assert.deepEqual(p.tests, []);
});

test("opening a skill panel does not assess anything: no indicator is sent and saving is blocked until one is assessed", () => {
  const s = initialFormState(data);
  s.skills["g_dasar"].selected = true;
  const issues = validateForm(data, s);
  assert.ok(issues.errors.some((e) => e.startsWith("Dasar: nilai minimal satu indikator")));
  assert.deepEqual(toPayload(data, s).scores, [], "unset indicators never become 0");
});

test("the brief's example: only the assessed indicators are sent, the rest of Water Safety stays 'tidak dinilai'", () => {
  const s = exampleState();
  assert.deepEqual(validateForm(data, s).errors, []);
  const p = toPayload(data, s);
  const ws = p.scores.filter((x) => x.name.startsWith("k1_water_safety_"));
  assert.deepEqual(ws.map((x) => [x.name, x.score]), [
    [key("water_safety", "floating"), 4],
    [key("water_safety", "rotasi_orientasi"), 3],
  ]);
  assert.equal(p.scores.length, 7);
  assert.deepEqual(p.assessment.skills["g_bebas"], { level: 2 });
  assert.deepEqual(p.assessment.skills["g_water_safety"], {});
  assert.deepEqual(p.assessment.placements, {}, "Bebas already has a recorded level, so no placement");
});

test("0 stars is sent when the pengajar explicitly assessed it (observed, cannot yet)", () => {
  const s = initialFormState(data);
  mark(s, "g_dasar", key("dasar", "menyelam"), 0);
  assert.deepEqual(toPayload(data, s).scores, [{ name: key("dasar", "menyelam"), score: 0 }]);
});

test("tidak berlaku needs a reason and is sent separately, never as a score", () => {
  const s = initialFormState(data);
  mark(s, "g_water_safety", key("water_safety", "floating"), 4);
  s.skills["g_water_safety"].items[key("water_safety", "keluar_dari_air")] = { mode: "na", score: null, reason: "" };
  assert.ok(validateForm(data, s).errors.some((e) => e.includes("alasan")));
  s.skills["g_water_safety"].items[key("water_safety", "keluar_dari_air")].reason = "Kolam tanpa tangga";
  assert.equal(validateForm(data, s).errors.length, 0);
  const p = toPayload(data, s);
  assert.deepEqual(p.assessment.na, { [key("water_safety", "keluar_dari_air")]: "Kolam tanpa tangga" });
  assert.ok(!p.scores.some((x) => x.name === key("water_safety", "keluar_dari_air")));
});

test("a stroke with no recorded level needs a placement; choosing one is sent as a placement", () => {
  const fresh = makeData();
  const s = initialFormState(fresh);
  mark(s, "g_dada", key("dada", "l1_posisi_tubuh"), 3);
  assert.ok(validateForm(fresh, s).errors.some((e) => e.includes("Gaya Dada") && e.includes("level awal")));

  s.skills["g_dada"].placementLevel = 1;
  mark(s, "g_dada", key("dada", "l1_posisi_tubuh"), 3);
  assert.equal(validateForm(fresh, s).errors.length, 0);
  const p = toPayload(fresh, s);
  assert.deepEqual(p.assessment.placements, { g_dada: 1 });
  assert.deepEqual(p.assessment.skills["g_dada"], { level: 1 });
});

test("a different level per stroke works in one report", () => {
  const two = makeData({
    levelEvents: [
      ...bebasL2Events,
      { id: "e2", skillId: "g_dada", level: 1, kind: "placement", effectiveOn: "2026-09-01", createdAt: "2", note: null },
    ],
  });
  const s = initialFormState(two);
  mark(s, "g_bebas", key("bebas", "l2_posisi_tubuh"), 4);
  mark(s, "g_dada", key("dada", "l1_posisi_tubuh"), 4);
  const p = toPayload(two, s);
  assert.deepEqual(p.assessment.skills, { g_bebas: { level: 2 }, g_dada: { level: 1 } });
});

test("test fields are validated: distance, technique answer, and sensible numbers", () => {
  const s = initialFormState(data);
  mark(s, "g_bebas", key("bebas", "l2_posisi_tubuh"), 4);
  s.tests["tt_jarak_bebas"].enabled = true;
  const e = validateForm(data, s).errors;
  assert.ok(e.some((x) => x.includes("jarak aktual")));
  assert.ok(e.some((x) => x.includes("syarat pelaksanaan/teknik")));
  s.tests["tt_jarak_bebas"].distance = "15";
  s.tests["tt_jarak_bebas"].techniqueMet = true;
  s.tests["tt_jarak_bebas"].time = "-3";
  assert.ok(validateForm(data, s).errors.some((x) => x.includes("waktu tempuh")));
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber(" "), null);
});

test("the safety sequence is a checklist test: passes only with every step, and is not an indicator", () => {
  const s = initialFormState(data);
  mark(s, "g_water_safety", key("water_safety", "floating"), 4);
  s.tests["tt_rangkaian_keselamatan"].enabled = true;
  s.tests["tt_rangkaian_keselamatan"].steps = s.tests["tt_rangkaian_keselamatan"].steps.map(() => true);
  assert.equal(validateForm(data, s).errors.length, 0);
  const t = toPayload(data, s).tests.find((x) => x.test_type_id === "tt_rangkaian_keselamatan")!;
  assert.equal(t.steps_passed?.length, 7);
  assert.equal(t.technique_met, true);
  s.tests["tt_rangkaian_keselamatan"].steps[3] = false;
  assert.equal(toPayload(data, s).tests.find((x) => x.test_type_id === "tt_rangkaian_keselamatan")!.technique_met, false);
  assert.equal(toPayload(data, s).scores.length, 1, "the sequence adds no score and no ninth indicator");
});

test("preview of the brief's example: technique 68%, new 15 m record, 25 m target and Level 2 not reached", () => {
  const previews = previewForm(data, exampleState(), { date: "2026-10-06" });
  const bebas = previews.find((p) => p.skill.slug === "bebas")!;
  assert.equal(bebas.level, 2);
  assert.equal(bebas.summary?.percent, 68);
  assert.equal(bebas.summary?.complete, true);
  assert.equal(bebas.tests.length, 1);
  assert.equal(bebas.tests[0].newPersonalRecord, true);
  assert.equal(bebas.tests[0].target?.met, false);
  assert.ok(bebas.tests[0].target?.reasons[0].includes("25 m"));
  assert.equal(bebas.eligibility?.eligible, false);

  const ws = previews.find((p) => p.skill.slug === "water_safety")!;
  assert.equal(ws.summary?.assessed, 2);
  assert.equal(ws.summary?.complete, false, "only 2 of 8 Water Safety indicators assessed -> shown as partial");
  assert.equal(ws.tests[0].type.code, "floating");
});

test("preview ignores the report being edited, so editing does not compete with its own old result", () => {
  const withOld = makeData({
    levelEvents: bebasL2Events,
    reports: [{ id: "r1", sessionDate: "2026-10-06", attendance: "hadir", scores: {}, curriculumVersion: 1, context: { skills: { g_bebas: { level: 2 } } }, authorName: null, notes: null }],
    results: [{ id: "x", reportId: "r1", sessionDate: "2026-10-06", testTypeId: "tt_jarak_bebas", level: 2, distanceM: 20, durationS: null, timeS: null, assisted: false, assistanceNote: null, conditions: null, conditionsComparable: true, techniqueMet: true, stepsPassed: null, validation: "divalidasi", targetId: "tg_jarak_bebas_2", notes: null }],
  });
  const s = initialFormState(withOld);
  mark(s, "g_bebas", key("bebas", "l2_posisi_tubuh"), 4);
  s.tests["tt_jarak_bebas"] = { ...s.tests["tt_jarak_bebas"], enabled: true, distance: "15", techniqueMet: true };
  const editing = previewForm(withOld, s, { date: "2026-10-06", editingReportId: "r1" });
  assert.equal(editing[0].tests[0].newPersonalRecord, true, "its own earlier 20 m is replaced, not beaten");
  const creating = previewForm(withOld, s, { date: "2026-10-13" });
  assert.equal(creating[0].tests[0].newPersonalRecord, false);
  assert.equal(creating[0].tests[0].previousBest, 20);
});

test("a saved report loads back into the form with unset indicators still unset", () => {
  const s = stateFromReport(
    data,
    { scores: { [key("bebas", "l2_posisi_tubuh")]: 4 }, context: { skills: { g_bebas: { level: 2 }, g_dasar: {} }, na: { [key("dasar", "menyelam")]: "Kolam dangkal" } } },
    []
  );
  assert.equal(s.skills["g_bebas"].selected, true);
  assert.equal(s.skills["g_bebas"].items[key("bebas", "l2_gerakan_kaki")], undefined);
  assert.deepEqual(s.skills["g_bebas"].items[key("bebas", "l2_posisi_tubuh")], { mode: "dinilai", score: 4, reason: "" });
  assert.equal(s.skills["g_dasar"].items[key("dasar", "menyelam")].mode, "na");
  assert.equal(s.skills["g_punggung"].selected, false);
});

test("star text distinguishes whole and half points", () => {
  assert.equal(starText(0), "0 — Belum mampu");
  assert.equal(starText(3), "3 — Mandiri, belum konsisten");
  assert.ok(starText(3.5).includes("antara") && starText(3.5).startsWith("3,5"));
});
