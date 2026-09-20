import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminCanMove,
  adminMoves,
  adminNewRegistrationMessage,
  hasClassAccess,
  offerOutcomeMessage,
  participantCanCancel,
  participantStatusCopy,
  pickEnrollment,
  remainingSeats,
  scheduleConfirmedMessage,
  scheduleOfferMessage,
  type EnrollmentStatus,
} from "../src/lib/enrollment";
import {
  OBSERVATION_LEVELS,
  SUPPORT_LEVELS,
  cardLinks,
  levelLabel,
  maxScoreFor,
  normalizeProgram,
  parseTab,
  reportTitle,
  tabsFor,
  usesStars,
} from "../src/lib/programs";
import {
  ACK_VERSION,
  normalizePhone,
  parseAdultRegistration,
  preferenceSummary,
} from "../src/lib/registration-input";
import { parseScoresPayload, sessionAllowsAssessment } from "../src/lib/report-scores";
import { goalProgress, type GoalEntry } from "../src/lib/personal-goals";
import { supportChanges, summarizeLevelGroups } from "../src/lib/level-summary";
import { buildIndicatorConfig } from "../src/lib/indicators";
import { buildWeek, type Enrollment, type ReportLite } from "../src/lib/teaching-schedule";
import { computeAwards } from "../src/lib/milestones";
import { DEFAULT_MILESTONES } from "../src/lib/default-milestones";

// ---------- enrollment status flow ----------
test("only scheduled/active enrollments unlock reports, progress and records", () => {
  const statuses: EnrollmentStatus[] = [
    "pending_review",
    "waiting_schedule",
    "schedule_offered",
    "scheduled",
    "active",
    "cancelled",
    "rejected",
  ];
  assert.deepEqual(
    statuses.filter(hasClassAccess),
    ["scheduled", "active"]
  );
});

test("admin transitions follow the agreed flow", () => {
  assert.ok(adminCanMove("pending_review", "waiting_schedule"));
  assert.ok(adminCanMove("pending_review", "schedule_offered"));
  assert.ok(adminCanMove("waiting_schedule", "schedule_offered"));
  assert.ok(adminCanMove("schedule_offered", "waiting_schedule"));
  assert.ok(adminCanMove("scheduled", "active"));
  // rejected is only for requests that never became a class
  assert.ok(adminCanMove("pending_review", "rejected"));
  assert.ok(!adminCanMove("scheduled", "rejected"));
  assert.ok(!adminCanMove("active", "rejected"));
  // a slot is locked by the participant's approval, never by an admin click
  assert.ok(!adminCanMove("schedule_offered", "scheduled"));
  assert.ok(!adminCanMove("pending_review", "active"));
  // closed registrations stay closed
  assert.deepEqual(adminMoves("cancelled"), []);
  assert.deepEqual(adminMoves("rejected"), []);
});

test("participants may withdraw only before the class is running", () => {
  assert.ok(participantCanCancel("pending_review"));
  assert.ok(participantCanCancel("schedule_offered"));
  assert.ok(participantCanCancel("scheduled"));
  assert.ok(!participantCanCancel("active"));
  assert.ok(!participantCanCancel("cancelled"));
});

test("waiting for a schedule is explained politely, never as a rejection", () => {
  const copy = participantStatusCopy("waiting_schedule", "Adult Swim");
  assert.equal(copy.title, "Menunggu jadwal");
  assert.match(copy.body, /mencarikan jadwal/);
  assert.match(copy.body, /WhatsApp/);
});

test("capacity: a full slot has no seats, never negative", () => {
  assert.equal(remainingSeats(5, 3), 2);
  assert.equal(remainingSeats(5, 5), 0);
  assert.equal(remainingSeats(5, 7), 0);
});

test("answering an offer: accepted, full slot and expiry each get a clear message", () => {
  assert.equal(offerOutcomeMessage("accepted").ok, true);
  const full = offerOutcomeMessage("slot_full");
  assert.equal(full.ok, false);
  assert.match(full.message, /tetap tersimpan/);
  assert.match(offerOutcomeMessage("expired").message, /berakhir/);
  assert.equal(offerOutcomeMessage("declined").ok, true);
  assert.equal(offerOutcomeMessage("whatever").ok, false);
});

