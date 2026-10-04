import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndicatorConfig } from "../src/lib/indicators";
import { computeMastery, skillStatus } from "../src/lib/skill-mastery";

const config = buildIndicatorConfig(
  [
    { id: "g1", name: "Dasar", sort_order: 1, active: true },
    { id: "g2", name: "Gaya Bebas", sort_order: 2, active: true },
  ],
  [
    { key: "adaptasi", label: "Adaptasi di Air", group_id: "g1", sort_order: 1, active: true },
    { key: "napas", label: "Pernapasan (bubbling)", group_id: "g1", sort_order: 2, active: true },
    { key: "luncur", label: "Meluncur", group_id: "g1", sort_order: 3, active: true },
    { key: "kaki", label: "Gerakan Kaki", group_id: "g2", sort_order: 1, active: true },
    { key: "lama", label: "Indikator Lama", group_id: "g2", sort_order: 2, active: false },
  ] as never
);

const rep = (d: string, scores: Record<string, number>, extra: Record<string, unknown> = {}) => ({
  session_date: d,
  scores,
  ...extra,
});

const reports = [
  rep("2026-01-05", { adaptasi: 3 }),
  rep("2026-01-12", { adaptasi: 5, napas: 2 }),
  rep("2026-01-19", { adaptasi: 5, napas: 3 }),
  rep("2026-01-26", {}, { attendance: "izin" }),
  rep("2026-02-02", { adaptasi: 5, napas: 3, luncur: 2 }),
  rep("2026-02-09", { adaptasi: 5, napas: 4, luncur: 2 }),
];

test("mastered = latest 5/5 and at least the two last assessments", () => {
  assert.equal(skillStatus([5, 5]), "mastered");
  assert.equal(skillStatus([5]), "training", "one 5/5 is not yet consistent");
  assert.equal(skillStatus([5, 4, 5]), "training");
  assert.equal(skillStatus([5, 5, 4]), "training", "a later dip is no longer mastered");
  assert.equal(skillStatus([]), "not_started");
  assert.equal(skillStatus([2, 0]), "not_started");
});

test("preview scenario: adaptasi mastered, napas and luncur trained, kaki not started", () => {
  const o = computeMastery(config, reports);
  assert.deepEqual(o.mastered.map((s) => [s.key, s.streak]), [["adaptasi", 4]]);
  assert.deepEqual(o.training.map((s) => s.key), ["napas", "luncur"]);
  assert.deepEqual(o.notStarted.map((s) => s.key), ["kaki"], "an inactive, never-scored indicator is hidden");
  assert.equal(o.training[0].afterMastered, "Adaptasi di Air");
  assert.equal(o.training[1].afterMastered, null);
  assert.equal(o.nextFocus, null, "no coach note: nothing is guessed");
});

test("next focus comes only from the coach's latest report", () => {
  const withFocus = [...reports, rep("2026-02-16", { adaptasi: 5, napas: 4 }, { next_focus: " Meluncur dengan papan " })];
  assert.equal(computeMastery(config, withFocus).nextFocus, "Meluncur dengan papan");
  // an older note is not reused once a newer report leaves it empty
  assert.equal(computeMastery(config, [...withFocus, rep("2026-02-23", { napas: 4 })]).nextFocus, null);
  // an izin report in between does not hide it
  assert.equal(computeMastery(config, [...withFocus, rep("2026-02-23", {}, { attendance: "izin" })]).nextFocus, "Meluncur dengan papan");
});

test("curriculum label: the indicator right after a mastered one", () => {
  const o = computeMastery(config, [rep("2026-01-05", { adaptasi: 5 }), rep("2026-01-12", { adaptasi: 5 })]);
  assert.deepEqual(o.notStarted.map((s) => [s.key, s.afterMastered]), [["napas", "Adaptasi di Air"], ["luncur", null], ["kaki", null]]);
});
