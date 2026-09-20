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
  checkRequestAgainstProgram,
  normalizePhone,
  parseAccountInput,
  parseChildRequest,
  parseEnrollmentRequest,
  preferenceSummary,
  programSuitsGender,
  unsuitableProgramMessage,
} from "../src/lib/registration-input";
import { billingNote, type EnrollmentBilling, type InvoiceSummary } from "../src/lib/billing";
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
  assert.ok(!msg.includes("Didaftarkan oleh"));
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
const account = {
  full_name: "Andi Wijaya",
  email: "Andi@Example.com ",
  password: "rahasia123",
  phone: "0812-3456-7890",
};

test("the account (the person filling the form) is validated and normalised", () => {
  const ok = parseAccountInput(account);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.value.email, "andi@example.com");
  assert.equal(ok.value.phone, "6281234567890");
  assert.ok(!parseAccountInput({ ...account, password: "short" }).ok);
  assert.ok(!parseAccountInput({ ...account, email: "not-an-email" }).ok);
  assert.ok(!parseAccountInput({ ...account, phone: "123" }).ok);
  assert.ok(!parseAccountInput({ ...account, website: "http://spam" }).ok); // honeypot
});

const self = { for: "self", program_id: "p1" };
const spouse = {
  for: "other",
  program_id: "p-aqua",
  participant_name: "Sari Wijaya",
  participant_phone: "0857-1111-2222",
  gender: "female",
  relationship: "Pasangan",
  acknowledged: "on",
};

test("a request needs someone to take the class and a chosen program", () => {
  assert.ok(parseEnrollmentRequest(self).ok);
  assert.ok(!parseEnrollmentRequest({ program_id: "p1" }).ok); // nobody chosen
  assert.ok(!parseEnrollmentRequest({ for: "self", program_id: "" }).ok); // no program
  assert.match(String((parseEnrollmentRequest({ for: "self" }) as { error: string }).error), /program/i);
  assert.ok(!parseEnrollmentRequest({ ...self, gender: "robot" }).ok);
  assert.ok(!parseEnrollmentRequest({ ...self, birth_date: "31-12-1990" }).ok);
});

test("registering someone else needs their own name, WhatsApp, gender and relationship", () => {
  const ok = parseEnrollmentRequest(spouse);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.value.participant_name, "Sari Wijaya");
  assert.equal(ok.value.participant_phone, "6285711112222");
  assert.equal(ok.value.gender, "female");
  assert.equal(ok.value.acknowledged, true);
  assert.ok(!parseEnrollmentRequest({ ...spouse, participant_name: "" }).ok);
  assert.ok(!parseEnrollmentRequest({ ...spouse, participant_phone: "12" }).ok);
  assert.ok(!parseEnrollmentRequest({ ...spouse, relationship: "" }).ok);
  assert.ok(!parseEnrollmentRequest({ ...spouse, gender: "" }).ok);
});

test("staying in the family account cannot demand a participant-only payer or report view", () => {
  const ok = parseEnrollmentRequest({ ...spouse, account_mode: "family", billing: "requester", report_access: "family" });
  assert.ok(ok.ok);
  assert.ok(!parseEnrollmentRequest({ ...spouse, account_mode: "family", billing: "participant" }).ok);
  assert.ok(!parseEnrollmentRequest({ ...spouse, account_mode: "family", report_access: "participant" }).ok);
  // with an invited account both are possible
  const own = parseEnrollmentRequest({ ...spouse, account_mode: "own", billing: "participant", report_access: "participant" });
  assert.ok(own.ok);
  if (own.ok) assert.deepEqual([own.value.account_mode, own.value.billing, own.value.report_access], ["own", "participant", "participant"]);
  assert.ok(!parseEnrollmentRequest({ ...spouse, account_mode: "bogus" }).ok);
  // registering yourself never carries a payer or access choice
  const me = parseEnrollmentRequest({ for: "self", program_id: "p1", account_mode: "family", billing: "participant" });
  assert.ok(me.ok);
  if (me.ok) assert.deepEqual([me.value.account_mode, me.value.billing], ["own", "requester"]);
});

