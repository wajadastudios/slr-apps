import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { InvoicePdf } from "@/components/invoice-pdf";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS scopes this the same way it does everywhere else: admin sees
  // any invoice, ortu only their own (and only sent/paid, per the
  // "ortu can read own invoices" policy) — no extra check needed here
  // beyond confirming a row came back.
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "invoice_number, status, sent_at, package_name, sessions_count, amount, student:student_id(full_name, parent:parent_id(full_name))"
    )
    .eq("id", id)
    .single();

  if (!invoice || invoice.status === "draft" || !invoice.invoice_number) {
    return new NextResponse("Not found", { status: 404 });
  }

  const student = invoice.student as unknown as {
    full_name: string;
    parent: { full_name: string } | null;
  } | null;

  const buffer = await renderToBuffer(
    InvoicePdf({
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      sentAt: invoice.sent_at
        ? new Date(invoice.sent_at).toLocaleDateString("id-ID")
        : null,
      studentName: student?.full_name ?? "-",
      parentName: student?.parent?.full_name ?? "-",
      packageName: invoice.package_name,
      sessionsCount: invoice.sessions_count,
      amount: invoice.amount,
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
    },
  });
}
