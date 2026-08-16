"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createTestimonialAction(formData: FormData) {
  await requireAdmin();

  const author_name = String(formData.get("author_name") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const ratingRaw = String(formData.get("rating") ?? "");
  const rating = ratingRaw ? Number(ratingRaw) : null;
  const photo = formData.get("photo");

  if (!author_name || !content) {
    redirect(
      `/admin/testimoni?error=${encodeURIComponent("Nama dan isi testimoni wajib diisi.")}`
    );
  }

  const supabase = await createClient();

  let photo_url: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const path = `testimonials/${Date.now()}-${photo.name}`;
    const { error: uploadError } = await supabase.storage
      .from("progress-media")
      .upload(path, photo, { contentType: photo.type });

    if (!uploadError) {
      const { data: publicUrl } = supabase.storage
        .from("progress-media")
        .getPublicUrl(path);
      photo_url = publicUrl.publicUrl;
    }
  }

  const { error } = await supabase.from("testimonials").insert({
    author_name,
    content,
    rating,
    photo_url,
    published: true,
  });

  if (error) {
    redirect(`/admin/testimoni?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/testimoni");
  revalidatePath("/");
  redirect("/admin/testimoni");
}

export async function toggleTestimonialPublishedAction(formData: FormData) {
  await requireAdmin();

  const testimonial_id = String(formData.get("testimonial_id") ?? "");
  const nextPublished = String(formData.get("next_published") ?? "") === "true";

  const supabase = await createClient();
  await supabase
    .from("testimonials")
    .update({ published: nextPublished })
    .eq("id", testimonial_id);

  revalidatePath("/admin/testimoni");
  revalidatePath("/");
}
