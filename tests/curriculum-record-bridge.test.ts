import { test } from "node:test";
import assert from "node:assert/strict";
import { makeData } from "./helpers/curriculum-fixture";
import { mergedRecords, recordsFromResults } from "../src/lib/curriculum/record-bridge";
import { computeMilestoneStatuses, type Milestone } from "../src/lib/milestones";
import type { TestResult } from "../src/lib/curriculum/types";

function result(id: string, over: Partial<TestResult>): TestResult {
  return {
    id,
    reportId: `r_${id}`,
    sessionDate: "2026-10-06",
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
    targetId: null,
    notes: null,
    ...over,
  };
}

test("a stroke distance test becomes a Jarak Tempuh record for that stroke, plus a time record when a time was taken", () => {
  const rows = recordsFromResults(makeData({ results: [result("a", { distanceM: 25, timeS: 40 })] }));
  assert.deepEqual(rows.map((r) => [r.metric_type, r.stroke, r.distance_m, r.duration_seconds]), [
    ["jarak_tempuh", "Bebas", 25, null],
    ["waktu_tempuh", "Bebas", 25, 40],
  ]);
});

test("Floating and Treading Water tests become duration records", () => {
  const rows = recordsFromResults(
    makeData({
      results: [
        result("f", { testTypeId: "tt_floating", level: null, distanceM: null, durationS: 30 }),
        result("t", { testTypeId: "tt_treading_water", level: null, distanceM: null, durationS: 60 }),
      ],
    })
  );
  assert.deepEqual(rows.map((r) => [r.metric_type, r.duration_seconds]), [["mengapung_telentang", 30], ["treading_water", 60]]);
});

test("results with help, not validated, or in unlike conditions are not records", () => {
  const rows = recordsFromResults(
    makeData({
      results: [result("a", { assisted: true }), result("b", { validation: "belum_divalidasi" }), result("c", { conditionsComparable: false }), result("d", { testTypeId: "tt_rangkaian_keselamatan", level: null, distanceM: null, stepsPassed: [true] })],
    })
  );
  assert.deepEqual(rows, []);
});

test("medals follow the results: delete the result and the medal goes with it", () => {
  const milestone: Milestone = { id: "m1", label: "Jarak Bebas", level: "Dasar", metric_type: "jarak_tempuh", stroke: "Bebas", distance_m: null, bronze: 10, silver: 25, gold: 50, sort_order: 1, active: true };
  const withResult = mergedRecords([], makeData({ results: [result("a", { distanceM: 28 })] }));
  assert.equal(computeMilestoneStatuses(withResult, [milestone])[0].tier, "silver");
  const without = mergedRecords([], makeData({ results: [] }));
  assert.equal(computeMilestoneStatuses(without, [milestone])[0].tier, null);
});

test("old records are kept as they are and merged, not replaced", () => {
  const old = [{ id: "o1", metric_type: "jarak_tempuh" as const, stroke: "Bebas", distance_m: 10, duration_seconds: null, recorded_at: "2026-01-01" }];
  const rows = mergedRecords(old, makeData({ results: [result("a", {})] }));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "o1");
});
