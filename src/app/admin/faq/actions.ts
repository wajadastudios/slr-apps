"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createFaqAction(formData: FormData) {
  await requireAdmin();

  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const sort_order = Number(formData.get("sort_order") ?? "0") || 0;

  if (!question || !answer) {
    redirect(
      `/admin/faq?error=${encodeURIComponent("Pertanyaan dan jawaban wajib diisi.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("faq_items").insert({
    question,
    answer,
    sort_order,
  });

  if (error) {
    redirect(`/admin/faq?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/faq");
  revalidatePath("/");
  redirect("/admin/faq");
}

export async function updateFaqAction(formData: FormData) {
  await requireAdmin();

  const faq_id = String(formData.get("faq_id") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const sort_order = Number(formData.get("sort_order") ?? "0") || 0;

  if (!question || !answer) {
    redirect(
      `/admin/faq?error=${encodeURIComponent("Pertanyaan dan jawaban wajib diisi.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("faq_items")
    .update({ question, answer, sort_order })
    .eq("id", faq_id);

  if (error) {
    redirect(`/admin/faq?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/faq");
  revalidatePath("/");
  redirect("/admin/faq");
}

export async function deleteFaqAction(formData: FormData) {
  await requireAdmin();

  const faq_id = String(formData.get("faq_id") ?? "");

  const supabase = await createClient();
  await supabase.from("faq_items").delete().eq("id", faq_id);

  revalidatePath("/admin/faq");
  revalidatePath("/");
}
