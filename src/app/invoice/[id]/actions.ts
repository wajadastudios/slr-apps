"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function submitInvoicePaymentProofAction(formData: FormData) {
  const invoice_id = String(formData.get("invoice_id") ?? "");
  const payment_method = String(formData.get("payment_method") ?? "");
  const proof = formData.get("proof");

  if (!invoice_id || !["qris", "transfer"].includes(payment_method)) {
    throw new Error("Data pembayaran tidak lengkap.");
  }
  if (!(proof instanceof File) || proof.size === 0) {
    throw new Error("Unggah bukti transfer terlebih dahulu.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Sesi Anda berakhir, silakan masuk kembali.");
  }

  // Ownership and status ('sent' only) are re-checked inside the RPC
  // itself -- the upload below is keyed off the same invoice_id, but it
  // only ever overwrites this one deterministic path, never anyone else's.
  const ext = proof.name.includes(".") ? proof.name.split(".").pop() : "jpg";
  const path = `invoice-proof/${invoice_id}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("progress-media")
    .upload(path, proof, { contentType: proof.type, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage
    .from("progress-media")
    .getPublicUrl(path);

  const { error } = await supabase.rpc("submit_invoice_payment_proof", {
    p_invoice_id: invoice_id,
    p_payment_method: payment_method,
    p_proof_url: publicUrl.publicUrl,
  });
  if (error) throw new Error(error.message);

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "invoice_number, amount, student:student_id(full_name)"
    )
    .eq("id", invoice_id)
    .maybeSingle();

  const student = invoice?.student as unknown as { full_name: string } | null;

  const { data: adminPhone } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "phone")
    .maybeSingle();

  await sendWhatsApp(
    adminPhone?.value,
    `Bukti pembayaran diterima: ${invoice?.invoice_number ?? invoice_id} an. ${
      student?.full_name ?? "-"
    }, Rp${Number(invoice?.amount ?? 0).toLocaleString("id-ID")}. Cek di /admin/tagihan.`
  );

  revalidatePath(`/invoice/${invoice_id}`);
  revalidatePath("/admin/tagihan");
  revalidatePath("/ortu/tagihan");
}
