"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { sendWhatsApp } from "@/lib/whatsapp";
import { DAYS } from "@/lib/days";

export async function selfRegisterAction(formData: FormData) {
  const session = await getUserWithRole();
  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  const program_id = String(formData.get("program_id") ?? "");
  const full_name = session!.fullName ?? session!.user.email ?? "";

  if (!program_id) {
    redirect(`/ortu?error=${encodeURIComponent("Program wajib dipilih.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("self_register_as_participant", {
    p_full_name: full_name,
    p_program_id: program_id,
  });

  if (error) {
    redirect(`/ortu?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/ortu");
  redirect("/ortu");
}

export async function addChildAndRegisterAction(formData: FormData) {
  const session = await getUserWithRole();
  if (!session || session.role !== "ortu") {
    redirect("/login");
  }

  const full_name = String(formData.get("full_name") ?? "").trim();
  const birth_date = String(formData.get("birth_date") ?? "") || null;
  const slot_id = String(formData.get("slot_id") ?? "");

  if (!full_name || !slot_id) {
    redirect(
      `/ortu?error=${encodeURIComponent(
        "Nama anak dan jadwal wajib diisi."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("ortu_add_child_and_register", {
    p_full_name: full_name,
    p_birth_date: birth_date,
    p_slot_id: slot_id,
  });

  if (error) {
    redirect(
      `/ortu?error=${encodeURIComponent(
        error.message.includes("slot is full")
          ? "Maaf, slot jadwal ini baru saja penuh. Silakan pilih jadwal lain."
          : error.message
      )}`
    );
  }

  const { data: slot } = await supabase
    .from("class_slots")
    .select("day_of_week, start_time, label, program:program_id(name)")
    .eq("id", slot_id)
    .single();

  const { data: adminPhone } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "phone")
    .single();

  if (slot) {
    const program = slot.program as unknown as { name: string } | null;
    await sendWhatsApp(
      adminPhone?.value,
      `Pendaftaran baru dari ${session.fullName ?? "orang tua"} untuk anak ${full_name}. Permintaan jadwal: ${DAYS[slot.day_of_week]}, ${slot.start_time.slice(0, 5)} WIB${
        program?.name ? ` — ${program.name}` : ""
      }${slot.label ? ` (${slot.label})` : ""}. Mohon di-follow up.`
    );
  }

  revalidatePath("/ortu");
  redirect("/ortu?child_added=1");
}
