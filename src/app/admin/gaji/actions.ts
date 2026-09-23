"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import { MONTH_NAMES } from "@/lib/payroll";

// Proof photo is uploaded client-side straight to Supabase Storage (same
// reason as media-ads: stays under the Vercel Server Action body cap),
// so this only ever receives the resulting small values -- called directly
// from the client, not as a <form action>, so it throws on error rather
// than redirecting.
//
// This is the ONLY step that ever sets status = 'dibayar'. If a draft/
// disetujui row already exists for this pelatih+period, its own
// gross/adjustment/net (whatever the admin already reviewed) is what gets
// paid -- this never silently recomputes a different amount from the live
// session count. Only when no row exists yet (the simple, no-adjustment
// path) does it compute gross = net = the live total and create the row
// directly as paid.
export async function markPayrollPaidAction(input: {
  pelatih_id: string;
  period_year: number;
  period_month: number;
  hadir_count: number;
  izin_sakit_count: number;
  amount: number; // live-computed total, used only when no draft exists
  proof_url: string | null;
  payment_method: string | null;
}) {
  const session = await requireAdmin();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("payroll_payments")
    .select("id, status, gross_amount, adjustment_amount, net_amount")
    .eq("pelatih_id", input.pelatih_id)
    .eq("period_year", input.period_year)
    .eq("period_month", input.period_month)
    .maybeSingle();

  if (existing && existing.status === "dibayar") {
    throw new Error("Gaji periode ini sudah dibayar.");
  }
  if (existing && existing.status === "draft") {
    throw new Error("Gaji ini masih draft -- setujui dulu sebelum dibayar.");
  }

  const netAmount = existing ? Number(existing.net_amount ?? existing.gross_amount ?? input.amount) : input.amount;

  const { error } = await supabase.from("payroll_payments").upsert(
    {
      pelatih_id: input.pelatih_id,
      period_year: input.period_year,
      period_month: input.period_month,
      hadir_count: input.hadir_count,
      izin_sakit_count: input.izin_sakit_count,
      amount: netAmount,
      gross_amount: existing ? existing.gross_amount : input.amount,
      adjustment_amount: existing ? existing.adjustment_amount : 0,
      net_amount: netAmount,
      status: "dibayar",
      payment_method: input.payment_method,
      proof_url: input.proof_url,
      paid_at: new Date().toISOString(),
      paid_by: session.user.id,
    },
    { onConflict: "pelatih_id,period_year,period_month" }
  );

  if (error) throw new Error(error.message);

  const { data: pelatih } = await supabase
    .from("users")
    .select("full_name, phone")
    .eq("id", input.pelatih_id)
    .maybeSingle();

  if (pelatih?.phone) {
    const monthName = MONTH_NAMES[input.period_month - 1] ?? String(input.period_month);
    await sendWhatsApp(
      pelatih.phone,
      `Halo ${pelatih.full_name}, gaji periode ${monthName} ${input.period_year} sebesar Rp${netAmount.toLocaleString(
        "id-ID"
      )} sudah kami transfer. Terima kasih atas kerja kerasnya di Sari Les Renang!`
    );
  }

  revalidatePath("/admin/gaji");
  revalidatePath("/admin/keuangan/arus-kas");
  revalidatePath("/admin/keuangan/ringkasan");
}

