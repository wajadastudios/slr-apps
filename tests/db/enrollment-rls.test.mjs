import { boot } from "./boot.mjs";
import fs from "node:fs";
import path from "node:path";

const results = [];
const check = (name, ok, extra = "") => {
  results.push([ok, name, extra]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + extra}`);
};

const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = uid(1), PA = uid(2), PB = uid(3), P1 = uid(4), P2 = uid(5), ANDI = uid(6), HUS = uid(7), WIFE = uid(8);

// boot up to 0029 (pre-feature state), add legacy data, then apply 0030..0033
const { pg: db, failures } = await boot({ upTo: "0029" });
if (failures.length) console.log("early failures", failures);

await db.exec(`
  insert into public.programs (name, skill_template, active) values
   ('Kids Swim', '["Dasar - Adaptasi di Air","Gaya Bebas - Gerakan Kaki"]'::jsonb, true),
   ('Teen & Adult Swim', '["Teknik - Lama"]'::jsonb, true),
   ('Adaptive Swim', '[]'::jsonb, false),
   ('Aquanatal', '["Nyaman"]'::jsonb, true),
   ('Baby Swim', '[]'::jsonb, true);
  insert into auth.users (id, email, raw_user_meta_data) values
   ('${ADMIN}','admin@t.co','{"role":"admin","full_name":"Admin"}'),
   ('${PA}','pa@t.co','{"role":"pelatih","full_name":"Pelatih A"}'),
   ('${PB}','pb@t.co','{"role":"pelatih","full_name":"Pelatih B"}'),
   ('${P1}','p1@t.co','{"role":"ortu","full_name":"Mama Rara"}'),
   ('${P2}','p2@t.co','{"role":"ortu","full_name":"Mama Lain"}'),
   ('${ANDI}','andi@t.co','{"role":"ortu","full_name":"Andi Wijaya"}'),
   ('${HUS}','hus@t.co','{"role":"ortu","full_name":"Budi Suami"}'),
   ('${WIFE}','wife@t.co','{"role":"ortu","full_name":"Sari Istri"}');
`);
const prog = async (name) => (await db.query("select id from public.programs where name=$1", [name])).rows[0].id;
const KIDS = await prog("Kids Swim"), ADULT = await prog("Teen & Adult Swim"), AQUA = await prog("Aquanatal"), ADAPT = await prog("Adaptive Swim");

// legacy child + slot + report + record
await db.exec(`
  insert into public.students (id, full_name, parent_id, program_id) values ('${uid(100)}','Rara','${P1}','${KIDS}');
  insert into public.class_slots (id, program_id, pelatih_id, label, day_of_week, start_time, capacity) values
    ('${uid(200)}','${KIDS}','${PA}','Private',1,'15:00',1);
  insert into public.schedules (student_id, slot_id) values ('${uid(100)}','${uid(200)}');
  insert into public.progress_reports (id, student_id, pelatih_id, session_date, attendance, scores)
    values ('${uid(300)}','${uid(100)}','${PA}','2026-09-01','hadir','{"Dasar - Adaptasi di Air":3}'::jsonb);
  insert into public.performance_records (id, student_id, pelatih_id, metric_type, duration_seconds)
    values ('${uid(400)}','${uid(100)}','${PA}','tahan_nafas',6);
`);

// now the feature migrations
const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
const apply = async (f) => {
  try {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  } catch (e) {
    console.log("MIGRATION FAILED", f, e.message);
    process.exit(1);
  }
};
for (const f of fs.readdirSync(dir).filter((f) => f >= "0030" && f <= "0034_z" && f.endsWith(".sql")).sort()) {
  await apply(f);
  console.log("applied", f);
}
// re-run the earlier ones to prove idempotence (before 0035 supersedes 0034's functions)
await apply("0033_enrollments_and_program_assessment.sql");
check("0033 is safe to re-run", true);
await apply("0034_participants_and_consent.sql");
check("0034 is safe to re-run", true);
for (const f of fs.readdirSync(dir).filter((f) => f >= "0035" && f.endsWith(".sql")).sort()) {
  await apply(f);
  console.log("applied", f);
  await apply(f);
  check(`${f} is safe to re-run`, true);
}

const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (id) => {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false), set_config('request.jwt.claim.role','authenticated',false);`);
};
const anon = async () => {
  await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','anon',false);`);
};
const su = async () => db.exec("reset role");
const fails = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return String(e.message);
  }
};

// ---------- backfill ----------
await su();
const rara = (await q("select * from public.enrollments where student_id=$1", [uid(100)]))[0];
check("legacy child got an ACTIVE legacy enrollment with its slot", rara?.status === "active" && rara.source === "legacy" && rara.slot_id === uid(200), JSON.stringify(rara));
const rep = (await q("select enrollment_id, program_id, assessment_type from public.progress_reports where id=$1", [uid(300)]))[0];
check("old report is linked to the enrollment/program (score_5)", rep.enrollment_id === rara.id && rep.program_id === KIDS && rep.assessment_type === "score_5", JSON.stringify(rep));
const rec = (await q("select enrollment_id, program_id from public.performance_records where id=$1", [uid(400)]))[0];
check("old record is linked to the enrollment/program", rec.enrollment_id === rara.id && rec.program_id === KIDS);

// ---------- programs / templates / milestones ----------
const meta = Object.fromEntries((await q("select name, assessment_type, records_mode, self_registration, requires_acknowledgement from public.programs")).map((r) => [r.name, r]));
check("Kids: score_5 + medals", meta["Kids Swim"].assessment_type === "score_5" && meta["Kids Swim"].records_mode === "medals");
check("Adaptive: support_level + personal_goals", meta["Adaptive Swim"].assessment_type === "support_level" && meta["Adaptive Swim"].records_mode === "personal_goals");
check("Aquanatal: observation + none + acknowledgement", meta["Aquanatal"].assessment_type === "observation" && meta["Aquanatal"].records_mode === "none" && meta["Aquanatal"].requires_acknowledgement);
check("Adult + Aquanatal are open for self registration, Adaptive is not", meta["Teen & Adult Swim"].self_registration && meta["Aquanatal"].self_registration && !meta["Adaptive Swim"].self_registration);
const groupsOf = async (pid) => (await q("select name from public.indicator_groups where program_id=$1 and active order by sort_order", [pid])).map((r) => r.name);
check("Adult groups", JSON.stringify(await groupsOf(ADULT)) === JSON.stringify(["Water Confidence", "Independent Swimming", "Technique", "Stamina & Water Safety"]), JSON.stringify(await groupsOf(ADULT)));
check("Adaptive groups (6)", (await groupsOf(ADAPT)).length === 6 && (await groupsOf(ADAPT))[0] === "Kenyamanan & Regulasi di Air");
check("Aquanatal groups (5)", (await groupsOf(AQUA)).length === 5);
check("Kids groups untouched (6)", (await groupsOf(KIDS)).length === 6, JSON.stringify(await groupsOf(KIDS)));
check("old Adult flat config archived, not deleted", (await q("select count(*)::int c from public.indicators where program_id=$1 and not active and key not like 'tpl\\_%'", [ADULT]))[0].c >= 1);
const ms = await q("select program_id, count(*)::int c from public.milestones group by program_id");
check("14 Kids milestones + 6 Adult milestones, none unassigned", ms.find((m) => m.program_id === KIDS)?.c === 14 && ms.find((m) => m.program_id === ADULT)?.c === 6 && ms.length === 2, JSON.stringify(ms));
const snap = (await q("select indicator_snapshot from public.progress_reports where id=$1", [uid(300)]))[0].indicator_snapshot;
check("old report got an indicator snapshot from the 0030 backfill", snap && snap["Dasar - Adaptasi di Air"]?.label === "Adaptasi di Air", JSON.stringify(snap));