test("the page follows ?program=, otherwise the running class", () => {
  const list = [
    { program_id: "adult", status: "active" as const, created_at: "2026-01-01" },
    { program_id: "aqua", status: "waiting_schedule" as const, created_at: "2026-02-01" },
  ];
  assert.equal(pickEnrollment(list, "aqua")?.program_id, "aqua");
  assert.equal(pickEnrollment(list, undefined)?.program_id, "adult");
  assert.equal(pickEnrollment(list, "unknown")?.program_id, "adult");
  assert.equal(pickEnrollment([{ program_id: "x", status: "cancelled" as const }], undefined), null);
});

// ---------- WhatsApp copy ----------
test("admin notification matches the agreed format", () => {
  const msg = adminNewRegistrationMessage({
    program: "Aquanatal",
    name: "Sari",
    phone: "6281234567890",
    preferred: "Sabtu pagi · Kolam CDR",
    link: "https://slr.test/admin/pendaftar/kelas/abc",
  });
  const lines = msg.split("\n");
  assert.equal(lines[0], "Pendaftar baru — Aquanatal");
  assert.ok(lines.includes("Nama: Sari"));
  assert.ok(lines.includes("WhatsApp: 6281234567890"));
  assert.ok(lines.includes("Program: Aquanatal"));
  assert.ok(lines.includes("Pilihan jadwal/lokasi: Sabtu pagi · Kolam CDR"));
  assert.match(msg, /https:\/\/slr\.test\/admin\/pendaftar\/kelas\/abc/);
  // the schedule line is left out when nothing was chosen
  assert.ok(
    !adminNewRegistrationMessage({ program: "A", name: "B", phone: null, preferred: null, link: "x" }).includes(
      "Pilihan jadwal"
    )
  );
});

test("offer and confirmation messages carry program, day, time and location", () => {
  const slot = { day_of_week: 1, start_time: "15:00:00", location: "Kolam CDR" };
  const offer = scheduleOfferMessage({ name: "Sari", program: "Adult Swim", slot, link: "https://slr.test/jadwal/t" });
  assert.match(offer, /Program: Adult Swim/);
  assert.match(offer, /Jadwal: Senin · 15\.00/);
  assert.match(offer, /Lokasi: Kolam CDR/);
  assert.match(offer, /https:\/\/slr\.test\/jadwal\/t/);
  const done = scheduleConfirmedMessage({ program: "Adult Swim", slot });
  assert.match(done, /jadwal kelas Anda sudah dikonfirmasi/);
  assert.match(done, /Sampai bertemu di kelas!/);
});

// ---------- registration input ----------
const base = {
  full_name: "Andi Wijaya",
  email: "Andi@Example.com ",
  password: "rahasia123",
  phone: "0812-3456-7890",
  program_id: "p1",
};

test("adult registration is validated and normalised", () => {
  const ok = parseAdultRegistration({ ...base, acknowledged: "on" });
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.value.email, "andi@example.com");
  assert.equal(ok.value.phone, "6281234567890");
  assert.equal(ok.value.acknowledged, true);
  assert.ok(!parseAdultRegistration({ ...base, password: "short" }).ok);
  assert.ok(!parseAdultRegistration({ ...base, email: "not-an-email" }).ok);
  assert.ok(!parseAdultRegistration({ ...base, phone: "123" }).ok);
  assert.ok(!parseAdultRegistration({ ...base, program_id: "" }).ok);
  assert.ok(!parseAdultRegistration({ ...base, website: "http://spam" }).ok); // honeypot
});

test("phone numbers become international digits", () => {
  assert.equal(normalizePhone("081234567890"), "6281234567890");
  assert.equal(normalizePhone("+62 812-3456-7890"), "6281234567890");
  assert.equal(normalizePhone("812345678"), "62812345678");
  assert.equal(normalizePhone("12"), null);
  assert.equal(preferenceSummary("Sabtu pagi", ""), "Sabtu pagi");
  assert.equal(preferenceSummary("", ""), null);
  assert.ok(ACK_VERSION.length > 0);
});

