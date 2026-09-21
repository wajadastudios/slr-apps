import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock, formatRange, slotFill, coachName } from "../src/lib/admin/format";
import {
  blocking,
  checkSlot,
  existingConflicts,
  overlaps,
  participantConflicts,
  warnings,
  type SlotContext,
} from "../src/lib/admin/schedule-rules";
import {
  billingReason,
  computeQuota,
  invoiceProblem,
  isOverdue,
  paidSessionsOf,
  quotaLine,
  type InvoiceLite,
} from "../src/lib/admin/quota";
import { buildQueue, enrollmentBilling, missingReports, type QEnrollment, type QReport } from "../src/lib/admin/queue";
import { programChecklist, readyBlockers, type ReadinessInput } from "../src/lib/admin/readiness";
import { describeActivity } from "../src/lib/admin/activity";

// ---------- time ----------
test("times are shown as 15.00, never 15:00:00", () => {
  assert.equal(formatClock("15:00:00"), "15.00");
  assert.equal(formatClock("09:05"), "09.05");
  assert.equal(formatClock(null), "-");
  assert.equal(formatRange("15:00:00", 60), "15.00-16.00");
  assert.equal(formatRange("23:30:00", 60), "23.30-00.30");
  assert.equal(coachName({ full_name: "Sari", title: "Coach" }), "Coach Sari");
});

test("a slot is full at capacity and almost full with one seat left", () => {
  assert.equal(slotFill(5, 5), "penuh");
  assert.equal(slotFill(4, 5), "hampir_penuh");
  assert.equal(slotFill(9, 10), "hampir_penuh");
  assert.equal(slotFill(2, 10), "tersedia");
});

// ---------- schedule conflicts ----------
const slot = (id: string, over: Partial<SlotContext> = {}): SlotContext => ({
  id,
  program_id: "kids",
  pelatih_id: "sari",
  location: "Kolam CDR",
  day_of_week: 6,
  start_time: "16:00:00",
  duration_minutes: 60,
  capacity: 5,
  programName: "Kids Swim",
  pelatihName: "Coach Sari",
  ...over,
});
const names = { programName: "Kids Swim", pelatihName: "Coach Sari" };

test("overlap is by minutes: back-to-back classes do not overlap", () => {
  assert.ok(overlaps(slot("a"), slot("b", { start_time: "16:30:00" })));
  assert.ok(!overlaps(slot("a"), slot("b", { start_time: "17:00:00" })));
  assert.ok(!overlaps(slot("a"), slot("b", { day_of_week: 5 })));
});

test("the same coach at an overlapping time blocks the slot, with a clear message", () => {
  const existing = [slot("s1")];
  const out = checkSlot({ ...slot("new"), id: undefined, program_id: "aqua", location: "Kolam Lain", start_time: "16:30:00" }, existing, names);
  const hard = blocking(out);
  assert.equal(hard.length, 1);
  assert.equal(hard[0].kind, "pelatih");
  assert.equal(hard[0].message, "Coach Sari sudah mengajar Kids Swim di Kolam CDR pada Sabtu pukul 16.00.");
});

test("an identical slot is a duplicate", () => {
  const out = checkSlot({ ...slot("new"), id: undefined }, [slot("s1")], names);
  assert.ok(blocking(out).some((c) => c.kind === "duplicate"));
});

test("a pool used by another coach at the same time is a warning, not a block", () => {
  const out = checkSlot(
    { ...slot("new"), id: undefined, pelatih_id: "budi", program_id: "aqua" },
    [slot("s1")],
    { programName: "Aquanatal", pelatihName: "Coach Budi" }
  );
  assert.equal(blocking(out).length, 0);
  const soft = warnings(out);
  assert.equal(soft.length, 1);
  assert.match(soft[0].message, /Kolam CDR sudah dipakai Kids Swim/);
});

test("capacity must be at least 1 and never below the people already in the slot", () => {
  assert.ok(blocking(checkSlot({ ...slot("x"), capacity: 0 }, [], names)).some((c) => c.kind === "capacity"));
  const shrink = blocking(checkSlot(slot("x", { capacity: 3 }), [], names, 5));
  assert.equal(shrink.length, 1);
  assert.match(shrink[0].message, /lebih kecil/);
  assert.equal(checkSlot(slot("x", { capacity: 5 }), [], names, 5).length, 0);
});

test("editing a slot does not conflict with itself", () => {
  assert.equal(blocking(checkSlot(slot("s1", { capacity: 6 }), [slot("s1")], names)).length, 0);
});

