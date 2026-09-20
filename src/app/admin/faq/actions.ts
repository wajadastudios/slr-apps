"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

async function createFaqActionImpl(formData: FormData) {
  await requireAdmin();

  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();

  if (!question || !answer) {
    redirect(
      `/admin/faq?error=${encodeURIComponent("Pertanyaan dan jawaban wajib diisi.")}`
    );
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("faq_items")
    .select("id", { count: "exact", head: true });

  const { error } = await supabase.from("faq_items").insert({
    question,
    answer,
    sort_order: count ?? 0,
  });

  if (error) {
    redirect(`/admin/faq?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/faq");
  revalidatePath("/");
  redirect("/admin/faq");
}

async function updateFaqActionImpl(formData: FormData) {
  await requireAdmin();

  const faq_id = String(formData.get("faq_id") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();

  if (!question || !answer) {
    redirect(
      `/admin/faq?error=${encodeURIComponent("Pertanyaan dan jawaban wajib diisi.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("faq_items")
    .update({ question, answer })
    .eq("id", faq_id);

  if (error) {
    redirect(`/admin/faq?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/faq");
  revalidatePath("/");
  redirect("/admin/faq");
}

async function moveFaqActionImpl(formData: FormData) {
  await requireAdmin();

  const faq_id = String(formData.get("faq_id") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("faq_items")
    .select("id")
    .order("sort_order")
    .order("created_at");

  if (!items) return;
  const index = items.findIndex((i) => i.id === faq_id);
  if (index === -1) return;

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= items.length) return;

  const reordered = [...items];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

  await Promise.all(
    reordered.map((item, i) =>
      supabase.from("faq_items").update({ sort_order: i }).eq("id", item.id)
    )
  );

  revalidatePath("/admin/faq");
  revalidatePath("/");
}

async function deleteFaqActionImpl(formData: FormData) {
  await requireAdmin();

  const faq_id = String(formData.get("faq_id") ?? "");

  const supabase = await createClient();
  const { error: mutationError } = await supabase.from("faq_items").delete().eq("id", faq_id);
  if (mutationError) {
    redirect(`/admin/faq?error=${encodeURIComponent(mutationError.message)}`);
  }

  revalidatePath("/admin/faq");
  revalidatePath("/");
}

export const createFaqAction = safeAction(createFaqActionImpl, "FAQ berhasil ditambahkan");
export const updateFaqAction = safeAction(updateFaqActionImpl, "FAQ berhasil diperbarui");
export const moveFaqAction = safeAction(moveFaqActionImpl, "Urutan FAQ berhasil diperbarui");
export const deleteFaqAction = safeAction(deleteFaqActionImpl, "FAQ berhasil dihapus");
