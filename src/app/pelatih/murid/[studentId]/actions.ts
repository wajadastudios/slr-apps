"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePelatih } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadIndicatorConfig } from "@/lib/indicator-loader";
import { activeKeys, buildSnapshot, type IndicatorConfig, type IndicatorSnapshot } from "@/lib/indicators";
import { loadMilestones } from "@/lib/milestone-loader";
import { computeAwards } from "@/lib/milestones";
import { insertRecords } from "@/lib/record-db";
import { parseRecordInput, type RecordInput } from "@/lib/record-input";

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

async function getStudentIndicatorConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  student_id: string
): Promise<IndicatorConfig> {
  const { data: student } = await supabase
    .from("students")
    .select("program_id")
    .eq("id", student_id)
    .single();
  return loadIndicatorConfig(supabase, student?.program_id);
}

// progress_reports.indicator_snapshot arrives with migration 0030; until it
// is applied the insert/update is retried without it.
function isMissingSnapshotColumn(message: string) {
  return message.includes("indicator_snapshot") && /column|schema cache/i.test(message);
}

function parseScoresFromForm(
  formData: FormData,
  allowedSkills: Set<string>
): Record<string, number> {
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
      if (!name || !allowedSkills.has(name)) continue;
      const rawScore = Number((item as { score?: unknown }).score);
      if (!Number.isFinite(rawScore)) continue;
      const score = Math.min(5, Math.max(0, Math.round(rawScore * 2) / 2));
      scores[name] = score;
    }
  }
  return scores;
}

// Rows from the "Rekor Performa" field of the report form. Validated with
// the same rules as the edit/admin forms; a bad row stops the save so the
// pengajar can fix it instead of losing it silently.
function parseReportRecords(
  raw: unknown,
  session_date: string
): { rows: RecordInput[]; error: string | null } {
  if (!Array.isArray(raw)) return { rows: [], error: null };
  const rows: RecordInput[] = [];
  for (const [index, item] of raw.slice(0, 20).entries()) {
    const obj = (item ?? {}) as Record<string, unknown>;
    const parsed = parseRecordInput({ ...obj, recorded_at: session_date });
    if (!parsed.ok) return { rows: [], error: `Rekor performa ke-${index + 1}: ${parsed.error}` };
    rows.push(parsed.value);
  }
  return { rows, error: null };
}

