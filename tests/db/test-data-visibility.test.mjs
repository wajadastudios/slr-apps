// 0045: QA test data (is_test accounts / slots) is invisible to anonymous
// visitors and real accounts, visible to admins and to the test accounts.
// Runs every migration against an ephemeral PGlite database.
import { boot } from "./boot.mjs";

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + extra}`);
};
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = uid(1), REAL_COACH = uid(2), TEST_COACH = uid(3), REAL_PARENT = uid(4), TEST_PARENT = uid(5);

const { pg: db, failures } = await boot();
check("all migrations apply", failures.length === 0, JSON.stringify(failures));

await db.exec(`
  insert into public.programs (name, skill_template, active) values ('Kids Swim', '[]'::jsonb, true);
  insert into auth.users (id, email, raw_user_meta_data) values
   ('${ADMIN}','abi@slr.example','{"role":"admin","full_name":"Admin Asli"}'),
   ('${REAL_COACH}','coach@slr.example','{"role":"pelatih","full_name":"Coach Asli"}'),
   ('${TEST_COACH}','pengajar@tesfitur.com','{"role":"pelatih","full_name":"[TEST] Pengajar"}'),
   ('${REAL_PARENT}','parent@slr.example','{"role":"ortu","full_name":"Orang Tua Asli"}'),
   ('${TEST_PARENT}','ortu@tesfitur.com','{"role":"ortu","full_name":"[TEST] Ortu"}');
`);
const kids = (await db.query("select id from public.programs where name='Kids Swim'")).rows[0].id;
await db.exec(`
  insert into public.class_slots (id, program_id, pelatih_id, label, location, day_of_week, start_time, capacity, is_test) values
    ('${uid(200)}','${kids}','${REAL_COACH}','Grup','Kolam Asli',1,'15:00',6,false),
    ('${uid(201)}','${kids}','${TEST_COACH}','Grup','[TEST] Lokasi Kolam Kids',6,'09:00',6,true);
  insert into public.students (id, full_name, parent_id, program_id) values
    ('${uid(100)}','Anak Asli','${REAL_PARENT}','${kids}');
  insert into public.students (id, full_name, parent_id, program_id, is_test) values
    ('${uid(101)}','[TEST] Murid Kids','${TEST_PARENT}','${kids}', true);
  insert into public.schedules (student_id, slot_id) values ('${uid(100)}','${uid(200)}'), ('${uid(101)}','${uid(201)}');
`);
// re-run 0045 after the test users exist, as it would run on the live project
const fs = await import("node:fs");
const path = await import("node:path");
await db.exec(fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/0045_hide_test_data_from_public.sql"), "utf8"));

const flagged = (await db.query("select email from public.users where is_test order by email")).rows.map((r) => r.email);
check("only the allowlisted @tesfitur accounts are flagged", JSON.stringify(flagged) === JSON.stringify(["ortu@tesfitur.com", "pengajar@tesfitur.com"]), JSON.stringify(flagged));

const as = async (id) => {
  if (id) await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false), set_config('request.jwt.claim.role','authenticated',false);`);
  else await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','anon',false);`);
};
const view = async (id) => {
  await as(id);
  const slots = (await db.query("select location from public.class_slots order by location")).rows.map((r) => r.location);
  const coaches = (await db.query("select full_name from public.get_public_pelatih_names() order by full_name")).rows.map((r) => r.full_name);
  const avail = (await db.query("select slot_id from public.get_slot_availability()")).rows.map((r) => r.slot_id);
  await db.exec("reset role");
  return { slots, coaches, avail };
};

for (const [who, id] of [["anonymous visitor", null], ["real parent", REAL_PARENT], ["real coach", REAL_COACH]]) {
  const v = await view(id);
  check(`${who}: no test slot`, !v.slots.some((s) => s.includes("[TEST]")) && v.slots.includes("Kolam Asli"), JSON.stringify(v.slots));
  check(`${who}: no test coach name`, !v.coaches.some((c) => c.includes("[TEST]")) && v.coaches.includes("Coach Asli"), JSON.stringify(v.coaches));
  check(`${who}: no test slot in availability`, !v.avail.includes(uid(201)) && v.avail.includes(uid(200)), JSON.stringify(v.avail));
}
for (const [who, id] of [["admin", ADMIN], ["test parent", TEST_PARENT], ["test coach", TEST_COACH]]) {
  const v = await view(id);
  check(`${who}: sees the test slot`, v.slots.includes("[TEST] Lokasi Kolam Kids"), JSON.stringify(v.slots));
  check(`${who}: sees the test coach`, v.coaches.includes("[TEST] Pengajar"), JSON.stringify(v.coaches));
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
