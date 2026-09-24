import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/create-account";
import { jakartaToday, toISODate } from "@/lib/week";
import { resolvePeriod, TAX_TYPE_LABEL, TAX_BASIS_LABEL, CASH_FLOW_CATEGORY_LABEL, EXPENSE_CATEGORY_LABEL, PAYROLL_STATUS_LABEL, type CashFlowCategory, type ExpenseCategory, type PayrollStatus } from "@/lib/finance/shared";
import { sumCashFlow, groupCashFlowBy, computeRingkasanTotals, type CashFlowEntryLite, type InvoiceLite } from "@/lib/finance/summary";
import { resolveEntityProfile, activeTaxSettingsOn, computeTaxEstimateLines, type TaxEntityProfileRow, type TaxSettingRow } from "@/lib/finance/tax";
import { isOverdue } from "@/lib/admin/quota";
import { createFinanceWorkbook, addDataSheet, addSummarySheet, addTaxSheet } from "@/lib/finance/export";

export async function GET(request: Request) {
  const session = await requireAdmin();
  const supabase = await createClient();
  const url = new URL(request.url);
  const todayISO = toISODate(jakartaToday());
  const period = resolvePeriod(
    { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined },
    todayISO
  );
  const programFilter = url.searchParams.get("program") ?? undefined;
  const locationFilter = url.searchParams.get("location") ?? undefined;
  const includeTest = url.searchParams.get("test") === "1";

  const [
    { data: programs },
    { data: cashFlowRows },
    { data: overdueSetting },
    { data: receivableRows },
    { data: expenseRows },
    { data: payrollRows },
    { data: profileRows },
    { data: settingRows },
    { data: activityRows },
  ] = await Promise.all([
    supabase.from("programs").select("id, name"),
    supabase
      .from("cash_flow_entries")
      .select(
        "id, entry_date, direction, category, amount, payment_method, program_id, location, note, status, is_test, invoice_id, payroll_payment_id, expense_id, created_by:created_by(full_name)"
      )
      .gte("entry_date", period.from)
      .lte("entry_date", period.to),
    supabase.from("site_settings").select("value").eq("key", "jatuh_tempo_hari").maybeSingle(),
    supabase
      .from("invoices")
      .select("id, amount, status, sent_at, package_name, is_test, student:student_id(full_name)")
      .in("status", ["sent", "processing"]),
    supabase
      .from("operational_expenses")
      .select("id, category, amount, expense_date, program_id, location, vendor, reference_number, payment_status, payment_method, note, is_test")
      .gte("expense_date", period.from)
      .lte("expense_date", period.to),
    supabase
      .from("payroll_payments")
      .select("id, pelatih_id, period_year, period_month, gross_amount, adjustment_amount, tax_deduction_amount, net_amount, amount, status, payment_method, paid_at, is_test, pelatih:pelatih_id(full_name)"),
    supabase.from("tax_entity_profile").select("*").order("effective_from", { ascending: false }),
    supabase.from("tax_settings").select("*").order("effective_from", { ascending: false }),
    supabase
      .from("activity_log")
      .select("id, created_at, actor_name, entity_type, action, note")
      .in("entity_type", ["cash_flow_entries", "operational_expenses", "payroll_payments", "tax_entity_profile", "tax_settings", "invoices", "program_packages"])
      .gte("created_at", `${period.from}T00:00:00Z`)
      .lte("created_at", `${period.to}T23:59:59Z`)
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const programName = new Map((programs ?? []).map((p) => [p.id, p.name]));
  const overdueDays = Number(overdueSetting?.value) > 0 ? Number(overdueSetting?.value) : 7;

  const cf = ((cashFlowRows ?? []) as unknown as (CashFlowEntryLite & { payment_method: string | null; note: string | null; is_test: boolean; created_by: { full_name: string } | null })[]).filter(
    (e) => (includeTest || !e.is_test) && (!programFilter || e.program_id === programFilter) && (!locationFilter || e.location === locationFilter)
  );

  const receivables: InvoiceLite[] = (receivableRows ?? []).filter((i) => includeTest || !i.is_test);
  const overdueIds = new Set(
    receivables.filter((r) => isOverdue({ status: r.status, sent_at: (r as unknown as { sent_at: string | null }).sent_at }, overdueDays)).map((r) => r.id)
  );

  const totals = computeRingkasanTotals({
    cashFlow: cf,
    from: period.from,
    to: period.to,
    receivableInvoices: receivables,
    overdueInvoiceIds: overdueIds,
    payrollUnpaidNet: (payrollRows ?? [])
      .filter((p) => ["draft", "disetujui"].includes(p.status) && (includeTest || !p.is_test))
      .reduce((s, p) => s + Number(p.net_amount ?? p.amount ?? 0), 0),
  });

  const meta = {
    periodFrom: period.from,
    periodTo: period.to,
    generatedAtISO: new Date().toISOString(),
    generatedBy: session.fullName ?? session.user.email ?? "Admin",
    filters: {
      program: programFilter ? (programName.get(programFilter) ?? programFilter) : undefined,
      location: locationFilter,
      data_uji: includeTest ? "disertakan" : "dikecualikan",
    },
  };

  const wb = createFinanceWorkbook(meta);

  // 1. Ringkasan Keuangan
  addSummarySheet(wb, meta, [
    { label: "Uang masuk", value: String(totals.uangMasuk) },
    { label: "Uang keluar", value: String(totals.uangKeluar) },
    { label: "Saldo bersih", value: String(totals.saldoBersih) },
    { label: "Piutang (belum dibayar)", value: String(totals.piutang) },
    { label: "Piutang jatuh tempo", value: String(totals.piutangJatuhTempo) },
    { label: "Gaji belum dibayar", value: String(totals.gajiBelumDibayar) },
  ]);

  // 2. Arus Kas
  addDataSheet(
    wb,
    "Arus Kas",
    [
      { header: "Tanggal", key: "entry_date", value: (r) => r.entry_date, width: 14 },
      { header: "Jenis", key: "direction", value: (r) => (r.direction === "masuk" ? "Masuk" : "Keluar"), width: 10 },
      { header: "Kategori", key: "category", value: (r) => CASH_FLOW_CATEGORY_LABEL[r.category as CashFlowCategory] ?? r.category, width: 20 },
      { header: "Nominal", key: "amount", value: (r) => Number(r.amount), width: 16 },
      { header: "Metode", key: "payment_method", value: (r) => r.payment_method ?? "", width: 14 },
      { header: "Program", key: "program", value: (r) => (r.program_id ? (programName.get(r.program_id) ?? "") : ""), width: 20 },
      { header: "Lokasi", key: "location", value: (r) => r.location ?? "", width: 20 },
      { header: "Status", key: "status", value: (r) => r.status, width: 12 },
      { header: "Catatan", key: "note", value: (r) => r.note ?? "", width: 30 },
      { header: "Data uji", key: "is_test", value: (r) => (r.is_test ? "[TEST]" : ""), width: 10 },
    ],
    cf,
    meta
  );

  // 3. Pendapatan per Program
  const perProgram = groupCashFlowBy(cf, period.from, period.to, "masuk", (e) => e.program_id ?? "__none").map((r) => ({
    label: r.key === "__none" ? "Tanpa program" : (programName.get(r.key) ?? r.key),
    total: r.total,
  }));
  addDataSheet(
    wb,
    "Pendapatan per Program",
    [
      { header: "Program", key: "label", value: (r: (typeof perProgram)[number]) => r.label, width: 28 },
      { header: "Total pemasukan", key: "total", value: (r) => r.total, width: 18 },
    ],
    perProgram,
    meta
  );

  // 4. Pendapatan per Lokasi
  const perLokasi = groupCashFlowBy(cf, period.from, period.to, "masuk", (e) => e.location ?? "__none").map((r) => ({
    label: r.key === "__none" ? "Tanpa lokasi" : r.key,
    total: r.total,
  }));
  addDataSheet(
    wb,
    "Pendapatan per Lokasi",
    [
      { header: "Lokasi", key: "label", value: (r: (typeof perLokasi)[number]) => r.label, width: 28 },
      { header: "Total pemasukan", key: "total", value: (r) => r.total, width: 18 },
    ],
    perLokasi,
    meta
  );

  // 5. Piutang dan Tagihan
  addDataSheet(
    wb,
    "Piutang dan Tagihan",
    [
      { header: "Peserta", key: "student", value: (r: (typeof receivables)[number]) => (r as unknown as { student: { full_name: string } | null }).student?.full_name ?? "", width: 24 },
      { header: "Paket", key: "package", value: (r) => (r as unknown as { package_name: string }).package_name, width: 24 },
      { header: "Nominal", key: "amount", value: (r) => Number(r.amount), width: 16 },
      { header: "Status", key: "status", value: (r) => r.status, width: 14 },
      { header: "Dikirim", key: "sent", value: (r) => (r as unknown as { sent_at: string | null }).sent_at ?? "", width: 14 },
      { header: "Jatuh tempo", key: "overdue", value: (r) => (overdueIds.has(r.id) ? "Ya" : "Tidak"), width: 12 },
    ],
    receivables,
    meta
  );

  // 6. Biaya Operasional
  const expenses = (expenseRows ?? []).filter((e) => includeTest || !e.is_test);
  addDataSheet(
    wb,
    "Biaya Operasional",
    [
      { header: "Tanggal", key: "date", value: (r: (typeof expenses)[number]) => r.expense_date, width: 14 },
      { header: "Kategori", key: "category", value: (r) => EXPENSE_CATEGORY_LABEL[r.category as ExpenseCategory] ?? r.category, width: 18 },
      { header: "Nominal", key: "amount", value: (r) => Number(r.amount), width: 16 },
      { header: "Program", key: "program", value: (r) => (r.program_id ? (programName.get(r.program_id) ?? "") : ""), width: 20 },
      { header: "Lokasi", key: "location", value: (r) => r.location ?? "", width: 18 },
      { header: "Vendor", key: "vendor", value: (r) => r.vendor ?? "", width: 20 },
      { header: "No. Referensi", key: "reference_number", value: (r) => r.reference_number ?? "", width: 16 },
      { header: "Status pembayaran", key: "payment_status", value: (r) => r.payment_status, width: 16 },
      { header: "Metode", key: "payment_method", value: (r) => r.payment_method ?? "", width: 14 },
      { header: "Catatan", key: "note", value: (r) => r.note ?? "", width: 30 },
    ],
    expenses,
    meta
  );

  // 7. Gaji Pengajar
  const payroll = (payrollRows ?? []).filter((p) => {
    if (!includeTest && p.is_test) return false;
    const periodDate = `${p.period_year}-${String(p.period_month).padStart(2, "0")}-01`;
    return periodDate >= period.from.slice(0, 7) + "-01" && periodDate <= period.to;
  });
  addDataSheet(
    wb,
    "Gaji Pengajar",
    [
      { header: "Pengajar", key: "pelatih", value: (r: (typeof payroll)[number]) => (r as unknown as { pelatih: { full_name: string } | null }).pelatih?.full_name ?? "", width: 22 },
      { header: "Periode", key: "period", value: (r) => `${r.period_month}/${r.period_year}`, width: 10 },
      { header: "Bruto", key: "gross", value: (r) => Number(r.gross_amount ?? r.amount), width: 16 },
      { header: "Penyesuaian", key: "adjustment", value: (r) => Number(r.adjustment_amount ?? 0), width: 14 },
      { header: "Potongan pajak (estimasi)", key: "tax", value: (r) => Number(r.tax_deduction_amount ?? 0), width: 18 },
      { header: "Bersih", key: "net", value: (r) => Number(r.net_amount ?? r.amount), width: 16 },
      { header: "Status", key: "status", value: (r) => PAYROLL_STATUS_LABEL[r.status as PayrollStatus] ?? r.status, width: 14 },
      { header: "Dibayar", key: "paid_at", value: (r) => r.paid_at ?? "", width: 14 },
    ],
    payroll,
    meta
  );

  // 8. Pajak & Kepatuhan -- Estimasi
  const profiles = (profileRows ?? []) as TaxEntityProfileRow[];
  const settings = (settingRows ?? []) as TaxSettingRow[];
  const currentProfile = resolveEntityProfile(profiles, todayISO);
  const pkpActive = currentProfile?.pkp_status === "pkp";
  const omzetBruto = sumCashFlow(cf, "masuk", period.from, period.to, "pembayaran_murid");
  const refund = sumCashFlow(cf, "keluar", period.from, period.to, "refund");
  const gajiPengajarTotal = sumCashFlow(cf, "keluar", period.from, period.to, "gaji_pengajar");
  const totalKeluar = sumCashFlow(cf, "keluar", period.from, period.to);
  const biayaOperasional = Math.max(0, totalKeluar - refund - gajiPengajarTotal);
  const pendapatanBersih = omzetBruto - refund;
  const labaRugiInternal = pendapatanBersih - biayaOperasional - gajiPengajarTotal;
  const activeSettings = activeTaxSettingsOn(settings, period.to);
  const lines = computeTaxEstimateLines(activeSettings, { omzet: omzetBruto, laba: labaRugiInternal, invoice: omzetBruto, biaya: biayaOperasional }, pkpActive);

  addTaxSheet(
    wb,
    meta,
    [
      { label: "Omzet bruto (invoice lunas)", value: String(omzetBruto) },
      { label: "Refund", value: String(refund) },
      { label: "Pendapatan bersih", value: String(pendapatanBersih) },
      { label: "Biaya operasional tercatat", value: String(biayaOperasional) },
      { label: "Gaji pengajar", value: String(gajiPengajarTotal) },
      { label: "Laba/rugi internal (sederhana)", value: String(labaRugiInternal) },
      { label: "Status PKP", value: currentProfile?.pkp_status === "pkp" ? "PKP" : "Belum PKP" },
    ],
    lines.map((l) => ({
      label: `${l.setting.tax_name} (${TAX_TYPE_LABEL[l.setting.tax_type]})`,
      basis: TAX_BASIS_LABEL[l.setting.basis],
      rate: l.setting.rate_percent != null ? `${l.setting.rate_percent}%` : "belum diisi",
      amount: l.estimatedAmount != null ? String(l.estimatedAmount) : "-",
      confirmation: l.setting.confirmation_status === "dikonfirmasi_akuntan" ? "Dikonfirmasi akuntan" : "Perlu dikonfirmasi akuntan",
    }))
  );

  // 9. Audit Trail Keuangan
  addDataSheet(
    wb,
    "Audit Trail Keuangan",
    [
      { header: "Waktu", key: "created_at", value: (r: NonNullable<typeof activityRows>[number]) => r.created_at, width: 20 },
      { header: "Oleh", key: "actor_name", value: (r) => r.actor_name ?? "Sistem", width: 20 },
      { header: "Entitas", key: "entity_type", value: (r) => r.entity_type, width: 22 },
      { header: "Aksi", key: "action", value: (r) => r.action, width: 12 },
      { header: "Catatan", key: "note", value: (r) => r.note ?? "", width: 30 },
    ],
    activityRows ?? [],
    meta
  );

  // "Catat ... export" -- activity_log's generic trigger only fires on
  // table writes, and an export writes nothing, so this is logged
  // explicitly as a note row (same convention resendInvoiceAction uses for
  // WhatsApp reminders in src/app/admin/tagihan/actions.ts).
  await supabase.from("activity_log").insert({
    entity_type: "finance_export",
    action: "note",
    note: `Export laporan keuangan ${period.from} s.d. ${period.to}${programFilter ? ` · program=${programName.get(programFilter) ?? programFilter}` : ""}${locationFilter ? ` · lokasi=${locationFilter}` : ""}`,
    actor_id: session.user.id,
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="laporan-keuangan-${period.from}_${period.to}.xlsx"`,
    },
  });
}
