"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";

// No-login counterpart of src/app/invoice/[id]/actions.ts. Anyone with the
// unguessable token can call this -- there is no auth.getUser() check here
// on purpose, matching the whole point of a public payment link -- but the
// storage path and the RPC itself both re-derive and validate the token
// server-side (see 0040_audit_fixes.sql), so this can never touch any
// invoice other than the one the token belongs to, and only while it is
// still 'sent'.
export async function submitPublicInvoicePaymentProofAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const payment_method = String(formData.get("payment_method") ?? "");
  const proof = formData.get("proof");

  if (!token || !["qris", "transfer"].includes(payment_method)) {
    throw new Error("Data pembayaran tidak lengkap.");
  }
  if (!(proof instanceof File) || proof.size === 0) {
    throw new Error("Unggah bukti transfer terlebih dahulu.");
  }

  const supabase = await createClient();

  const ext = proof.name.includes(".") ? proof.name.split(".").pop() : "jpg";
  const path = `invoice-proof-public/${token}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("progress-media")
    .upload(path, proof, { contentType: proof.type, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage.from("progress-media").getPublicUrl(path);

  const { error } = await supabase.rpc("submit_invoice_payment_proof_by_token", {
    p_token: token,
    p_payment_method: payment_method,
    p_proof_url: publicUrl.publicUrl,
  });
  if (error) throw new Error(error.message);

  // Not a plain table select: RLS on invoices has no anon/token-based
  // policy (on purpose -- see 0040_audit_fixes.sql), so an unauthenticated
  // caller must go back through the same SECURITY DEFINER RPC the page
  // itself uses to read anything about this invoice.
  const { data: invoiceData } = await supabase.rpc("get_public_invoice", { p_token: token }).maybeSingle();
  const invoice = invoiceData as { out_invoice_number: string; out_amount: number; out_student_name: string } | null;

  const { data: adminPhone } = await supabase.from("site_settings").select("value").eq("key", "phone").maybeSingle();
  await sendWhatsApp(
    adminPhone?.value,
    `Bukti pembayaran diterima: ${invoice?.out_invoice_number ?? "-"} an. ${invoice?.out_student_name ?? "-"}, Rp${Number(
      invoice?.out_amount ?? 0
    ).toLocaleString("id-ID")}. Cek di /admin/tagihan.`
  );

  revalidatePath(`/invoice/pay/${token}`);
  revalidatePath("/admin/tagihan");
}
