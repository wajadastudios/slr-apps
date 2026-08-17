"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";

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
