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

const METRIC_TYPES = ["waktu_tempuh", "jarak_tempuh", "tahan_nafas", "treading_water"];
const STROKES = ["Bebas", "Dada", "Punggung", "Kupu-kupu"];

function parsePerformanceRecords(raw: unknown): {
  metric_type: string;
  stroke: string | null;
  distance_m: number | null;
  duration_seconds: number | null;
}[] {
  if (!Array.isArray(raw)) return [];
  const out: ReturnType<typeof parsePerformanceRecords> = [];

  for (const item of raw.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const metric_type = String((item as { metric_type?: unknown }).metric_type ?? "");
    if (!METRIC_TYPES.includes(metric_type)) continue;

    const strokeRaw = String((item as { stroke?: unknown }).stroke ?? "");
    const stroke = STROKES.includes(strokeRaw) ? strokeRaw : null;

    const distanceRaw = Number((item as { distance_m?: unknown }).distance_m);
    const distance_m = Number.isFinite(distanceRaw) && distanceRaw > 0 ? distanceRaw : null;

    const durationRaw = Number((item as { duration_seconds?: unknown }).duration_seconds);
    const duration_seconds =
      Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null;

    if (distance_m === null && duration_seconds === null) continue;

    out.push({ metric_type, stroke, distance_m, duration_seconds });
  }

  return out;
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

  const { data: report, error } = await supabase
    .from("progress_reports")
    .insert({
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
    })
    .select("id")
    .single();

  if (error) {
    redirect(
      `/pelatih/murid/${student_id}?error=${encodeURIComponent(error.message)}`
    );
  }

  let parsedRecords: unknown;
  try {
    parsedRecords = JSON.parse(String(formData.get("performance_records_json") ?? "[]"));
  } catch {
    parsedRecords = [];
  }
  const performanceRecords = parsePerformanceRecords(parsedRecords);

  if (performanceRecords.length > 0) {
    await supabase.from("performance_records").insert(
      performanceRecords.map((r) => ({
        student_id,
        progress_report_id: report?.id ?? null,
        pelatih_id: session.user.id,
        recorded_at: session_date,
        ...r,
      }))
    );
  }

  revalidatePath(`/pelatih/murid/${student_id}`);
  redirect(`/pelatih/murid/${student_id}`);
}