// ---------- adult registration ----------
await as(ANDI);
// register_enrollment(program, for, name, phone, birth, gender, relationship, schedule, location, ack)
const regFull = (pid, ack, who = "self", o = {}) =>
  db.query(
    "select out_enrollment_id id, out_student_id student_id, out_claim_token token from public.register_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [pid, who, o.name ?? null, o.phone ?? null, o.birth ?? null, o.gender ?? null, o.rel ?? null, "Sabtu pagi", "Kolam CDR", ack]
  );
const reg = (pid, ack) => regFull(pid, ack);
const adultId = (await reg(ADULT, "")).rows[0].id;
check("adult registration creates a pending_review enrollment", !!adultId);
let e = (await q("select status, source, acknowledged_at from public.enrollments where id=$1", [adultId]))[0];
check("status pending_review, self_registered", e.status === "pending_review" && e.source === "self_registered");
check("no schedule and no class access yet", (await q("select count(*)::int c from public.schedules where student_id in (select id from public.students where parent_id=$1)", [ANDI]))[0].c === 0);
check("Aquanatal without acknowledgement is refused", /acknowledgement required/.test((await fails(() => reg(AQUA, ""))) ?? ""));
check("Adaptive (not self-registrable) is refused", /not open/.test((await fails(() => reg(ADAPT, ""))) ?? ""));
const aquaId = (await reg(AQUA, "aquanatal-2026-09")).rows[0].id;
e = (await q("select status, acknowledged_at, acknowledgement_version from public.enrollments where id=$1", [aquaId]))[0];
check("Aquanatal enrollment is separate and stores the acknowledgement", e.status === "pending_review" && !!e.acknowledged_at && e.acknowledgement_version === "aquanatal-2026-09");
check("duplicate live enrollment is refused", /already enrolled/.test((await fails(() => reg(ADULT, ""))) ?? ""));
const students = await q("select id, is_self, program_id from public.students where parent_id=$1", [ANDI]);
check("one participant row for the account, both enrollments hang on it", students.length === 1 && students[0].is_self && (await q("select count(*)::int c from public.enrollments where student_id=$1", [students[0].id]))[0].c === 2);
const andiStudent = students[0].id;

// pre-class: participant reads only their own
await as(ANDI);
check("participant sees only their own two enrollments", (await q("select id from public.enrollments")).length === 2);
await as(P2);
check("another parent sees none of them", (await q("select id from public.enrollments")).length === 0);
await as(P1);
check("parent sees only their child enrollment", (await q("select id from public.enrollments")).length === 1);

// ---------- offers + atomic capacity ----------
await su();
await db.exec(`
  insert into public.class_slots (id, program_id, pelatih_id, label, day_of_week, start_time, capacity, location) values
   ('${uid(201)}','${ADULT}','${PA}','Grup',2,'09:00',1,'Kolam CDR'),
   ('${uid(202)}','${ADULT}','${PA}','Grup',3,'09:00',2,'Kolam CDR'),
   ('${uid(203)}','${AQUA}','${PB}','Grup',4,'09:00',5,'Kolam CDR');
  insert into public.students (id, full_name, parent_id) values ('${uid(101)}','Peserta Lain','${P2}');
`);
await as(ADMIN);
await db.query("update public.enrollments set status='schedule_offered', offered_slot_id=$1, offer_token='tok-full', offer_expires_at=now()+interval '3 days' where id=$2", [uid(201), adultId]);
// somebody else takes the last seat before the participant answers
await db.query("insert into public.schedules (student_id, slot_id) values ($1,$2)", [uid(101), uid(201)]);
await anon();
const offer = await q("select * from public.get_schedule_offer('tok-full')");
check("public offer page can read its own token only", offer.length === 1 && offer[0].program_name === "Teen & Adult Swim" && offer[0].participant_name === "Andi", JSON.stringify(offer));
check("unknown token shows nothing", (await q("select * from public.get_schedule_offer('nope')")).length === 0);
check("anon cannot read enrollments directly", (await q("select id from public.enrollments")).length === 0);
const full = (await q("select public.respond_schedule_offer_by_token('tok-full', true) r"))[0].r;
check("approving a slot that filled up -> slot_full", full === "slot_full", full);
await su();
e = (await q("select status, slot_id, offered_slot_id, offer_token from public.enrollments where id=$1", [adultId]))[0];
check("enrollment falls back to waiting_schedule, token cleared, NOT active", e.status === "waiting_schedule" && !e.slot_id && !e.offered_slot_id && !e.offer_token, JSON.stringify(e));
check("no seat was taken", (await q("select count(*)::int c from public.schedules where student_id=$1", [andiStudent]))[0].c === 0);

await as(ADMIN);
await db.query("update public.enrollments set status='schedule_offered', offered_slot_id=$1, offer_token='tok-ok', offer_expires_at=now()+interval '3 days' where id=$2", [uid(202), adultId]);
await as(P2);
check("another parent cannot answer this offer", (await q("select public.respond_schedule_offer_for_me($1,true) r", [adultId]))[0].r === "not_found");
await as(ANDI);
const ok = (await q("select public.respond_schedule_offer_for_me($1,true) r", [adultId]))[0].r;
check("approving a slot with room -> accepted", ok === "accepted", ok);
await su();
e = (await q("select status, slot_id, offer_token from public.enrollments where id=$1", [adultId]))[0];
check("status scheduled, slot locked, token cleared", e.status === "scheduled" && e.slot_id === uid(202) && !e.offer_token, JSON.stringify(e));
check("the answer is single-use (replay refused)", ["not_pending", "not_found"].includes((await q("select public.respond_schedule_offer_by_token('tok-ok', true) r"))[0].r));
check("Aquanatal enrollment untouched by the Adult Swim flow", (await q("select status from public.enrollments where id=$1", [aquaId]))[0].status === "pending_review");

// expiry
await as(ADMIN);
await db.query("update public.enrollments set status='schedule_offered', offered_slot_id=$1, offer_token='tok-old', offer_expires_at=now()-interval '1 day' where id=$2", [uid(203), aquaId]);
await anon();
check("an expired offer is refused", (await q("select public.respond_schedule_offer_by_token('tok-old', true) r"))[0].r === "expired");
await su();
check("expired offer returns to waiting_schedule", (await q("select status from public.enrollments where id=$1", [aquaId]))[0].status === "waiting_schedule");

// old admin flow (assign schedule) moves waiting -> scheduled
await as(ADMIN);
await db.query("insert into public.schedules (student_id, slot_id) values ($1,$2)", [andiStudent, uid(203)]);
await su();
check("assigning a schedule the old way moves a waiting enrollment to scheduled", (await q("select status from public.enrollments where id=$1", [aquaId]))[0].status === "scheduled");

