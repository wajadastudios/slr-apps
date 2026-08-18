"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

const SLOT_KEYS = {
  "1": { url: "media_ad_1_url", type: "media_ad_1_type" },
  "2": { url: "media_ad_2_url", type: "media_ad_2_type" },
  video: { url: "video_ads_url", type: null },
} as const;

type SlotName = keyof typeof SLOT_KEYS;

async function replaceSlotFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slot: SlotName,
  file: File
) {
  const { data: existing } = await supabase.storage
    .from("progress-media")
    .list("media-ads");

  const oldFiles =
    existing
      ?.filter((f) => f.name.startsWith(`slot-${slot}.`))
      .map((f) => `media-ads/${f.name}`) ?? [];

  if (oldFiles.length > 0) {
    await supabase.storage.from("progress-media").remove(oldFiles);
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `media-ads/slot-${slot}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("progress-media")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: publicUrl } = supabase.storage
    .from("progress-media")
    .getPublicUrl(path);

  return publicUrl.publicUrl;
}

export async function uploadMediaAdAction(formData: FormData) {
  await requireAdmin();

  const slot = String(formData.get("slot") ?? "") as SlotName;
  const media = formData.get("media");

  if (!(slot in SLOT_KEYS) || !(media instanceof File) || media.size === 0) {
    redirect(`/admin/media-ads?error=${encodeURIComponent("Pilih foto atau video.")}`);
  }

  const supabase = await createClient();
  const file = media as File;
  const media_type = file.type.startsWith("video") ? "video" : "image";

  let url: string;
  try {
    url = await replaceSlotFile(supabase, slot, file);
  } catch (err) {
    redirect(
      `/admin/media-ads?error=${encodeURIComponent(
        err instanceof Error ? err.message : "Gagal mengunggah."
      )}`
    );
  }

  const keys = SLOT_KEYS[slot];
  const rows: { key: string; value: string }[] = [{ key: keys.url, value: url! }];
  if (keys.type) rows.push({ key: keys.type, value: media_type });

  const { error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    redirect(`/admin/media-ads?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/media-ads");
  revalidatePath("/");
  redirect("/admin/media-ads?saved=1");
}

export async function removeMediaAdAction(formData: FormData) {
  await requireAdmin();

  const slot = String(formData.get("slot") ?? "") as SlotName;
  if (!(slot in SLOT_KEYS)) return;

  const supabase = await createClient();

  const { data: existing } = await supabase.storage
    .from("progress-media")
    .list("media-ads");

  const oldFiles =
    existing
      ?.filter((f) => f.name.startsWith(`slot-${slot}.`))
      .map((f) => `media-ads/${f.name}`) ?? [];

  if (oldFiles.length > 0) {
    await supabase.storage.from("progress-media").remove(oldFiles);
  }

  const keys = SLOT_KEYS[slot];
  const rows: { key: string; value: string }[] = [{ key: keys.url, value: "" }];
  if (keys.type) rows.push({ key: keys.type, value: "" });

  await supabase.from("site_settings").upsert(rows, { onConflict: "key" });

  revalidatePath("/admin/media-ads");
  revalidatePath("/");
  redirect("/admin/media-ads?saved=1");
}
