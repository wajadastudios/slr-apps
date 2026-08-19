"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

const KEYS = [
  "address",
  "phone",
  "email",
  "operating_hours",
  "instagram",
  "stat_families",
  "stat_years",
  "stat_rating",
  "about_text",
  "founder_certifications",
  "bank_transfer_info",
  "trial_fee_amount",
] as const;

export async function saveSiteSettingsAction(formData: FormData) {
  await requireAdmin();

  const supabase = await createClient();

  const rows: { key: string; value: string }[] = KEYS.map((key) => ({
    key,
    value: String(formData.get(key) ?? "").trim(),
  }));

  // Checkbox: absent from FormData when unchecked, so this can't use the
  // same String(formData.get(key)) treatment as the text keys above.
  rows.push({
    key: "registrasi_dewasa_aktif",
    value: formData.get("registrasi_dewasa_aktif") === "true" ? "true" : "false",
  });

  const { error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    redirect(`/admin/pengaturan?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/pengaturan");
  revalidatePath("/");
  redirect("/admin/pengaturan?saved=1");
}

export async function uploadQrisAction(formData: FormData) {
  await requireAdmin();

  const media = formData.get("qris_image");
  if (!(media instanceof File) || media.size === 0) {
    redirect(`/admin/pengaturan?error=${encodeURIComponent("Pilih gambar QRIS.")}`);
  }

  const supabase = await createClient();
  const file = media as File;

  const { data: existing } = await supabase.storage
    .from("progress-media")
    .list("media-ads");
  const oldFiles =
    existing
      ?.filter((f) => f.name.startsWith("qris."))
      .map((f) => `media-ads/${f.name}`) ?? [];
  if (oldFiles.length > 0) {
    await supabase.storage.from("progress-media").remove(oldFiles);
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const path = `media-ads/qris.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("progress-media")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    redirect(`/admin/pengaturan?error=${encodeURIComponent(uploadError.message)}`);
  }

  const { data: publicUrl } = supabase.storage
    .from("progress-media")
    .getPublicUrl(path);

  const { error } = await supabase
    .from("site_settings")
    .upsert({ key: "qris_image_url", value: publicUrl.publicUrl }, { onConflict: "key" });

  if (error) {
    redirect(`/admin/pengaturan?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/pengaturan");
  revalidatePath("/daftar");
  redirect("/admin/pengaturan?saved=1");
}
