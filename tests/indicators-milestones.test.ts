import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildIndicatorConfig,
  legacyIndicatorConfig,
  activeKeys,
  activeGroups,
  buildSnapshot,
  resolveReportIndicators,
  formGroups,
  relevantGroupIds,
  displayName,
  type IndicatorGroupRow,
  type IndicatorRow,
} from "../src/lib/indicators";
import { computeReorder, nextSortOrder } from "../src/lib/reorder";
import { parseRecordInput, parseMilestoneInput } from "../src/lib/record-input";
import { buildRecordPatch, measurementChanged } from "../src/lib/record-update";
import {
  computeAwards,
  computeMilestoneStatuses,
  tierForValue,
} from "../src/lib/milestones";
import { DEFAULT_MILESTONES } from "../src/lib/default-milestones";
import { annotatePersonalBests, type PerformanceRecordRow } from "../src/lib/performance";

// ---------- indicators ----------
const groups: IndicatorGroupRow[] = [
  { id: "g2", name: "Gaya Dada", sort_order: 2, active: true },
  { id: "g1", name: "Dasar", sort_order: 1, active: true },
  { id: "g3", name: "Arsip", sort_order: 3, active: false },
];
const indicators: IndicatorRow[] = [
  { id: "i1", key: "Adaptasi di Air", label: "Adaptasi di Air", group_id: "g1", sort_order: 1, active: true },
  { id: "i2", key: "ind_a", label: "Mengapung", group_id: "g1", sort_order: 2, active: false },
  { id: "i3", key: "ind_b", label: "Timing", group_id: "g2", sort_order: 1, active: true },
  { id: "i4", key: "ind_c", label: "Lama", group_id: "g3", sort_order: 1, active: true },
];
const config = buildIndicatorConfig(groups, indicators);

test("groups and indicators follow the admin order, not insertion order", () => {
  assert.deepEqual(config.groups.map((g) => g.name), ["Dasar", "Gaya Dada", "Arsip"]);
  assert.deepEqual(activeKeys(config), ["Adaptasi di Air", "ind_b"]);
});

test("inactive indicators and inactive groups are hidden from the new-report form", () => {
  const form = formGroups(config);
  assert.deepEqual(form.map((g) => g.name), ["Dasar", "Gaya Dada"]);
  assert.deepEqual(form[0].indicators.map((i) => i.key), ["Adaptasi di Air"]);
  assert.equal(activeGroups(config).length, 2);
});

test("editing an old report still shows indicators it already scored, marked inactive", () => {
  const form = formGroups(config, ["ind_a", "ind_c"]);
  const dasar = form.find((g) => g.name === "Dasar")!;
  assert.deepEqual(dasar.indicators.map((i) => [i.key, i.inactive]), [
    ["Adaptasi di Air", false],
    ["ind_a", true],
  ]);
  assert.ok(form.find((g) => g.name === "Arsip"));
});

test("renaming keeps the stable key, so old scores still resolve", () => {
  const scores = { "Adaptasi di Air": 4 };
  const renamed = buildIndicatorConfig(
    groups,
    indicators.map((i) => (i.key === "Adaptasi di Air" ? { ...i, label: "Adaptasi Air" } : i))
  );
  const [row] = resolveReportIndicators(scores, null, renamed);
  assert.equal(row.score, 4);
  assert.equal(row.label, "Adaptasi Air");
  assert.equal(displayName(renamed, "Adaptasi di Air"), "Dasar - Adaptasi Air");
});

test("a snapshot freezes the label and group a report was written with", () => {
  const snapshot = buildSnapshot(config, ["Adaptasi di Air", "ind_b"]);
  const later = buildIndicatorConfig(
    [{ id: "g1", name: "Dasar Baru", sort_order: 9, active: true }],
    [{ id: "i1", key: "Adaptasi di Air", label: "Beradaptasi", group_id: "g1", sort_order: 1, active: true }]
  );
  const rows = resolveReportIndicators({ "Adaptasi di Air": 3, ind_b: 5 }, snapshot, later);
  assert.deepEqual(rows.map((r) => [r.group, r.label]), [
    ["Dasar", "Adaptasi di Air"],
    ["Gaya Dada", "Timing"],
  ]);
});

test("a deleted/unknown key in an old report falls back to its raw name", () => {
  const rows = resolveReportIndicators({ "Gaya Bebas - Gerakan Kaki": 2 }, null, config);
  assert.equal(rows[0].group, "Gaya Bebas");
  assert.equal(rows[0].label, "Gerakan Kaki");
});

