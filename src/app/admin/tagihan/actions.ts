"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

const SESSIONS_PER_PACKAGE = 4;

export async function generateInvoicesAction() {
  await requireAdmin();

  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id")
    .eq("active", true);

  if (students && students.length > 0) {
    const { data: hadirReports } = await supabase
      .from("progress_reports")
      .select("student_id")
      .eq("attendance", "hadir");

    const hadirCount = new Map<string, number>();
    for (const r of hadirReports ?? []) {
      hadirCount.set(r.student_id, (hadirCount.get(r.student_id) ?? 0) + 1);
    }

    const rows: {
      student_id: string;
      package_number: number;
      amount: number;
      status: "draft";
    }[] = [];

    for (const s of students) {
      const eligiblePackages = Math.floor(
        (hadirCount.get(s.id) ?? 0) / SESSIONS_PER_PACKAGE
      );
      for (let pkg = 1; pkg <= eligiblePackages; pkg++) {
        rows.push({
          student_id: s.id,
          package_number: pkg,
          amount: 0,
          status: "draft",
        });
      }
    }

    if (rows.length > 0) {
      await supabase.from("invoices").upsert(rows, {
        onConflict: "student_id,package_number",
        ignoreDuplicates: true,
      });
    }
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
