import type { SupabaseClient } from "@supabase/supabase-js";

// What ANY account that manages or is a participant may know about payment:
// who is responsible, and whether the invoice is settled. Never the amount, the
// invoice id or a payment link -- those stay with the one billing account (RLS
// on `invoices`); these come from security-definer summaries.

export type InvoiceSummary = {
  invoice_id: string | null; // only set for the paying account
  student_id: string;
  enrollment_id: string | null;
  status: "sent" | "processing" | "paid";
  sessions_count: number;
  package_name: string;
  created_at: string;
  is_payer: boolean;
};

export type EnrollmentBilling = {
  enrollment_id: string;
  student_id: string;
  payer_name: string | null;
  is_payer: boolean;
  // the participant is to pay from their own account, which does not exist yet
  payer_pending: boolean;
};

export async function loadInvoiceSummaries(supabase: SupabaseClient): Promise<InvoiceSummary[]> {
  const { data } = await supabase.rpc("invoice_summaries");
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      invoice_id: (r.out_invoice_id as string | null) ?? null,
      student_id: r.out_student_id as string,
      enrollment_id: (r.out_enrollment_id as string | null) ?? null,
      status: r.out_status as InvoiceSummary["status"],
      sessions_count: Number(r.out_sessions_count ?? 0),
      package_name: String(r.out_package_name ?? ""),
      created_at: String(r.out_created_at ?? ""),
      is_payer: r.out_is_payer === true,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function loadEnrollmentBilling(supabase: SupabaseClient): Promise<Map<string, EnrollmentBilling>> {
  const { data } = await supabase.rpc("enrollment_billing");
  const map = new Map<string, EnrollmentBilling>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    map.set(r.out_enrollment_id as string, {
      enrollment_id: r.out_enrollment_id as string,
      student_id: r.out_student_id as string,
      payer_name: (r.out_payer_name as string | null) ?? null,
      is_payer: r.out_is_payer === true,
      payer_pending: r.out_payer_pending === true,
    });
  }
  return map;
}

export type BillingNote = { line: string; status: string | null };

const STATUS_TEXT: Record<InvoiceSummary["status"], string> = {
  sent: "Menunggu pembayaran",
  processing: "Pembayaran sedang diverifikasi",
  paid: "Lunas",
};

// The short note shown on a participant whose invoices someone else pays.
// Null when the viewer pays themselves (they have the Tagihan menu).
export function billingNote(
  billing: EnrollmentBilling | undefined,
  invoices: InvoiceSummary[]
): BillingNote | null {
  if (!billing || billing.is_payer) return null;
  if (billing.payer_pending) {
    return { line: "Tagihan akan dikelola oleh peserta setelah akunnya aktif", status: null };
  }
  if (!billing.payer_name) return null;
  const latest = invoices.find((i) => i.enrollment_id === billing.enrollment_id);
  return {
    line: `Tagihan dikelola oleh ${billing.payer_name}`,
    status: latest ? STATUS_TEXT[latest.status] : null,
  };
}