test("a participant cannot be in two overlapping classes", () => {
  const out = participantConflicts(slot("new", { start_time: "16:30:00", program_id: "aqua", programName: "Aquanatal" }), "Rara", [slot("s1")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].message, "Rara sudah punya jadwal Kids Swim pada Sabtu pukul 16.00.");
  assert.equal(participantConflicts(slot("n", { start_time: "17:00:00" }), "Rara", [slot("s1")]).length, 0);
});

test("legacy overlaps are found for the dashboard", () => {
  const found = existingConflicts([slot("a"), slot("b", { start_time: "16:30:00" }), slot("c", { day_of_week: 2 })]);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "pelatih");
});

// ---------- quota ----------
const inv = (status: string, sessions: number, over: Partial<InvoiceLite> = {}): InvoiceLite => ({
  id: `${status}-${sessions}`,
  student_id: "s1",
  enrollment_id: "e1",
  status,
  sessions_count: sessions,
  ...over,
});

test("only paid invoices add sessions; sent, draft and processing add nothing", () => {
  assert.equal(paidSessionsOf([inv("paid", 30)]), 30);
  assert.equal(paidSessionsOf([inv("sent", 30)]), 0);
  assert.equal(paidSessionsOf([inv("draft", 30), inv("approved", 30), inv("processing", 30)]), 0);
  assert.equal(paidSessionsOf([inv("paid", 8), inv("paid", 4), inv("sent", 8)]), 12);
});

test("attendance uses up the quota and the line explains it", () => {
  const q = computeQuota(30, 25);
  assert.equal(q.remaining, 5);
  assert.equal(quotaLine(q), "Kuota dibeli: 30 sesi · Sudah hadir: 25 · Sisa: 5 sesi");
});

test("attendance above the quota is a warning, never silently corrected", () => {
  const q = computeQuota(4, 6);
  assert.equal(q.remaining, 0);
  assert.equal(q.overdrawn, 2);
});

test("low quota or no paid package puts a participant in the billing queue", () => {
  assert.equal(billingReason(computeQuota(30, 27), 2, false), null); // 3 left: not yet
  assert.equal(billingReason(computeQuota(30, 28), 2, false), "low_quota"); // 2 left: at the threshold
  assert.equal(billingReason(computeQuota(30, 29), 2, false), "low_quota");
  assert.equal(billingReason(computeQuota(30, 27), 3, false), "low_quota"); // the threshold is configurable
  assert.equal(billingReason(computeQuota(30, 20), 2, false), null);
  assert.equal(billingReason(computeQuota(0, 0), 2, false), "no_package");
  // an open invoice already answers the need: no double billing
  assert.equal(billingReason(computeQuota(4, 4), 2, true), null);
});

test("attendance beating the ever-billed count no longer makes someone 'ready to bill'", () => {
  // 5 attended, 4 billed but NOT paid: quota is 0 bought, reason is no paid package
  const q = computeQuota(paidSessionsOf([inv("sent", 4)]), 5);
  assert.equal(q.bought, 0);
  assert.equal(billingReason(q, 2, true), null); // the sent invoice is open, so nothing new to make
  assert.equal(billingReason(q, 2, false), "no_package");
});

test("a paid invoice that adds nothing is a problem, an unpaid one never is", () => {
  assert.equal(invoiceProblem(inv("paid", 0), "active"), "no_sessions");
  assert.equal(invoiceProblem(inv("paid", 4, { enrollment_id: null }), null), "not_linked");
  assert.equal(invoiceProblem(inv("paid", 4), "cancelled"), "closed_enrollment");
  assert.equal(invoiceProblem(inv("paid", 4), "active"), null);
  assert.equal(invoiceProblem(inv("sent", 0), "active"), null);
});

test("a sent invoice is overdue after the allowed days", () => {
  const now = new Date("2026-09-21T00:00:00Z");
  assert.equal(isOverdue({ status: "sent", sent_at: "2026-09-10T00:00:00Z" }, 7, now), true);
  assert.equal(isOverdue({ status: "sent", sent_at: "2026-09-18T00:00:00Z" }, 7, now), false);
  assert.equal(isOverdue({ status: "paid", sent_at: "2026-09-01T00:00:00Z" }, 7, now), false);
});

// ---------- action queue ----------
const enr = (id: string, status: string, over: Partial<QEnrollment> = {}): QEnrollment => ({
  id,
  student_id: `stu-${id}`,
  program_id: "kids",
  status,
  slot_id: null,
  offered_slot_id: null,
  preferred_schedule: "Sabtu pagi",
  preferred_location: null,
  created_at: `2026-09-0${(id.charCodeAt(0) % 9) + 1}T00:00:00Z`,
  updated_at: null,
  followed_up_at: null,
  studentName: `Peserta ${id}`,
  programName: "Kids Swim",
  ...over,
});

