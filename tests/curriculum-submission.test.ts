import { test } from "node:test";
import assert from "node:assert/strict";
import { key, makeData } from "./helpers/curriculum-fixture";
import { levelsOfContext, parseSubmission } from "../src/lib/curriculum/submission";
import type { LevelEvent } from "../src/lib/curriculum/types";

const events: LevelEvent[] = [{ id: "e", skillId: "g_bebas", level: 2, kind: "placement", effectiveOn: "2026-09-01", createdAt: "1", note: null }];
const data = makeData({ levelEvents: events });

const raw = (scores: unknown[], assessment: unknown, tests: unknown[] = []) => ({
  scores: JSON.stringify(scores),
  assessment: JSON.stringify(assessment),
  tests: JSON.stringify(tests),
});

const bebasScore = { name: key("bebas", "l2_posisi_tubuh"), score: 3.5 };

test("an absent session stores nothing, whatever was posted", () => {
  const r = parseSubmission(data, raw([bebasScore], { skills: { g_bebas: { level: 2 } } }), { assess: false });
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.value.scores, {});
  assert.deepEqual(r.ok && r.value.tests, []);
});

test("keeps half points, clamps to 0-5, and only keeps indicators of that skill and level", () => {
  const r = parseSubmission(
    data,
    raw(
      [bebasScore, { name: key("bebas", "l1_posisi_tubuh"), score: 4 }, { name: key("bebas", "l2_gerakan_kaki"), score: 9 }, { name: "bogus", score: 3 }, { name: key("bebas", "l2_pernapasan"), score: 0 }],
      { skills: { g_bebas: { level: 1 } } }
    )
  );
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.value.scores, {
    [key("bebas", "l2_posisi_tubuh")]: 3.5,
    [key("bebas", "l2_gerakan_kaki")]: 5,
    [key("bebas", "l2_pernapasan")]: 0,
  });
  // the recorded level (2) wins over whatever level the form claims
  assert.deepEqual(r.ok && r.value.context.skills, { g_bebas: { level: 2 } });
});

test("a skill without any score is refused, so opening a panel can never save anything", () => {
  const r = parseSubmission(data, raw([], { skills: { g_dasar: {} } }));
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /Dasar: nilai minimal satu indikator/);
});

test("a stroke with no recorded level needs a placement, and the placement is returned for recording", () => {
  const fresh = makeData();
  const score = { name: key("dada", "l1_posisi_tubuh"), score: 3 };
  const none = parseSubmission(fresh, raw([score], { skills: { g_dada: {} } }));
  assert.equal(none.ok, false);
  const placed = parseSubmission(fresh, raw([score], { skills: { g_dada: { level: 1 } }, placements: { g_dada: 1 } }));
  assert.ok(placed.ok);
  assert.deepEqual(placed.ok && placed.value.placements, [{ skillId: "g_dada", level: 1 }]);
});

test("a recorded level is never re-placed, and editing keeps the level the report was written at", () => {
  const r = parseSubmission(data, raw([bebasScore], { skills: { g_bebas: { level: 2 } }, placements: { g_bebas: 3 } }));
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.value.placements, []);
  const old = parseSubmission(data, raw([{ name: key("bebas", "l1_posisi_tubuh"), score: 4 }], { skills: { g_bebas: { level: 1 } } }), {
    assess: true,
    keepLevels: { g_bebas: 1 },
  });
  assert.ok(old.ok);
  assert.deepEqual(old.ok && old.value.scores, { [key("bebas", "l1_posisi_tubuh")]: 4 });
  assert.deepEqual(old.ok && old.value.placements, []);
});

test("tidak berlaku needs a reason, is stored separately, and is never also a score", () => {
  const na = key("water_safety", "keluar_dari_air");
  const floating = { name: key("water_safety", "floating"), score: 4 };
  const noReason = parseSubmission(data, raw([floating], { skills: { g_water_safety: {} }, na: { [na]: " " } }));
  assert.equal(noReason.ok, false);
  const ok = parseSubmission(data, raw([floating], { skills: { g_water_safety: {} }, na: { [na]: "Kolam tanpa tangga" } }));
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok && ok.value.context.na, { [na]: "Kolam tanpa tangga" });
  assert.ok(ok.ok && !(na in ok.value.scores));
});

test("tests are re-validated: numbers, technique answer, level, and unknown/duplicate types", () => {
  const base = { skills: { g_bebas: { level: 2 } } };
  const t = (over: Record<string, unknown>) => ({ test_type_id: "tt_jarak_bebas", distance_m: 15, technique_met: true, assisted: false, ...over });
  assert.equal(parseSubmission(data, raw([bebasScore], base, [t({ distance_m: -1 })])).ok, false);
  assert.equal(parseSubmission(data, raw([bebasScore], base, [t({ distance_m: "abc" })])).ok, false);
  assert.equal(parseSubmission(data, raw([bebasScore], base, [t({ technique_met: undefined })])).ok, false);
  assert.equal(parseSubmission(data, raw([bebasScore], base, [t({ time_s: 0 })])).ok, false);

  const ok = parseSubmission(data, raw([bebasScore], base, [t({}), t({ distance_m: 20 }), { test_type_id: "nope", distance_m: 5 }, { test_type_id: "tt_floating", duration_s: 20, technique_met: true }]));
  assert.ok(ok.ok);
  const tests = ok.ok ? ok.value.tests : [];
  assert.equal(tests.length, 1, "duplicate, unknown, and a test of a skill not in the report are dropped");
  assert.equal(tests[0].level, 2, "level comes from the server, not the form");
  assert.equal(tests[0].distance_m, 15);
  assert.equal(tests[0].assistance_note, "", "no assistance note without assistance");
});

test("the safety sequence needs the exact step list and passes only when every step is met", () => {
  const ws = { skills: { g_water_safety: {} } };
  const floating = { name: key("water_safety", "floating"), score: 4 };
  const tt = (steps: unknown) => ({ test_type_id: "tt_rangkaian_keselamatan", steps_passed: steps });
  assert.equal(parseSubmission(data, raw([floating], ws, [tt([true, true])])).ok, false);
  const all = parseSubmission(data, raw([floating], ws, [tt(Array(7).fill(true))]));
  assert.ok(all.ok && all.value.tests[0].technique_met === true);
  const some = parseSubmission(data, raw([floating], ws, [tt([true, true, true, false, true, true, true])]));
  assert.ok(some.ok && some.value.tests[0].technique_met === false);
});

test("garbage input is refused instead of throwing", () => {
  assert.equal(parseSubmission(data, { scores: "{", assessment: "[]", tests: "x" }).ok, false);
});

test("levelsOfContext reads only valid levels", () => {
  assert.deepEqual(levelsOfContext({ skills: { a: { level: 2 }, b: {}, c: { level: 9 } } }), { a: 2 });
  assert.deepEqual(levelsOfContext(null), {});
});
