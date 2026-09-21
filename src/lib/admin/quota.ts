import { rupiah } from "./format";

// Quota rules (one place, so the dashboard, the billing page and the
// participant page can never disagree):
//   * only invoices with status "paid" add sessions
//   * every attended session ("hadir") uses one
//   * anything else -- draft, approved, sent, processing -- adds nothing

export type InvoiceLite = {
  id: string;
  student_id: string;
  enrollment_id: string | null;
  status: string;
  sessions_count: number;
  amount?: number | string | null;
  package_name?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
};

export type Quota = {
  bought: number;
  attended: number;
  remaining: number;
  // attended more than was bought: old data, shown as a warning, never fixed silently
  overdrawn: number;
};

export function computeQuota(paidSessions: number, attended: number): Quota {
  return {
    bought: paidSessions,
    attended,
    remaining: Math.max(0, paidSessions - attended),
    overdrawn: Math.max(0, attended - paidSessions),
  };
}

export function paidSessionsOf(invoices: Pick<InvoiceLite, "status" | "sessions_count">[]): number {
  return invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.sessions_count, 0);
}

export function quotaLine(q: Quota): string {
  return `Kuota dibeli: ${q.bought} sesi · Sudah hadir: ${q.attended} · Sisa: ${q.remaining} sesi`;
}

export const OPEN_INVOICE = ["draft", "approved", "sent", "processing"] as const;
export const isOpenInvoice = (status: string) => (OPEN_INVOICE as readonly string[]).includes(status);

export type BillingReason = "no_package" | "low_quota";

// Does this participant need a new invoice? An invoice that is already open
// (draft, sent, waiting for verification) is the answer -- another one would
// double-bill.
export function billingReason(q: Quota, threshold: number, hasOpenInvoice: boolean): BillingReason | null {
  if (hasOpenInvoice) return null;
  if (q.bought === 0) return "no_package";
  if (q.remaining <= threshold) return "low_quota";
  return null;
}

export const REASON_TEXT: Record<BillingReason, string> = {
  no_package: "Belum punya paket lunas",
  low_quota: "Sisa kuota hampir habis",
};

export type InvoiceProblem = "not_linked" | "no_sessions" | "closed_enrollment";

// A paid invoice that does not give its participant any sessions.
export function invoiceProblem(
  inv: Pick<InvoiceLite, "status" | "sessions_count" | "enrollment_id">,
  enrollmentStatus: string | null | undefined
): InvoiceProblem | null {
  if (inv.status !== "paid") return null;
  if (!inv.sessions_count || inv.sessions_count <= 0) return "no_sessions";
  if (!inv.enrollment_id) return "not_linked";
  if (enrollmentStatus === "cancelled" || enrollmentStatus === "rejected") return "closed_enrollment";
  return null;
}

export const PROBLEM_TEXT: Record<InvoiceProblem, string> = {
  no_sessions: "Lunas, tetapi paket tidak menambah sesi",
  not_linked: "Lunas, tetapi belum terhubung ke pendaftaran kelas",
  closed_enrollment: "Lunas, tetapi pendaftaran kelasnya sudah ditutup",
};

// A "sent" invoice unpaid for longer than the allowed days is overdue.
export function isOverdue(inv: Pick<InvoiceLite, "status" | "sent_at">, days: number, now = new Date()): boolean {
  if (inv.status !== "sent" || !inv.sent_at) return false;
  return now.getTime() - new Date(inv.sent_at).getTime() > days * 86_400_000;
}

export const invoiceLabel = (i: Pick<InvoiceLite, "package_name" | "sessions_count" | "amount">) =>
  `${i.package_name ?? "Paket"} (${i.sessions_count} sesi)${i.amount != null ? ` · ${rupiah(i.amount)}` : ""}`;
