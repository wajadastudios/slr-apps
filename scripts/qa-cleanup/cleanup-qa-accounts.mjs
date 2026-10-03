// QA account cleanup — removes exactly three [TEST] accounts and the test
// data that belongs ONLY to them. Reviewable, idempotent, dry-run by default.
//
//   node scripts/qa-cleanup/cleanup-qa-accounts.mjs                 # dry run: report only
//   node scripts/qa-cleanup/cleanup-qa-accounts.mjs --execute       # delete + verify
//   ... --out=<file.json>                                           # write the JSON report elsewhere
//
// Reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
// from .env.local. Never prints keys, passwords, tokens or report contents.
//
// Safety rules (enforced in code, see `block()`):
//  - targets are matched by EXACT email (allowlist below), never by pattern;
//  - a participant is deleted only if it is owned by a target account AND is
//    flagged test (is_test or a "[TEST]" name);
//  - any link to a non-target account or non-test record blocks that record
//    (it is reported, not deleted) — e.g. an enrollment billed to someone
//    else, a report written by a non-test coach, an invoice chain that leaves
//    the test set;
//  - the two kept test accounts (admin/pengajar) are snapshotted before and
//    after so any unexpected change is visible.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const TARGET_EMAILS = ["ortu@tesfitur.com", "pendaftar@tesfitur.com", "dewasa@tesfitur.com"];
const KEEP_EMAILS = ["admin@tesfitur.com", "pengajar@tesfitur.com"];
const BUCKET = "progress-media";

const EXECUTE = process.argv.includes("--execute");
const outArg = process.argv.find((a) => a.startsWith("--out="));
const OUT = outArg ? outArg.slice(6) : path.join(os.tmpdir(), `qa-cleanup-${EXECUTE ? "execute" : "dryrun"}-${Date.now()}.json`);

// ── env ────────────────────────────────────────────────────────────────────
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── helpers ────────────────────────────────────────────────────────────────
const isTestName = (name) => typeof name === "string" && name.trim().startsWith("[TEST]");

async function rows(table, select, build) {
  let q = db.from(table).select(select);
  q = build(q);
  const { data, error } = await q;
  if (error) {
    // A table that does not exist in this project (older schema) is reported, not fatal.
    if (/does not exist|schema cache/i.test(error.message)) return { missing: true, data: [] };
    throw new Error(`${table}: ${error.message}`);
  }
  return { data: data ?? [] };
}
const inList = (ids) => (ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

async function allAuthUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

function storagePathFromUrl(url) {
  if (!url) return null;
  const i = url.indexOf(`/${BUCKET}/`);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + BUCKET.length + 2).split("?")[0]);
}

async function listFolder(prefix) {
  const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`storage list ${prefix}: ${error.message}`);
  return (data ?? []).filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
}

