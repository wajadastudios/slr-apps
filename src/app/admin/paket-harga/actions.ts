"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createPackageAction(formData: FormData) {
  await requireAdmin();

  const program_id = String(formData.get("program_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sessions_count = Number(formData.get("sessions_count") ?? "");
  const price = Number(formData.get("price") ?? "");
  const benefitsRaw = String(formData.get("benefits") ?? "");
  const benefits = benefitsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!program_id || !name || !sessions_count || sessions_count < 1 || price < 0) {
    redirect(
      `/admin/paket-harga?error=${encodeURIComponent(
        "Program, nama, jumlah sesi (min 1), dan harga wajib diisi dengan benar."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("program_packages").insert({
    program_id,
    name,
    sessions_count,
    price,
    benefits,
  });

  if (error) {
    redirect(`/admin/paket-harga?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/paket-harga");
  revalidatePath("/admin/tagihan");
  redirect("/admin/paket-harga");
}

export async function togglePackageActiveAction(formData: FormData) {
  await requireAdmin();

  const package_id = String(formData.get("package_id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";

  const supabase = await createClient();
  await supabase
    .from("program_packages")
    .update({ active: nextActive })
    .eq("id", package_id);

  revalidatePath("/admin/paket-harga");
  revalidatePath("/admin/tagihan");
}
