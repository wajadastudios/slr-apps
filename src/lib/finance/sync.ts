import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseCategory } from "./shared";

// "Invoice berstatus paid harus otomatis tercatat sebagai uang masuk, tanpa
// membuat duplikasi jika sinkronisasi dijalankan ulang." These three
// functions are the single place that turns a paid invoice / paid payroll /
// paid expense into a cash_flow_entries row. They are safe to call on every
// page load: each one only inserts rows for sources that don't already have
// a cash_flow_entries row (checked first, and backstopped by a partial
// unique index in 0039_finance_module.sql), so re-running never duplicates.

type Db = SupabaseClient;

function toDateOnly(iso: string | null | undefined): string {
  return (iso ?? new Date().toISOString()).slice(0, 10);
}

export async function syncPaidInvoicesToCashFlow(supabase: Db, actorId: string | null): Promise<number> {
  const { data: paid } = await supabase
    .from("invoices")
    .select("id, amount, created_at, sent_at, student_id, enrollment_id, payment_method")
    .eq("status", "paid");
  if (!paid || paid.length === 0) return 0;

  const ids = paid.map((i) => i.id);
  const { data: existing } = await supabase.from("cash_flow_entries").select("invoice_id").in("invoice_id", ids);
  const already = new Set((existing ?? []).map((e) => e.invoice_id));
  const missing = paid.filter((i) => !already.has(i.id));
  if (missing.length === 0) return 0;

  const enrollmentIds = [...new Set(missing.map((i) => i.enrollment_id).filter((v): v is string => !!v))];
  const { data: enrollments } = enrollmentIds.length
    ? await supabase.from("enrollments").select("id, program_id").in("id", enrollmentIds)
    : { data: [] as { id: string; program_id: string }[] };
  const programByEnrollment = new Map((enrollments ?? []).map((e) => [e.id, e.program_id]));

  const studentIds = [...new Set(missing.map((i) => i.student_id))];
  const { data: scheduleRows } = studentIds.length
    ? await supabase
        .from("schedules")
        .select("student_id, slot:slot_id(location, program_id)")
        .in("student_id", studentIds)
    : { data: [] as { student_id: string; slot: { location: string | null; program_id: string } | null }[] };
  const locationByStudentProgram = new Map<string, string | null>();
  for (const s of scheduleRows ?? []) {
    const slot = s.slot as unknown as { location: string | null; program_id: string } | null;
    if (!slot) continue;
    locationByStudentProgram.set(`${s.student_id}:${slot.program_id}`, slot.location);
  }

  const rows = missing.map((i) => {
    const programId = i.enrollment_id ? (programByEnrollment.get(i.enrollment_id) ?? null) : null;
    const location = programId ? (locationByStudentProgram.get(`${i.student_id}:${programId}`) ?? null) : null;
    return {
      entry_date: toDateOnly(i.sent_at ?? i.created_at),
      direction: "masuk" as const,
      category: "pembayaran_murid" as const,
      amount: i.amount,
      payment_method: i.payment_method,
      invoice_id: i.id,
      program_id: programId,
      location,
      status: "tercatat" as const,
      note: "Sinkron otomatis dari invoice lunas",
      created_by: actorId,
      updated_by: actorId,
    };
  });

  const { error } = await supabase.from("cash_flow_entries").insert(rows);
  // A duplicate-key race (another request synced the same invoice between the
  // check above and this insert) is expected and harmless -- the row it
  // raced against is exactly the one this call would have written.
  if (error && !error.message.includes("duplicate key")) throw error;
  return rows.length;
}

export async function syncPaidPayrollToCashFlow(supabase: Db, actorId: string | null): Promise<number> {
  const { data: paid } = await supabase
    .from("payroll_payments")
    .select("id, net_amount, amount, paid_at, created_at, payment_method, is_test")
    .eq("status", "dibayar");
  if (!paid || paid.length === 0) return 0;

  const ids = paid.map((p) => p.id);
  const { data: existing } = await supabase.from("cash_flow_entries").select("payroll_payment_id").in("payroll_payment_id", ids);
  const already = new Set((existing ?? []).map((e) => e.payroll_payment_id));
  const missing = paid.filter((p) => !already.has(p.id));
  if (missing.length === 0) return 0;

  const rows = missing.map((p) => ({
    entry_date: toDateOnly(p.paid_at ?? p.created_at),
    direction: "keluar" as const,
    category: "gaji_pengajar" as const,
    amount: p.net_amount ?? p.amount,
    payment_method: p.payment_method,
    payroll_payment_id: p.id,
    status: "tercatat" as const,
    note: "Sinkron otomatis dari gaji pengajar yang sudah dibayar",
    is_test: p.is_test ?? false,
    created_by: actorId,
    updated_by: actorId,
  }));

  const { error } = await supabase.from("cash_flow_entries").insert(rows);
  if (error && !error.message.includes("duplicate key")) throw error;
  return rows.length;
}

export async function syncPaidExpensesToCashFlow(supabase: Db, actorId: string | null): Promise<number> {
  const { data: paid } = await supabase
    .from("operational_expenses")
    .select("id, category, amount, paid_at, expense_date, payment_method, program_id, location, is_test")
    .eq("payment_status", "dibayar");
  if (!paid || paid.length === 0) return 0;

  const ids = paid.map((e) => e.id);
  const { data: existing } = await supabase.from("cash_flow_entries").select("expense_id").in("expense_id", ids);
  const already = new Set((existing ?? []).map((e) => e.expense_id));
  const missing = paid.filter((e) => !already.has(e.id));
  if (missing.length === 0) return 0;

  const rows = missing.map((e) => ({
    entry_date: toDateOnly(e.paid_at ? e.paid_at.slice(0, 10) : e.expense_date),
    direction: "keluar" as const,
    category: e.category as ExpenseCategory,
    amount: e.amount,
    payment_method: e.payment_method,
    expense_id: e.id,
    program_id: e.program_id,
    location: e.location,
    status: "tercatat" as const,
    note: "Sinkron otomatis dari biaya operasional yang sudah dibayar",
    is_test: e.is_test ?? false,
    created_by: actorId,
    updated_by: actorId,
  }));

  const { error } = await supabase.from("cash_flow_entries").insert(rows);
  if (error && !error.message.includes("duplicate key")) throw error;
  return rows.length;
}

export async function syncAllToCashFlow(supabase: Db, actorId: string | null): Promise<{ invoices: number; payroll: number; expenses: number }> {
  const [invoices, payroll, expenses] = await Promise.all([
    syncPaidInvoicesToCashFlow(supabase, actorId),
    syncPaidPayrollToCashFlow(supabase, actorId),
    syncPaidExpensesToCashFlow(supabase, actorId),
  ]);
  return { invoices, payroll, expenses };
}