function backTo(formData: FormData, fallback = "/admin/gaji"): string {
  const to = String(formData.get("return") ?? "");
  return to.startsWith("/admin/") ? to : fallback;
}
function withError(to: string, message: string): string {
  return `${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}

// Kebijakan: "Jangan otomatis menganggap sesi terjadwal sebagai sesi yang
// layak dibayar" -- gross_amount here is exactly computeGaji()'s output,
// which only ever counts actual progress_reports rows (a session that was
// really taught and reported), never a scheduled slot. Draft is where an
// admin reviews that number and may add a manual adjustment, with a
// mandatory reason, before it becomes payable.
async function saveDraftActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);

  const pelatih_id = String(formData.get("pelatih_id") ?? "");
  const period_year = Number(formData.get("period_year") ?? "");
  const period_month = Number(formData.get("period_month") ?? "");
  const hadir_count = Number(formData.get("hadir_count") ?? "0");
  const izin_sakit_count = Number(formData.get("izin_sakit_count") ?? "0");
  const gross_amount = Number(formData.get("gross_amount") ?? "0");
  const adjustment_amount = Number(formData.get("adjustment_amount") ?? "0");
  const adjustment_reason = String(formData.get("adjustment_reason") ?? "").trim() || null;
  const tax_deduction_amount = Number(formData.get("tax_deduction_amount") ?? "0");
  const tax_deduction_note = String(formData.get("tax_deduction_note") ?? "").trim() || null;

  if (!pelatih_id || !period_year || !period_month) {
    redirect(withError(returnTo, "Data pengajar/periode tidak lengkap."));
  }
  if (adjustment_amount !== 0 && !adjustment_reason) {
    redirect(withError(returnTo, "Isi alasan penyesuaian manual."));
  }

  const netAmount = gross_amount + adjustment_amount - tax_deduction_amount;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("payroll_payments")
    .select("status")
    .eq("pelatih_id", pelatih_id)
    .eq("period_year", period_year)
    .eq("period_month", period_month)
    .maybeSingle();
  if (existing && existing.status === "dibayar") {
    redirect(withError(returnTo, "Gaji periode ini sudah dibayar dan tidak dapat diubah sebagai draft."));
  }

  const { error } = await supabase.from("payroll_payments").upsert(
    {
      pelatih_id,
      period_year,
      period_month,
      hadir_count,
      izin_sakit_count,
      amount: netAmount,
      gross_amount,
      adjustment_amount,
      adjustment_reason,
      tax_deduction_amount,
      tax_deduction_note,
      net_amount: netAmount,
      status: "draft",
      cancelled_reason: null,
    },
    { onConflict: "pelatih_id,period_year,period_month" }
  );
  if (error) redirect(withError(returnTo, "Draft gaji belum dapat disimpan."));

  revalidatePath("/admin/gaji");
  redirect(returnTo);
}

async function approveActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_payments").update({ status: "disetujui" }).eq("id", id).eq("status", "draft");
  if (error) redirect(withError(returnTo, error.message));
  revalidatePath("/admin/gaji");
  redirect(returnTo);
}

async function cancelActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("cancelled_reason") ?? "").trim();
  if (!id || !reason) redirect(withError(returnTo, "Alasan pembatalan wajib diisi."));

  const supabase = await createClient();
  const { error } = await supabase
    .from("payroll_payments")
    .update({ status: "dibatalkan", cancelled_reason: reason })
    .eq("id", id)
    .neq("status", "dibayar");
  if (error) redirect(withError(returnTo, error.message));
  revalidatePath("/admin/gaji");
  redirect(returnTo);
}

// Re-open a cancelled draft for the same period -- the pelatih+period+period
// unique key means a fresh row can't be inserted once one exists, so
// "membuat ulang" is a status reset on the same row, not a new one.
async function reopenActionImpl(formData: FormData) {
  await requireAdmin();
  const returnTo = backTo(formData);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("payroll_payments")
    .update({ status: "draft", cancelled_reason: null })
    .eq("id", id)
    .eq("status", "dibatalkan");
  if (error) redirect(withError(returnTo, error.message));
  revalidatePath("/admin/gaji");
  redirect(returnTo);
}

export const saveDraftAction = safeAction(saveDraftActionImpl, "Draft gaji disimpan");
export const approveAction = safeAction(approveActionImpl, "Gaji disetujui, siap dibayar");
export const cancelPayrollAction = safeAction(cancelActionImpl, "Gaji dibatalkan");
export const reopenPayrollAction = safeAction(reopenActionImpl, "Draft gaji dibuka ulang");