// ── collect ────────────────────────────────────────────────────────────────
async function collect() {
  const blocked = [];
  const block = (kind, id, reason) => blocked.push({ kind, id, reason });

  const auth = await allAuthUsers();
  const byEmail = (email) => auth.filter((u) => (u.email ?? "").toLowerCase() === email);
  const targets = TARGET_EMAILS.map((email) => ({ email, auth: byEmail(email) }));
  for (const t of targets) if (t.auth.length > 1) throw new Error(`more than one auth user for ${t.email}`);
  const T = targets.flatMap((t) => t.auth.map((u) => u.id));
  const keep = KEEP_EMAILS.map((email) => ({ email, id: byEmail(email)[0]?.id ?? null }));
  const testPelatihIds = keep.filter((k) => k.email.startsWith("pengajar")).map((k) => k.id).filter(Boolean);

  const profiles = (await rows("users", "*", (q) => q.in("id", inList(T)))).data;

  // participants owned by (or registered for) the targets
  const stu = (await rows("students", "id, full_name, kind, is_self, is_test, parent_id, user_id, avatar_url", (q) =>
    q.or(`parent_id.in.(${inList(T).join(",")}),user_id.in.(${inList(T).join(",")})`)
  )).data;
  const S = [];
  for (const s of stu) {
    if (!T.includes(s.parent_id)) block("student", s.id, "registered by a non-target account (user_id is a target only)");
    else if (s.user_id && !T.includes(s.user_id)) block("student", s.id, "linked to a non-target login (user_id)");
    else if (!(s.is_test || isTestName(s.full_name))) block("student", s.id, "owned by a target but not flagged test");
    else S.push(s.id);
  }

  let enr = (await rows("enrollments", "id, student_id, requested_by_user_id, billing_contact_user_id", (q) => q.in("student_id", inList(S)))).data;
  for (const e of enr) {
    for (const col of ["requested_by_user_id", "billing_contact_user_id"]) {
      if (e[col] && !T.includes(e[col])) {
        block("enrollment", e.id, `${col} points at a non-target account`);
        const i = S.indexOf(e.student_id);
        if (i >= 0) { S.splice(i, 1); block("student", e.student_id, "has an enrollment linked to a non-target account"); }
      }
    }
  }
  // Enrollments of OTHER participants that merely reference a target (would be nulled by FK).
  const foreignEnr = (await rows("enrollments", "id, student_id", (q) =>
    q.or(`requested_by_user_id.in.(${inList(T).join(",")}),billing_contact_user_id.in.(${inList(T).join(",")})`)
  )).data.filter((e) => !S.includes(e.student_id));
  for (const e of foreignEnr) block("enrollment", e.id, "non-target participant's enrollment references a target account");

  // Never delete a real coach's work: a report by a non-test coach keeps
  // that whole participant out of the cleanup.
  const allReports = (await rows("progress_reports", "id, student_id, pelatih_id, media_urls", (q) => q.in("student_id", inList(S)))).data;
  for (const r of allReports) {
    if (r.pelatih_id && !testPelatihIds.includes(r.pelatih_id)) {
      block("progress_report", r.id, "written by a non-test coach");
      const i = S.indexOf(r.student_id);
      if (i >= 0) { S.splice(i, 1); block("student", r.student_id, "has a report written by a non-test coach"); }
    }
  }
  const reports = allReports.filter((r) => S.includes(r.student_id));

  enr = enr.filter((e) => S.includes(e.student_id));
  const E = enr.map((e) => e.id);

  const schedules = (await rows("schedules", "id, slot_id", (q) => q.in("student_id", inList(S)))).data;
  const R = reports.map((r) => r.id);
  const corrections = (await rows("report_corrections", "id", (q) => q.in("report_id", inList(R))));
  const perf = (await rows("performance_records", "id", (q) => q.in("student_id", inList(S))));
  const goals = (await rows("personal_goals", "id", (q) => q.in("enrollment_id", inList(E))));
  const G = goals.data.map((g) => g.id);
  const goalEntries = (await rows("personal_goal_entries", "id", (q) => q.in("goal_id", inList(G))));
  const priceLocks = (await rows("enrollment_price_locks", "id", (q) => q.in("enrollment_id", inList(E))));

  // invoices: by participant, plus anything billed to a target
  const invA = (await rows("invoices", "id, student_id, billing_account_id, status, is_test, public_token, payment_proof_url, supersedes_invoice_id, superseded_by_invoice_id", (q) => q.in("student_id", inList(S)))).data;
  const invB = (await rows("invoices", "id, student_id, billing_account_id, status, is_test, public_token, payment_proof_url, supersedes_invoice_id, superseded_by_invoice_id", (q) => q.in("billing_account_id", inList(T)))).data;
  const invMap = new Map([...invA, ...invB].map((i) => [i.id, i]));
  for (const i of invB) if (!S.includes(i.student_id)) { block("invoice", i.id, "billed to a target but for a non-target participant"); invMap.delete(i.id); }
  for (const i of [...invMap.values()]) {
    for (const col of ["supersedes_invoice_id", "superseded_by_invoice_id"]) {
      if (i[col] && !invMap.has(i[col])) { block("invoice", i.id, `${col} links outside the test set`); invMap.delete(i.id); }
    }
  }
  const invoices = [...invMap.values()];
  const I = invoices.map((i) => i.id);
  const cash = (await rows("cash_flow_entries", "id, direction, category, amount", (q) => q.in("invoice_id", inList(I))));

  const regs = [];
  for (const email of TARGET_EMAILS) {
    // ilike without wildcards = exact, case-insensitive
    regs.push(...(await rows("registrations", "id, status", (q) => q.ilike("parent_email", email))).data);
  }

  const logs = (await rows("activity_log", "id", (q) =>
    q.or([
      `actor_id.in.(${inList(T).join(",")})`,
      `student_id.in.(${inList(S).join(",")})`,
      `enrollment_id.in.(${inList(E).join(",")})`,
      `invoice_id.in.(${inList(I).join(",")})`,
    ].join(","))
  ));
  const subs = (await rows("substitution_requests", "id", (q) => q.in("requester_id", inList(T))));

  // storage: report media folders, invoice proofs, avatars referenced by these rows
  const files = new Set();
  for (const sid of S) for (const f of await listFolder(sid)) files.add(f);
  const proofFolder = await listFolder("invoice-proof");
  for (const id of I) for (const f of proofFolder) if (path.posix.basename(f).startsWith(`${id}.`)) files.add(f);
  const publicFolder = await listFolder("invoice-proof-public");
  for (const inv of invoices) if (inv.public_token) for (const f of publicFolder) if (path.posix.basename(f).startsWith(`${inv.public_token}.`)) files.add(f);
  for (const url of [
    ...profiles.map((p) => p.avatar_url),
    ...stu.filter((s) => S.includes(s.id)).map((s) => s.avatar_url),
    ...invoices.map((i) => i.payment_proof_url),
    ...reports.flatMap((r) => r.media_urls ?? []),
  ]) {
    const p = storagePathFromUrl(url);
    if (p) files.add(p);
  }

  // kept accounts: snapshot their own data so changes are visible
  const keepSnapshot = {};
  for (const k of keep) {
    if (!k.id) continue;
    keepSnapshot[k.email] = {
      profile: (await rows("users", "id, email, role, full_name", (q) => q.eq("id", k.id))).data.length,
      class_slots: (await rows("class_slots", "id", (q) => q.eq("pelatih_id", k.id))).data.length,
      progress_reports_written: (await rows("progress_reports", "id", (q) => q.eq("pelatih_id", k.id))).data.length,
      payroll_payments: (await rows("payroll_payments", "id", (q) => q.eq("pelatih_id", k.id))).data.length,
    };
  }

  return {
    targets: targets.map((t) => ({
      email: t.email,
      auth_id: t.auth[0]?.id ?? null,
      profile_id: profiles.find((p) => p.id === t.auth[0]?.id)?.id ?? null,
      role: profiles.find((p) => p.id === t.auth[0]?.id)?.role ?? null,
    })),
    keep,
    keepSnapshot,
    ids: { T, S, E, R, I, G },
    participants: stu.filter((s) => S.includes(s.id)).map((s) => ({ id: s.id, name: s.full_name, kind: s.kind })),
    counts: {
      students: S.length,
      enrollments: E.length,
      schedules: schedules.length,
      progress_reports: R.length,
      report_corrections: corrections.data.length,
      performance_records: perf.data.length,
      personal_goals: G.length,
      personal_goal_entries: goalEntries.data.length,
      enrollment_price_locks: priceLocks.data.length,
      invoices: I.length,
      invoices_by_status: invoices.reduce((a, i) => ((a[i.status] = (a[i.status] ?? 0) + 1), a), {}),
      cash_flow_entries: cash.data.length,
      registrations_legacy: regs.length,
      activity_log: logs.data.length,
      substitution_requests: subs.data.length,
      storage_files: files.size,
      notifications_table: "none — the app has no notification table (WhatsApp messages are not stored)",
    },
    cashFlow: cash.data.map((c) => ({ id: c.id, direction: c.direction, category: c.category, amount: Number(c.amount) })),
    lists: {
      cash: cash.data.map((c) => c.id),
      logs: logs.data.map((l) => l.id),
      regs: regs.map((r) => r.id),
      subs: subs.data.map((s) => s.id),
      files: [...files],
    },
    blocked,
  };
}

