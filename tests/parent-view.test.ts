import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAwards,
  computeMilestoneStatuses,
  formatMilestoneTargets,
  formatMilestoneValue,
  groupStatusesByLevel,
  isSupervisedOnly,
  pickNextTarget,
} from "../src/lib/milestones";
import { DEFAULT_MILESTONES } from "../src/lib/default-milestones";
import { parseMilestoneInput, parseRecordInput } from "../src/lib/record-input";
import { computeReorderInGroup } from "../src/lib/reorder";
import {
  buildIndicatorConfig,
  buildSnapshot,
  type IndicatorGroupRow,
  type IndicatorRow,
} from "../src/lib/indicators";
import { formatScore, scoreLabel, summarizeReportGroups } from "../src/lib/report-summary";
import type { PerformanceRecordRow } from "../src/lib/performance";

const rec = (over: Partial<PerformanceRecordRow>): PerformanceRecordRow => ({
  id: Math.random().toString(36).slice(2),
  metric_type: "tahan_nafas",
  stroke: null,
  distance_m: null,
  duration_seconds: null,
  recorded_at: "2026-09-01",
  ...over,
});

// awards frozen the way the server does it when a record is saved
const saved = (over: Partial<PerformanceRecordRow>): PerformanceRecordRow => {
  const r = rec(over);
  return { ...r, awards: computeAwards(r, DEFAULT_MILESTONES) };
};

// ---------- starter set ----------
test("starter set: Dasar 5, Menengah 4, Mahir 5 with the agreed targets", () => {
  const groups = groupStatusesByLevel(computeMilestoneStatuses([], DEFAULT_MILESTONES));
  assert.deepEqual(
    groups.map((g) => [g.level, g.statuses.length]),
    [["Dasar", 5], ["Menengah", 4], ["Mahir", 5]]
  );
  const by = (id: string) => DEFAULT_MILESTONES.find((m) => m.id === `seed:${id}`)!;
  assert.equal(formatMilestoneTargets(by("tahan-nafas")), "3 / 5 / 8 detik");
  assert.equal(formatMilestoneTargets(by("jarak-meluncur")), "3 / 5 / 8 meter");
  assert.equal(formatMilestoneTargets(by("waktu-25m-bebas")), "1:00 / 0:50 / 0:40");
  assert.equal(formatMilestoneTargets(by("treading-water")), "15 / 30 / 60 detik");
  assert.equal(formatMilestoneTargets(by("medley-4x25")), "5:00 / 4:20 / 3:50");
  assert.equal(formatMilestoneValue("jarak_tempuh", 3), "3 meter");
  assert.equal(formatMilestoneValue("waktu_tempuh", 65), "1:05");
});

test("distance milestones are told apart by technique, not confused with each other", () => {
  const swim = computeAwards(
    { metric_type: "jarak_tempuh", stroke: "Bebas", distance_m: 12, duration_seconds: null },
    DEFAULT_MILESTONES
  );
  assert.deepEqual(swim, { "seed:bebas-tanpa-berhenti": "bronze" });
  const kick = computeAwards(
    { metric_type: "jarak_tempuh", stroke: "Tendangan Bebas", distance_m: 10, duration_seconds: null },
    DEFAULT_MILESTONES
  );
  assert.deepEqual(kick, { "seed:tendangan-bebas": "silver" });
  const glide = computeAwards(
    { metric_type: "jarak_tempuh", stroke: "Meluncur", distance_m: 8, duration_seconds: null },
    DEFAULT_MILESTONES
  );
  assert.deepEqual(glide, { "seed:jarak-meluncur": "gold" });
});

test("new record types validate: mengapung, medley, technique required for distance", () => {
  assert.ok(parseRecordInput({ metric_type: "mengapung_telentang", duration_seconds: "12", recorded_at: "2026-09-01" }).ok);
  assert.ok(parseRecordInput({ metric_type: "waktu_tempuh", stroke: "Medley", distance_m: "100", duration_seconds: "240", recorded_at: "2026-09-01" }).ok);
  assert.ok(!parseRecordInput({ metric_type: "jarak_tempuh", distance_m: "8", recorded_at: "2026-09-01" }).ok);
  assert.ok(!parseRecordInput({ metric_type: "waktu_tempuh", stroke: "Meluncur", distance_m: "25", duration_seconds: "40", recorded_at: "2026-09-01" }).ok);
  assert.ok(parseMilestoneInput({ label: "Meluncur", metric_type: "jarak_tempuh", stroke: "Meluncur", bronze: 3, silver: 5, gold: 8 }).ok);
  assert.ok(!parseMilestoneInput({ label: "Meluncur", metric_type: "jarak_tempuh", bronze: 3, silver: 5, gold: 8 }).ok);
});