test("legacy skill_template still works before migration", () => {
  const legacy = legacyIndicatorConfig(["Gaya Bebas - Gerakan Kaki", "Gaya Bebas - Pernapasan", "Mengapung"]);
  assert.equal(legacy.legacy, true);
  assert.deepEqual(legacy.groups.map((g) => g.name), ["Gaya Bebas", "Indikator"]);
  assert.deepEqual(activeKeys(legacy), ["Gaya Bebas - Gerakan Kaki", "Gaya Bebas - Pernapasan", "Mengapung"]);
});

test("groups with a started-but-not-mastered score open first, else the first group", () => {
  const form = formGroups(config);
  assert.deepEqual(relevantGroupIds(form, { ind_b: 3 }), ["g2"]);
  assert.deepEqual(relevantGroupIds(form, { ind_b: 5, "Adaptasi di Air": 0 }), ["g1"]);
  assert.deepEqual(relevantGroupIds(form, null), ["g1"]);
  assert.deepEqual(relevantGroupIds([], null), []);
});

// ---------- reorder ----------
test("computeReorder swaps neighbours and copes with duplicate sort orders", () => {
  const items = [
    { id: "a", sort_order: 1 },
    { id: "b", sort_order: 2 },
    { id: "c", sort_order: 3 },
  ];
  const moved = computeReorder(items, "c", "up")!;
  assert.deepEqual(Object.fromEntries(moved.map((m) => [m.id, m.sort_order])), { b: 3, c: 2 });
  assert.equal(computeReorder(items, "a", "up"), null);
  assert.equal(computeReorder(items, "c", "down"), null);
  const dupes = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 0 },
  ];
  const fixed = computeReorder(dupes, "b", "up")!;
  assert.equal(new Set(fixed.map((f) => f.sort_order)).size, fixed.length);
  assert.equal(nextSortOrder(items), 4);
  assert.equal(nextSortOrder([]), 1);
});

// ---------- record input ----------
test("waktu tempuh needs gaya, jarak target and time", () => {
  const ok = parseRecordInput({ metric_type: "waktu_tempuh", stroke: "Bebas", distance_m: "25", duration_seconds: "48.5", recorded_at: "2026-09-01" });
  assert.ok(ok.ok);
  assert.ok(!parseRecordInput({ metric_type: "waktu_tempuh", stroke: "Bebas", distance_m: "", duration_seconds: "40", recorded_at: "2026-09-01" }).ok);
  assert.ok(!parseRecordInput({ metric_type: "waktu_tempuh", stroke: "Bebas", distance_m: "25", duration_seconds: "-3", recorded_at: "2026-09-01" }).ok);
});

test("jarak = meters, tahan nafas/treading = seconds; bad values are rejected", () => {
  const jarak = parseRecordInput({ metric_type: "jarak_tempuh", stroke: "Meluncur", distance_m: "8", recorded_at: "2026-09-01" });
  assert.ok(jarak.ok && jarak.value.distance_m === 8 && jarak.value.duration_seconds === null);
  const nafas = parseRecordInput({ metric_type: "tahan_nafas", duration_seconds: "6", recorded_at: "2026-09-01" });
  assert.ok(nafas.ok && nafas.value.duration_seconds === 6 && nafas.value.distance_m === null);
  assert.ok(!parseRecordInput({ metric_type: "treading_water", duration_seconds: "abc", recorded_at: "2026-09-01" }).ok);
  assert.ok(!parseRecordInput({ metric_type: "nope", duration_seconds: "3", recorded_at: "2026-09-01" }).ok);
  assert.ok(!parseRecordInput({ metric_type: "tahan_nafas", duration_seconds: "3", recorded_at: "kemarin" }).ok);
});

// ---------- milestone input ----------
test("milestone targets must be ordered for the metric", () => {
  const time = parseMilestoneInput({ label: "25m Bebas", metric_type: "waktu_tempuh", stroke: "Bebas", distance_m: 25, bronze: 60, silver: 50, gold: 40 });
  assert.ok(time.ok);
  assert.ok(!parseMilestoneInput({ label: "25m Bebas", metric_type: "waktu_tempuh", stroke: "Bebas", distance_m: 25, bronze: 40, silver: 50, gold: 60 }).ok);
  assert.ok(parseMilestoneInput({ label: "Nafas", metric_type: "tahan_nafas", bronze: 3, silver: 5, gold: 8 }).ok);
  assert.ok(!parseMilestoneInput({ label: "Nafas", metric_type: "tahan_nafas", bronze: 8, silver: 5, gold: 3 }).ok);
  assert.ok(!parseMilestoneInput({ label: "  ", metric_type: "tahan_nafas", bronze: 3, silver: 5, gold: 8 }).ok);
});

