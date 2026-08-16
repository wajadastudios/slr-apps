"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createJadwalAction(formData: FormData) {
  await requireAdmin();

  const pelatih_id = String(formData.get("pelatih_id") ?? "");
  const student_id = String(formData.get("student_id") ?? "");
  const day_of_week = String(formData.get("day_of_week") ?? "");
  const start_time = String(formData.get("start_time") ?? "") || null;

  if (!pelatih_id || !student_id || day_of_week === "") {
    redirect(
      `/admin/jadwal?error=${encodeURIComponent("Pelatih, murid, dan hari wajib diisi.")}`
    );
  }

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("program_id")
    .eq("id", student_id)
    .single();

  const { error } = await supabase.from("schedules").insert({
    pelatih_id,
    student_id,
    program_id: student?.program_id ?? null,
    day_of_week: Number(day_of_week),
    start_time,
  });

  if (error) {
    redirect(`/admin/jadwal?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/jadwal");
  redirect("/admin/jadwal");
}
