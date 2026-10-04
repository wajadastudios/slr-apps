// Billing history reset — prepares SLR Apps for importing invoice history
// from Excel. Auditable, and it never deletes before a validated backup.
//
//   node scripts/billing-reset/reset-billing-history.mjs            # backup + validate only (no changes)
//   node scripts/billing-reset/reset-billing-history.mjs --execute  # backup + validate, then delete
//
// Deletes ONLY:
//   - every row of public.invoices (draft, sent/belum dibayar, processing, paid)
//   - public.cash_flow_entries rows linked to those invoices (the recorded
//     payments; kept rows would double-count income once the imported paid
//     invoices are synced to cash flow)
//   - payment-proof files of those invoices in Storage, if any
// Never touches users, students, enrollments, schedules, progress_reports
// (attendance), programs, packages/prices, indicators, milestones, settings.
// Session quota has no separate table: it is always computed as paid
// invoices minus attendance, so it follows automatically.
//
// Sends no WhatsApp/email/app notification: those only exist in app code
// paths, which this script does not call. The database only writes its own
// activity_log audit rows for the deletions.
//
// Backup: backups/tagihan-<date>/ (gitignored — contains personal data):
//   tagihan-backup-<date>.xlsx   human-readable, one sheet per table
//   tagihan-backup-<date>.json   full-fidelity rows, for restoring
//   SHA256SUMS.txt

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const EXECUTE = process.argv.includes("--execute");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKET = "progress-media";

const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "medium" })
  .format(new Date())
  .replace(" ", "_")
  .replace(/:/g, "");
const dir = path.join(root, "backups", `tagihan-${stamp}`);

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const log = (...a) => console.log(...a);

