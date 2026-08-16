"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePelatih } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";

export async function createReportAction(formData: FormData) {
  const session = await requirePelatih();

  const student_id = String(formData.get("student_id") ?? "");
  const session_date = String(formData.get("session_date") ?? "");
  const session_number = Number(formData.get("session_number") ?? "0") || null;
  const attendance = String(formData.get("attendance") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const next_focus = String(formData.get("next_focus") ?? "").trim() || null;

  if (!student_id || !session_date || !attendance) {
    redirect(
      `/pelatih/murid/${student_id}?error=${encodeURIComponent(
        "Tanggal dan kehadiran wajib diisi."
      )}`
    );
  }

  const supabase = await createClient();

  // Re-derive the skill list server-side (don't trust field names from the
  // client) so scores line up with the student's current program template.
  const { data: student } = await supabase
    .from("students")
    .select("program:program_id(skill_template)")
    .eq("id", student_id)
    .single();

  const skillTemplate =
    ((student?.program as unknown as { skill_template: string[] } | null)
      ?.skill_template as string[] | undefined) ?? [];

  const scores: Record<string, number> = {};
  skillTemplate.forEach((skill, i) => {
    const value = Number(formData.get(`score_${i}`) ?? "");
    if (value) scores[skill] = value;
  });

  const files = formData
    .getAll("media")
    .filter((f): f is File => f instanceof File && f.size > 0);

  const media_urls: string[] = [];
  for (const file of files) {
    const path = `${student_id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("progress-media")
      .upload(path, file, { contentType: file.type });

    if (!uploadError) {
      const { data: publicUrl } = supabase.storage
        .from("progress-media")
        .getPublicUrl(path);
      media_urls.push(publicUrl.publicUrl);
    }
  }

  const { error } = await supabase.from("progress_reports").insert({
    student_id,
    pelatih_id: session.user.id,
    session_date,
    session_number,
    attendance,
    scores,
    notes,
    media_urls,
    next_focus,
  });

  if (error) {
    redirect(
      `/pelatih/murid/${student_id}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/pelatih/murid/${student_id}`);
  redirect(`/pelatih/murid/${student_id}`);
}
