"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

function backTo(formData: FormData, fallback = "/admin/keuangan/biaya"): string {
  const to = String(formData.get("return") ?? "");
  return to.startsWith("/admin/") ? to : fallback;
}
function withError(to: string, message: string): string {
  return `${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}

const CATEGORIES = ["sewa_lokasi", "perlengkapan", "marketing", "operasional", "pajak", "lainnya"];

function readCommon(formData: FormData) {
  return {
    category: String(formData.get("category") ?? ""),
    amount: Number(formData.get("amount") ?? ""),
    expense_date: String(formData.get("expense_date") ?? ""),
    program_id: String(formData.get("program_id") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    vendor: String(formData.get("vendor") ?? "").trim() || null,
    reference_number: String(formData.get("reference_number") ?? "").trim() || null,
    attachment_url: String(formData.get("attachment_url") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    payment_method: String(formData.get("payment_method") ?? "").trim() || null,
  };
}

async function createExpenseActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);
  const f = readCommon(formData);
  const is_test = String(formData.get("is_test") ?? "") === "true";

  if (!CATEGORIES.includes(f.category) || Number.isNaN(f.amount) || f.amount < 0 || !f.expense_date) {
    redirect(withError(returnTo, "Kategori, nominal, dan tanggal wajib diisi dengan benar."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("operational_expenses").insert({
    ...f,
    payment_status: "belum_dibayar",
    is_test,
    created_by: session.user.id,
    updated_by: session.user.id,
  });
  if (error) redirect(withError(returnTo, "Biaya belum dapat disimpan."));

  revalidatePath("/admin/keuangan/biaya");
  revalidatePath("/admin/keuangan/ringkasan");
  redirect(returnTo);
}

async function updateExpenseActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);
  const expense_id = String(formData.get("expense_id") ?? "");
  const f = readCommon(formData);
  const change_reason = String(formData.get("change_reason") ?? "").trim();

  if (!expense_id || !CATEGORIES.includes(f.category) || Number.isNaN(f.amount) || f.amount < 0 || !f.expense_date) {
    redirect(withError(returnTo, "Data biaya tidak lengkap atau tidak valid."));
  }

  const supabase = await createClient();
  const { data: existing } = await supabase.from("operational_expenses").select("amount, payment_status").eq("id", expense_id).maybeSingle();
  if (!existing) redirect(withError(returnTo, "Biaya tidak ditemukan."));
  if (existing!.payment_status === "dibayar" && Number(existing!.amount) !== f.amount && !change_reason) {
    redirect(withError(returnTo, "Biaya ini sudah berstatus dibayar. Isi alasan perubahan untuk mengubah nominalnya."));
  }

  const { error } = await supabase
    .from("operational_expenses")
    .update({
      ...f,
      note: change_reason ? `${f.note ?? ""}${f.note ? " -- " : ""}Alasan perubahan: ${change_reason}`.trim() : f.note,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", expense_id);
  if (error) redirect(withError(returnTo, "Biaya belum dapat disimpan."));

  revalidatePath("/admin/keuangan/biaya");
  revalidatePath("/admin/keuangan/ringkasan");
  redirect(returnTo);
}

async function markExpensePaidActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);
  const expense_id = String(formData.get("expense_id") ?? "");
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;
  if (!expense_id) redirect(withError(returnTo, "Biaya tidak ditemukan."));

  const supabase = await createClient();
  const { error } = await supabase
    .from("operational_expenses")
    .update({ payment_status: "dibayar", payment_method, paid_at: new Date().toISOString(), updated_by: session.user.id, updated_at: new Date().toISOString() })
    .eq("id", expense_id)
    .eq("payment_status", "belum_dibayar");
  if (error) redirect(withError(returnTo, error.message));

  revalidatePath("/admin/keuangan/biaya");
  revalidatePath("/admin/keuangan/arus-kas");
  revalidatePath("/admin/keuangan/ringkasan");
  redirect(returnTo);
}

// "Pembatalan tidak menghapus histori" -- flips status, keeps the row.
async function cancelExpenseActionImpl(formData: FormData) {
  const session = await requireAdmin();
  const returnTo = backTo(formData);
  const expense_id = String(formData.get("expense_id") ?? "");
  const reason = String(formData.get("cancelled_reason") ?? "").trim();
  if (!expense_id || !reason) redirect(withError(returnTo, "Alasan pembatalan wajib diisi."));

  const supabase = await createClient();
  const { error } = await supabase
    .from("operational_expenses")
    .update({ payment_status: "dibatalkan", cancelled_reason: reason, updated_by: session.user.id, updated_at: new Date().toISOString() })
    .eq("id", expense_id);
  if (error) redirect(withError(returnTo, error.message));

  revalidatePath("/admin/keuangan/biaya");
  revalidatePath("/admin/keuangan/ringkasan");
  redirect(returnTo);
}

export const createExpenseAction = safeAction(createExpenseActionImpl, "Biaya dicatat");
export const updateExpenseAction = safeAction(updateExpenseActionImpl, "Biaya diperbarui");
export const markExpensePaidAction = safeAction(markExpensePaidActionImpl, "Biaya ditandai dibayar");
export const cancelExpenseAction = safeAction(cancelExpenseActionImpl, "Biaya dibatalkan");
