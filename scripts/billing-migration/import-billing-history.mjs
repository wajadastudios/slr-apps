// Billing history migration: SLR_Template_Migrasi_Riwayat_Tagihan.xlsx -> invoices.
//
//   node scripts/billing-migration/import-billing-history.mjs --file=<xlsx>            # dry-run (read-only)
//   node scripts/billing-migration/import-billing-history.mjs --file=<xlsx> --execute  # import
//
// Rules (from the migration brief):
//  - only rows with "Status Kelengkapan" = "Siap diimpor"; the Excel is the only source
//  - required: Nama Murid, Program, Tanggal Tagihan, Jumlah Sesi, Nominal, Status;
//    "Lunas" also requires Tanggal Pembayaran
//  - student matched by "ID Murid SLR" when given, else by EXACT name (full name
//    or nickname, case/space-insensitive). Not found / ambiguous / not enrolled in
//    the program -> rejected and reported, never guessed
//  - one invoice per valid row, with the original dates; only "Lunas" adds sessions
//  - "Kode Migrasi" is stored in invoices.migration_code (unique): re-running never
//    creates a second invoice for the same code
//  - never touches reports/attendance, schedules, accounts or students; sends no
//    WhatsApp/email/app notification (none exist on the database insert path)
//  - writes a result report (xlsx) to backups/migrasi-tagihan-<stamp>/ (gitignored)

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const EXECUTE = process.argv.includes("--execute");
const fileArg = process.argv.find((a) => a.startsWith("--file="));
if (!fileArg) throw new Error("Pakai --file=<path ke xlsx>");
const FILE = fileArg.slice(7);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SHEET = "Riwayat Tagihan";
const HEADER_ROW = 4;
const STATUS = { lunas: "paid", "menunggu pembayaran": "sent", dibatalkan: "cancelled" };
const METHOD = { "transfer bank": "transfer", qris: "qris", tunai: "tunai", "payment gateway": "payment_gateway", lainnya: "lainnya", "tidak tercatat": null };
const MONTHS = { januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12 };

const norm = (s) => String(s ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const todayWib = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());

function cellValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null; // formula: cached result
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text) return v.text;
    if ("sharedFormula" in v || "formula" in v) return null;
  }
  return v;
}