// ---------- reports: assignment + program separation ----------
const insertReport = (id, enrollment, scores = "{}") =>
  db.query("insert into public.progress_reports (id, student_id, enrollment_id, pelatih_id, session_date, attendance, scores) values ($1,$2,$3,current_setting('request.jwt.claim.sub')::uuid,'2026-09-20','hadir',$4::jsonb)", [id, andiStudent, enrollment, scores]);
const insertReportFor = (student, enrollment, id) =>
  db.query("insert into public.progress_reports (id, student_id, enrollment_id, pelatih_id, session_date, attendance, scores) values ($1,$2,$3,current_setting('request.jwt.claim.sub')::uuid,'2026-09-22','hadir','{}'::jsonb)", [id, student, enrollment]);
await as(PA);
await insertReport(uid(310), adultId, '{"tpl_ta_tk_kaki":3}');
check("assigned pelatih can write the Adult Swim report", true);
check("program_id is filled from the enrollment", (await q("select program_id from public.progress_reports where id=$1", [uid(310)]))[0].program_id === ADULT);
check("pelatih A cannot write the Aquanatal report (assigned to pelatih B)", (await fails(() => insertReport(uid(311), aquaId))) !== null);
check("pelatih A cannot pass an enrollment of another participant", (await fails(() => db.query("insert into public.progress_reports (student_id, enrollment_id, pelatih_id, session_date, attendance) values ($1,$2,current_setting('request.jwt.claim.sub')::uuid,'2026-09-20','hadir')", [uid(100), adultId]))) !== null);
await as(PB);
await insertReport(uid(312), aquaId, '{"tpl_aq_kb_nyaman":1}');
check("pelatih B can write the Aquanatal note", true);
check("pelatih B cannot write the Adult Swim report", (await fails(() => insertReport(uid(313), adultId))) !== null);
await as(PA);
const seenA = (await q("select id from public.progress_reports where student_id=$1", [andiStudent])).map((r) => r.id);
await as(PB);
const seenB = (await q("select id from public.progress_reports where student_id=$1", [andiStudent])).map((r) => r.id);
check("pelatih A only sees the Adult Swim report", JSON.stringify(seenA) === JSON.stringify([uid(310)]), JSON.stringify(seenA));
check("pelatih B only sees the Aquanatal report", JSON.stringify(seenB) === JSON.stringify([uid(312)]), JSON.stringify(seenB));
await as(PA);
const mineA = await q("select program_id from public.pelatih_enrollments() where student_id=$1", [andiStudent]);
check("pelatih_enrollments() lists only the enrollment assigned to that pelatih", mineA.length === 1 && mineA[0].program_id === ADULT, JSON.stringify(mineA));
await as(PB);
const mineB = await q("select program_id from public.pelatih_enrollments()");
check("pelatih B list has only Aquanatal", mineB.length === 1 && mineB[0].program_id === AQUA, JSON.stringify(mineB));
await as(PA);
check("pelatih cannot read enrollments directly (tokens/notes stay private)", (await q("select id from public.enrollments")).length === 0);

await su();
await db.exec(`update public.enrollments set status='waiting_schedule' where id='${aquaId}'`);
await as(PB);
check("no new report while the enrollment is not scheduled/active", (await fails(() => insertReport(uid(314), aquaId))) !== null);
await su();
await db.exec(`update public.enrollments set status='scheduled' where id='${aquaId}'`);

await as(ANDI);
check("participant sees both their reports (the pages separate them by enrollment)", (await q("select id from public.progress_reports")).length === 2);
await as(P2);
check("another parent sees no reports of this participant", (await q("select id from public.progress_reports where student_id=$1", [andiStudent])).length === 0);

// ---------- milestones ----------
await as(PA);
check("pelatih cannot insert milestones", (await fails(() => db.query("insert into public.milestones (program_id,label,level,metric_type,bronze,silver,gold) values ($1,'x','Dasar','tahan_nafas',1,2,3)", [ADULT]))) !== null);
await db.exec("update public.milestones set bronze = 1");
check("pelatih cannot change milestones (no row is touched)", (await (async () => { await su(); return q("select count(*)::int c from public.milestones where bronze=1"); })())[0].c === 0);
await as(ADMIN);
await db.query("insert into public.milestones (program_id,label,level,metric_type,bronze,silver,gold) values ($1,'x','Dasar','tahan_nafas',1,2,3)", [ADULT]);
check("admin manages milestones", true);

// ---------- personal goals (adaptive) ----------
await su();
await db.exec(`
  insert into public.class_slots (id, program_id, pelatih_id, label, day_of_week, start_time, capacity) values ('${uid(204)}','${ADAPT}','${PA}','Private',5,'10:00',1);
  insert into public.students (id, full_name, parent_id, program_id) values ('${uid(102)}','Dio','${P2}','${ADAPT}');
  insert into public.schedules (student_id, slot_id) values ('${uid(102)}','${uid(204)}');
`);
const dioEnr = (await q("select id from public.enrollments where student_id=$1", [uid(102)]))[0].id;
await as(PA);
await db.query("insert into public.personal_goals (enrollment_id,label,unit,baseline,target) values ($1,'Mengapung','detik',3,10)", [dioEnr]);
check("assigned pelatih sets a personal goal", true);
await as(PB);
check("other pelatih cannot", (await fails(() => db.query("insert into public.personal_goals (enrollment_id,label,unit,baseline,target) values ($1,'x','detik',1,2)", [dioEnr]))) !== null);
await as(P2);
check("parent reads the goal", (await q("select id from public.personal_goals")).length === 1);
await as(P1);
check("unrelated parent does not", (await q("select id from public.personal_goals")).length === 0);

// ---------- cancel frees the seat ----------
await as(ANDI);
const c = (await q("select public.cancel_my_enrollment($1) r", [adultId]))[0].r;
await su();
check("participant cancels a scheduled class: cancelled + seat released", c === "cancelled" && (await q("select count(*)::int c from public.schedules where slot_id=$1 and student_id=$2", [uid(202), andiStudent]))[0].c === 0);
check("the Adult Swim report is kept after cancelling", (await q("select id from public.progress_reports where id=$1", [uid(310)])).length === 1);
await as(ANDI);
check("a cancelled class can be registered again (new enrollment)", !!(await reg(ADULT, "")).rows[0].id);

// ---------- legacy admin flows still produce enrollments ----------
await su();
await db.exec(`insert into public.students (id, full_name, parent_id, program_id) values ('${uid(103)}','Baru','${P1}','${KIDS}')`);
check("adding a student the old way creates an active legacy enrollment", (await q("select status, source from public.enrollments where student_id=$1", [uid(103)]))[0]?.status === "active");

// ---------- participant vs account (0034) ----------
const HUSBAND_AQUA = "aquanatal-2026-09b";
await as(HUS);
const maleAqua = await fails(() => regFull(AQUA, HUSBAND_AQUA, "self", { gender: "male" }));
check("a man registering himself for Aquanatal is refused", /not suitable/.test(maleAqua ?? ""), String(maleAqua));
await su();
check("...and nothing was created (no participant, no enrollment)",
  (await q("select count(*)::int c from public.students where parent_id=$1", [HUS]))[0].c === 0 &&
  (await q("select count(*)::int c from public.enrollments where requested_by_user_id=$1", [HUS]))[0].c === 0);