// ---------- program templates ----------
test("each program type gets its own tabs, and only those", () => {
  const ids = (a: Parameters<typeof tabsFor>[0]) => tabsFor(a).map((t) => t.id);
  assert.deepEqual(ids({ assessment_type: "score_5", records_mode: "medals" }), ["laporan", "perkembangan", "record"]);
  assert.deepEqual(ids({ assessment_type: "support_level", records_mode: "personal_goals" }), [
    "laporan",
    "perkembangan",
    "target",
  ]);
  assert.deepEqual(ids({ assessment_type: "observation", records_mode: "none" }), ["catatan", "perjalanan"]);
  // Aquanatal never falls back to the Kids tabs
  const aqua = tabsFor({ assessment_type: "observation", records_mode: "none" });
  assert.equal(parseTab("record", aqua), "catatan");
  assert.equal(parseTab("perkembangan", aqua), "catatan");
});

test("program meta falls back to the star scale with medals when columns are missing", () => {
  const p = normalizeProgram({ id: "1", name: "Kids Swim" });
  assert.equal(p.assessment_type, "score_5");
  assert.equal(p.records_mode, "medals");
  assert.equal(normalizeProgram({ id: "2", name: "X", assessment_type: "nope", records_mode: "nope" }).assessment_type, "score_5");
});

test("only star programs use stars; the others have descriptive scales", () => {
  assert.equal(usesStars("score_5"), true);
  assert.equal(usesStars("support_level"), false);
  assert.equal(usesStars("observation"), false);
  assert.deepEqual(SUPPORT_LEVELS.map((l) => l.label), [
    "Belum diamati",
    "Dengan bantuan penuh",
    "Dengan bantuan sebagian",
    "Dengan isyarat minimal",
    "Mandiri",
  ]);
  assert.deepEqual(OBSERVATION_LEVELS.map((l) => l.label), [
    "Belum diamati",
    "Dilakukan nyaman",
    "Perlu penyesuaian",
    "Tidak dilakukan pada sesi ini",
  ]);
  assert.equal(levelLabel("support_level", 4), "Mandiri");
  assert.equal(levelLabel("observation", 3), "Tidak dilakukan pada sesi ini");
  assert.equal(reportTitle("observation"), "Catatan Sesi Aquanatal");
  assert.equal(cardLinks({ assessment_type: "observation" }).primaryTab, "catatan");
});

// ---------- report scores ----------
test("scores are clamped to the scale of the program", () => {
  const allowed = new Set(["a", "b", "c"]);
  const raw = JSON.stringify([
    { name: "a", score: 7 },
    { name: "b", score: 2.4 },
    { name: "c", score: -3 },
    { name: "forged", score: 5 },
  ]);
  assert.deepEqual(parseScoresPayload(raw, allowed, "score_5"), { a: 5, b: 2.5, c: 0 });
  // support levels are whole numbers 0..4
  assert.deepEqual(parseScoresPayload(raw, allowed, "support_level"), { a: 4, b: 2, c: 0 });
  // observations are whole numbers 0..3
  assert.deepEqual(parseScoresPayload(raw, allowed, "observation"), { a: 3, b: 2, c: 0 });
  assert.equal(maxScoreFor("observation"), 3);
  assert.deepEqual(parseScoresPayload("not json", allowed, "score_5"), {});
});

test("a missed session never carries an assessment", () => {
  assert.equal(sessionAllowsAssessment("hadir"), true);
  assert.equal(sessionAllowsAssessment("izin"), false);
  assert.equal(sessionAllowsAssessment("sakit"), false);
});

// ---------- program separation ----------
test("the same person's Adult Swim and Aquanatal sessions and reports stay apart", () => {
  const slot = (id: string, day: number, program_id: string, program: string) => ({
    id,
    label: null,
    location: null,
    day_of_week: day,
    start_time: "09:00:00",
    program_id,
    program,
  });
  const andi = { id: "andi", full_name: "Andi" };
  const enrollments: Enrollment[] = [
    { student: andi, slot: slot("s-adult", 1, "p-adult", "Teen & Adult Swim") },
    { student: andi, slot: slot("s-aqua", 1, "p-aqua", "Aquanatal") }, // same day, same person
  ];
  // only the Adult Swim session of that day has a report
  const reports: ReportLite[] = [
    { student_id: "andi", program_id: "p-adult", session_date: "2026-09-21", attendance: "hadir", next_focus: "Napas" },
  ];
  const day = buildWeek(enrollments, reports, new Date(2026, 8, 20), "2026-09-21")[1];
  assert.equal(day.items.length, 2);
  const byProgram = Object.fromEntries(day.items.map((i) => [i.program, i.students[0]]));
  assert.equal(byProgram["Teen & Adult Swim"].status, "tersimpan");
  assert.equal(byProgram["Teen & Adult Swim"].focus, "Napas");
  assert.equal(byProgram["Aquanatal"].status, "belum");
  assert.equal(byProgram["Aquanatal"].focus, null);
  assert.equal(byProgram["Aquanatal"].hasReport, false);
  assert.equal(day.pending, 1);
});