// ── execute ────────────────────────────────────────────────────────────────
async function del(table, ids) {
  if (!ids.length) return 0;
  let n = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error, count } = await db.from(table).delete({ count: "exact" }).in("id", chunk);
    if (error) throw new Error(`delete ${table}: ${error.message}`);
    n += count ?? 0;
  }
  return n;
}

async function execute(c) {
  if (c.blocked.length) {
    console.log(`! ${c.blocked.length} blocked record(s) are excluded and will NOT be touched.`);
  }
  const done = {};
  if (c.lists.files.length) {
    const { data, error } = await db.storage.from(BUCKET).remove(c.lists.files);
    if (error) throw new Error(`storage remove: ${error.message}`);
    done.storage_files = data?.length ?? 0;
  } else done.storage_files = 0;
  done.cash_flow_entries = await del("cash_flow_entries", c.lists.cash);
  done.activity_log = await del("activity_log", c.lists.logs);
  done.substitution_requests = await del("substitution_requests", c.lists.subs);
  done.invoices = await del("invoices", c.ids.I);
  done.registrations_legacy = await del("registrations", c.lists.regs);
  // Participants last among app data: FK cascades remove their enrollments,
  // schedules, reports (+ corrections), records, goals, price locks.
  done.students = await del("students", c.ids.S);
  // Finally the accounts (public.users cascades from auth.users).
  done.auth_users = 0;
  for (const id of c.ids.T) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw new Error(`auth delete: ${error.message}`);
    done.auth_users++;
  }
  return done;
}