await as(HUS);
check("for=other without the participant's name is refused", /name required/.test((await fails(() => regFull(AQUA, HUSBAND_AQUA, "other", { phone: "085711112222", gender: "female" }))) ?? ""));
check("for=other without the participant's WhatsApp is refused", /phone required/.test((await fails(() => regFull(AQUA, HUSBAND_AQUA, "other", { name: "Sari Wijaya", gender: "female" }))) ?? ""));
check("Aquanatal for the spouse still needs the acknowledgement", /acknowledgement required/.test((await fails(() => regFull(AQUA, "", "other", { name: "Sari Wijaya", phone: "085711112222", gender: "female" }))) ?? ""));
check("an unknown gender value is refused", /invalid gender/.test((await fails(() => regFull(AQUA, HUSBAND_AQUA, "other", { name: "Sari Wijaya", phone: "085711112222", gender: "robot" }))) ?? ""));

const wifeReg = (await regFull(AQUA, HUSBAND_AQUA, "other", { name: "Sari Wijaya", phone: "0857-1111-2222", gender: "female", rel: "Pasangan", birth: "1994-05-01" })).rows[0];
check("husband registers his wife for Aquanatal", !!wifeReg.id && !!wifeReg.student_id);
check("an invitation token is returned for the wife", !!wifeReg.token && wifeReg.token.length >= 32);
await su();
const wifeStudent = (await q("select * from public.students where id=$1", [wifeReg.student_id]))[0];
check("participant is the wife, not the husband's account", wifeStudent.full_name === "Sari Wijaya" && wifeStudent.parent_id === HUS && wifeStudent.user_id === null && wifeStudent.kind === "adult_family" && !wifeStudent.is_self);
check("gender, phone, birth date and relationship live on the PARTICIPANT", wifeStudent.gender === "female" && wifeStudent.phone === "085711112222" && new Date(wifeStudent.birth_date).toISOString().startsWith("1994-05-01") && wifeStudent.relationship === "Pasangan", JSON.stringify(wifeStudent));
check("the husband's own account has no participant row of its own", (await q("select count(*)::int c from public.students where user_id=$1 or (parent_id=$1 and is_self)", [HUS]))[0].c === 0);
const wifeEnr = (await q("select * from public.enrollments where id=$1", [wifeReg.id]))[0];
check("enrollment is pending_review, no slot, requested/billed by the husband, no report access",
  wifeEnr.status === "pending_review" && !wifeEnr.slot_id && wifeEnr.requested_by_user_id === HUS && wifeEnr.billing_contact_user_id === HUS && wifeEnr.report_access_granted_to_requester === false && !!wifeEnr.acknowledged_at, JSON.stringify(wifeEnr));
check("no schedule row exists for the wife yet", (await q("select count(*)::int c from public.schedules where student_id=$1", [wifeReg.student_id]))[0].c === 0);

// the same person for a second program is the same participant
await as(HUS);
const wifeAdult = (await regFull(ADULT, "", "other", { name: "sari wijaya", phone: "085711112222", gender: "female", rel: "Pasangan" })).rows[0];
check("registering the wife for Adult Swim reuses the same participant", wifeAdult.student_id === wifeReg.student_id);
check("...with a separate enrollment", wifeAdult.id !== wifeReg.id);
check("a second live enrollment for the same program is refused", /already enrolled/.test((await fails(() => regFull(AQUA, HUSBAND_AQUA, "other", { name: "Sari Wijaya", phone: "085711112222", gender: "female", rel: "Pasangan" }))) ?? ""));
check("choosing 'memilih tidak menyebutkan' passes to admin review", !!(await regFull(ADULT, "", "self", { gender: "undisclosed" })).rows[0].id);

// the registrant sees the registration, not the class
await su();
await db.exec(`update public.enrollments set status='waiting_schedule' where id='${wifeReg.id}'`);
await db.exec(`insert into public.schedules (student_id, slot_id) values ('${wifeReg.student_id}','${uid(203)}')`);
await as(PB);
await insertReportFor(wifeReg.student_id, wifeReg.id, uid(320));
await as(HUS);
check("the husband sees the participant row and enrollments (administrative)", (await q("select id from public.students where id=$1", [wifeReg.student_id])).length === 1 && (await q("select id from public.enrollments where student_id=$1", [wifeReg.student_id])).length === 2);
check("the husband does NOT see the wife's schedule", (await q("select id from public.schedules where student_id=$1", [wifeReg.student_id])).length === 0);
check("the husband does NOT see the wife's report", (await q("select id from public.progress_reports where student_id=$1", [wifeReg.student_id])).length === 0);
check("the husband cannot grant himself access", (await q("select public.set_report_access($1,true) r", [wifeReg.id]))[0].r === "not_found");
check("the husband cannot edit the wife's profile", (await q("select public.update_participant_profile($1,'male','0811111111',null) r", [wifeReg.student_id]))[0].r === "not_found");
await as(P2);
check("nobody else sees the wife's participant", (await q("select id from public.students where id=$1", [wifeReg.student_id])).length === 0);

// the invitation
await anon();
const info = await q("select * from public.get_claim_info($1)", [wifeReg.token]);
check("the invitation page can show who registered whom (no reports)", info.length === 1 && info[0].participant_name === "Sari Wijaya" && info[0].registered_by === "Budi Suami" && info[0].program_names.includes("Aquanatal"), JSON.stringify(info));
check("a wrong token shows nothing", (await q("select * from public.get_claim_info('nope')")).length === 0);
check("anon cannot claim", (await q("select public.claim_participant($1) r", [wifeReg.token]))[0].r === "not_authenticated");
await as(HUS);
check("the registering account cannot claim the participant it registered", (await q("select public.claim_participant($1) r", [wifeReg.token]))[0].r === "same_account");
await su();
await db.exec(`update public.students set claim_expires_at = now() - interval '1 day' where id='${wifeReg.student_id}'`);
await as(WIFE);
check("an expired invitation is refused", (await q("select public.claim_participant($1) r", [wifeReg.token]))[0].r === "invalid");
await su();
await db.exec(`update public.students set claim_expires_at = now() + interval '5 days' where id='${wifeReg.student_id}'`);
await as(WIFE);
check("the wife claims her own participant", (await q("select public.claim_participant($1) r", [wifeReg.token]))[0].r === "claimed");
check("the invitation is single-use", (await q("select public.claim_participant($1) r", [wifeReg.token]))[0].r === "invalid");
await su();
const claimed = (await q("select user_id, parent_id, claim_token from public.students where id=$1", [wifeReg.student_id]))[0];
check("claimed: linked to her account, token gone, registrant unchanged", claimed.user_id === WIFE && claimed.parent_id === HUS && claimed.claim_token === null, JSON.stringify(claimed));

await as(WIFE);
check("the wife sees her own participant, schedule and report", (await q("select id from public.students where id=$1", [wifeReg.student_id])).length === 1 && (await q("select id from public.schedules where student_id=$1", [wifeReg.student_id])).length === 1 && (await q("select id from public.progress_reports where student_id=$1", [wifeReg.student_id])).length === 1);
check("...and the enrollments (both programs)", (await q("select id from public.enrollments where student_id=$1", [wifeReg.student_id])).length === 2);
await as(HUS);
check("after the claim the husband still has no access to schedule/reports", (await q("select id from public.schedules where student_id=$1", [wifeReg.student_id])).length === 0 && (await q("select id from public.progress_reports where student_id=$1", [wifeReg.student_id])).length === 0);

