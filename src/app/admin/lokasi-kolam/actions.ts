"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createPoolLocationAction(formData: FormData) {
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

export async function deletePoolLocationAction(formData: FormData) {
  await requireAdmin();

  const location_id = String(formData.get("location_id") ?? "");

  const supabase = await createClient();
  await supabase.from("pool_locations").delete().eq("id", location_id);

  revalidatePath("/admin/lokasi-kolam");
  revalidatePath("/");
}