test("breath-hold is flagged as supervised-only", () => {
  assert.equal(isSupervisedOnly("tahan_nafas"), true);
  assert.equal(isSupervisedOnly("treading_water"), false);
});

// ---------- next target + counts ----------
test("student with no records: next target is the first milestone, nothing unlocked", () => {
  const statuses = computeMilestoneStatuses([], DEFAULT_MILESTONES);
  assert.equal(statuses.filter((s) => s.tier).length, 0);
  const next = pickNextTarget(statuses)!;
  assert.equal(next.status.milestone.id, "seed:tahan-nafas");
  assert.equal(next.tier, "bronze");
  assert.equal(next.value, 3);
  assert.equal(next.status.bestValue, null);
});

test("one bronze record: 1 of 14 unlocked, next target moves to the next locked milestone", () => {
  const statuses = computeMilestoneStatuses([saved({ duration_seconds: 3 })], DEFAULT_MILESTONES);
  assert.equal(statuses.length, 14);
  assert.equal(statuses.filter((s) => s.tier).length, 1);
  const next = pickNextTarget(statuses)!;
  assert.equal(next.status.milestone.id, "seed:mengapung-telentang");
  assert.equal(next.tier, "bronze");
});

test("several badges: counts, tiers and next target stay consistent", () => {
  const records = [
    saved({ duration_seconds: 9 }), // tahan nafas gold
    saved({ metric_type: "mengapung_telentang", duration_seconds: 10 }), // silver
    saved({ metric_type: "jarak_tempuh", stroke: "Meluncur", distance_m: 3 }), // bronze
    saved({ metric_type: "jarak_tempuh", stroke: "Tendangan Bebas", distance_m: 2 }), // attempt, no badge
  ];
  const statuses = computeMilestoneStatuses(records, DEFAULT_MILESTONES);
  const tier = (id: string) => statuses.find((s) => s.milestone.id === `seed:${id}`)!.tier;
  assert.equal(tier("tahan-nafas"), "gold");
  assert.equal(tier("mengapung-telentang"), "silver");
  assert.equal(tier("jarak-meluncur"), "bronze");
  assert.equal(tier("tendangan-bebas"), null);
  assert.equal(statuses.filter((s) => s.tier).length, 3);
  const next = pickNextTarget(statuses)!;
  assert.equal(next.status.milestone.id, "seed:tendangan-bebas");
  assert.equal(next.status.bestValue, 2);
});

test("all gold: no next target; once everything is unlocked upgrades are suggested", () => {
  const golds = DEFAULT_MILESTONES.map((m) => ({ ...m }));
  const allBronze = computeMilestoneStatuses(
    [],
    golds
  ).map((s) => ({ ...s, tier: "bronze" as const }));
  const next = pickNextTarget(allBronze)!;
  assert.equal(next.tier, "silver");
  const allGold = allBronze.map((s) => ({ ...s, tier: "gold" as const }));
  assert.equal(pickNextTarget(allGold), null);
});

test("archived milestones are never suggested as a target", () => {
  const off = DEFAULT_MILESTONES.map((m) => (m.id === "seed:tahan-nafas" ? { ...m, active: false } : m));
  const next = pickNextTarget(computeMilestoneStatuses([], off))!;
  assert.equal(next.status.milestone.id, "seed:mengapung-telentang");
});

// ---------- reorder within level ----------
test("reordering stays inside the level and keeps a global order", () => {
  const items = [
    { id: "a", sort_order: 1, group: "Dasar" },
    { id: "b", sort_order: 2, group: "Dasar" },
    { id: "c", sort_order: 3, group: "Menengah" },
    { id: "d", sort_order: 4, group: "Menengah" },
  ];
  assert.equal(computeReorderInGroup(items, "c", "up"), null); // first in its level
  assert.equal(computeReorderInGroup(items, "b", "down"), null); // last in its level
  const moved = computeReorderInGroup(items, "d", "up")!;
  assert.deepEqual(Object.fromEntries(moved.map((m) => [m.id, m.sort_order])), { c: 4, d: 3 });
});