// consent
await as(P2);
check("an unrelated account cannot change consent", (await q("select public.set_report_access($1,true) r", [wifeReg.id]))[0].r === "not_found");
await as(WIFE);
check("the wife allows the husband to see her Aquanatal schedule and reports", (await q("select public.set_report_access($1,true) r", [wifeReg.id]))[0].r === "ok");
await as(HUS);
check("now the husband sees the Aquanatal report", (await q("select id from public.progress_reports where student_id=$1", [wifeReg.student_id])).length === 1);
check("...and the schedule", (await q("select id from public.schedules where student_id=$1", [wifeReg.student_id])).length === 1);
await su();
check("consent is per enrollment: Adult Swim stays private", (await q("select report_access_granted_to_requester g from public.enrollments where id=$1", [wifeAdult.id]))[0].g === false);
await as(WIFE);
await q("select public.set_report_access($1,false) r", [wifeReg.id]);
await as(HUS);
check("the wife can take the permission back", (await q("select id from public.progress_reports where student_id=$1", [wifeReg.student_id])).length === 0);

// profile
await as(WIFE);
check("the participant edits her own profile (gender, phone, birth date)", (await q("select public.update_participant_profile($1,'undisclosed','0812 999 000 11','1993-01-02') r", [wifeReg.student_id]))[0].r === "ok");
await su();
const prof = (await q("select gender, phone, birth_date from public.students where id=$1", [wifeReg.student_id]))[0];
check("the profile change is stored on the participant", prof.gender === "undisclosed" && prof.phone === "081299900011", JSON.stringify(prof));
await as(WIFE);
check("an invalid gender is rejected", (await q("select public.update_participant_profile($1,'robot','0812',null) r", [wifeReg.student_id]))[0].r === "invalid_gender");
await as(ANDI);
check("an adult who registered themselves can edit their own profile", (await q("select public.update_participant_profile($1,'male','0813 1111 2222','1990-01-01') r", [andiStudent]))[0].r === "ok");
check("...but not somebody else's", (await q("select public.update_participant_profile($1,'male','0813',null) r", [wifeReg.student_id]))[0].r === "not_found");

await as(HUS);
check("the husband cannot rename or re-photograph the wife's participant", /not authorized/.test((await fails(() => db.query("select public.update_own_child_profile($1,'Hacked',null,null)", [wifeReg.student_id]))) ?? ""));
await as(WIFE);
check("the wife can update her own display name/photo", (await fails(() => db.query("select public.update_own_child_profile($1,'Sari W',null,null)", [wifeReg.student_id]))) === null);
await as(P1);
check("a parent can still update their child's profile", (await fails(() => db.query("select public.update_own_child_profile($1,'Rara',null,null)", [uid(100)]))) === null);

// administrative actions stay with the registering account
await as(HUS);
check("the husband can still withdraw the registration he made", (await q("select public.cancel_my_enrollment($1) r", [wifeAdult.id]))[0].r === "cancelled");
await as(P2);
check("an unrelated account cannot cancel it", (await q("select public.cancel_my_enrollment($1) r", [wifeReg.id]))[0].r === "not_found");

// children keep working exactly as before
await su();
check("legacy children are kind 'child'", (await q("select kind from public.students where id=$1", [uid(100)]))[0].kind === "child");
await as(P1);
check("a parent still sees their child's reports", (await q("select id from public.progress_reports where student_id=$1", [uid(100)])).length === 1);

// ---------- family account, participants, one payer (0035) ----------
await su();
await db.exec(`
  insert into public.program_packages (id, program_id, name, sessions_count, price) values
    ('${uid(500)}','${AQUA}','Aquanatal 4',4,700000),
    ('${uid(501)}','${KIDS}','Kids 4',4,500000),
    ('${uid(502)}','${ADULT}','Adult 4',4,600000);
  insert into public.class_slots (id, program_id, pelatih_id, label, day_of_week, start_time, capacity, location) values
    ('${uid(205)}','${KIDS}','${PA}','Grup',6,'08:00',1,'Kolam CDR'),
    ('${uid(206)}','${(await prog("Baby Swim"))}','${PA}','Grup',6,'09:00',3,'Kolam CDR'),
    ('${uid(207)}','${AQUA}','${PB}','Grup',6,'10:00',5,'Kolam CDR');
`);
const regModes = (pid, o) =>
  db.query(
    "select out_enrollment_id id, out_student_id student_id, out_claim_token token from public.register_enrollment($1,'other',$2,$3,null,$4,$5,'','',$6,$7,$8,$9)",
    [pid, o.name, o.phone, o.gender ?? "female", o.rel ?? "Anggota keluarga lain", o.ack ?? "", o.account ?? "own", o.billing ?? "requester", o.report ?? "participant"]
  );

// -- a participant who stays inside the family account
await as(HUS);
check("staying in the family account cannot ask for a participant-paid invoice", /participant account required/.test((await fails(() => regModes(ADULT, { name: "Ani Keluarga", phone: "085722223333", account: "family", billing: "participant" }))) ?? ""));
check("...nor for reports kept away from the family account", /participant account required/.test((await fails(() => regModes(ADULT, { name: "Ani Keluarga", phone: "085722223333", account: "family", report: "participant" }))) ?? ""));
check("an unknown access option is refused", /invalid access option/.test((await fails(() => regModes(ADULT, { name: "Ani Keluarga", phone: "085722223333", account: "bogus" }))) ?? ""));
const ani = (await regModes(AQUA, { name: "Ani Keluarga", phone: "085722223333", account: "family", billing: "requester", report: "family", ack: "aquanatal-2026-09b" })).rows[0];
check("family mode: no invitation is created or sent", ani.token === null);
await su();
const aniEnr = (await q("select * from public.enrollments where id=$1", [ani.id]))[0];
check("family mode: family account pays and sees reports from the start", aniEnr.billing_mode === "requester" && aniEnr.billing_contact_user_id === HUS && aniEnr.report_access_granted_to_requester === true);
await db.exec(`update public.enrollments set status='waiting_schedule' where id='${ani.id}'`);
await db.exec(`insert into public.schedules (student_id, slot_id) values ('${ani.student_id}','${uid(207)}')`);
await as(PB);
await insertReportFor(ani.student_id, ani.id, uid(330));
await as(HUS);
check("family mode: the family account reads the report, under the participant's own name", (await q("select r.id, s.full_name from public.progress_reports r join public.students s on s.id = r.student_id where r.student_id=$1", [ani.student_id])).filter((r) => r.full_name === "Ani Keluarga").length === 1);
await as(P2);
check("...and nobody else does", (await q("select id from public.progress_reports where student_id=$1", [ani.student_id])).length === 0);

