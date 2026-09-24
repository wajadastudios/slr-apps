import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { InvoicePdf } from "@/components/invoice-pdf";

type PublicInvoice = {
  out_invoice_number: string;
  out_status: string;
  out_package_name: string;
  out_sessions_count: number;
  out_amount: number;
  out_base_price: number | null;
  out_discount_amount: number;
  out_sent_at: string | null;
  out_created_at: string;
  out_student_name: string;
};

// No-login counterpart of /invoice/[id]/pdf -- authorized by the
// unguessable public_token instead of RLS session, via the same SECURITY
// DEFINER RPC the page itself uses. Never exposes billing_account_id,
// student_id, or anything beyond what get_public_invoice already limits
// itself to (see 0040_audit_fixes.sql). The "same rules" the audit asked
// for: draft invoices have no token yet (backfilled/assigned only at send
// time), so this can never render a draft either, matching the logged-in
// PDF route's own `status === "draft"` guard.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const [{ data: invoiceData }, { data: settings }] = await Promise.all([
    supabase.rpc("get_public_invoice", { p_token: token }).maybeSingle(),
    supabase.from("site_settings").select("key, value"),
  ]);

  if (!invoiceData) {
    return new NextResponse("Not found", { status: 404 });
  }
  const invoice = invoiceData as PublicInvoice;

  const getSetting = (key: string) => settings?.find((s) => s.key === key)?.value || null;
  const origin = await getSiteOrigin();

  const buffer = await renderToBuffer(
    InvoicePdf({
      logoUrl: `${origin}/logo.png`,
      address: getSetting("address"),
      phone: getSetting("phone"),
      email: getSetting("email"),
      invoiceNumber: invoice.out_invoice_number,
      status: invoice.out_status,
      sentAt: invoice.out_sent_at ? new Date(invoice.out_sent_at).toLocaleDateString("id-ID") : null,
      studentName: invoice.out_student_name,
      // The public link deliberately never reveals who the billing account
      // is -- the logged-in PDF route shows the parent's name here, this
      // one shows the participant's own name again rather than leak it.
      parentName: invoice.out_student_name,
      packageName: invoice.out_package_name,
      createdAt: new Date(invoice.out_created_at).toLocaleDateString("id-ID"),
      sessionsCount: invoice.out_sessions_count,
      amount: invoice.out_amount,
      basePrice: invoice.out_base_price,
      discountAmount: invoice.out_discount_amount,
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.out_invoice_number}.pdf"`,
    },
  });
}
