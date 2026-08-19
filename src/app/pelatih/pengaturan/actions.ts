"use server";

import { revalidatePath } from "next/cache";
import { requirePelatih } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

// Called directly from the client (not a <form action>) after the avatar
// crop has already been uploaded straight to Storage, so this only ever
// carries small strings -- throws on error instead of redirecting.
export async function updatePelatihProfileAction(input: {
  full_name: string;
  phone: string;
  bank_info: string;
  birth_place: string;
  birth_date: string;
  address: string;
  avatar_url: string | null;
}) {
  await requirePelatih();

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_pelatih_profile", {
    p_full_name: input.full_name.trim() || null,
    p_phone: input.phone.trim() || null,
    p_bank_info: input.bank_info.trim() || null,
    p_birth_place: input.birth_place.trim() || null,
    p_birth_date: input.birth_date.trim() || null,
    p_address: input.address.trim() || null,
    p_avatar_url: input.avatar_url,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/pelatih/pengaturan");
  revalidatePath("/pelatih");
}
