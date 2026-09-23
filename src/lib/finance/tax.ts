import { TAX_DISCLAIMER } from "./shared";

// Pure logic: given already-loaded rows, resolve "the profile/settings in
// effect on date X" and turn an active percent-based tax_settings row into
// an estimated number. No hardcoded rate ever appears here -- every number
// this module can produce comes from a tax_settings row the Admin entered.

export type TaxEntityProfileRow = {
  id: string;
  entity_name: string;
  business_form: string;
  npwp: string | null;
  pkp_status: "belum_pkp" | "pkp";
  fiscal_year_start_month: number;
  accountant_note: string | null;
  effective_from: string;
};

export function resolveEntityProfile<T extends { effective_from: string }>(rows: T[], asOfISO: string): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.effective_from > asOfISO) continue;
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best;
}

export type TaxSettingRow = {
  id: string;
  tax_name: string;
  tax_type: "pph_estimasi" | "ppn_estimasi" | "potongan_gaji_vendor" | "lainnya";
  rate_percent: number | null;
  calculation_method: string | null;
  basis: "omzet" | "laba" | "invoice" | "biaya" | "manual";
  effective_from: string;
  effective_until: string | null;
  active: boolean;
  confirmation_status: "perlu_dikonfirmasi_akuntan" | "dikonfirmasi_akuntan";
  note: string | null;
  source_reference: string | null;
};

// Settings whose window covers `asOfISO` and are marked active -- a tax
// setting an admin created but left inactive, or scheduled for a period that
// hasn't started/has already ended, never contributes to an estimate.
export function activeTaxSettingsOn(rows: TaxSettingRow[], asOfISO: string): TaxSettingRow[] {
  return rows.filter(
    (r) =>
      r.active &&
      r.effective_from <= asOfISO &&
      (r.effective_until === null || r.effective_until >= asOfISO)
  );
}

export type TaxEstimateBasisAmounts = { omzet: number; laba: number; invoice: number; biaya: number };

export type TaxEstimateLine = {
  setting: TaxSettingRow;
  basisAmount: number;
  estimatedAmount: number | null; // null when rate_percent is missing (method is descriptive-only)
};

export function computeTaxEstimateLines(
  settings: TaxSettingRow[],
  basisAmounts: TaxEstimateBasisAmounts,
  pkpActive: boolean
): TaxEstimateLine[] {
  return settings
    .filter((s) => s.tax_type !== "ppn_estimasi" || pkpActive) // PPN never estimated unless PKP is active
    .map((s) => {
      const basisAmount = s.basis === "manual" ? 0 : basisAmounts[s.basis as keyof TaxEstimateBasisAmounts] ?? 0;
      const estimatedAmount = s.rate_percent != null ? (basisAmount * Number(s.rate_percent)) / 100 : null;
      return { setting: s, basisAmount, estimatedAmount };
    });
}

export { TAX_DISCLAIMER };
