"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteStorageFileFromUrl } from "@/lib/storage";

async function uploadAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File
) {
  const path = `avatars/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage
    .from("progress-media")
    .upload(path, file, { contentType: file.type });
  if (error) return null;
  const { data } = supabase.storage.from("progress-media").getPublicUrl(path);
  return data.publicUrl;
}

export async function updateOwnProfileAction(formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const photo = formData.get("photo");

  const previous_avatar_url =
    String(formData.get("current_avatar_url") ?? "") || null;
  let avatar_url: string | null = previous_avatar_url;
  if (photo instanceof File && photo.size > 0) {
    const uploaded = await uploadAvatar(supabase, photo);
    if (uploaded) {
      avatar_url = uploaded;
      await deleteStorageFileFromUrl(supabase, previous_avatar_url);
    }
  }

  await supabase.rpc("update_own_profile", {
    p_full_name: full_name,
    p_phone: phone,
    p_address: address,
    p_avatar_url: avatar_url,
  });

  revalidatePath("/ortu/pengaturan");
}

export async function updateChildProfileAction(formData: FormData) {
  const supabase = await createClient();

  const student_id = String(formData.get("student_id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim() || null;
  const nickname = String(formData.get("nickname") ?? "").trim() || null;
  const photo = formData.get("photo");

  if (!student_id) return;

  const previous_avatar_url =
    String(formData.get("current_avatar_url") ?? "") || null;
  let avatar_url: string | null = previous_avatar_url;
  if (photo instanceof File && photo.size > 0) {
    const uploaded = await uploadAvatar(supabase, photo);
    if (uploaded) {
      avatar_url = uploaded;
      await deleteStorageFileFromUrl(supabase, previous_avatar_url);
    }
  }

  await supabase.rpc("update_own_child_profile", {
    p_student_id: student_id,
    p_full_name: full_name,
    p_nickname: nickname,
    p_avatar_url: avatar_url,
  });

  revalidatePath("/ortu/pengaturan");
  revalidatePath("/ortu");
}
