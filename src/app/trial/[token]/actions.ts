"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp";

// Public, unauthenticated page -- the payment_token itself is the security
// boundary (unguessable, generated with randomBytes(24) at scheduling
// time), so this uses the service-role client and re-validates the token
// itself rather than relying on a session or a broad public RLS policy.
export async function confirmTrialPaymentAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const payment_method = String(formData.get("payment_method") ?? "");
  const proof = formData.get("proof");

  if (!token || !["qris", "transfer"].includes(payment_method)) {
    throw new Error("Data pembayaran tidak lengkap.");
  }
  if (!(proof instanceof File) || proof.size === 0) {
    throw new Error("Unggah bukti transfer terlebih dahulu.");
  }

  const supabase = createAdminClient();

  const { data: registration } = await supabase
    .from("registrations")
    .select(
      "id, child_name, trial_session_date, trial_session_time, trial_pelatih_id, trial_fee_status"
    )
    .eq("payment_token", token)
    .maybeSingle();

  if (!registration) throw new Error("Link pembayaran tidak valid.");
  if (registration.trial_fee_status === "paid") {
    throw new Error("Pembayaran untuk trial ini sudah dikonfirmasi sebelumnya.");
  }

  const ext = proof.name.includes(".") ? proof.name.split(".").pop() : "jpg";
  const path = `trial-proof/${token}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("progress-media")
    .upload(path, proof, { contentType: proof.type, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage
    .from("progress-media")
    .getPublicUrl(path);

  const { error } = await supabase
    .from("registrations")
    .update({
      trial_fee_status: "paid",
      payment_method,
      trial_proof_url: publicUrl.publicUrl,
      trial_confirmed_at: new Date().toISOString(),
    })
    .eq("id", registration.id);

  if (error) throw new Error(error.message);

  let pelatihName = "-";
  if (registration.trial_pelatih_id) {
    const { data: pelatih } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", registration.trial_pelatih_id)
      .maybeSingle();
    pelatihName = pelatih?.full_name ?? "-";
  }

  const { data: adminPhone } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "phone")
    .maybeSingle();

  await sendWhatsApp(
    adminPhone?.value,
    `Pembayaran trial diterima: ${registration.child_name}, ${registration.trial_session_date} pukul ${String(
      registration.trial_session_time
    ).slice(0, 5)} dengan Coach ${pelatihName}. Cek bukti di /admin/pendaftar.`
  );

  revalidatePath(`/trial/${token}`);
  revalidatePath("/admin/pendaftar");
  revalidatePath("/pelatih/trial");
}
