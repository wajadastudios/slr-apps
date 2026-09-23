import "server-only";
import ExcelJS from "exceljs";
import { TAX_DISCLAIMER } from "./shared";

export type ExportColumn<T> = { header: string; key: string; width?: number; value: (row: T) => string | number | null };

export type ExportMeta = {
  periodFrom: string;
  periodTo: string;
  generatedAtISO: string;
  generatedBy: string;
  filters: Record<string, string | undefined>;
};

// One workbook, nine sheets, per the spec. Every sheet gets the same
// metadata block at the top (periode, kapan/oleh siapa di-export, filter
// yang dipakai) so a printed/forwarded copy is self-describing without the
// app around it; the tax sheet additionally carries the estimate disclaimer
// on every row group, not just once, since it is the sheet most likely to
// be read out of context.
export function createFinanceWorkbook(meta: ExportMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.generatedBy;
  wb.created = new Date(meta.generatedAtISO);
  return wb;
}

function writeMetaBlock(sheet: ExcelJS.Worksheet, meta: ExportMeta, extraNote?: string) {
  sheet.addRow([`Periode laporan: ${meta.periodFrom} s.d. ${meta.periodTo}`]);
  sheet.addRow([`Diexport: ${new Date(meta.generatedAtISO).toLocaleString("id-ID")} oleh ${meta.generatedBy}`]);
  const filterText = Object.entries(meta.filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  sheet.addRow([`Filter: ${filterText || "(tidak ada filter tambahan)"}`]);
  if (extraNote) sheet.addRow([extraNote]);
  sheet.addRow([]);
  for (let i = 1; i <= (extraNote ? 4 : 3); i++) {
    sheet.getRow(i).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  }
}

export function addDataSheet<T>(
  wb: ExcelJS.Workbook,
  name: string,
  columns: ExportColumn<T>[],
  rows: T[],
  meta: ExportMeta,
  extraNote?: string
): ExcelJS.Worksheet {
  const sheet = wb.addWorksheet(name.slice(0, 31));
  writeMetaBlock(sheet, meta, extraNote);
  const headerRowIndex = sheet.rowCount + 1;
  sheet.addRow(columns.map((c) => c.header));
  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDF3F6" } };
  });
  for (const row of rows) {
    sheet.addRow(columns.map((c) => c.value(row)));
  }
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width ?? 18 }));
  // columns width must be set after addRow when not using sheet.columns
  // definitions up front; re-apply explicitly to be safe across exceljs
  // versions.
  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width ?? 18;
  });
  return sheet;
}

export function addSummarySheet(
  wb: ExcelJS.Workbook,
  meta: ExportMeta,
  totals: { label: string; value: string }[]
): ExcelJS.Worksheet {
  const sheet = wb.addWorksheet("Ringkasan Keuangan");
  writeMetaBlock(sheet, meta);
  const headerRowIndex = sheet.rowCount + 1;
  sheet.addRow(["Metrik", "Nilai"]);
  sheet.getRow(headerRowIndex).font = { bold: true };
  for (const t of totals) sheet.addRow([t.label, t.value]);
  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 24;
  return sheet;
}

export function addTaxSheet(
  wb: ExcelJS.Workbook,
  meta: ExportMeta,
  totals: { label: string; value: string }[],
  lines: { label: string; basis: string; rate: string; amount: string; confirmation: string }[]
): ExcelJS.Worksheet {
  const sheet = addDataSheet(
    wb,
    "Pajak & Kepatuhan - Estimasi",
    [
      { header: "Pajak", key: "label", value: (r: (typeof lines)[number]) => r.label, width: 28 },
      { header: "Dasar pengenaan", key: "basis", value: (r) => r.basis, width: 20 },
      { header: "Tarif", key: "rate", value: (r) => r.rate, width: 14 },
      { header: "Estimasi", key: "amount", value: (r) => r.amount, width: 18 },
      { header: "Status konfirmasi", key: "confirmation", value: (r) => r.confirmation, width: 22 },
    ],
    lines,
    meta,
    TAX_DISCLAIMER
  );
  const startRow = sheet.rowCount + 2;
  sheet.addRow([]);
  sheet.addRow(["Ringkasan dasar perhitungan"]);
  sheet.getRow(startRow + 1).font = { bold: true };
  for (const t of totals) sheet.addRow([t.label, t.value]);
  sheet.addRow([]);
  sheet.addRow([TAX_DISCLAIMER]);
  sheet.lastRow!.font = { bold: true, color: { argb: "FFA3183C" } };
  return sheet;
}
