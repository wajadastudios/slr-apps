import { test } from "node:test";
import assert from "node:assert/strict";
import { indicators, key, makeData } from "./helpers/curriculum-fixture";
import { hasLegacyHistory, legacyLatest, legacyRows, legacySeries } from "../src/lib/curriculum/legacy-view";
import type { LegacyMapEntry, LegacyReport, CurriculumData } from "../src/lib/curriculum/types";

const idOf = (k: string) => indicators.find((i) => i.key === k)!.id;
const dasar = (slug: string) => key("dasar", slug);

const report = (id: string, date: string, scores: Record<string, number>, attendance = "hadir"): LegacyReport => ({
  id,
  sessionDate: date,
  attendance,
  scores,
  labels: Object.fromEntries(Object.keys(scores).map((k) => [k, { label: k.replace(/^.* - /, ""), group: k.split(" - ")[0] }])),
});
const entry = (legacyKey: string, status: LegacyMapEntry["status"], target?: string): LegacyMapEntry => ({
  legacyKey,
  legacyLabel: legacyKey.replace(/^.* - /, ""),
  legacyGroup: legacyKey.split(" - ")[0],
  status,
  targetId: target ? idOf(target) : null,
});

function withLegacy(reports: LegacyReport[], map: LegacyMapEntry[]): CurriculumData {
  return { ...makeData(), legacy: { reports, map } };
}
const skill = (data: CurriculumData, slug: string) => data.skills.find((s) => s.slug === slug)!;

test("without any mapping nothing is drawn, but the history list still has every old indicator", () => {
  const d = withLegacy([report("r1", "2025-06-01", { "Dasar - Meluncur": 3 })], []);
  assert.deepEqual(legacySeries(d, skill(d, "dasar")), []);
  const rows = legacyRows(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mappedTo, null);
  assert.equal(rows[0].status, "belum_ada");
  assert.equal(hasLegacyHistory(d), true);
});

test("mapped old scores become points on their ORIGINAL dates, marked as legacy", () => {
  const d = withLegacy(
    [report("r1", "2025-06-01", { "Dasar - Meluncur": 3, "Dasar - Menyelam": 2 }), report("r2", "2025-07-06", { "Dasar - Meluncur": 4, "Dasar - Menyelam": 3.5 })],
    [entry("Dasar - Meluncur", "auto", dasar("meluncur")), entry("Dasar - Menyelam", "auto", dasar("menyelam"))]
  );
  const [seg] = legacySeries(d, skill(d, "dasar"));
  assert.equal(seg.legacy, true);
  assert.deepEqual(seg.points.map((p) => p.date), ["2025-06-01", "2025-07-06"]);
  assert.equal(seg.points[0].percent, 50); // (3+2)/(5*2)
  assert.equal(seg.points[1].percent, 75);
  assert.ok(seg.points.every((p) => p.legacy === true && p.complete === false), "2 of 6 Dasar indicators: partial, not connected");
});

test("a legacy 0 is never drawn (it cannot be told from 'not assessed') but is counted as such in the list", () => {
  const d = withLegacy(
    [report("r1", "2025-06-01", { "Dasar - Meluncur": 0, "Dasar - Menyelam": 4 }), report("r2", "2025-06-08", { "Dasar - Meluncur": 0 })],
    [entry("Dasar - Meluncur", "auto", dasar("meluncur")), entry("Dasar - Menyelam", "auto", dasar("menyelam"))]
  );
  const [seg] = legacySeries(d, skill(d, "dasar"));
  assert.deepEqual(seg.points.map((p) => [p.date, p.assessed]), [["2025-06-01", 1]]);
  const meluncur = legacyRows(d).find((r) => r.key === "Dasar - Meluncur")!;
  assert.equal(meluncur.zeros, 2);
  assert.deepEqual(meluncur.entries, []);
});

test("sessions the child missed carry no history", () => {
  const d = withLegacy([report("r1", "2025-06-01", { "Dasar - Meluncur": 4 }, "izin")], [entry("Dasar - Meluncur", "auto", dasar("meluncur"))]);
  assert.deepEqual(legacySeries(d, skill(d, "dasar")), []);
  assert.equal(hasLegacyHistory(d), false);
});

test("review and skipped entries are not drawn and keep their place in the list", () => {
  const d = withLegacy(
    [report("r1", "2025-06-01", { "Dasar - Meluncur": 4, "Dasar - Menyelam": 3 })],
    [entry("Dasar - Meluncur", "review"), entry("Dasar - Menyelam", "skipped")]
  );
  assert.deepEqual(legacySeries(d, skill(d, "dasar")), []);
  assert.deepEqual(legacyRows(d).map((r) => r.status).sort(), ["review", "skipped"]);
});

test("a stroke mapped to Level 1 is drawn at Level 1 by the admin's choice", () => {
  const l1 = (s: string) => key("bebas", `l1_${s}`);
  const d = withLegacy(
    [report("r1", "2025-06-01", { "Gaya Bebas - Gerakan Kaki": 3, "Gaya Bebas - Posisi Tubuh": 4 })],
    [entry("Gaya Bebas - Gerakan Kaki", "manual", l1("gerakan_kaki")), entry("Gaya Bebas - Posisi Tubuh", "manual", l1("posisi_tubuh"))]
  );
  const [seg] = legacySeries(d, skill(d, "bebas"));
  assert.equal(seg.level, 1);
  assert.equal(seg.points[0].percent, 70);
  assert.equal(seg.points[0].required, 5);
});

test("the latest mapped legacy score is available for the 'keadaan terkini' note", () => {
  const d = withLegacy(
    [report("r1", "2025-06-01", { "Dasar - Meluncur": 2 }), report("r2", "2025-07-06", { "Dasar - Meluncur": 4 }), report("r3", "2025-08-03", { "Dasar - Meluncur": 0 })],
    [entry("Dasar - Meluncur", "auto", dasar("meluncur"))]
  );
  assert.deepEqual(legacyLatest(d, dasar("meluncur")), { score: 4, date: "2025-07-06" });
  assert.equal(legacyLatest(d, dasar("menyelam")), null);
});

test("two old indicators mapped to one new one are averaged, never summed", () => {
  const d = withLegacy(
    [report("r1", "2025-06-01", { "Dasar - A": 2, "Dasar - B": 4 })],
    [entry("Dasar - A", "manual", dasar("meluncur")), entry("Dasar - B", "manual", dasar("meluncur"))]
  );
  assert.equal(legacyLatest(d, dasar("meluncur"))?.score, 3);
});

test("no legacy history at all (a child who started on the new curriculum)", () => {
  const d = makeData();
  assert.deepEqual(legacyRows(d), []);
  assert.equal(hasLegacyHistory(d), false);
  assert.deepEqual(legacySeries(d, skill(d, "dasar")), []);
});
