"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { deleteStorageFileFromUrl } from "@/lib/storage";

export async function addGalleryItemAction(formData: FormData) {
  await requireAdmin();

  const caption = String(formData.get("caption") ?? "").trim();
  const media = formData.get("media");

  if (!(media instanceof File) || media.size === 0) {
    redirect(`/admin/galeri?error=${encodeURIComponent("Pilih foto atau video.")}`);
  }

  const supabase = await createClient();

  const file = media as File;
  const media_type = file.type.startsWith("video") ? "video" : "image";
  const path = `gallery/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("progress-media")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    redirect(`/admin/galeri?error=${encodeURIComponent(uploadError.message)}`);
  }

  const { data: publicUrl } = supabase.storage
    .from("progress-media")
    .getPublicUrl(path);

  const { error } = await supabase.from("gallery_items").insert({
    media_url: publicUrl.publicUrl,
    media_type,
    caption: caption || null,
  });

  if (error) {
    redirect(`/admin/galeri?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/galeri");
  revalidatePath("/");
  redirect("/admin/galeri");
}

export async function deleteGalleryItemAction(formData: FormData) {
  await requireAdmin();

  const item_id = String(formData.get("item_id") ?? "");

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("gallery_items")
    .select("media_url")
    .eq("id", item_id)
    .single();

  await supabase.from("gallery_items").delete().eq("id", item_id);
  await deleteStorageFileFromUrl(supabase, item?.media_url);

  revalidatePath("/admin/galeri");
  revalidatePath("/");
}