async function createReportActionImpl(formData: FormData) {
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

  // Check assignment before touching storage: the progress_reports insert
  // below is already RLS-gated on pelatih_teaches_student, but media files
  // were being uploaded to the shared, unscoped progress-media bucket
  // first -- an unauthorized pelatih could plant a public file under a
  // student they don't teach even though the later DB insert would reject
  // it. Calling the same check function up front closes that gap.
  const { data: teachesStudent } = await supabase.rpc(
    "pelatih_teaches_student",
    { p_student_id: student_id }
  );
  if (!teachesStudent) {
    redirect(
      `/pelatih/murid/${student_id}?error=${encodeURIComponent(
        "Anda tidak mengajar siswa ini."
      )}`
    );
  }

  // Indicators are locked to the structure admin defined under Admin >
  // Program: only ACTIVE indicators of active groups are accepted. The form
  // only offers those, but a direct POST could forge others, so re-check.
  const indicatorConfig = await getStudentIndicatorConfig(supabase, student_id);
  const scores = parseScoresFromForm(formData, new Set(activeKeys(indicatorConfig)));
  const indicator_snapshot = buildSnapshot(indicatorConfig, Object.keys(scores));

  let parsedRecords: unknown;
  try {
    parsedRecords = JSON.parse(String(formData.get("performance_records_json") ?? "[]"));
  } catch {
    parsedRecords = [];
  }
  const recordsInput = parseReportRecords(parsedRecords, session_date);
  if (recordsInput.error) {
    redirect(`/pelatih/murid/${student_id}?error=${encodeURIComponent(recordsInput.error)}`);
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

  const reportRow = {
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
  };
  let { data: report, error } = await supabase
    .from("progress_reports")
    .insert({ ...reportRow, indicator_snapshot })
    .select("id")
    .single();
  if (error && isMissingSnapshotColumn(error.message)) {
    ({ data: report, error } = await supabase
      .from("progress_reports")
      .insert(reportRow)
      .select("id")
      .single());
  }

  if (error) {
    redirect(
      `/pelatih/murid/${student_id}?error=${encodeURIComponent(error.message)}`
    );
  }

  if (recordsInput.rows.length > 0) {
    const milestones = await loadMilestones(supabase);
    const recordsError = await insertRecords(
      supabase,
      recordsInput.rows.map((r) => ({
        student_id,
        progress_report_id: report?.id ?? null,
        pelatih_id: session.user.id,
        ...r,
        // Badges are decided now, against today's targets, and kept.
        awards: computeAwards(r, milestones),
      }))
    );
    if (recordsError) {
      revalidatePath(`/pelatih/murid/${student_id}`);
      redirect(
        `/pelatih/murid/${student_id}?error=${encodeURIComponent(
          "Laporan sesi tersimpan, tetapi rekor performa gagal disimpan."
        )}`
      );
    }
  }

  revalidatePath(`/pelatih/murid/${student_id}`);
  redirect(`/pelatih/murid/${student_id}`);
}

async function updateReportActionImpl(formData: FormData) {
  const session = await requirePelatih();

  const report_id = String(formData.get("report_id") ?? "");
  const student_id = String(formData.get("student_id") ?? "");
  const session_date = String(formData.get("session_date") ?? "");
  const session_number = Number(formData.get("session_number") ?? "0") || null;
  const attendance = String(formData.get("attendance") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const next_focus = String(formData.get("next_focus") ?? "").trim() || null;

  if (!report_id || !student_id || !session_date || !attendance) {
    redirect(
      `/pelatih/murid/${student_id}?error=${encodeURIComponent(
        "Tanggal dan kehadiran wajib diisi."
      )}`
    );
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("progress_reports")
    .select("*")
    .eq("id", report_id)
    .single();

  // Editing an old report may keep indicators that have since been
  // deactivated (it already scored them) but never adds inactive ones.
  const indicatorConfig = await getStudentIndicatorConfig(supabase, student_id);
  const existingScores = (existing?.scores ?? {}) as Record<string, number>;
  const allowed = new Set([...activeKeys(indicatorConfig), ...Object.keys(existingScores)]);
  const scores = parseScoresFromForm(formData, allowed);
  // Keep what the report was written with; only newly scored keys are added.
  const previousSnapshot = (existing?.indicator_snapshot ?? {}) as IndicatorSnapshot;
  const freshSnapshot = buildSnapshot(
    indicatorConfig,
    Object.keys(scores).filter((k) => !(k in previousSnapshot))
  );
  const indicator_snapshot = { ...freshSnapshot, ...previousSnapshot };

  // New uploads are appended to whatever was already attached rather than
  // replacing it -- this form has no way to pick which existing file to
  // remove, so overwriting media_urls outright would silently drop them.
  const files = formData
    .getAll("media")
    .filter((f): f is File => f instanceof File && f.size > 0);

  const media_urls: string[] = [...(existing?.media_urls ?? [])];
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

  // RLS ("pelatih can update own reports") already scopes this to the
  // caller's own reports; the explicit pelatih_id match here is
  // defense-in-depth, not the actual boundary.
  const reportPatch = {
    session_date,
    session_number,
    attendance,
    scores,
    notes,
    media_urls,
    next_focus,
  };
  let { error } = await supabase
    .from("progress_reports")
    .update({ ...reportPatch, indicator_snapshot })
    .eq("id", report_id)
    .eq("pelatih_id", session.user.id);
  if (error && isMissingSnapshotColumn(error.message)) {
    ({ error } = await supabase
      .from("progress_reports")
      .update(reportPatch)
      .eq("id", report_id)
      .eq("pelatih_id", session.user.id));
  }

  if (error) {
    redirect(
      `/pelatih/murid/${student_id}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/pelatih/murid/${student_id}`);
  redirect(`/pelatih/murid/${student_id}`);
}

async function deleteReportActionImpl(formData: FormData) {
  const session = await requirePelatih();

  const report_id = String(formData.get("report_id") ?? "");
  const student_id = String(formData.get("student_id") ?? "");
  if (!report_id) return;

  const supabase = await createClient();

  // RLS ("pelatih can delete own reports") already scopes this to the
  // caller's own reports; the explicit pelatih_id match here is
  // defense-in-depth, not the actual boundary.
  const { error } = await supabase
    .from("progress_reports")
    .delete()
    .eq("id", report_id)
    .eq("pelatih_id", session.user.id);

  if (error) {
    redirect(
      `/pelatih/murid/${student_id}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/pelatih/murid/${student_id}`);
  redirect(`/pelatih/murid/${student_id}`);
}

export const createReportAction = safeAction(createReportActionImpl, "Laporan latihan berhasil disimpan");
export const updateReportAction = safeAction(updateReportActionImpl, "Laporan latihan berhasil diperbarui");
export const deleteReportAction = safeAction(deleteReportActionImpl, "Laporan latihan berhasil dihapus");
