"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createInvoiceForStudentAction(formData: FormData) {
  await requireAdmin();

  const student_id = String(formData.get("student_id") ?? "");
  const program_package_id = String(formData.get("program_package_id") ?? "");

  if (!student_id || !program_package_id) {
    redirect(
      `/admin/tagihan?error=${encodeURIComponent("Siswa dan paket wajib dipilih.")}`
    );
  }

  const supabase = await createClient();

  const { data: pkg } = await supabase
    .from("program_packages")
    .select("name, sessions_count, price")
    .eq("id", program_package_id)
    .single();

  if (!pkg) {
    redirect(`/admin/tagihan?error=${encodeURIComponent("Paket tidak ditemukan.")}`);
  }

  const { error } = await supabase.from("invoices").insert({
    student_id,
    program_package_id,
    package_name: pkg!.name,
    sessions_count: pkg!.sessions_count,
    amount: pkg!.price,
    status: "draft",
  });

  if (error) {
    redirect(`/admin/tagihan?error=${encodeURIComponent(error.message)}`);
  }

  // Clear the parent's renewal preference now that it's been acted on.
  await supabase
    .from("students")
    .update({ next_package_preference_id: null })
    .eq("id", student_id);

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

  const { data: invoiceNumber } = await supabase.rpc("next_invoice_number");

  const { error } = await supabase
    .from("invoices")
    .update({
      amount,
      status: "sent",
      approved_by: session.user.id,
      sent_at: new Date().toISOString(),
      invoice_number: invoiceNumber,
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
