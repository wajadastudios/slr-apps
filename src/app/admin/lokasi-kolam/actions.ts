"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

async function createPoolLocationActionImpl(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const maps_link = String(formData.get("maps_link") ?? "").trim();

  if (!name || !maps_link) {
    redirect(
      `/admin/lokasi-kolam?error=${encodeURIComponent("Nama kolam dan link Google Maps wajib diisi.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pool_locations").insert({
    name,
    maps_link,
  });

  if (error) {
    redirect(`/admin/lokasi-kolam?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/lokasi-kolam");
  revalidatePath("/");
  redirect("/admin/lokasi-kolam");
}

async function deletePoolLocationActionImpl(formData: FormData) {
  await requireAdmin();

  const location_id = String(formData.get("location_id") ?? "");

  const supabase = await createClient();
  const { error: mutationError } = await supabase.from("pool_locations").delete().eq("id", location_id);
  if (mutationError) {
    redirect(`/admin/lokasi-kolam?error=${encodeURIComponent(mutationError.message)}`);
  }

  revalidatePath("/admin/lokasi-kolam");
  revalidatePath("/");
}

export const createPoolLocationAction = safeAction(createPoolLocationActionImpl, "Lokasi kolam berhasil ditambahkan");
export const deletePoolLocationAction = safeAction(deletePoolLocationActionImpl, "Lokasi kolam berhasil dihapus");