test("medal milestones are judged inside their own program", () => {
  const kids = DEFAULT_MILESTONES.map((m) => ({ ...m, program_id: "p-kids" }));
  const adult = [{ ...DEFAULT_MILESTONES[0], id: "adult:nafas", program_id: "p-adult", bronze: 10, silver: 20, gold: 30 }];
  const record = { metric_type: "tahan_nafas" as const, stroke: null, distance_m: null, duration_seconds: 8 };
  // Kids targets: 8 seconds is gold; Adult targets: 8 seconds is nothing
  assert.deepEqual(computeAwards(record, kids), { "seed:tahan-nafas": "gold" });
  assert.deepEqual(computeAwards(record, adult), {});
});

// ---------- personal goals (Adaptive Swim) ----------
const goal = { baseline: 3, target: 10 };
const entry = (id: string, value: number, recorded_at: string): GoalEntry => ({ id, goal_id: "g", value, recorded_at });

test("personal goals are read against the participant's own baseline and target", () => {
  assert.equal(goalProgress(goal, []).standing, "no_data");
  assert.equal(goalProgress(goal, [entry("1", 3, "2026-09-01")]).standing, "in_progress");
  assert.equal(goalProgress(goal, [entry("1", 5, "2026-09-01")]).standing, "above_baseline");
  assert.equal(
    goalProgress(goal, [entry("1", 5, "2026-09-01"), entry("2", 7, "2026-09-08")]).standing,
    "personal_best"
  );
  assert.equal(
    goalProgress(goal, [entry("1", 7, "2026-09-01"), entry("2", 6, "2026-09-08")]).standing,
    "above_baseline" // latest below best: no "personal best" claim
  );
  const reached = goalProgress(goal, [entry("1", 5, "2026-09-01"), entry("2", 10, "2026-09-08")]);
  assert.equal(reached.standing, "target_reached");
  assert.equal(reached.label, "Target pribadi tercapai");
  assert.equal(reached.best, 10);
});

// ---------- support levels + observations for parents ----------
const groups = [
  { id: "g1", name: "Buoyancy & Keseimbangan", sort_order: 1, active: true },
  { id: "g2", name: "Komunikasi & Kemandirian", sort_order: 2, active: true },
];
const indicators = [
  { id: "1", key: "k1", label: "Mengapung", group_id: "g1", sort_order: 1, active: true },
  { id: "2", key: "k2", label: "Merespons isyarat", group_id: "g2", sort_order: 1, active: true },
];
const config = buildIndicatorConfig(groups, indicators);

test("support level summary lists descriptions, never a score or average", () => {
  const summary = summarizeLevelGroups({ k1: 2, k2: 0 }, null, config, "support_level");
  assert.equal(summary[0].status, "diamati");
  assert.equal(summary[0].items[0].levelText, "Dengan bantuan sebagian");
  assert.equal(summary[1].status, "belum_diamati");
  assert.ok(!("average" in summary[0]));
});

test("independence is read as the change from the first to the latest observation", () => {
  const reports = [
    { scores: { k1: 3 }, attendance: "hadir" },
    { scores: { k1: 0, k2: 2 }, attendance: "hadir" }, // not observed this time
    { scores: { k1: 1 }, attendance: "hadir" },
    { scores: { k1: 4 }, attendance: "izin" }, // missed session is ignored
  ];
  const changes = supportChanges(reports, config, "support_level");
  const mengapung = changes.find((c) => c.key === "k1")!;
  assert.equal(mengapung.first, 1);
  assert.equal(mengapung.latest, 3);
  assert.equal(mengapung.moreIndependent, true);
  assert.equal(mengapung.firstText, "Dengan bantuan penuh");
  const respons = changes.find((c) => c.key === "k2")!;
  assert.equal(respons.moreIndependent, false);
});
