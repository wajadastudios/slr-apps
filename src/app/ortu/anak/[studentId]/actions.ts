"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setPackagePreferenceAction(formData: FormData) {
  const student_id = String(formData.get("student_id") ?? "");
  const program_package_id = String(formData.get("program_package_id") ?? "");

  const supabase = await createClient();

  // Narrow, validated write path — see set_next_package_preference() in
  // supabase/migrations/0006_program_packages.sql. Confirms ownership and
  // that the package matches the child's program before writing.
  await supabase.rpc("set_next_package_preference", {
    p_student_id: student_id,
    p_package_id: program_package_id,
  });

  revalidatePath(`/ortu/anak/${student_id}`);
}