// -- the participant pays from her own account, reports asked for by the family
await as(HUS);
const dewi = (await regModes(ADULT, { name: "Dewi Mandiri", phone: "085733334444", account: "own", billing: "participant", report: "family" })).rows[0];
check("own account: an invitation token is returned", !!dewi.token);
await su();
const dewiEnr = (await q("select * from public.enrollments where id=$1", [dewi.id]))[0];
check("participant pays: no payer until she claims; reports are only ASKED for", dewiEnr.billing_mode === "participant" && dewiEnr.billing_contact_user_id === null && dewiEnr.report_access_requested === true && dewiEnr.report_access_granted_to_requester === false, JSON.stringify(dewiEnr));
check("no invoice can be made while nobody is the payer yet", /billing account not ready/.test((await fails(() => db.query("insert into public.invoices (student_id, program_package_id, package_name, sessions_count, amount, status) values ($1,$2,'Adult 4',4,600000,'draft')", [dewi.student_id, uid(502)]))) ?? ""));
await anon();
const dewiInfo = (await q("select * from public.get_claim_info($1)", [dewi.token]))[0];
check("the invitation shows that the family asks for reports and that she pays", dewiInfo.wants_report_access === true && dewiInfo.participant_pays === true, JSON.stringify(dewiInfo));
await su();
const before = (await q("select (select count(*)::int from public.students) s, (select count(*)::int from public.enrollments) e"))[0];
await as(P2);
check("she claims her profile and lets the family see her reports", (await q("select public.claim_participant($1, true) r", [dewi.token]))[0].r === "claimed");
await su();
const after = (await q("select (select count(*)::int from public.students) s, (select count(*)::int from public.enrollments) e"))[0];
check("claiming creates no duplicate participant or enrollment", before.s === after.s && before.e === after.e, JSON.stringify([before, after]));
const dewiAfter = (await q("select billing_contact_user_id, report_access_granted_to_requester g from public.enrollments where id=$1", [dewi.id]))[0];
check("after claiming she is the payer and her answer decides report access", dewiAfter.billing_contact_user_id === P2 && dewiAfter.g === true, JSON.stringify(dewiAfter));
await db.query("insert into public.invoices (id, student_id, program_package_id, package_name, sessions_count, amount, status, invoice_number) values ($1,$2,$3,'Adult 4',4,600000,'sent','INV-T1')", [uid(600), dewi.student_id, uid(502)]);
const inv1 = (await q("select billing_account_id, enrollment_id from public.invoices where id=$1", [uid(600)]))[0];
check("the invoice is tied to her enrollment and to her alone", inv1.billing_account_id === P2 && inv1.enrollment_id === dewi.id, JSON.stringify(inv1));
await as(P2);
check("the payer sees her invoice", (await q("select id from public.invoices where id=$1", [uid(600)])).length === 1);
await as(HUS);
check("the registrant does NOT see it", (await q("select id from public.invoices where id=$1", [uid(600)])).length === 0);
check("the registrant cannot pay it", /not authorized/.test((await fails(() => db.query("select public.submit_invoice_payment_proof($1,'transfer','http://x')", [uid(600)]))) ?? ""));
const hs = (await q("select * from public.invoice_summaries() where out_enrollment_id=$1", [dewi.id]))[0];
check("the registrant only gets a summary: status, no invoice id", hs && hs.out_status === "sent" && hs.out_invoice_id === null && hs.out_is_payer === false, JSON.stringify(hs));
const hb = (await q("select * from public.enrollment_billing() where out_enrollment_id=$1", [dewi.id]))[0];
check("...and who is responsible for payment", hb.out_payer_name === "Mama Lain" && hb.out_is_payer === false && hb.out_payer_pending === false, JSON.stringify(hb));
await as(P2);
check("the payer can pay it", (await fails(() => db.query("select public.submit_invoice_payment_proof($1,'transfer','http://x')", [uid(600)]))) === null);
const ps = (await q("select * from public.invoice_summaries() where out_enrollment_id=$1", [dewi.id]))[0];
check("the payer's summary carries the invoice id and status 'processing'", ps.out_invoice_id === uid(600) && ps.out_is_payer && ps.out_status === "processing");

// -- Siti: has her own account, the family (Budi) pays
await su();
const sitiEnr = (await q("select billing_mode, billing_contact_user_id from public.enrollments where id=$1", [wifeReg.id]))[0];
check("Siti: own account, but the family account is the payer", sitiEnr.billing_mode === "requester" && sitiEnr.billing_contact_user_id === HUS, JSON.stringify(sitiEnr));
await db.query("insert into public.invoices (id, student_id, program_package_id, package_name, sessions_count, amount, status, invoice_number) values ($1,$2,$3,'Aquanatal 4',4,700000,'sent','INV-T2')", [uid(601), wifeReg.student_id, uid(500)]);
const inv2 = (await q("select billing_account_id, enrollment_id from public.invoices where id=$1", [uid(601)]))[0];
check("Siti's invoice belongs to her Aquanatal enrollment and to Budi only", inv2.billing_account_id === HUS && inv2.enrollment_id === wifeReg.id, JSON.stringify(inv2));
await as(HUS);
check("Budi sees and can pay it", (await q("select id from public.invoices where id=$1", [uid(601)])).length === 1);
await as(WIFE);
check("Siti cannot read the invoice", (await q("select id from public.invoices where id=$1", [uid(601)])).length === 0);
check("Siti cannot pay the invoice", /not authorized/.test((await fails(() => db.query("select public.submit_invoice_payment_proof($1,'transfer','http://x')", [uid(601)]))) ?? ""));
const ss = (await q("select * from public.invoice_summaries() where out_enrollment_id=$1", [wifeReg.id]))[0];
const sb = (await q("select * from public.enrollment_billing() where out_enrollment_id=$1", [wifeReg.id]))[0];
check("Siti sees 'managed by Budi' and 'waiting for payment'", sb.out_payer_name === "Budi Suami" && !sb.out_is_payer && ss.out_status === "sent" && ss.out_invoice_id === null, JSON.stringify([sb, ss]));
await su();
await db.exec(`update public.invoices set status='paid' where id='${uid(601)}'`);
await as(WIFE);
check("...and 'paid' once it is settled", (await q("select out_status from public.invoice_summaries() where out_enrollment_id=$1", [wifeReg.id]))[0].out_status === "paid");
await as(P1);
check("an unrelated family sees neither invoice nor summary", (await q("select id from public.invoices where id in ($1,$2)", [uid(600), uid(601)])).length === 0 && (await q("select * from public.invoice_summaries() where out_enrollment_id in ($1,$2)", [wifeReg.id, dewi.id])).length === 0);
await as(ADMIN);
check("admin sees every invoice with its billing account", (await q("select id from public.invoices where id in ($1,$2)", [uid(600), uid(601)])).length === 2);

// -- an invoice can never exist for two accounts: one column, NOT NULL
await su();
check("every invoice has exactly one billing account (NOT NULL)", (await q("select count(*)::int c from public.invoices where billing_account_id is null"))[0].c === 0 && (await q("select is_nullable from information_schema.columns where table_name='invoices' and column_name='billing_account_id'"))[0].is_nullable === "NO");
await db.query("insert into public.invoices (id, student_id, program_package_id, package_name, sessions_count, amount, status) values ($1,$2,$3,'Kids 4',4,500000,'sent')", [uid(602), uid(100), uid(501)]);
check("a child's invoice goes to the parent", (await q("select billing_account_id from public.invoices where id=$1", [uid(602)]))[0].billing_account_id === P1);
check("...and the parent's summary marks them as the payer", (await (async () => { await as(P1); return q("select out_is_payer from public.invoice_summaries() where out_student_id=$1", [uid(100)]); })())[0].out_is_payer === true);

