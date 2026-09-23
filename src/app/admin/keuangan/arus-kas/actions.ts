"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

function backTo(formData: FormData, fallback = "/admin/keuangan/arus-kas"): string {
  const to = String(formData.get("return") ?? "");
  return to.startsWith("/admin/") ? to : fallback;
}

function withError(to: string, message: string): string {
  return `${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}

const CATEGORIES = ["pembayaran_murid", "refund", "gaji_pengajar", "sewa_lokasi", "perlengkapan", "marketing", "operasional", "pajak", "lainnya"];

async function createEntryActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);

  const direction = String(formData.get("direction") ?? "");
  const category = String(formData.get("category") ?? "");
  const amount = Number(formData.get("amount") ?? "");
  const entry_date = String(formData.get("entry_date") ?? "");
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;
  const program_id = String(formData.get("program_id") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const attachment_url = String(formData.get("attachment_url") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "tercatat");
  const is_test = String(formData.get("is_test") ?? "") === "true";

  if (!["masuk", "keluar"].includes(direction) || !CATEGORIES.includes(category) || Number.isNaN(amount) || amount < 0 || !entry_date) {
    redirect(withError(returnTo, "Jenis, kategori, nominal, dan tanggal wajib diisi dengan benar."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cash_flow_entries").insert({
    direction,
    category,
    amount,
    entry_date,
    payment_method,
    program_id,
    location,
    note,
    attachment_url,
    status: ["draft", "tercatat", "dibayar", "dibatalkan"].includes(status) ? status : "tercatat",
    is_test,
    created_by: session.user.id,
    updated_by: session.user.id,
  });
  if (error) redirect(withError(returnTo, "Transaksi belum dapat disimpan. Periksa data lalu coba lagi."));

  revalidatePath("/admin/keuangan/arus-kas");
  revalidatePath("/admin/keuangan/ringkasan");
  redirect(returnTo);
}

// Manual (non-synced) entries only -- an entry created from a paid invoice/
// payroll/expense is edited at its own source, never here, so the two
// never drift apart silently. Nominal/status changes require a reason,
// captured in activity_log's before/after diff via the note field.
async function updateEntryActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);

  const entry_id = String(formData.get("entry_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const category = String(formData.get("category") ?? "");
  const amount = Number(formData.get("amount") ?? "");
  const entry_date = String(formData.get("entry_date") ?? "");
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;
  const program_id = String(formData.get("program_id") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const attachment_url = String(formData.get("attachment_url") ?? "").trim() || null;
  const change_reason = String(formData.get("change_reason") ?? "").trim();

  if (!entry_id || !["masuk", "keluar"].includes(direction) || !CATEGORIES.includes(category) || Number.isNaN(amount) || amount < 0 || !entry_date) {
    redirect(withError(returnTo, "Data transaksi tidak lengkap atau tidak valid."));
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("cash_flow_entries")
    .select("invoice_id, payroll_payment_id, expense_id, amount, status")
    .eq("id", entry_id)
    .maybeSingle();
  if (!existing) redirect(withError(returnTo, "Transaksi tidak ditemukan."));
  if (existing!.invoice_id || existing!.payroll_payment_id || existing!.expense_id) {
    redirect(withError(returnTo, "Transaksi ini tercatat otomatis dari invoice/gaji/biaya -- edit dari sumbernya, bukan di sini. Anda tetap bisa membatalkannya."));
  }
  if (Number(existing!.amount) !== amount && !change_reason) {
    redirect(withError(returnTo, "Isi alasan perubahan karena nominal diubah."));
  }

  const { error } = await supabase
    .from("cash_flow_entries")
    .update({
      direction,
      category,
      amount,
      entry_date,
      payment_method,
      program_id,
      location,
      note: change_reason ? `${note ?? ""}${note ? " -- " : ""}Alasan perubahan: ${change_reason}`.trim() : note,
      attachment_url,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entry_id);
  if (error) redirect(withError(returnTo, "Transaksi belum dapat disimpan."));

  revalidatePath("/admin/keuangan/arus-kas");
  revalidatePath("/admin/keuangan/ringkasan");
  redirect(returnTo);
}

// "Pembatalan tidak menghapus histori" -- never a hard delete, only a
// status flip to 'dibatalkan' with a mandatory reason, same convention as
// invoice revision in 0038 (superseded, not gone).
async function cancelEntryActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);

  const entry_id = String(formData.get("entry_id") ?? "");
  const reason = String(formData.get("cancelled_reason") ?? "").trim();
  if (!entry_id || !reason) redirect(withError(returnTo, "Alasan pembatalan wajib diisi."));

  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_flow_entries")
    .update({ status: "dibatalkan", cancelled_reason: reason, updated_by: session.user.id, updated_at: new Date().toISOString() })
    .eq("id", entry_id);
  if (error) redirect(withError(returnTo, error.message));

  revalidatePath("/admin/keuangan/arus-kas");
  revalidatePath("/admin/keuangan/ringkasan");
  redirect(returnTo);
}

export const createEntryAction = safeAction(createEntryActionImpl, "Transaksi kas dicatat");
export const updateEntryAction = safeAction(updateEntryActionImpl, "Transaksi kas diperbarui");
export const cancelEntryAction = safeAction(cancelEntryActionImpl, "Transaksi kas dibatalkan");
