"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function generateInvoicesAction(formData: FormData) {
  await requireAdmin();

  const period_month = Number(formData.get("period_month") ?? "");
  const period_year = Number(formData.get("period_year") ?? "");

  if (!period_month || !period_year) {
    redirect(
      `/admin/tagihan?error=${encodeURIComponent("Bulan dan tahun wajib diisi.")}`
    );
  }

  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id")
    .eq("active", true);

  if (students && students.length > 0) {
    const rows = students.map((s) => ({
      student_id: s.id,
      period_month,
      period_year,
      amount: 0,
      status: "draft" as const,
    }));

    await supabase
      .from("invoices")
      .upsert(rows, {
        onConflict: "student_id,period_month,period_year",
        ignoreDuplicates: true,
      });
  }

  revalidatePath("/admin/tagihan");
  redirect("/admin/tagihan");
}

export async function sendInvoiceAction(formData: FormData) {
  const session = await requireAdmin();

  const invoice_id = String(formData.get("invoice_id") ?? "");
  const amount = Number(formData.get("amount") ?? "0");

  if (!invoice_id || !amount || amount <= 0) {
    redirect(
      `/admin/tagihan?error=${encodeURIComponent("Nominal tagihan harus lebih dari 0.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({
      amount,
      status: "sent",
      approved_by: session.user.id,
      sent_at: new Date().toISOString(),
    })
    .eq("id", invoice_id);

  if (error) {
    redirect(`/admin/tagihan?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/tagihan");
  revalidatePath("/ortu/tagihan");
  redirect("/admin/tagihan");
}

export async function markPaidAction(formData: FormData) {
  await requireAdmin();

  const invoice_id = String(formData.get("invoice_id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({ status: "paid" })
    .eq("id", invoice_id);

  revalidatePath("/admin/tagihan");
  revalidatePath("/ortu/tagihan");
  redirect("/admin/tagihan");
}
