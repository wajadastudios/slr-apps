import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awaitsQuotaDecision,
  computeSessionQuota,
  countAttendedSessions,
  countUsedSessions,
  formatSessionQuota,
  usesQuota,
} from "../src/lib/progress";
import { computeQuota, quotaLine } from "../src/lib/admin/quota";
import { computeGaji, payrollBlocker, resolveIzinTerpakaiRate, type RateRow } from "../src/lib/payroll";
import { attendanceText } from "../src/lib/report-preview";

const r = (session_date: string, attendance: string, extra: { late_notice?: boolean; quota_decision?: string | null } = {}) => ({
  session_date,
  attendance,
  ...extra,
});

// Ica's case: 45 hadir + one izin after the coach had arrived, decided "used"
const ica = [
  ...Array.from({ length: 45 }, (_, i) => r(`2026-01-${String((i % 28) + 1).padStart(2, "0")}-${i}`, "hadir")),
  r("2026-04-13", "izin", { late_notice: true, quota_decision: "used" }),
];

test("used = hadir + izin terpakai; attended stays hadir only", () => {
  assert.equal(countAttendedSessions(ica), 45);
  assert.equal(countUsedSessions(ica), 46);
  assert.equal(usesQuota(r("d", "izin")), false);
  assert.equal(usesQuota(r("d", "izin", { late_notice: true })), false, "undecided does not use quota yet");
  assert.equal(usesQuota(r("d", "izin", { late_notice: true, quota_decision: "not_used" })), false);
  assert.equal(usesQuota(r("d", "sakit")), false);
});

test("parent quota line adds up with the invoice", () => {
  const q = computeSessionQuota([{ status: "paid", sessions_count: 46 }, { status: "sent", sessions_count: 8 }], ica);
  assert.deepEqual([q.hadir, q.used, q.izinTerpakai, q.total, q.remaining], [45, 46, 1, 46, 0]);
  const text = formatSessionQuota(q);
  assert.equal(text.note, "Sisa 0 sesi");
  assert.equal(text.value, "46 / 46 terpakai · 45 hadir · 1 izin terpakai");
  // without any izin terpakai the wording stays familiar
  const plain = formatSessionQuota(computeSessionQuota([{ status: "paid", sessions_count: 8 }], [r("a", "hadir")]));
  assert.equal(plain.value, "1 / 8 terpakai · 1 sesi diikuti");
});

test("admin quota uses the same rule", () => {
  const q = computeQuota(46, 46, 45, 1);
  assert.equal(q.remaining, 0);
  assert.equal(q.overdrawn, 0);
  assert.equal(quotaLine(q), "Kuota dibeli: 46 sesi · Terpakai: 46 (45 hadir, 1 izin terpakai) · Sisa: 0 sesi");
  assert.equal(computeQuota(8, 3).attended, 3, "old two-argument call still works");
});

test("only a late, undecided izin awaits a decision", () => {
  assert.equal(awaitsQuotaDecision(r("d", "izin", { late_notice: true })), true);
  assert.equal(awaitsQuotaDecision(r("d", "izin", { late_notice: true, quota_decision: "used" })), false);
  assert.equal(awaitsQuotaDecision(r("d", "izin")), false);
});

test("labels: parents see only the final status", () => {
  const pending = { attendance: "izin", late_notice: true, quota_decision: null };
  const used = { attendance: "izin", late_notice: true, quota_decision: "used" };
  assert.equal(attendanceText(pending, "parent"), "Izin");
  assert.equal(attendanceText(pending, "staff"), "Izin · menunggu keputusan admin");
  assert.equal(attendanceText(used, "parent"), "Izin — sesi terpakai");
  assert.equal(attendanceText({ attendance: "hadir" }, "parent"), "Hadir");
});

const rates: RateRow[] = [
  { rate_hadir: 100, rate_izin_sakit: 20, rate_izin_terpakai: null, effective_from: "2026-01-01" },
];

test("payroll: used izin paid at the coach's own rate, never Rp0 when unset", () => {
  const reports = [r("2026-04-06", "hadir"), r("2026-04-13", "izin", { late_notice: true, quota_decision: "used" }), r("2026-04-20", "izin")];
  const unset = computeGaji(reports, rates);
  assert.equal(unset.izinTerpakaiCount, 1);
  assert.equal(unset.izinTerpakaiUnratedCount, 1);
  assert.equal(unset.total, 120, "hadir 100 + izin 20; the unrated used izin is not paid as 0 silently");
  assert.match(payrollBlocker(unset) ?? "", /Tarif sesi terpakai belum diisi/);

  const withRate: RateRow[] = [...rates, { rate_hadir: 100, rate_izin_sakit: 20, rate_izin_terpakai: 75, effective_from: "2026-04-01" }];
  const set = computeGaji(reports, withRate);
  assert.equal(set.izinTerpakaiUnratedCount, 0);
  assert.equal(set.total, 195);
  assert.equal(payrollBlocker(set), null);
});

test("payroll: an undecided late izin blocks approval/transfer", () => {
  const g = computeGaji([r("2026-04-13", "izin", { late_notice: true })], rates);
  assert.equal(g.pendingDecisionCount, 1);
  assert.equal(g.total, 20, "paid like an izin until decided");
  assert.match(payrollBlocker(g) ?? "", /belum diputuskan/);
});

test("sesi terpakai rate carries forward when a later rate row leaves it empty", () => {
  const rows: RateRow[] = [
    { rate_hadir: 100, rate_izin_sakit: 20, rate_izin_terpakai: 60, effective_from: "2026-01-01" },
    { rate_hadir: 120, rate_izin_sakit: 20, rate_izin_terpakai: null, effective_from: "2026-06-01" },
  ];
  assert.equal(resolveIzinTerpakaiRate(rows, "2026-07-01"), 60);
  assert.equal(resolveIzinTerpakaiRate(rows, "2025-12-31"), null);
});
