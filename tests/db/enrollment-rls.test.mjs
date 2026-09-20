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
for (const f of fs.readdirSync(dir).filter((f) => f >= "0030" && f.endsWith(".sql")).sort()) {
  try {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    console.log("applied", f);
  } catch (e) {
    console.log("MIGRATION FAILED", f, e.message);
    process.exit(1);
  }
}
// re-run 0033 to prove idempotence
await db.exec(fs.readFileSync(path.join(dir, "0033_enrollments_and_program_assessment.sql"), "utf8"));
check("0033 is safe to re-run", true);
await db.exec(fs.readFileSync(path.join(dir, "0034_participants_and_consent.sql"), "utf8"));
check("0034 is safe to re-run", true);

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

const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