// ---------- milestones / awards ----------
const rec = (over: Partial<PerformanceRecordRow>): PerformanceRecordRow => ({
  id: Math.random().toString(36).slice(2),
  metric_type: "tahan_nafas",
  stroke: null,
  distance_m: null,
  duration_seconds: null,
  recorded_at: "2026-09-01",
  ...over,
});

test("the starter milestones are present and tier thresholds work", () => {
  assert.equal(DEFAULT_MILESTONES.length, 14);
  const nafas = DEFAULT_MILESTONES.find((m) => m.id === "seed:tahan-nafas")!;
  assert.equal(tierForValue(nafas, 2), null);
  assert.equal(tierForValue(nafas, 3), "bronze");
  assert.equal(tierForValue(nafas, 8), "gold");
  const bebas = DEFAULT_MILESTONES.find((m) => m.id === "seed:waktu-25m-bebas")!;
  assert.equal(tierForValue(bebas, 61), null);
  assert.equal(tierForValue(bebas, 55), "bronze");
  assert.equal(tierForValue(bebas, 39), "gold");
});

test("computeAwards ignores inactive milestones", () => {
  const nafas = DEFAULT_MILESTONES.find((m) => m.id === "seed:tahan-nafas")!;
  const r = { metric_type: "tahan_nafas" as const, stroke: null, distance_m: null, duration_seconds: 6 };
  assert.deepEqual(computeAwards(r, [nafas]), { [nafas.id]: "silver" });
  assert.deepEqual(computeAwards(r, [{ ...nafas, active: false }]), {});
});

test("changing a target later never removes a badge already frozen on a record", () => {
  const nafas = DEFAULT_MILESTONES.find((m) => m.id === "seed:tahan-nafas")!;
  const saved = rec({ duration_seconds: 5, awards: { [nafas.id]: "silver" } });
  const harder = { ...nafas, bronze: 20, silver: 30, gold: 40 };
  const [status] = computeMilestoneStatuses([saved], [harder]);
  assert.equal(status.tier, "silver");
});

test("legacy records (no awards) are evaluated against current targets", () => {
  const nafas = DEFAULT_MILESTONES.find((m) => m.id === "seed:tahan-nafas")!;
  const [status] = computeMilestoneStatuses([rec({ duration_seconds: 9 })], [nafas]);
  assert.equal(status.tier, "gold");
});

test("an archived milestone stays visible only while it holds earned badges", () => {
  const nafas = { ...DEFAULT_MILESTONES.find((m) => m.id === "seed:tahan-nafas")!, active: false };
  assert.equal(computeMilestoneStatuses([], [nafas]).length, 0);
  const held = rec({ duration_seconds: 5, awards: { [nafas.id]: "silver" } });
  const [status] = computeMilestoneStatuses([held], [nafas]);
  assert.equal(status.archived, true);
  assert.equal(status.tier, "silver");
});

test("editing only the date keeps awards; editing the measurement recomputes them", () => {
  const nafas = DEFAULT_MILESTONES.find((m) => m.id === "seed:tahan-nafas")!;
  const existing = { metric_type: "tahan_nafas" as const, stroke: null, distance_m: null, duration_seconds: 5 };
  const sameMeasure = parseRecordInput({ metric_type: "tahan_nafas", duration_seconds: 5, recorded_at: "2026-08-01" });
  assert.ok(sameMeasure.ok);
  if (!sameMeasure.ok) return;
  assert.equal(measurementChanged(existing, sameMeasure.value), false);
  assert.equal("awards" in buildRecordPatch(existing, sameMeasure.value, [nafas]), false);

  const better = parseRecordInput({ metric_type: "tahan_nafas", duration_seconds: 9, recorded_at: "2026-08-01" });
  assert.ok(better.ok);
  if (!better.ok) return;
  const patch = buildRecordPatch(existing, better.value, [nafas]);
  assert.deepEqual(patch.awards, { [nafas.id]: "gold" });
});

test("personal best flags follow record changes immediately", () => {
  const a = rec({ id: "a", metric_type: "waktu_tempuh", stroke: "Bebas", distance_m: 25, duration_seconds: 50, recorded_at: "2026-09-01" });
  const b = rec({ id: "b", metric_type: "waktu_tempuh", stroke: "Bebas", distance_m: 25, duration_seconds: 45, recorded_at: "2026-09-10" });
  // a PB is a record that beat every earlier one when it was set
  const best = (rows: PerformanceRecordRow[]) => annotatePersonalBests(rows).filter((r) => r.isPersonalBest).map((r) => r.id);
  assert.deepEqual(best([a, b]), ["a", "b"]);
  assert.deepEqual(best([a]), ["a"]); // b deleted
  assert.deepEqual(best([a, { ...b, duration_seconds: 55 }]), ["a"]); // b corrected to slower: no longer a PB
});
