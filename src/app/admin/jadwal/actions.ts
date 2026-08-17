"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function enrollStudentAction(formData: FormData) {
  await requireAdmin();

  const student_id = String(formData.get("student_id") ?? "");
  const slot_id = String(formData.get("slot_id") ?? "");

  if (!student_id || !slot_id) {
    redirect(
      `/admin/jadwal?error=${encodeURIComponent("Siswa dan slot jadwal wajib dipilih.")}`
    );
  }

  const supabase = await createClient();

  const { data: slot } = await supabase
    .from("class_slots")
    .select("capacity")
    .eq("id", slot_id)
    .single();

  if (!slot) {
    redirect(`/admin/jadwal?error=${encodeURIComponent("Slot jadwal tidak ditemukan.")}`);
  }

  const { count } = await supabase
    .from("schedules")
    .select("*", { count: "exact", head: true })
    .eq("slot_id", slot_id);

  if ((count ?? 0) >= slot!.capacity) {
    redirect(
      `/admin/jadwal?error=${encodeURIComponent("Slot jadwal ini sudah penuh.")}`
    );
  }

  const { error } = await supabase.from("schedules").insert({
    student_id,
    slot_id,
  });

  if (error) {
    const message = error.code === "23505"
      ? "Siswa ini sudah terdaftar di slot jadwal tersebut."
      : error.message;
    redirect(`/admin/jadwal?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/jadwal");
  revalidatePath("/admin/slot-jadwal");
  redirect("/admin/jadwal");
}

export async function deleteEnrollmentAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("schedules").delete().eq("id", id);

  if (error) {
    redirect(`/admin/jadwal?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/jadwal");
  revalidatePath("/admin/slot-jadwal");
  redirect("/admin/jadwal");
}
