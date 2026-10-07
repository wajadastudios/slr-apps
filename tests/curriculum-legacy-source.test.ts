import { test } from "node:test";
import assert from "node:assert/strict";
import { indicators, skills } from "./helpers/curriculum-fixture";
import { reviewRows, summarize, type MapRow, type MappingState } from "../src/lib/curriculum/legacy-source";
import type { LegacyKeyInfo, MapTarget } from "../src/lib/curriculum/legacy-map";

const skillById = new Map(skills.map((s) => [s.id, s]));
const targets: MapTarget[] = indicators.map((i) => ({
  id: i.id,
  key: i.key,
  label: i.label,
  skillId: i.skillId,
  skillName: skillById.get(i.skillId)!.name,
  level: i.level,
  hasLevels: skillById.get(i.skillId)!.hasLevels,
  active: true,
}));
const k = (key: string, label: string, group: string, scores: number, zeros: number): LegacyKeyInfo => ({ key, label, group, scores, zeros });

const keys = [
  k("Dasar - Meluncur", "Meluncur", "Dasar", 100, 10),
  k("Gaya Bebas - Gerakan Kaki", "Gerakan Kaki", "Gaya Bebas", 100, 60),
  k("Water Safety - Water Trappen", "Water Trappen", "Water Safety", 100, 90),
];
const state = (rows: MapRow[]): MappingState => ({ skills: skills.map((s) => ({ id: s.id, name: s.name, hasLevels: s.hasLevels })), targets, keys, rows, ready: true, legacyIndicatorIds: {}, studentsByKey: {} });

test("before anything is stored: every key is ready to apply automatically (strokes at Level 1)", () => {
  const s = summarize(reviewRows(state([])));
  assert.equal(s.keys, 3);
  assert.equal(s.pendingAuto, 3);
  assert.equal(s.needsReview, 0);
  assert.equal(s.done, 0);
  assert.equal(s.scores, 300);
});

test("stored decisions win over proposals and are counted as done", () => {
  const target = targets.find((t) => t.label === "Meluncur")!;
  const rows: MapRow[] = [
    { legacyKey: "Dasar - Meluncur", legacyLabel: "Meluncur", legacyGroup: "Dasar", status: "auto", targetId: target.id, method: "nama_sama", note: null },
    { legacyKey: "Gaya Bebas - Gerakan Kaki", legacyLabel: "Gerakan Kaki", legacyGroup: "Gaya Bebas", status: "skipped", targetId: null, method: null, note: null },
  ];
  const s = summarize(reviewRows(state(rows)));
  assert.equal(s.done, 1);
  assert.equal(s.auto, 1);
  assert.equal(s.skipped, 1);
  assert.equal(s.pendingAuto, 1, "Water Trappen is still waiting");
  assert.equal(s.needsReview, 0, "a skipped indicator is a decision, not a to-do");
  assert.equal(s.scoresDone, 100);
  assert.equal(s.nonZeroDone, 90);
});
