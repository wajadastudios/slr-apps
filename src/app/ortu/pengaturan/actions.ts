"use server";

import { redirect } from "next/navigation";
import { safeAction } from "@/lib/safe-action";
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

async function updateOwnProfileActionImpl(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const full_name = String(formData.get("full_name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const photo = formData.get("photo");

  // The avatar to delete is read from this account's own row, never from a
  // client-supplied "current_avatar_url" field -- that field is attacker
  // controlled and could point at any file in the shared progress-media
  // bucket.
  const { data: current } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", user.id)
    .single();

  let avatar_url: string | null = current?.avatar_url ?? null;
  if (photo instanceof File && photo.size > 0) {
    const uploaded = await uploadAvatar(supabase, photo);
    if (uploaded) {
      if (avatar_url) await deleteStorageFileFromUrl(supabase, avatar_url);
      avatar_url = uploaded;
    }
  }

  const { error } = await supabase.rpc("update_own_profile", {
    p_full_name: full_name,
    p_phone: phone,
    p_address: address,
    p_avatar_url: avatar_url,
  });

  if (error) {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/ortu/pengaturan");
}

async function updateChildProfileActionImpl(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const student_id = String(formData.get("student_id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim() || null;
  const nickname = String(formData.get("nickname") ?? "").trim() || null;
  const photo = formData.get("photo");

  if (!student_id) return;

  // Confirm this parent actually owns the student -- and read the avatar to
  // delete from that row -- before touching storage. The RPC below enforces
  // the same ownership rule for the DB update, but the storage delete has
  // to be gated here too, since a client-supplied "current_avatar_url"
  // could otherwise point at any file in the shared progress-media bucket.
  const { data: current } = await supabase
    .from("students")
    .select("avatar_url, parent_id")
    .eq("id", student_id)
    .single();

  if (!current || current.parent_id !== user.id) return;

  let avatar_url: string | null = current.avatar_url;
  if (photo instanceof File && photo.size > 0) {
    const uploaded = await uploadAvatar(supabase, photo);
    if (uploaded) {
      if (avatar_url) await deleteStorageFileFromUrl(supabase, avatar_url);
      avatar_url = uploaded;
    }
  }

  const { error } = await supabase.rpc("update_own_child_profile", {
    p_student_id: student_id,
    p_full_name: full_name,
    p_nickname: nickname,
    p_avatar_url: avatar_url,
  });

  if (error) {
    redirect(`/ortu/pengaturan?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/ortu/pengaturan");
  revalidatePath("/ortu");
}

export const updateOwnProfileAction = safeAction(updateOwnProfileActionImpl, "Profil berhasil disimpan");
export const updateChildProfileAction = safeAction(updateChildProfileActionImpl, "Profil anak berhasil disimpan");