// -- invitation later for a participant kept inside the family account
await as(P2);
check("someone else cannot invite Ani", (await q("select public.invite_participant($1) t", [ani.student_id]))[0].t === null);
await as(HUS);
const later = (await q("select public.invite_participant($1) t", [ani.student_id]))[0].t;
check("the family account can invite Ani later", !!later);
await su();
const aniStudentId = ani.student_id;
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${uid(9)}','ani@t.co','{"role":"ortu","full_name":"Ani Sendiri"}')`);
await as(uid(9));
check("Ani claims it and keeps her reports private", (await q("select public.claim_participant($1, false) r", [later]))[0].r === "claimed");
await as(HUS);
check("the family account no longer sees Ani's reports", (await q("select id from public.progress_reports where student_id=$1", [aniStudentId])).length === 0);
await as(uid(9));
check("Ani sees them", (await q("select id from public.progress_reports where student_id=$1", [aniStudentId])).length === 1);

// -- children: an existing child or a new one, cards stay separate
await as(P1);
const newKid = (await db.query("select out_enrollment_id id, out_student_id student_id from public.register_child_enrollment(null,'Adik Rara',null,$1)", [uid(205)])).rows[0];
await su();
const kid = (await q("select kind, parent_id, is_self from public.students where id=$1", [newKid.student_id]))[0];
const kidEnr = (await q("select status, requested_by_user_id, billing_contact_user_id, billing_mode from public.enrollments where id=$1", [newKid.id]))[0];
check("a new child is a child participant of the family account", kid.kind === "child" && kid.parent_id === P1 && !kid.is_self);
check("...with its own enrollment, paid by the family account", kidEnr.status === "active" && kidEnr.requested_by_user_id === P1 && kidEnr.billing_contact_user_id === P1 && kidEnr.billing_mode === "requester", JSON.stringify(kidEnr));
await as(P1);
check("the last seat is gone: the next child is refused and nothing is left behind", /slot is full/.test((await fails(() => db.query("select * from public.register_child_enrollment(null,'Anak Ketiga',null,$1)", [uid(205)]))) ?? "") && (await q("select id from public.students where full_name='Anak Ketiga'")).length === 0);
check("an adult program cannot be booked through the child flow", /not open/.test((await fails(() => db.query("select * from public.register_child_enrollment(null,'Anak Salah',null,$1)", [uid(207)]))) ?? ""));
const rara2 = (await db.query("select out_enrollment_id id, out_student_id student_id from public.register_child_enrollment($1,null,null,$2)", [uid(100), uid(206)])).rows[0];
check("an existing child joins a second program with a separate enrollment", rara2.student_id === uid(100) && rara2.id !== rara.id);
check("an existing child cannot be booked into the same program twice", /already enrolled/.test((await fails(() => db.query("select * from public.register_child_enrollment($1,null,null,$2)", [uid(100), uid(205)]))) ?? ""));
await as(P2);
check("another family cannot book somebody else's child", /not authorized/.test((await fails(() => db.query("select * from public.register_child_enrollment($1,null,null,$2)", [uid(100), uid(206)]))) ?? ""));
await as(P1);
const cards = await q("select e.id, p.name from public.enrollments e join public.programs p on p.id = e.program_id join public.students s on s.id = e.student_id where s.parent_id = $1 and e.status not in ('cancelled','rejected')", [P1]);
check("one family account shows a separate enrollment (card) per participant and program", cards.length >= 3 && new Set(cards.map((c) => c.id)).size === cards.length, JSON.stringify(cards.map((c) => c.name)));
check("reports of Rara stay with her Kids Swim enrollment", (await q("select id from public.progress_reports where enrollment_id=$1", [rara2.id])).length === 0 && (await q("select id from public.progress_reports where enrollment_id=$1", [rara.id])).length === 1);

// ---------- admin operations (0036) ----------
await su();
const sets = Object.fromEntries((await q("select key, value from public.site_settings where key in ('ambang_penagihan','jatuh_tempo_hari')")).map((r) => [r.key, r.value]));
check("billing threshold defaults to 2 remaining sessions, overdue after 7 days", sets.ambang_penagihan === "2" && sets.jatuh_tempo_hari === "7", JSON.stringify(sets));
const open = Object.fromEntries((await q("select name, registration_open from public.programs")).map((r) => [r.name, r.registration_open]));
check("programs already running keep accepting registrations; an inactive one does not", open["Kids Swim"] === true && open["Aquanatal"] === true && open["Adaptive Swim"] === false, JSON.stringify(open));

// -- slot guards (certain conflicts are blocked in the database too)
await su();
await db.exec(`insert into public.class_slots (id, program_id, pelatih_id, label, location, day_of_week, start_time, capacity, duration_minutes)
  values ('${uid(700)}','${KIDS}','${PA}','Grup','Kolam CDR',2,'16:00',4,60)`);
check("a coach cannot teach two classes at overlapping times", /slot_conflict_pelatih/.test((await fails(() => db.exec(`insert into public.class_slots (program_id, pelatih_id, label, location, day_of_week, start_time, capacity, duration_minutes) values ('${AQUA}','${PA}','Grup','Kolam Lain',2,'16:30',4,60)`))) ?? ""));
check("an identical slot is refused as a duplicate", /slot_duplicate/.test((await fails(() => db.exec(`insert into public.class_slots (program_id, pelatih_id, label, location, day_of_week, start_time, capacity, duration_minutes) values ('${KIDS}','${PA}','Grup','Kolam CDR',2,'16:00',4,60)`))) ?? ""));
check("back-to-back classes of one coach are fine", (await fails(() => db.exec(`insert into public.class_slots (id, program_id, pelatih_id, label, location, day_of_week, start_time, capacity, duration_minutes) values ('${uid(701)}','${KIDS}','${PA}','Grup','Kolam CDR',2,'17:00',4,60)`))) === null);
check("a shared pool by another coach is only a warning in the app, not blocked by the database", (await fails(() => db.exec(`insert into public.class_slots (id, program_id, pelatih_id, label, location, day_of_week, start_time, capacity, duration_minutes) values ('${uid(702)}','${AQUA}','${PB}','Grup','Kolam CDR',2,'16:00',4,60)`))) === null);
check("capacity 0 is refused", (await fails(() => db.exec(`insert into public.class_slots (program_id, pelatih_id, day_of_week, start_time, capacity) values ('${KIDS}','${PB}',3,'08:00',0)`))) !== null);
check("editing only the capacity of a slot never trips the guards", (await fails(() => db.exec(`update public.class_slots set capacity = 6 where id='${uid(700)}'`))) === null);

// -- a participant cannot sit in two overlapping classes
await db.exec(`insert into public.students (id, full_name, parent_id) values ('${uid(710)}','Dua Kelas','${P1}')`);
await db.exec(`insert into public.schedules (student_id, slot_id) values ('${uid(710)}','${uid(700)}')`);
check("a participant cannot be booked into an overlapping class", /participant_conflict/.test((await fails(() => db.exec(`insert into public.schedules (student_id, slot_id) values ('${uid(710)}','${uid(702)}')`))) ?? ""));
check("...but can attend the next one", (await fails(() => db.exec(`insert into public.schedules (student_id, slot_id) values ('${uid(710)}','${uid(701)}')`))) === null);

