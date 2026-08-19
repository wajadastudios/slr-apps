"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createReferralCodeAction(formData: FormData) {
  const session = await requireAdmin();

  const pelatih_id = String(formData.get("pelatih_id") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const discount_type = String(formData.get("discount_type") ?? "");
  const discount_value = Number(formData.get("discount_value") ?? "");
  const komisi_per_sesi = Number(formData.get("komisi_per_sesi") ?? "");

  if (
    !pelatih_id ||
    !code ||
    !["percent", "fixed"].includes(discount_type) ||
    !Number.isFinite(discount_value) ||
    discount_value < 0 ||
    !Number.isFinite(komisi_per_sesi) ||
    komisi_per_sesi < 0
  ) {
    redirect(
      `/admin/referral?pelatih_id=${pelatih_id}&error=${encodeURIComponent(
        "Lengkapi kode, tipe diskon, nilai diskon, dan komisi dengan angka yang valid."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("referral_codes").insert({
    pelatih_id,
    code,
    discount_type,
    discount_value,
    komisi_per_sesi,
    created_by: session.user.id,
  });

  if (error) {
    const message = error.code === "23505" ? "Kode ini sudah dipakai." : error.message;
    redirect(
      `/admin/referral?pelatih_id=${pelatih_id}&error=${encodeURIComponent(message)}`
    );
  }

  revalidatePath("/admin/referral");
  redirect(`/admin/referral?pelatih_id=${pelatih_id}`);
}

export async function toggleReferralCodeActiveAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const pelatih_id = String(formData.get("pelatih_id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("referral_codes").update({ active: nextActive }).eq("id", id);

  revalidatePath("/admin/referral");
  redirect(`/admin/referral?pelatih_id=${pelatih_id}`);
}