test("a child is registered from an existing child or a new one, always into a slot", () => {
  const newChild = parseChildRequest({ child_id: "new", child_name: "Adik", program_id: "kids", slot_id: "s1" });
  assert.ok(newChild.ok);
  if (newChild.ok) assert.deepEqual([newChild.value.child_id, newChild.value.child_name], ["", "Adik"]);
  const existing = parseChildRequest({ child_id: "c-1", program_id: "kids", slot_id: "s1" });
  assert.ok(existing.ok);
  if (existing.ok) assert.equal(existing.value.child_id, "c-1");
  assert.ok(!parseChildRequest({ program_id: "kids", slot_id: "s1" }).ok); // nobody chosen
  assert.ok(!parseChildRequest({ child_id: "new", child_name: "", program_id: "kids", slot_id: "s1" }).ok);
  assert.ok(!parseChildRequest({ child_id: "c-1", program_id: "", slot_id: "s1" }).ok);
  assert.ok(!parseChildRequest({ child_id: "c-1", program_id: "kids", slot_id: "" }).ok);
});

test("a participant whose invoices someone else pays sees who pays and the status, nothing more", () => {
  const billing = (o: Partial<EnrollmentBilling>): EnrollmentBilling => ({
    enrollment_id: "e1",
    student_id: "s1",
    payer_name: "Budi",
    is_payer: false,
    payer_pending: false,
    ...o,
  });
  const inv = (status: InvoiceSummary["status"]): InvoiceSummary => ({
    invoice_id: null,
    student_id: "s1",
    enrollment_id: "e1",
    status,
    sessions_count: 4,
    package_name: "Aquanatal 4",
    created_at: "2026-09-01",
    is_payer: false,
  });
  assert.deepEqual(billingNote(billing({}), [inv("sent")]), { line: "Tagihan dikelola oleh Budi", status: "Menunggu pembayaran" });
  assert.equal(billingNote(billing({}), [inv("paid")])?.status, "Lunas");
  assert.equal(billingNote(billing({}), [])?.status, null);
  // the payer sees the invoice itself, not a note
  assert.equal(billingNote(billing({ is_payer: true }), [inv("sent")]), null);
  assert.equal(billingNote(undefined, []), null);
  assert.match(String(billingNote(billing({ payer_name: null, payer_pending: true }), [])?.line), /peserta/i);
});

test("gender is a hint for the program, never the only eligibility rule", () => {
  assert.equal(programSuitsGender("female", "female"), true);
  assert.equal(programSuitsGender("female", "male"), false);
  assert.equal(programSuitsGender("female", "undisclosed"), true); // goes to admin review
  assert.equal(programSuitsGender("female", null), true);
  assert.equal(programSuitsGender(null, "male"), true); // programs without a target accept anyone
});