const report = (enrollment: string, attendance: string, date = "2026-09-01"): QReport => ({
  student_id: `stu-${enrollment}`,
  program_id: "kids",
  session_date: date,
  attendance,
  enrollment_id: enrollment,
});

function queue(enrollments: QEnrollment[], invoices: InvoiceLite[], reports: QReport[], extra = {}) {
  return buildQueue({
    enrollments,
    invoices,
    reports,
    slots: [],
    filledBySlot: new Map(),
    missing: [],
    threshold: 2,
    pelatihNames: new Map(),
    ...extra,
  });
}

test("the queue shows real work in order of urgency, at most three items per card", () => {
  const cards = queue(
    [enr("a", "pending_review"), enr("b", "pending_review"), enr("c", "pending_review"), enr("d", "pending_review"), enr("e", "waiting_schedule"), enr("f", "schedule_offered")],
    [],
    []
  );
  assert.deepEqual(cards.map((c) => c.key), ["tinjau", "ditawarkan", "menunggu"]);
  const review = cards[0];
  assert.equal(review.count, 4);
  assert.equal(review.items.length, 3);
  assert.equal(review.cta, "Tinjau pendaftar");
  assert.equal(review.href, "/admin/pendaftar?tab=tinjau");
  assert.ok(review.items[0].href.startsWith("/admin/pendaftar/kelas/"));
});

test("an empty system produces no cards", () => {
  assert.equal(queue([], [], []).length, 0);
});

test("active participants without a paid package and with low quota get their own cards", () => {
  const enrollments = [enr("a", "active"), enr("b", "active"), enr("c", "active")];
  const invoices: InvoiceLite[] = [
    inv("paid", 4, { id: "p1", student_id: "stu-b", enrollment_id: "b" }),
    inv("paid", 30, { id: "p2", student_id: "stu-c", enrollment_id: "c" }),
    inv("sent", 30, { id: "s3", student_id: "stu-c", enrollment_id: "c" }),
  ];
  // b attended 3 of 4 (1 left <= 2); c is fine; a has nothing
  const reports = [report("b", "hadir", "2026-09-01"), report("b", "hadir", "2026-09-08"), report("b", "hadir", "2026-09-15")];
  const cards = queue(enrollments, invoices, reports);
  const keys = cards.map((c) => c.key);
  assert.ok(keys.includes("belum-lunas"));
  assert.ok(keys.includes("kuota-menipis"));
  const low = cards.find((c) => c.key === "kuota-menipis")!;
  assert.equal(low.items[0].meta, "Sisa 1 sesi");
  assert.equal(cards.find((c) => c.key === "belum-lunas")!.items[0].label, "Peserta a · Kids Swim");
});

test("a paid invoice not linked to any enrollment is reported as a payment problem", () => {
  const cards = queue([enr("a", "active")], [inv("paid", 4, { enrollment_id: null })], []);
  const problem = cards.find((c) => c.key === "bermasalah");
  assert.ok(problem);
  assert.equal(problem!.cta, "Periksa pembayaran");
});

test("billing info counts attendance per enrollment, not per person", () => {
  const list = enrollmentBilling(
    [enr("a", "active"), enr("z", "active", { student_id: "stu-a", program_id: "aqua", programName: "Aquanatal" })],
    [inv("paid", 8, { enrollment_id: "a", student_id: "stu-a" })],
    [report("a", "hadir"), { ...report("a", "hadir", "2026-09-08"), enrollment_id: "z", program_id: "aqua" }],
    2
  );
  const kids = list.find((b) => b.enrollment.id === "a")!;
  const aqua = list.find((b) => b.enrollment.id === "z")!;
  assert.equal(kids.quota.attended, 1);
  assert.equal(kids.quota.remaining, 7);
  assert.equal(aqua.quota.attended, 1);
  assert.equal(aqua.quota.bought, 0);
});