/** Excel date or Indonesian text ("12 Mei 2025") -> "YYYY-MM-DD", else null. */
function parseDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10); // Excel dates are stored as UTC midnight
  if (typeof v === "string") {
    const s = v.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return s;
    m = s.match(/^(\d{1,2})[ \-/]+([A-Za-z]+)[ \-/]+(\d{4})$/);
    if (m && MONTHS[m[2].toLowerCase()]) {
      const d = `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      const check = new Date(`${d}T00:00:00Z`);
      if (!Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === d) return d;
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}
const toNumber = (v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
};

// ── read the Excel ─────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const ws = wb.getWorksheet(SHEET);
if (!ws) throw new Error(`Sheet "${SHEET}" tidak ditemukan`);
const headers = [];
ws.getRow(HEADER_ROW).eachCell({ includeEmpty: true }, (c, i) => (headers[i] = String(cellValue(c) ?? "").trim()));
const col = (prefix) => {
  const i = headers.findIndex((h) => h && h.toLowerCase().startsWith(prefix.toLowerCase()));
  if (i < 0) throw new Error(`Kolom "${prefix}" tidak ditemukan`);
  return i;
};
const C = {
  code: col("Kode Migrasi"),
  studentId: col("ID Murid SLR"),
  name: col("Nama Murid"),
  program: col("Program"),
  billDate: col("Tanggal Tagihan"),
  payDate: col("Tanggal Pembayaran"),
  package: col("Paket"),
  sessions: col("Jumlah Sesi"),
  amount: col("Nominal"),
  status: col("Status Pembayaran"),
  method: col("Metode Pembayaran"),
  reference: col("Referensi Pembayaran"),
  note: col("Catatan"),
  ready: col("Status Kelengkapan"),
};
const rows = [];
for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const get = (k) => cellValue(row.getCell(C[k]));
  if (norm(get("ready")) !== "siap diimpor") continue;
  rows.push({ excelRow: r, ...Object.fromEntries(Object.keys(C).map((k) => [k, get(k)])) });
}

// ── reference data from SLR (read-only) ───────────────────────────────────
const { data: students } = await db.from("students").select("id, full_name, nickname, is_test");
const { data: enrollments } = await db.from("enrollments").select("id, student_id, status, program:program_id(name)");
const { data: programs } = await db.from("programs").select("name");
const programNames = new Set(programs.map((p) => norm(p.name)));

const schema = await db.from("invoices").select("migration_code, paid_at").limit(1);
const hasMigrationColumns = !schema.error;
const existingCodes = new Set();
if (hasMigrationColumns) {
  const { data } = await db.from("invoices").select("migration_code").not("migration_code", "is", null);
  for (const r of data) existingCodes.add(r.migration_code);
}

// ── validate every row ─────────────────────────────────────────────────────
const codeCount = rows.reduce((m, r) => m.set(norm(r.code), (m.get(norm(r.code)) ?? 0) + 1), new Map());
const results = rows.map((r) => {
  const errors = [];
  const warnings = [];
  const code = String(r.code ?? "").trim();
  if (!code) errors.push("Kode Migrasi kosong");
  else if (codeCount.get(norm(code)) > 1) errors.push("Kode Migrasi ganda di Excel");

  const name = String(r.name ?? "").trim();
  if (!name) errors.push("Nama Murid kosong");
  const programName = String(r.program ?? "").trim();
  if (!programName) errors.push("Program kosong");
  else if (!programNames.has(norm(programName))) errors.push(`Program "${programName}" tidak ada di SLR`);

  const billDate = parseDate(r.billDate);
  if (!billDate) errors.push("Tanggal Tagihan kosong/tidak valid");
  const payDate = r.payDate == null || r.payDate === "" ? null : parseDate(r.payDate);
  if (r.payDate != null && r.payDate !== "" && !payDate) errors.push(`Tanggal Pembayaran tidak terbaca ("${r.payDate}")`);

  const sessions = toNumber(r.sessions);
  if (!Number.isInteger(sessions) || sessions <= 0) errors.push("Jumlah Sesi harus bilangan bulat > 0");
  const amount = toNumber(r.amount);
  if (!Number.isFinite(amount) || amount < 0) errors.push("Nominal tidak valid");

  const status = STATUS[norm(r.status)];
  if (!status) errors.push(`Status Pembayaran "${r.status ?? ""}" tidak dikenal`);
  if (status === "paid" && !payDate) errors.push("Status Lunas wajib Tanggal Pembayaran");
  if (billDate && billDate > todayWib) errors.push("Tanggal Tagihan di masa depan");
  if (payDate && payDate > todayWib) errors.push("Tanggal Pembayaran di masa depan");
  if (payDate && billDate && payDate < billDate) warnings.push("Tanggal Pembayaran sebelum Tanggal Tagihan");
  if (status !== "paid" && payDate) warnings.push("Ada Tanggal Pembayaran tetapi status bukan Lunas");

  const methodKey = norm(r.method);
  const method = methodKey === "" ? null : methodKey in METHOD ? METHOD[methodKey] : methodKey;

  // student
  let student = null;
  const givenId = String(r.studentId ?? "").trim();
  if (givenId) {
    student = students.find((s) => s.id === givenId) ?? null;
    if (!student) errors.push("ID Murid SLR tidak ditemukan");
    else if (name && norm(student.full_name) !== norm(name) && norm(student.nickname) !== norm(name)) {
      errors.push(`ID Murid SLR milik "${student.full_name}", bukan "${name}"`);
    }
  } else if (name) {
    const matches = students.filter((s) => !s.is_test && (norm(s.full_name) === norm(name) || (s.nickname && norm(s.nickname) === norm(name))));
    if (matches.length === 0) errors.push(`Murid "${name}" tidak ditemukan`);
    else if (matches.length > 1) errors.push(`Nama "${name}" ambigu (${matches.length} murid: ${matches.map((m) => m.full_name).join(", ")})`);
    else student = matches[0];
  }

  // enrollment in that program
  let enrollment = null;
  if (student && programName) {
    const mine = enrollments.filter((e) => e.student_id === student.id && norm(e.program?.name) === norm(programName));
    const live = mine.filter((e) => !["cancelled", "rejected"].includes(e.status));
    const pick = live.length === 1 ? live : mine.length === 1 ? mine : [];
    if (mine.length === 0) errors.push(`"${student.full_name}" tidak terdaftar di program ${programName}`);
    else if (pick.length !== 1) errors.push(`"${student.full_name}" punya ${mine.length} pendaftaran ${programName}; tidak dapat dipastikan`);
    else enrollment = pick[0];
  }

  const alreadyImported = hasMigrationColumns && existingCodes.has(code);
  return {
    ...r,
    code,
    billDate,
    payDate,
    sessions,
    amount,
    status,
    method,
    student,
    enrollment,
    errors,
    warnings,
    outcome: errors.length ? "ditolak" : alreadyImported ? "dilewati" : "siap",
  };
});

// ── summary ────────────────────────────────────────────────────────────────
const ready = results.filter((r) => r.outcome === "siap");
const rejected = results.filter((r) => r.outcome === "ditolak");
const skipped = results.filter((r) => r.outcome === "dilewati");
const reasons = rejected.flatMap((r) => r.errors).reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map());
console.log(`Mode: ${EXECUTE ? "EXECUTE (impor)" : "DRY-RUN (tidak ada perubahan)"}`);
console.log(`File: ${FILE}`);
console.log(`Baris "Siap diimpor": ${rows.length} | cocok & valid: ${ready.length} | ditolak: ${rejected.length} | sudah pernah diimpor (dilewati): ${skipped.length}`);
console.log(`Murid tercocokkan: ${new Set(ready.map((r) => r.student.id)).size}`);
for (const [reason, n] of reasons) console.log(`  ditolak ${n}x: ${reason}`);
const warn = results.flatMap((r) => r.warnings.map((w) => `${r.code}: ${w}`));
for (const w of warn) console.log(`  peringatan ${w}`);
const byStatus = ready.reduce((m, r) => {
  const k = r.status;
  m[k] = m[k] ?? { n: 0, nominal: 0, sesi: 0 };
  m[k].n++;
  m[k].nominal += r.amount;
  m[k].sesi += r.sessions;
  return m;
}, {});
console.log("Akan dibuat per status:", JSON.stringify(byStatus));
console.log(`Kolom migrasi di database (paid_at, migration_code): ${hasMigrationColumns ? "ada" : "BELUM ADA — jalankan migration 0047 sebelum impor"}`);

// ── import ─────────────────────────────────────────────────────────────────
const created = new Map();
if (EXECUTE) {
  if (!hasMigrationColumns) throw new Error("Migration 0047 belum dijalankan — impor dibatalkan, tidak ada data yang dibuat.");
  for (const r of ready) {
    const { data: number, error: numErr } = await db.rpc("next_invoice_number");
    if (numErr) throw new Error(`nomor invoice: ${numErr.message}`);
    const packageText = String(r.package ?? "").trim();
    const noteParts = [
      `Migrasi riwayat tagihan dari Excel (${r.code}, baris ${r.excelRow}).`,
      packageText ? `Paket/Keterangan di Excel: ${packageText}.` : null,
      r.reference ? `Referensi pembayaran: ${r.reference}.` : null,
      r.note ? `Catatan: ${r.note}.` : null,
    ].filter(Boolean);
    const { data, error } = await db
      .from("invoices")
      .insert({
        student_id: r.student.id,
        enrollment_id: r.enrollment.id,
        amount: r.amount,
        base_price: r.amount,
        discount_amount: 0,
        sessions_count: r.sessions,
        package_name: packageText && !/^\d+([.,]\d+)?$/.test(packageText) ? packageText : `Paket ${r.sessions} sesi (riwayat)`,
        status: r.status,
        payment_method: r.method,
        price_source: "migration",
        created_at: `${r.billDate}T00:00:00+07:00`,
        sent_at: r.status === "draft" ? null : `${r.billDate}T00:00:00+07:00`,
        paid_at: r.status === "paid" ? `${r.payDate}T00:00:00+07:00` : null,
        invoice_number: number,
        migration_code: r.code,
        // every non-draft invoice needs its public link (page, PDF, WhatsApp, email)
        public_token: randomBytes(32).toString("hex"),
        internal_note: noteParts.join(" "),
        is_test: false,
      })
      .select("id, invoice_number")
      .single();
    if (error) {
      // unique migration_code: a concurrent/earlier run already created it
      if (/migration_code/.test(error.message)) {
        r.outcome = "dilewati";
        r.errors.push("Kode Migrasi sudah ada di database");
      } else {
        r.outcome = "gagal";
        r.errors.push(error.message);
      }
      continue;
    }
    r.outcome = "berhasil";
    created.set(r.code, data);
  }
  console.log(`Dibuat: ${created.size} invoice.`);
}

// ── result report ──────────────────────────────────────────────────────────
const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "medium" })
  .format(new Date())
  .replace(" ", "_")
  .replace(/:/g, "");
const outDir = path.join(root, "backups", `migrasi-tagihan-${stamp}${EXECUTE ? "" : "-preview"}`);
fs.mkdirSync(outDir, { recursive: true });
const out = new ExcelJS.Workbook();
const sheet = out.addWorksheet(EXECUTE ? "Hasil Migrasi" : "Preview Migrasi");
sheet.columns = [
  ["Kode Migrasi", 14], ["Baris Excel", 10], ["Nama Murid (Excel)", 20], ["Murid ditemukan", 22], ["ID Murid SLR", 38],
  ["Program", 14], ["ID / Nomor Invoice", 40], ["Tanggal Tagihan", 14], ["Tanggal Pembayaran", 16], ["Jumlah Sesi", 10],
  ["Nominal", 12], ["Status", 10], ["Hasil", 12], ["Alasan / Catatan", 60],
].map(([header, width]) => ({ header, width }));
const OUTCOME = { siap: "akan diimpor", berhasil: "berhasil", dilewati: "dilewati", ditolak: "dilewati (ditolak)", gagal: "gagal" };
for (const r of results) {
  const inv = created.get(r.code);
  sheet.addRow([
    r.code, r.excelRow, String(r.name ?? ""), r.student?.full_name ?? "", r.student?.id ?? "", String(r.program ?? ""),
    inv ? `${inv.invoice_number} / ${inv.id}` : "", r.billDate ?? "", r.payDate ?? "", Number.isFinite(r.sessions) ? r.sessions : "",
    Number.isFinite(r.amount) ? r.amount : "", r.status ?? String(r.status ?? ""), OUTCOME[r.outcome] ?? r.outcome,
    [...r.errors, ...r.warnings.map((w) => `peringatan: ${w}`)].join("; "),
  ]);
}
sheet.getRow(1).font = { bold: true };
sheet.views = [{ state: "frozen", ySplit: 1 }];
const reportFile = path.join(outDir, `${EXECUTE ? "hasil" : "preview"}-migrasi-tagihan-${stamp}.xlsx`);
await out.xlsx.writeFile(reportFile);
console.log(`Laporan: ${reportFile}`);