// Primary key per table (most use "id"); used for stable paging and hashing.
const ORDER = { site_settings: "key" };
async function all(table, select = "*", build = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(db.from(table).select(select)).order(ORDER[table] ?? "id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// Fingerprints of the data that must NOT change: row count + hash of the
// sorted rows. Compared before vs after the deletion.
const PROTECTED = [
  "users", "students", "enrollments", "schedules", "progress_reports", "class_slots", "programs",
  "program_packages", "package_price_versions", "enrollment_price_locks", "performance_records",
  "indicators", "indicator_groups", "milestones", "personal_goals", "personal_goal_entries",
  "payroll_payments", "pelatih_rates", "operational_expenses", "site_settings", "registrations",
];
async function fingerprint() {
  const out = {};
  for (const t of PROTECTED) {
    const rows = await all(t);
    out[t] = { rows: rows.length, hash: sha(JSON.stringify(rows)) };
  }
  // cash flow rows that are NOT invoice payments must survive untouched
  const manual = await all("cash_flow_entries", "*", (q) => q.is("invoice_id", null));
  out["cash_flow_entries (bukan pembayaran invoice)"] = { rows: manual.length, hash: sha(JSON.stringify(manual)) };
  return out;
}

function addSheet(wb, name, rows) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 2)) }));
  for (const r of rows) {
    const flat = {};
    for (const c of cols) {
      const v = r[c];
      flat[c] = v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : v;
    }
    ws.addRow(flat);
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// ── 1. read everything that will be deleted ───────────────────────────────
log(`Mode: ${EXECUTE ? "EXECUTE (backup, lalu hapus)" : "backup + validasi saja (tidak ada perubahan)"}`);
const invoices = await all("invoices");
const invoiceIds = invoices.map((i) => i.id);
const payments = invoiceIds.length ? await all("cash_flow_entries", "*", (q) => q.not("invoice_id", "is", null)) : [];
const auditRows = await all("activity_log", "*", (q) => q.not("invoice_id", "is", null));
const students = new Map((await all("students", "id, full_name")).map((s) => [s.id, s.full_name]));
const enrollmentPrograms = new Map(
  (await all("enrollments", "id, program:program_id(name)")).map((e) => [e.id, e.program?.name ?? null])
);
const proofFiles = [];
for (const folder of ["invoice-proof", "invoice-proof-public"]) {
  const { data } = await db.storage.from(BUCKET).list(folder, { limit: 1000 });
  proofFiles.push(...(data ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`));
}
log(`Akan di-backup: ${invoices.length} invoice, ${payments.length} pembayaran (arus kas), ${proofFiles.length} file bukti, ${auditRows.length} baris audit (referensi).`);

// ── 2. write the backup ───────────────────────────────────────────────────
fs.mkdirSync(dir, { recursive: true });
const readable = invoices.map((i) => ({
  nama_murid: students.get(i.student_id) ?? null,
  program: i.enrollment_id ? enrollmentPrograms.get(i.enrollment_id) ?? null : null,
  ...i,
}));
const jsonPayload = {
  created_at_wib: stamp,
  source: process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0],
  tables: { invoices, cash_flow_entries: payments, activity_log_reference: auditRows },
  storage_files: proofFiles,
};
const jsonName = `tagihan-backup-${stamp}.json`;
const xlsxName = `tagihan-backup-${stamp}.xlsx`;
fs.writeFileSync(path.join(dir, jsonName), JSON.stringify(jsonPayload, null, 2));

const wb = new ExcelJS.Workbook();
wb.creator = "SLR Apps billing reset";
addSheet(wb, "Ringkasan", [
  { keterangan: "Dibuat (WIB)", nilai: stamp },
  { keterangan: "Invoice", nilai: invoices.length },
  ...Object.entries(invoices.reduce((a, i) => ((a[i.status] = (a[i.status] ?? 0) + 1), a), {})).map(([k, v]) => ({ keterangan: `Invoice status ${k}`, nilai: v })),
  { keterangan: "Pembayaran (cash_flow_entries terkait invoice)", nilai: payments.length },
  { keterangan: "File bukti bayar", nilai: proofFiles.length },
  { keterangan: "Activity log terkait invoice (referensi, tidak dihapus)", nilai: auditRows.length },
]);
addSheet(wb, "Invoice", readable);
addSheet(wb, "Pembayaran (arus kas)", payments);
addSheet(wb, "Activity log (referensi)", auditRows);
addSheet(wb, "File bukti bayar", proofFiles.map((p) => ({ path: p })));
await wb.xlsx.writeFile(path.join(dir, xlsxName));

// download proof files, if any
for (const p of proofFiles) {
  const { data, error } = await db.storage.from(BUCKET).download(p);
  if (error) throw new Error(`download ${p}: ${error.message}`);
  const out = path.join(dir, "bukti-bayar", p);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await data.arrayBuffer()));
}

// ── 3. validate the backup by reading it back ─────────────────────────────
const back = JSON.parse(fs.readFileSync(path.join(dir, jsonName), "utf8"));
const wbBack = new ExcelJS.Workbook();
await wbBack.xlsx.readFile(path.join(dir, xlsxName));
const sheetRows = (name) => (wbBack.getWorksheet(name)?.rowCount ?? 1) - 1;
const ids = (rows) => rows.map((r) => r.id).sort().join(",");
const checks = [
  ["JSON invoice = database", back.tables.invoices.length === invoices.length && ids(back.tables.invoices) === ids(invoices)],
  ["JSON pembayaran = database", back.tables.cash_flow_entries.length === payments.length && ids(back.tables.cash_flow_entries) === ids(payments)],
  ["Excel sheet Invoice lengkap", sheetRows("Invoice") === invoices.length],
  ["Excel sheet Pembayaran lengkap", sheetRows("Pembayaran (arus kas)") === payments.length],
  ["Semua file bukti terunduh", proofFiles.every((p) => fs.existsSync(path.join(dir, "bukti-bayar", p)))],
  ["Setiap pembayaran menunjuk invoice yang di-backup", payments.every((p) => invoiceIds.includes(p.invoice_id))],
];
fs.writeFileSync(
  path.join(dir, "SHA256SUMS.txt"),
  [jsonName, xlsxName].map((f) => `${sha(fs.readFileSync(path.join(dir, f)))}  ${f}`).join("\n") + "\n"
);
for (const [name, ok] of checks) log(`${ok ? "OK  " : "GAGAL"} backup: ${name}`);
const backupOk = checks.every(([, ok]) => ok);
log(`Backup: ${dir}`);
if (!backupOk) {
  log("Backup TIDAK valid — tidak ada data yang dihapus.");
  process.exit(1);
}
if (!EXECUTE) {
  log("Backup valid. Jalankan dengan --execute untuk menghapus.");
  process.exit(0);
}

// ── 4. delete (payments first, then invoices, then proof files) ───────────
const before = await fingerprint();
const del = async (table, idList) => {
  let n = 0;
  for (let i = 0; i < idList.length; i += 100) {
    const { error, count } = await db.from(table).delete({ count: "exact" }).in("id", idList.slice(i, i + 100));
    if (error) throw new Error(`hapus ${table}: ${error.message}`);
    n += count ?? 0;
  }
  return n;
};
const deletedPayments = await del("cash_flow_entries", payments.map((p) => p.id));
const deletedInvoices = await del("invoices", invoiceIds);
let deletedFiles = 0;
if (proofFiles.length) {
  const { data, error } = await db.storage.from(BUCKET).remove(proofFiles);
  if (error) throw new Error(`hapus file bukti: ${error.message}`);
  deletedFiles = data?.length ?? 0;
}
log(`Dihapus: ${deletedInvoices} invoice, ${deletedPayments} pembayaran, ${deletedFiles} file bukti.`);

// ── 5. verify ─────────────────────────────────────────────────────────────
const after = await fingerprint();
const { count: invLeft } = await db.from("invoices").select("*", { count: "exact", head: true });
const { count: payLeft } = await db.from("cash_flow_entries").select("*", { count: "exact", head: true }).not("invoice_id", "is", null);
log(`Sisa: ${invLeft} invoice, ${payLeft} pembayaran terkait invoice.`);
let unchanged = true;
for (const t of Object.keys(before)) {
  const same = before[t].rows === after[t].rows && before[t].hash === after[t].hash;
  if (!same) unchanged = false;
  log(`${same ? "tetap " : "BERUBAH"} ${t.padEnd(46)} ${before[t].rows} -> ${after[t].rows}`);
}
fs.writeFileSync(
  path.join(dir, "hasil-penghapusan.json"),
  JSON.stringify({ deleted: { invoices: deletedInvoices, payments: deletedPayments, files: deletedFiles }, remaining: { invoices: invLeft, payments: payLeft }, protected_before: before, protected_after: after, unchanged }, null, 2)
);
process.exit(invLeft === 0 && payLeft === 0 && unchanged ? 0 : 1);