test("Aquanatal for a man registering himself is refused with guidance", () => {
  const aqua = {
    name: "Aquanatal",
    active: true,
    self_registration: true,
    requires_acknowledgement: true,
    intended_gender: "female" as const,
  };
  const msg = checkRequestAgainstProgram(aqua, { for: "self", gender: "male", acknowledged: true });
  assert.equal(
    msg,
    "Aquanatal ditujukan untuk peserta hamil. Jika Anda mendaftarkan pasangan, pilih “Pasangan / anggota keluarga”."
  );
  assert.equal(msg, unsuitableProgramMessage("Aquanatal", "self"));
  // the husband registering his wife is fine, but needs the acknowledgement
  assert.equal(checkRequestAgainstProgram(aqua, { for: "other", gender: "female", acknowledged: true }), null);
  assert.match(
    String(checkRequestAgainstProgram(aqua, { for: "other", gender: "female", acknowledged: false })),
    /setujui/
  );
  // a program that is closed or unknown is never accepted
  assert.ok(checkRequestAgainstProgram(null, { for: "self", gender: null, acknowledged: true }));
  assert.ok(checkRequestAgainstProgram({ ...aqua, active: false }, { for: "other", gender: "female", acknowledged: true }));
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

// ---------- card wording + record summary ----------
import { firstNameOf } from "../src/lib/programs";
import { summarizeRecordUnlock } from "../src/lib/record-summary";
import type { PerformanceRecordRow } from "../src/lib/performance";

const kidsProgram = { assessment_type: "score_5" as const };
const collectCopy = (l: ReturnType<typeof cardLinks>) =>
  [l.primaryLabel, l.emptyPrimaryLabel, l.latestLabel, l.emptyTitle, l.emptyBody, ...l.secondary.map((s) => s.label)].join(" | ");

test("an adult participant is never called 'anak' on their own card", () => {
  const self = cardLinks(kidsProgram, { isSelf: true, firstName: "Andi" });
  assert.equal(self.primaryLabel, "Lihat laporan terakhir");
  assert.equal(self.emptyPrimaryLabel, "Lihat Detail Kelas");
  assert.deepEqual(self.secondary.map((s) => s.label), ["Perkembangan Saya"]);
  assert.equal(self.emptyTitle, "Belum ada laporan latihan");
  assert.equal(self.emptyBody, "Laporan akan muncul di sini setelah sesi latihan pertama.");
  assert.ok(!/anak/i.test(collectCopy(self)));
  const aqua = cardLinks({ assessment_type: "observation" }, { isSelf: true, firstName: "Andi" });
  assert.ok(!/anak/i.test(collectCopy(aqua)));
});

test("a child's card names the child so the parent knows which one opens", () => {
  const rara = cardLinks(kidsProgram, { isSelf: false, firstName: firstNameOf("Rara Putri") });
  assert.equal(rara.primaryLabel, "Lihat Laporan Rara");
  assert.deepEqual(rara.secondary.map((s) => s.label), ["Perkembangan Rara"]);
  assert.equal(rara.emptyPrimaryLabel, "Lihat Detail Rara");
  assert.ok(!/anak/i.test(collectCopy(rara)));
  assert.equal(firstNameOf("  Artanabil Syauqi Aflah "), "Artanabil");
});

const adultMilestones = DEFAULT_MILESTONES.map((m) => ({ ...m, program_id: "p-adult" }));
const adultRecord = (over: Partial<PerformanceRecordRow>): PerformanceRecordRow => {
  const r = {
    id: Math.random().toString(36).slice(2),
    metric_type: "tahan_nafas" as const,
    stroke: null,
    distance_m: null,
    duration_seconds: null,
    recorded_at: "2026-09-01",
    ...over,
  };
  return { ...r, awards: computeAwards(r, adultMilestones) };
};

test("record summary: nothing unlocked shows a first target, not a negative status", () => {
  const s = summarizeRecordUnlock([], adultMilestones)!;
  assert.equal(s.unlocked, 0);
  assert.equal(s.total, 14);
  assert.equal(s.top, null);
  assert.deepEqual(s.first, { tier: "bronze", label: "Tahan Nafas Terkontrol", valueText: "3 detik" });
});

test("record summary: shows the highest medal, in its own tier", () => {
  const bronze = summarizeRecordUnlock([adultRecord({ duration_seconds: 3 })], adultMilestones)!;
  assert.equal(bronze.top?.tier, "bronze");
  assert.equal(bronze.first, null);
  assert.equal(bronze.unlocked, 1);

  const silver = summarizeRecordUnlock(
    [
      adultRecord({ duration_seconds: 3 }),
      adultRecord({ metric_type: "treading_water", duration_seconds: 35 }),
      adultRecord({ metric_type: "mengapung_telentang", duration_seconds: 5 }),
    ],
    adultMilestones
  )!;
  assert.equal(silver.top?.tier, "silver");
  assert.equal(silver.top?.label, "Treading Water");
  assert.equal(silver.top?.valueText, "35 detik");
  assert.equal(silver.unlocked, 3);
  assert.equal(silver.total, 14);

  const gold = summarizeRecordUnlock(
    [adultRecord({ duration_seconds: 9 }), adultRecord({ metric_type: "treading_water", duration_seconds: 35 })],
    adultMilestones
  )!;
  assert.equal(gold.top?.tier, "gold");
  assert.equal(gold.top?.label, "Tahan Nafas Terkontrol");
});

test("record summary is hidden when the admin has not configured milestones", () => {
  assert.equal(summarizeRecordUnlock([], []), null);
  assert.equal(summarizeRecordUnlock([], adultMilestones.map((m) => ({ ...m, active: false }))), null);
});

test("Aquanatal never shows records, and a pending class shows no class sections", () => {
  // no record / progress tab exists for the observation type
  const ids = tabsFor({ assessment_type: "observation", records_mode: "none" }).map((t) => t.id);
  assert.ok(!ids.includes("record"));
  // waiting_schedule has no class access, so the card renders the status card only
  assert.equal(hasClassAccess("waiting_schedule"), false);
  assert.equal(hasClassAccess("pending_review"), false);
  assert.equal(hasClassAccess("schedule_offered"), false);
});