// ---------- parent report summary ----------
const groups: IndicatorGroupRow[] = [
  { id: "g1", name: "Dasar", sort_order: 1, active: true },
  { id: "g2", name: "Water Safety", sort_order: 2, active: true },
  { id: "g3", name: "Gaya Bebas", sort_order: 3, active: true },
  { id: "g4", name: "Gaya Dada", sort_order: 4, active: true },
];
const indicators: IndicatorRow[] = [
  { id: "1", key: "d1", label: "Meluncur", group_id: "g1", sort_order: 1, active: true },
  { id: "2", key: "d2", label: "Mengapung", group_id: "g1", sort_order: 2, active: true },
  { id: "3", key: "w1", label: "Floating", group_id: "g2", sort_order: 1, active: true },
  { id: "4", key: "b1", label: "Posisi Tubuh", group_id: "g3", sort_order: 1, active: true },
  { id: "5", key: "b2", label: "Gerakan Kaki", group_id: "g3", sort_order: 2, active: true },
  { id: "6", key: "c1", label: "Timing", group_id: "g4", sort_order: 1, active: true },
];
const config = buildIndicatorConfig(groups, indicators);

test("groups keep the admin order; untouched groups read Belum dinilai / Belum dimulai", () => {
  const scores = { d1: 4, d2: 3, b1: 0, b2: 0, c1: 0 }; // Water Safety not scored at all
  const summary = summarizeReportGroups(scores, buildSnapshot(config, Object.keys(scores)), config);
  assert.deepEqual(summary.map((g) => g.name), ["Dasar", "Water Safety", "Gaya Bebas", "Gaya Dada"]);
  const by = (n: string) => summary.find((g) => g.name === n)!;
  assert.equal(by("Dasar").status, "dinilai");
  assert.equal(by("Dasar").average, 3.5);
  assert.equal(by("Water Safety").status, "belum_dinilai");
  assert.equal(by("Water Safety").average, null);
  assert.equal(by("Gaya Bebas").status, "belum_dimulai"); // all zero: never shown as a 0 average
  assert.equal(by("Gaya Bebas").average, null);
});

test("whole, half and a deliberately chosen zero score all read clearly", () => {
  const scores = { b1: 2.5, b2: 0 }; // a zero next to a real score is a real "Belum bisa"
  const [, , bebas] = summarizeReportGroups(scores, null, config);
  assert.equal(bebas.status, "dinilai");
  assert.equal(bebas.average, 1.25);
  assert.deepEqual(bebas.items.map((i) => [i.label, i.score]), [["Posisi Tubuh", 2.5], ["Gerakan Kaki", 0]]);
  assert.equal(formatScore(2.5), "2,5");
  assert.equal(formatScore(3), "3");
  assert.equal(formatScore(1.25), "1,3");
  assert.deepEqual([0, 1, 2, 2.5, 3, 4, 4.5, 5].map(scoreLabel), [
    "Belum bisa",
    "Baru mencoba",
    "Cukup baik",
    "Cukup baik",
    "Baik",
    "Sangat baik",
    "Sangat baik",
    "Mahir",
  ]);
});

test("a report with no scores at all lists every group as Belum dinilai", () => {
  const summary = summarizeReportGroups({}, null, config);
  assert.equal(summary.length, 4);
  assert.ok(summary.every((g) => g.status === "belum_dinilai"));
});

// ---------- parent navigation ----------
import { childHref, latestReportPreview, parseChildTab, CHILD_TABS } from "../src/lib/report-preview";

test("child tab comes from the URL and falls back to laporan", () => {
  assert.equal(parseChildTab(undefined), "laporan");
  assert.equal(parseChildTab("perkembangan"), "perkembangan");
  assert.equal(parseChildTab("record"), "record");
  assert.equal(parseChildTab("nonsense"), "laporan");
  assert.equal(parseChildTab(["record", "laporan"]), "record");
  assert.deepEqual(CHILD_TABS.map((t) => t.id), ["laporan", "perkembangan", "record"]);
});

test("deep links point at the right tab and anchor", () => {
  assert.equal(childHref("abc", "laporan", "laporan-terbaru"), "/ortu/anak/abc?tab=laporan#laporan-terbaru");
  assert.equal(childHref("abc", "laporan", "riwayat-laporan"), "/ortu/anak/abc?tab=laporan#riwayat-laporan");
  assert.equal(childHref("abc", "perkembangan"), "/ortu/anak/abc?tab=perkembangan");
});

test("latest report preview: newest report, note trimmed, null when none", () => {
  assert.equal(latestReportPreview([]), null);
  const p = latestReportPreview([
    { session_date: "2026-09-15", session_number: 4, attendance: "hadir", notes: "  Makin berani meluncur  " },
    { session_date: "2026-09-08", session_number: 3, attendance: "izin", notes: "lama" },
  ])!;
  assert.equal(p.sessionNumber, 4);
  assert.equal(p.attendance, "hadir");
  assert.equal(p.note, "Makin berani meluncur");
  const noNote = latestReportPreview([{ session_date: "2026-09-15", attendance: "izin", notes: "   " }])!;
  assert.equal(noNote.note, null);
});