// -- activity log
await as(ADMIN);
await db.query("update public.class_slots set location = 'Kolam Baru' where id = $1", [uid(700)]);
await su();
const slotLog = await q("select actor_name, action, changes from public.activity_log where slot_id = $1 and entity_type = 'class_slots' and action = 'update' order by created_at desc", [uid(700)]);
check("changing a slot is logged with who and before/after", slotLog.length >= 1 && slotLog[0].actor_name === "Admin" && JSON.stringify(slotLog[0].changes.location) === JSON.stringify(["Kolam CDR", "Kolam Baru"]), JSON.stringify(slotLog[0]));
const capLog = await q("select changes from public.activity_log where slot_id = $1 and entity_type='class_slots' and action='update' and changes ? 'capacity'", [uid(700)]);
check("a capacity change (before the admin) is logged as well, with no actor when done by the system", capLog.length === 1 && JSON.stringify(capLog[0].changes.capacity) === JSON.stringify([4, 6]));
const schedLog = await q("select changes from public.activity_log where entity_type = 'schedules' and action = 'insert' and student_id = $1", [uid(710)]);
check("putting a participant in a slot is logged with the participant's name", schedLog.length >= 1 && schedLog[0].changes._student === "Dua Kelas", JSON.stringify(schedLog));

// -- invoice + enrollment changes are logged, secrets are not
await db.exec(`insert into public.invoices (id, student_id, program_package_id, package_name, sessions_count, amount, status) values ('${uid(720)}','${uid(100)}','${uid(501)}','Kids 4',4,500000,'draft')`);
await as(ADMIN);
await db.query("update public.invoices set status = 'paid' where id = $1", [uid(720)]);
await su();
const invLog = await q("select actor_name, changes from public.activity_log where invoice_id = $1 and entity_type = 'invoices' and action = 'update'", [uid(720)]);
check("marking an invoice paid is logged (draft -> paid) with the admin", invLog.length === 1 && invLog[0].actor_name === "Admin" && JSON.stringify(invLog[0].changes.status) === JSON.stringify(["draft", "paid"]), JSON.stringify(invLog));
check("the invoice is reachable from the participant's history", (await q("select count(*)::int c from public.activity_log where student_id = $1", [uid(100)]))[0].c >= 2);

await as(ADMIN);
await db.query("update public.enrollments set status='schedule_offered', offered_slot_id=$1, offer_token='SECRET-TOKEN', offer_expires_at=now()+interval '3 days' where id=$2", [uid(700), aquaId]).catch(() => null);
await su();
const enrLog = await q("select changes from public.activity_log where enrollment_id = $1 and entity_type='enrollments' and action='update' order by created_at desc limit 5", [aquaId]);
check("no offer token ever reaches the activity log", !JSON.stringify(enrLog).includes("SECRET-TOKEN"));

// -- who can read the log
await as(ADMIN);
check("admin reads the activity log", (await q("select id from public.activity_log limit 1")).length === 1);
await as(P1);
check("a parent cannot read it", (await q("select id from public.activity_log")).length === 0);
await as(PA);
check("a coach cannot read it", (await q("select id from public.activity_log")).length === 0);
check("a parent cannot write into it", (await fails(() => db.exec("insert into public.activity_log (entity_type, action) values ('x','note')"))) === null ? false : true);

// -- follow-up marks
await as(ADMIN);
await db.query("update public.enrollments set followed_up_at = now(), followed_up_by = $1 where id = $2", [ADMIN, wifeAdult.id]);
await su();
const fuRow = (await q("select followed_up_by from public.enrollments where id=$1", [wifeAdult.id]))[0];
const fuLog = await q("select changes from public.activity_log where enrollment_id=$1 and action='update' and changes ? 'followed_up_at'", [wifeAdult.id]);
check("a follow-up mark is stored and shown in the log", fuRow?.followed_up_by === ADMIN && fuLog.length === 1, JSON.stringify([fuRow, fuLog]));

// ---------- program target group ----------
await su();
await db.exec(`insert into public.programs (id, name, skill_template, active, audience, self_registration, registration_open) values ('${uid(800)}','Semua Usia','[]'::jsonb,true,'all',true,true)`);
await db.exec(`insert into public.class_slots (id, program_id, pelatih_id, label, day_of_week, start_time, capacity) values ('${uid(801)}','${uid(800)}','${PB}','Grup',0,'07:00',5)`);
await as(P1);
check("a program for all ages can be booked through the child flow", (await fails(() => db.query("select * from public.register_child_enrollment(null,'Anak Semua',null,$1)", [uid(801)]))) === null);
await as(ANDI);
check("...and through the adult flow", (await fails(() => db.query("select * from public.register_enrollment($1,'self',null,null,null,null,null,'','','')", [uid(800)]))) === null);
await as(P1);
check("an adult-only program is refused in the child flow", /not open/.test((await fails(() => db.query("select * from public.register_child_enrollment(null,'Anak Salah',null,$1)", [uid(207)]))) ?? ""));
await as(HUS);
await su();
await db.exec(`update public.programs set audience='child', self_registration=false where id='${KIDS}'`);
await as(ANDI);
check("a children-only program is refused in the adult flow", /not open/.test((await fails(() => db.query("select * from public.register_enrollment($1,'self',null,null,null,null,null,'','','')", [KIDS]))) ?? ""));

// changing the target group touches nothing but the program row
await su();
const beforeCounts = (await q("select (select count(*)::int from public.enrollments) e, (select count(*)::int from public.schedules) s, (select count(*)::int from public.invoices) i, (select count(*)::int from public.class_slots) c, (select count(*)::int from public.progress_reports) r, (select count(*)::int from public.students) st, (select count(*)::int from public.program_packages) pk"))[0];
await as(ADMIN);
await db.query("update public.programs set audience='adult', self_registration=true where id=$1", [uid(800)]);
await su();
const afterCounts = (await q("select (select count(*)::int from public.enrollments) e, (select count(*)::int from public.schedules) s, (select count(*)::int from public.invoices) i, (select count(*)::int from public.class_slots) c, (select count(*)::int from public.progress_reports) r, (select count(*)::int from public.students) st, (select count(*)::int from public.program_packages) pk"))[0];
check("changing a program's target group leaves enrollments, schedules, invoices, slots and reports as they were", JSON.stringify(beforeCounts) === JSON.stringify(afterCounts), JSON.stringify([beforeCounts, afterCounts]));
const audLog = await q("select actor_name, changes from public.activity_log where program_id=$1 and entity_type='programs' and action='update' order by created_at desc limit 1", [uid(800)]);
check("the change is logged with before, after and the admin", audLog.length === 1 && audLog[0].actor_name === "Admin" && JSON.stringify(audLog[0].changes.audience) === JSON.stringify(["all", "adult"]), JSON.stringify(audLog));
const stillThere = (await q("select count(*)::int c from public.enrollments where program_id=$1", [uid(800)]))[0].c;
check("existing registrations of that program stay in place after the change", stillThere === 2, String(stillThere));

const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
