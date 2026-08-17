"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createSlotAction(formData: FormData) {
  await requireAdmin();

  const program_id = String(formData.get("program_id") ?? "");
  const pelatih_id = String(formData.get("pelatih_id") ?? "");
  const label = String(formData.get("label") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const day_of_week = String(formData.get("day_of_week") ?? "");
  const start_time = String(formData.get("start_time") ?? "");
  const capacity = Number(formData.get("capacity") ?? "");

  if (
    !program_id ||
    !pelatih_id ||
    day_of_week === "" ||
    !start_time ||
    !capacity ||
    capacity < 1
  ) {
    redirect(
      `/admin/slot-jadwal?error=${encodeURIComponent(
        "Program, pelatih, hari, jam, dan kapasitas (minimal 1) wajib diisi."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("class_slots").insert({
    program_id,
    pelatih_id,
    label,
    location,
    day_of_week: Number(day_of_week),
    start_time,
    capacity,
  });

  if (error) {
    redirect(`/admin/slot-jadwal?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/slot-jadwal");
  revalidatePath("/admin/jadwal");
  redirect("/admin/slot-jadwal");
}

export async function updateSlotAction(formData: FormData) {
  await requireAdmin();

  const slot_id = String(formData.get("slot_id") ?? "");
  const program_id = String(formData.get("program_id") ?? "");
  const pelatih_id = String(formData.get("pelatih_id") ?? "");
  const label = String(formData.get("label") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const day_of_week = String(formData.get("day_of_week") ?? "");
  const start_time = String(formData.get("start_time") ?? "");
  const capacity = Number(formData.get("capacity") ?? "");

  if (
    !program_id ||
    !pelatih_id ||
    day_of_week === "" ||
    !start_time ||
    !capacity ||
    capacity < 1
  ) {
    redirect(
      `/admin/slot-jadwal?edit=${slot_id}&error=${encodeURIComponent(
        "Program, pelatih, hari, jam, dan kapasitas (minimal 1) wajib diisi."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_slots")
    .update({
      program_id,
      pelatih_id,
      label,
      location,
      day_of_week: Number(day_of_week),
      start_time,
      capacity,
    })
    .eq("id", slot_id);

  if (error) {
    redirect(
      `/admin/slot-jadwal?edit=${slot_id}&error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/admin/slot-jadwal");
  revalidatePath("/admin/jadwal");
  redirect("/admin/slot-jadwal");
}

export async function deleteSlotAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("class_slots").delete().eq("id", id);

  if (error) {
    redirect(`/admin/slot-jadwal?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/slot-jadwal");
  revalidatePath("/admin/jadwal");
  redirect("/admin/slot-jadwal");
}
