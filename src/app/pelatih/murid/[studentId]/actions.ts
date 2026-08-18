"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePelatih } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Whether this report is being written by a substitute, and for whom.
//
// Derived server-side rather than passed through the form: a hidden field
// could be forged to mislabel who actually taught the session. Reads via the
// service client because a pengajar cannot see another pengajar's users row.
async function resolveSubstituteFor(
  student_id: string,
  authorId: string
): Promise<string | null> {
  const admin = createAdminClient();

  const { data: enrolments } = await admin
    .from("schedules")
    .select("slot_id, class_slots:slot_id(pelatih_id)")
    .eq("student_id", student_id);

  const rows = (enrolments ?? []) as unknown as {
    slot_id: string;
    class_slots: { pelatih_id: string } | null;
  }[];

  // Assigned pengajar for this student -> not a substitution.
  if (rows.some((r) => r.class_slots?.pelatih_id === authorId)) return null;

  const slotIds = rows.map((r) => r.slot_id);
  if (slotIds.length === 0) return null;

  const { data: sub } = await admin
    .from("substitution_requests")
    .select("slot_id")
    .eq("requester_id", authorId)
    .eq("status", "approved")
    .in("slot_id", slotIds)
    .order("session_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return null;

  const replacedId = rows.find((r) => r.slot_id === sub.slot_id)?.class_slots
    ?.pelatih_id;
  if (!replacedId) return null;

  const { data: replaced } = await admin
    .from("users")
    .select("full_name")
    .eq("id", replacedId)
    .maybeSingle();

  return replaced?.full_name ?? null;
}

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

  // Indicators are pelatih-customizable (not limited to the program's
  // skill_template) — parse the client-submitted list and sanitize each
  // entry rather than trusting it verbatim.
  let parsedScores: unknown;
  try {
    parsedScores = JSON.parse(String(formData.get("scores_json") ?? "[]"));
  } catch {
    parsedScores = [];
  }

  const scores: Record<string, number> = {};
  if (Array.isArray(parsedScores)) {
    for (const item of parsedScores.slice(0, 20)) {
      if (!item || typeof item !== "object") continue;
      const name = String((item as { name?: unknown }).name ?? "").trim();
      if (!name) continue;
      const rawScore = Number((item as { score?: unknown }).score);
      if (!Number.isFinite(rawScore)) continue;
      const score = Math.min(5, Math.max(0.5, Math.round(rawScore * 2) / 2));
      scores[name] = score;
    }
  }

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

  const substitute_for = await resolveSubstituteFor(student_id, session.user.id);

  const { error } = await supabase.from("progress_reports").insert({
    student_id,
    pelatih_id: session.user.id,
    substitute_for,
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
