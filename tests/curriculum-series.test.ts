import { test } from "node:test";
import assert from "node:assert/strict";
import { makeData } from "./helpers/curriculum-fixture";
import { abilitySeries } from "../src/lib/curriculum/series";
import type { LevelEvent, TestResult } from "../src/lib/curriculum/types";

const events: LevelEvent[] = [{ id: "e", skillId: "g_bebas", level: 2, kind: "placement", effectiveOn: "2026-09-01", createdAt: "1", note: null }];

function result(id: string, date: string, over: Partial<TestResult>): TestResult {
  return {
    id,
    reportId: `r_${id}`,
    sessionDate: date,
    testTypeId: "tt_jarak_bebas",
    level: 2,
    distanceM: 10,
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

test("no tests recorded -> no ability series (nothing is invented)", () => {
  assert.deepEqual(abilitySeries(makeData({ levelEvents: events }), "g_bebas"), []);
});

test("distance series keeps meters, shows the current level target, and marks the personal record", () => {
  const data = makeData({
    levelEvents: events,
    results: [result("a", "2026-09-10", { distanceM: 10 }), result("b", "2026-09-17", { distanceM: 15 }), result("c", "2026-09-24", { distanceM: 12 })],
  });
  const [s] = abilitySeries(data, "g_bebas");
  assert.equal(s.unit, "m");
  assert.deepEqual(s.points.map((p) => p.value), [10, 15, 12], "scores may fall: 12 after 15 is shown as it is");
  assert.deepEqual(s.points.map((p) => p.isRecord), [false, true, false]);
  assert.equal(s.target?.value, 25);
  assert.equal(s.best, 15);
  assert.ok(s.points.every((p) => p.targetMet === false), "15 m of 25 m opens no target");
});

test("an assisted swim never sets the record nor the best, and is flagged", () => {
  const data = makeData({
    levelEvents: events,
    results: [result("a", "2026-09-10", { distanceM: 12 }), result("b", "2026-09-17", { distanceM: 25, assisted: true })],
  });
  const [s] = abilitySeries(data, "g_bebas");
  assert.equal(s.best, 12);
  assert.deepEqual(s.points.map((p) => p.isRecord), [true, false]);
  assert.equal(s.points[1].assisted, true);
  assert.equal(s.points[1].targetMet, false);
});

test("duration tests (floating) are their own series in seconds with no invented target", () => {
  const data = makeData({
    results: [result("f", "2026-10-06", { testTypeId: "tt_floating", level: null, distanceM: null, durationS: 20, targetId: null })],
  });
  const [s] = abilitySeries(data, "g_water_safety");
  assert.equal(s.unit, "detik");
  assert.equal(s.points[0].value, 20);
  assert.equal(s.target, null);
  assert.equal(s.points[0].targetMet, null);
});

test("an unvalidated result is shown but cannot be the record", () => {
  const data = makeData({
    levelEvents: events,
    results: [result("a", "2026-09-10", { distanceM: 20, validation: "belum_divalidasi" })],
  });
  const [s] = abilitySeries(data, "g_bebas");
  assert.equal(s.points[0].valid, false);
  assert.equal(s.points[0].isRecord, false);
  assert.equal(s.best, null);
});