// ── verify ─────────────────────────────────────────────────────────────────
function passwordsFromHandoff() {
  const file = path.join(root, "HANDOFF-CODEX-QA-TEST.md");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/`([^`]+@tesfitur\.com)`\s*\|\s*`([^`]+)`/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function canLogin(email, pw) {
  if (!pw) return "no password on file";
  const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: pw });
  if (data?.session) await anon.auth.signOut();
  return error ? `no (${error.message})` : "yes";
}

// ── main ───────────────────────────────────────────────────────────────────
const before = await collect();
const report = { mode: EXECUTE ? "execute" : "dry-run", at: new Date().toISOString(), before };
console.log(`Mode: ${report.mode}`);
console.log("Targets:", JSON.stringify(before.targets));
console.log("Will delete:", JSON.stringify(before.counts));
console.log("Participants:", JSON.stringify(before.participants.map((p) => `${p.name} (${p.kind})`)));
console.log("Cash-flow entries from test invoices:", JSON.stringify(before.cashFlow));
console.log("Blocked (kept):", JSON.stringify(before.blocked));
console.log("Kept accounts before:", JSON.stringify(before.keepSnapshot));

if (EXECUTE) {
  report.deleted = await execute(before);
  console.log("Deleted:", JSON.stringify(report.deleted));
  const after = await collect();
  report.after = { targets: after.targets, counts: after.counts, keepSnapshot: after.keepSnapshot };
  console.log("Remaining for targets:", JSON.stringify(after.counts));
  console.log("Kept accounts after:", JSON.stringify(after.keepSnapshot));
  const pw = passwordsFromHandoff();
  report.login = {};
  for (const email of [...TARGET_EMAILS, ...KEEP_EMAILS]) report.login[email] = await canLogin(email, pw[email]);
  console.log("Login check:", JSON.stringify(report.login));
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`Report: ${OUT}`);
