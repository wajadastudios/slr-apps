import { test } from "node:test";
import assert from "node:assert/strict";
import { indicators, skills } from "./helpers/curriculum-fixture";
import { aggregateLegacyKeys, canonicalName, dryRun, proposeMapping, type LegacyKeyInfo, type MapTarget } from "../src/lib/curriculum/legacy-map";

const skillById = new Map(skills.map((s) => [s.id, s]));
const allTargets: MapTarget[] = indicators.map((i) => ({
  id: i.id,
  key: i.key,
  label: i.label,
  skillId: i.skillId,
  skillName: skillById.get(i.skillId)!.name,
  level: i.level,
  hasLevels: skillById.get(i.skillId)!.hasLevels,
  active: true,
}));
const legacy = (key: string, label: string, group: string | null, scores = 10, zeros = 0): LegacyKeyInfo => ({ key, label, group, scores, zeros });

test("names that mean the same thing meet at one canonical form", () => {
  assert.equal(canonicalName("Water Trappen"), canonicalName("Water Trappen / Treading Water"));
  assert.equal(canonicalName("Pernapasaran (bubbling)"), canonicalName("Pernapasan"));
  assert.equal(canonicalName("Koordinasi gerakan"), canonicalName("Koordinasi Gerakan"));
  assert.notEqual(canonicalName("Gerakan Kaki"), canonicalName("Gerakan Tangan"));
});

test("the old Meluncur maps to Meluncur of the new curriculum, not to a new indicator", () => {
  const p = proposeMapping(legacy("Dasar - Meluncur", "Meluncur", "Dasar"), allTargets);
  assert.equal(p.status, "auto");
  assert.equal(p.target?.label, "Meluncur");
  assert.equal(p.target?.skillName, "Dasar");
  assert.equal(p.method, "nama_sama");
});

test("an old key that is already a curriculum key is the same indicator", () => {
  const dasar = allTargets.find((t) => t.label === "Meluncur")!;
  const p = proposeMapping(legacy(dasar.key, "Meluncur", "Dasar"), allTargets);
  assert.equal(p.method, "kunci_sama");
  assert.equal(p.status, "auto");
});

test("a different name with the same meaning is matched as a synonym", () => {
  const p = proposeMapping(legacy("Water Safety - Water Trappen", "Water Trappen", "Water Safety"), allTargets);
  assert.equal(p.status, "auto");
  assert.equal(p.method, "sinonim");
  assert.match(p.target!.label, /Treading/);
});

test("Floating maps in Water Safety, but is left for review when the new Floating is gone", () => {
  const ok = proposeMapping(legacy("Water Safety - Floating", "Floating", "Water Safety"), allTargets);
  assert.equal(ok.status, "auto");
  const without = allTargets.filter((t) => t.label !== "Floating");
  const gone = proposeMapping(legacy("Water Safety - Floating", "Floating", "Water Safety"), without);
  assert.equal(gone.status, "review");
  assert.equal(gone.target, null);
  assert.ok(gone.candidates.length > 0, "the admin can still pick another Water Safety indicator");
  assert.ok(gone.candidates.every((c) => c.skillName === "Water Safety"));
});

test("a stroke indicator exists at three levels, so it is never decided automatically", () => {
  const p = proposeMapping(legacy("Gaya Bebas - Gerakan Kaki", "Gerakan Kaki", "Gaya Bebas"), allTargets);
  assert.equal(p.status, "review");
  assert.equal(p.needsLevel, true);
  assert.equal(p.target, null);
  assert.deepEqual(p.candidates.map((c) => c.level).sort(), [1, 2, 3]);
  assert.ok(p.candidates.every((c) => c.skillName === "Gaya Bebas" && c.label === "Gerakan Kaki"));
});

test("the same label in another stroke is never offered: Pernapasan in Dada stays in Dada", () => {
  const p = proposeMapping(legacy("Gaya Dada - Pernapasan", "Pernapasan", "Gaya Dada"), allTargets);
  assert.ok(p.candidates.length === 3 && p.candidates.every((c) => c.skillName === "Gaya Dada"));
});

test("an old group that matches no skill is reviewed, never guessed", () => {
  const p = proposeMapping(legacy("x - y", "Meluncur", "Kelompok Aneh"), allTargets);
  assert.equal(p.status, "review");
  assert.equal(p.target, null);
});

test("dry run counts keys and stored scores separately for automatic and review", () => {
  const set = [
    legacy("Dasar - Meluncur", "Meluncur", "Dasar", 342, 8),
    legacy("Gaya Bebas - Gerakan Kaki", "Gerakan Kaki", "Gaya Bebas", 342, 179),
  ];
  const d = dryRun(set, allTargets);
  assert.equal(d.auto, 1);
  assert.equal(d.review, 1);
  assert.equal(d.scoresAuto, 342);
  assert.equal(d.nonZeroAuto, 334);
  assert.equal(d.nonZeroReview, 163);
});

test("reading old reports: labels come from their snapshots and zeros are counted", () => {
  const keys = aggregateLegacyKeys(
    [
      { id: "a", attendance: "hadir", scores: { k: 0, j: 4 }, indicator_snapshot: { k: { label: "Lama", group: "G" }, j: { label: "Juga", group: "G" } } },
      { id: "b", attendance: "hadir", scores: { k: 3 }, indicator_snapshot: { k: { label: "Baru", group: "G" } } },
      { id: "c", attendance: "izin", scores: null, indicator_snapshot: null },
    ],
    { a: "2026-01-01", b: "2026-02-01", c: "2026-03-01" }
  );
  const k = keys.find((x) => x.key === "k")!;
  assert.equal(k.scores, 2);
  assert.equal(k.zeros, 1);
  assert.equal(k.label, "Baru", "the newest snapshot label wins");
});