test("unwritten reports are found only for sessions that already took place", () => {
  const slots = new Map<string, SlotContext>([["sl1", slot("sl1", { day_of_week: 1, start_time: "15:00:00" })]]);
  const enrollments = [enr("a", "active")];
  const schedules = [{ student_id: "stu-a", slot_id: "sl1", created_at: "2026-09-01T00:00:00Z" }];
  // today is Monday 2026-09-21, 16:30 => the 15.00 session (ends 16.00) has passed
  const names = new Map([["stu-a", "Rara"]]);
  const pending = missingReports(schedules, slots, enrollments, [], names, "2026-09-21", 16 * 60 + 30);
  assert.deepEqual(pending.map((m) => m.date), ["2026-09-21", "2026-09-14"]);
  // at 15.30 today's session has not ended yet
  assert.deepEqual(missingReports(schedules, slots, enrollments, [], names, "2026-09-21", 15 * 60 + 30).map((m) => m.date), ["2026-09-14"]);
  // a saved report clears its own date only
  const saved: QReport[] = [{ student_id: "stu-a", program_id: "kids", session_date: "2026-09-14", attendance: "hadir", enrollment_id: "a" }];
  assert.deepEqual(missingReports(schedules, slots, enrollments, saved, names, "2026-09-21", 16 * 60 + 30).map((m) => m.date), ["2026-09-21"]);
  // sessions before the participant joined the slot never count
  const late = [{ student_id: "stu-a", slot_id: "sl1", created_at: "2026-09-20T00:00:00Z" }];
  assert.deepEqual(missingReports(late, slots, enrollments, [], names, "2026-09-21", 16 * 60 + 30).map((m) => m.date), ["2026-09-21"]);
});

// ---------- program setup ----------
const ready = (over: Partial<ReadinessInput> = {}, program: Partial<ReadinessInput["program"]> = {}): ReadinessInput => ({
  program: {
    id: "p1",
    name: "Aquanatal",
    active: true,
    audience: "adult",
    assessment_type: "observation",
    records_mode: "none",
    registration_open: false,
    ...program,
  },
  indicatorGroups: 5,
  indicators: 20,
  milestones: 0,
  packages: 2,
  slots: 3,
  pelatihWithSlots: 2,
  locations: 1,
  poolLocations: 2,
  ...over,
});

test("a program is ready once it has a package, a slot, a coach and its own template", () => {
  assert.deepEqual(readyBlockers(ready()), []);
  assert.deepEqual(readyBlockers(ready({ packages: 0 })), ["Belum ada paket aktif."]);
  assert.deepEqual(readyBlockers(ready({ slots: 0, pelatihWithSlots: 0 })), ["Belum ada slot aktif.", "Belum ada pengajar."]);
  assert.deepEqual(readyBlockers(ready({ indicatorGroups: 0, indicators: 0 })), ["Template penilaian yang sesuai belum ada."]);
});

test("medal programs need milestones; Aquanatal and Adaptive never do", () => {
  const kids = ready({ milestones: 0 }, { name: "Kids Swim", assessment_type: "score_5", records_mode: "medals", audience: "child" });
  assert.ok(readyBlockers(kids).some((b) => b.includes("Milestone")));
  assert.equal(readyBlockers({ ...kids, milestones: 14 }).length, 0);
  assert.equal(readyBlockers(ready({}, { records_mode: "none" })).length, 0);
  assert.equal(readyBlockers(ready({}, { name: "Adaptive Swim", assessment_type: "support_level", records_mode: "personal_goals" })).length, 0);
  const steps = programChecklist(ready());
  assert.equal(steps.find((s) => s.key === "milestones")!.optional, true);
});

test("a program without a category is not ready", () => {
  assert.ok(readyBlockers(ready({}, { audience: null })).includes("Nama dan kategori program belum lengkap."));
});

// ---------- activity log wording ----------
test("activity entries read as one sentence with before and after", () => {
  const change = describeActivity({
    id: "1",
    created_at: "2026-09-21T00:00:00Z",
    actor_name: "Admin",
    entity_type: "invoices",
    action: "update",
    changes: { status: ["sent", "paid"], _student: "Rara" },
    note: null,
  });
  assert.equal(change.title, "Tagihan diubah · Rara");
  assert.deepEqual(change.detail, ["status: Menunggu pembayaran → Lunas"]);

  const moved = describeActivity({
    id: "2",
    created_at: "2026-09-21T00:00:00Z",
    actor_name: "Admin",
    entity_type: "class_slots",
    action: "update",
    changes: { start_time: ["15:00:00", "16:00:00"], day_of_week: [2, 6] },
    note: null,
  });
  assert.deepEqual(moved.detail.sort(), ["hari: Selasa → Sabtu", "jam: 15.00 → 16.00"]);

  assert.equal(
    describeActivity({ id: "3", created_at: "", actor_name: null, entity_type: "reminder", action: "note", changes: {}, note: "Pengingat dikirim" }).title,
    "Pengingat: Pengingat dikirim"
  );
});
