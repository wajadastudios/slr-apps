// Shared types, labels and period helpers for the Keuangan module. Kept
// framework-agnostic (no "server-only") so these can be imported from both
// server components/actions and the exceljs export builder.

export type CashFlowDirection = "masuk" | "keluar";

export type CashFlowCategory =
  | "pembayaran_murid"
  | "refund"
  | "gaji_pengajar"
  | "sewa_lokasi"
  | "perlengkapan"
  | "marketing"
  | "operasional"
  | "pajak"
  | "lainnya";

export const CASH_FLOW_CATEGORY_LABEL: Record<CashFlowCategory, string> = {
  pembayaran_murid: "Pembayaran murid",
  refund: "Refund",
  gaji_pengajar: "Gaji pengajar",
  sewa_lokasi: "Sewa lokasi/kolam",
  perlengkapan: "Perlengkapan",
  marketing: "Marketing",
  operasional: "Operasional",
  pajak: "Pajak",
  lainnya: "Lainnya",
};

export type CashFlowStatus = "draft" | "tercatat" | "dibayar" | "dibatalkan";

export const CASH_FLOW_STATUS_LABEL: Record<CashFlowStatus, string> = {
  draft: "Draft",
  tercatat: "Tercatat",
  dibayar: "Dibayar",
  dibatalkan: "Dibatalkan",
};

export type ExpenseCategory = "sewa_lokasi" | "perlengkapan" | "marketing" | "operasional" | "pajak" | "lainnya";

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  sewa_lokasi: "Sewa lokasi/kolam",
  perlengkapan: "Perlengkapan",
  marketing: "Marketing",
  operasional: "Operasional",
  pajak: "Pajak",
  lainnya: "Lainnya",
};

export type ExpensePaymentStatus = "belum_dibayar" | "dibayar" | "dibatalkan";

export const EXPENSE_STATUS_LABEL: Record<ExpensePaymentStatus, string> = {
  belum_dibayar: "Belum dibayar",
  dibayar: "Dibayar",
  dibatalkan: "Dibatalkan",
};

export type PayrollStatus = "draft" | "disetujui" | "dibayar" | "dibatalkan";

export const PAYROLL_STATUS_LABEL: Record<PayrollStatus, string> = {
  draft: "Draft",
  disetujui: "Disetujui",
  dibayar: "Dibayar",
  dibatalkan: "Dibatalkan",
};

export const TAX_TYPE_LABEL: Record<string, string> = {
  pph_estimasi: "PPh (estimasi)",
  ppn_estimasi: "PPN (estimasi)",
  potongan_gaji_vendor: "Potongan gaji/vendor",
  lainnya: "Lainnya",
};

export const TAX_BASIS_LABEL: Record<string, string> = {
  omzet: "Omzet",
  laba: "Laba",
  invoice: "Invoice",
  biaya: "Biaya",
  manual: "Nominal manual",
};

export const BUSINESS_FORM_LABEL: Record<string, string> = {
  individu: "Individu",
  pt_perorangan: "PT Perorangan",
  cv: "CV",
  firma: "Firma",
  koperasi: "Koperasi",
  pt: "PT",
};

// The one line every tax-estimate surface (report, export sheet, dashboard
// card) must show, verbatim, per the finance module's own ground rule.
export const TAX_DISCLAIMER = "Estimasi internal — verifikasi dengan akuntan sebelum pelaporan.";
export const NOT_OFFICIAL_NOTE = "Bukan angka pelaporan resmi.";

export type Period = { from: string; to: string }; // inclusive ISO dates (YYYY-MM-DD)

export function defaultPeriod(todayISO: string): Period {
  const [y, m] = todayISO.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  return { from, to: todayISO };
}

export function resolvePeriod(params: { from?: string; to?: string }, todayISO: string): Period {
  const fallback = defaultPeriod(todayISO);
  return {
    from: params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : fallback.from,
    to: params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : fallback.to,
  };
}

// exclusive-end helper for querying a timestamptz column with a plain date
// range (a "to" date should include that whole day).
export function periodToExclusiveEnd(to: string): string {
  const d = new Date(`${to}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
