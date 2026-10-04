// 0046: "Izin — sesi terpakai". Only an admin decides; a decision exists only
// on a late-notice izin; the coach's quota RPC counts used sessions.
import { boot } from "./boot.mjs";

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + extra}`);
};
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = uid(1), COACH = uid(2), PARENT = uid(3);
const STUDENT = uid(100), SLOT = uid(200), ENR = uid(300), R_HADIR = uid(400), R_IZIN = uid(401);

const { pg: db, failures } = await boot();
check("all migrations apply", failures.length === 0, JSON.stringify(failures));

const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (id) =>
  db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false), set_config('request.jwt.claim.role','authenticated',false);`);
const su = async () => db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");

await db.exec(`
  insert into public.programs (name, skill_template, active) values ('Kids Swim', '[]'::jsonb, true);
  insert into auth.users (id, email, raw_user_meta_data) values
   ('${ADMIN}','admin@slr.example','{"role":"admin","full_name":"Admin"}'),
   ('${COACH}','coach@slr.example','{"role":"pelatih","full_name":"Coach"}'),
   ('${PARENT}','parent@slr.example','{"role":"ortu","full_name":"Orang Tua"}');
`);
const kids = (await q("select id from public.programs where name='Kids Swim'"))[0].id;
await db.exec(`
  insert into public.students (id, full_name, parent_id, program_id) values ('${STUDENT}','Ica','${PARENT}','${kids}');
  insert into public.class_slots (id, program_id, pelatih_id, label, day_of_week, start_time, capacity) values ('${SLOT}','${kids}','${COACH}','Grup',1,'15:00',6);
  insert into public.schedules (student_id, slot_id) values ('${STUDENT}','${SLOT}');
`);
let enr = (await q("select id from public.enrollments where student_id=$1", [STUDENT]))[0]?.id;
if (!enr) {
  await db.exec(`insert into public.enrollments (id, student_id, program_id, status, slot_id) values ('${ENR}','${STUDENT}','${kids}','active','${SLOT}')`);
  enr = ENR;
} else {
  await db.exec(`update public.enrollments set status='active', slot_id='${SLOT}' where id='${enr}'`);
}
await db.exec(`
  insert into public.invoices (student_id, enrollment_id, amount, status, sessions_count)
    values ('${STUDENT}','${enr}', 100, 'paid', 2);
  insert into public.progress_reports (id, student_id, enrollment_id, program_id, pelatih_id, session_date, attendance, status)
    values ('${R_HADIR}','${STUDENT}','${enr}','${kids}','${COACH}','2026-04-06','hadir','final'),
           ('${R_IZIN}','${STUDENT}','${enr}','${kids}','${COACH}','2026-04-13','izin','final');
`);

const report = async () => (await q("select late_notice, quota_decision from public.progress_reports where id=$1", [R_IZIN]))[0];
const quotaAsCoach = async () => {
  await as(COACH);
  const row = (await q("select * from public.pelatih_session_quota($1)", [enr]))[0];
  await su();
  return row;
};

// coach reports the late notice, and cannot decide
await as(COACH);
await db.exec(`update public.progress_reports set late_notice = true where id='${R_IZIN}'`);
await db.exec(`update public.progress_reports set quota_decision = 'used' where id='${R_IZIN}'`);
await su();
let rep = await report();
check("coach can set late_notice", rep.late_notice === true, JSON.stringify(rep));
check("coach cannot set the decision", rep.quota_decision === null, JSON.stringify(rep));

let quota = await quotaAsCoach();
check("undecided: quota counts hadir only", quota.used === 1 && quota.attended === 1 && quota.remaining === 1, JSON.stringify(quota));

// admin decides
await as(ADMIN);
await db.exec(`update public.progress_reports set quota_decision = 'used', quota_decided_by = '${ADMIN}', quota_decided_at = now() where id='${R_IZIN}'`);
await su();
rep = await report();
check("admin can decide 'used'", rep.quota_decision === "used", JSON.stringify(rep));
quota = await quotaAsCoach();
check("decided: used = hadir + izin terpakai, attended unchanged", quota.used === 2 && quota.attended === 1 && quota.remaining === 0, JSON.stringify(quota));

// coach edits the report (e.g. its notes): the decision is kept
await as(COACH);
await db.exec(`update public.progress_reports set notes = 'kabar via WA' where id='${R_IZIN}'`);
await su();
check("coach edit keeps the admin's decision", (await report()).quota_decision === "used");

// attendance changed away from izin: the late flag and decision no longer apply
await as(COACH);
await db.exec(`update public.progress_reports set attendance = 'sakit' where id='${R_IZIN}'`);
await su();
rep = await report();
check("non-izin clears late_notice and decision", rep.late_notice === false && rep.quota_decision === null, JSON.stringify(rep));

// a decision cannot exist without a late notice, even from an admin
await as(ADMIN);
await db.exec(`update public.progress_reports set attendance = 'izin', quota_decision = 'used' where id='${R_IZIN}'`);
await su();
check("no decision without late_notice", (await report()).quota_decision === null);

// rate column is optional and non-negative
const bad = await db.exec(`insert into public.pelatih_rates (pelatih_id, rate_hadir, rate_izin_terpakai, effective_from) values ('${COACH}', 100, -1, '2026-01-01')`).then(() => null, (e) => e.message);
check("negative rate_izin_terpakai rejected", Boolean(bad));
await db.exec(`insert into public.pelatih_rates (pelatih_id, rate_hadir, effective_from) values ('${COACH}', 100, '2026-01-01')`);
check("rate_izin_terpakai defaults to null", (await q("select rate_izin_terpakai from public.pelatih_rates where pelatih_id=$1", [COACH]))[0].rate_izin_terpakai === null);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
