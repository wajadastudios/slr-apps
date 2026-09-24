"use server";

import { safeAction } from "@/lib/safe-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePelatih } from "@/lib/create-account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadIndicatorConfig } from "@/lib/indicator-loader";
import { buildSnapshot, type IndicatorSnapshot } from "@/lib/indicators";
import { loadMilestones } from "@/lib/milestone-loader";
import { computeAwards } from "@/lib/milestones";
import { insertRecords } from "@/lib/record-db";
import { parseRecordInput, type RecordInput } from "@/lib/record-input";
import { PROGRAM_SELECT, normalizeProgram, type ProgramMeta } from "@/lib/programs";
import { parseScoresPayload, scorableKeys, sessionAllowsAssessment } from "@/lib/report-scores";
import { hasClassAccess, type EnrollmentStatus } from "@/lib/enrollment";

type Db = Awaited<ReturnType<typeof createClient>>;

// Whether this report is being written by a substitute, and for whom.
//
// Derived server-side rather than passed through the form: a hidden field
// could be forged to mislabel who actually taught the session. Reads via the
// service client because a pengajar cannot see another pengajar's users row.
// Only the slot of THIS program counts, so a person with two enrollments is
// matched against the right class.
async function resolveSubstituteFor(
  student_id: string,
  program_id: string,
  authorId: string
): Promise<string | null> {
  const admin = createAdminClient();

  const { data: enrolments } = await admin
    .from("schedules")
    .select("slot_id, class_slots:slot_id(pelatih_id, program_id)")
    .eq("student_id", student_id);

  const rows = ((enrolments ?? []) as unknown as {
    slot_id: string;
    class_slots: { pelatih_id: string; program_id: string } | null;
  }[]).filter((r) => r.class_slots?.program_id === program_id);

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

  const replacedId = rows.find((r) => r.slot_id === sub.slot_id)?.class_slots?.pelatih_id;
  if (!replacedId) return null;

  const { data: replaced } = await admin
    .from("users")
    .select("full_name")
    .eq("id", replacedId)
    .maybeSingle();

  return replaced?.full_name ?? null;
}

function back(student_id: string, program_id: string, error?: string) {
  const base = `/pelatih/murid/${student_id}${program_id ? `?program=${program_id}` : ""}`;
  return error ? `${base}${base.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : base;
}

type Ctx = {
  enrollmentId: string;
  status: EnrollmentStatus;
  program: ProgramMeta;
};

// The enrollment a pengajar is allowed to write for: assigned to them (via the
// narrow pelatih_enrollments() function), belonging to this student, and with
// class access.
async function loadContext(
  supabase: Db,
  student_id: string,
  enrollment_id: string
): Promise<Ctx | null> {
  const { data: mine } = await supabase.rpc("pelatih_enrollments");
  const enrollment = ((mine ?? []) as { id: string; student_id: string; program_id: string; status: EnrollmentStatus }[]).find(
    (e) => e.id === enrollment_id && e.student_id === student_id
  );
  if (!enrollment) return null;

  const { data: programRow } = await supabase
    .from("programs")
    .select(PROGRAM_SELECT)
    .eq("id", enrollment.program_id)
    .maybeSingle();
  if (!programRow) return null;

  return { enrollmentId: enrollment.id, status: enrollment.status, program: normalizeProgram(programRow) };
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

async function uploadMedia(supabase: Db, student_id: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const path = `${student_id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("progress-media")
      .upload(path, file, { contentType: file.type });
    if (!uploadError) {
      const { data: publicUrl } = supabase.storage.from("progress-media").getPublicUrl(path);
      urls.push(publicUrl.publicUrl);
    }
  }
  return urls;
}

async function createReportActionImpl(formData: FormData) {
  const session = await requirePelatih();

  const student_id = String(formData.get("student_id") ?? "");
  const enrollment_id = String(formData.get("enrollment_id") ?? "");
  const session_date = String(formData.get("session_date") ?? "");
  const session_number = Number(formData.get("session_number") ?? "0") || null;
  const attendance = String(formData.get("attendance") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const next_focus = String(formData.get("next_focus") ?? "").trim() || null;

  if (!student_id || !enrollment_id || !session_date || !attendance) {
    redirect(back(student_id, "", "Tanggal dan kehadiran wajib diisi."));
  }

  const supabase = await createClient();

  // Assignment is checked before touching storage or the database: only the
  // pengajar assigned to THIS enrollment (program) may write, and only once
  // its class is scheduled/active.
  const ctx = await loadContext(supabase, student_id, enrollment_id);
  if (!ctx) redirect(back(student_id, "", "Anda tidak mengajar peserta ini di program tersebut."));
  if (!hasClassAccess(ctx.status)) {
    redirect(back(student_id, ctx.program.id, "Kelas peserta ini belum aktif."));
  }
  const { program } = ctx;

  // A missed session records nothing about what the participant can do: no
  // scores and no performance records, whatever was posted.
  const assess = sessionAllowsAssessment(attendance);

  const indicatorConfig = await loadIndicatorConfig(supabase, program.id);
  const scores = assess
    ? parseScoresPayload(
        String(formData.get("scores_json") ?? "[]"),
        scorableKeys(indicatorConfig),
        program.assessment_type
      )
    : {};
  const indicator_snapshot = buildSnapshot(indicatorConfig, Object.keys(scores));

  let recordRows: RecordInput[] = [];
  if (assess && program.records_mode === "medals") {
    let parsedRecords: unknown;
    try {
      parsedRecords = JSON.parse(String(formData.get("performance_records_json") ?? "[]"));
    } catch {
      parsedRecords = [];
    }
    const recordsInput = parseReportRecords(parsedRecords, session_date);
    if (recordsInput.error) redirect(back(student_id, program.id, recordsInput.error));
    recordRows = recordsInput.rows;
  }

  // Aquanatal notes carry no photos or videos.
  const files =
    program.assessment_type === "observation"
      ? []
      : formData.getAll("media").filter((f): f is File => f instanceof File && f.size > 0);
  const media_urls = await uploadMedia(supabase, student_id, files);

  const substitute_for = await resolveSubstituteFor(student_id, program.id, session.user.id);

  const { data: report, error } = await supabase
    .from("progress_reports")
    .insert({
      student_id,
      enrollment_id,
      pelatih_id: session.user.id,
      substitute_for,
      session_date,
      session_number,
      attendance,
      scores,
      notes,
      media_urls,
      next_focus,
      indicator_snapshot,
      assessment_type: program.assessment_type,
      template_version: program.template_version,
    })
    .select("id")
    .single();

  if (error) {
    redirect(back(student_id, program.id, error.message));
  }

  // First report of a confirmed class: the class is now running.
  if (ctx.status === "scheduled") {
    await createAdminClient()
      .from("enrollments")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", enrollment_id)
      .eq("status", "scheduled");
  }

  if (recordRows.length > 0) {
    const milestones = await loadMilestones(supabase, program.id);
    const recordsError = await insertRecords(
      supabase,
      recordRows.map((r) => ({
        student_id,
        enrollment_id,
        progress_report_id: report?.id ?? null,
        pelatih_id: session.user.id,
        ...r,
        // Badges are decided now, against this program's targets, and kept.
        awards: computeAwards(r, milestones),
      }))
    );
    if (recordsError) {
      revalidatePath(`/pelatih/murid/${student_id}`);
      redirect(back(student_id, program.id, "Laporan sesi tersimpan, tetapi rekor performa gagal disimpan."));
    }
  }

  revalidatePath(`/pelatih/murid/${student_id}`);
  revalidatePath("/pelatih");
  revalidatePath("/ortu");
  revalidatePath(`/ortu/anak/${student_id}`);
  redirect(back(student_id, program.id));
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
    redirect(back(student_id, "", "Tanggal dan kehadiran wajib diisi."));
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("progress_reports")
    .select("*")
    .eq("id", report_id)
    .single();
  if (!existing || !existing.enrollment_id) {
    redirect(back(student_id, "", "Laporan tidak ditemukan."));
  }

  const ctx = await loadContext(supabase, student_id, existing.enrollment_id);
  if (!ctx) redirect(back(student_id, "", "Anda tidak mengajar peserta ini di program tersebut."));
  const { program } = ctx;

  // A report keeps the scale it was written with, even if the program's
  // assessment type were changed later.
  const type = (existing.assessment_type ?? program.assessment_type) as ProgramMeta["assessment_type"];

  const assess = sessionAllowsAssessment(attendance);
  const indicatorConfig = await loadIndicatorConfig(supabase, program.id);
  const existingScores = (existing.scores ?? {}) as Record<string, number>;
  // Editing an old report may keep indicators that have since been
  // deactivated (it already scored them) but never adds inactive ones.
  const scores = assess
    ? parseScoresPayload(
        String(formData.get("scores_json") ?? "[]"),
        scorableKeys(indicatorConfig, Object.keys(existingScores)),
        type
      )
    : {};
  // Keep what the report was written with; only newly scored keys are added.
  const previousSnapshot = (existing.indicator_snapshot ?? {}) as IndicatorSnapshot;
  const freshSnapshot = buildSnapshot(
    indicatorConfig,
    Object.keys(scores).filter((k) => !(k in previousSnapshot))
  );
  const indicator_snapshot = { ...freshSnapshot, ...previousSnapshot };

  // New uploads are appended to whatever was already attached rather than
  // replacing it -- this form has no way to pick which existing file to
  // remove, so overwriting media_urls outright would silently drop them.
  const files =
    type === "observation"
      ? []
      : formData.getAll("media").filter((f): f is File => f instanceof File && f.size > 0);
  const media_urls: string[] = [...(existing.media_urls ?? []), ...(await uploadMedia(supabase, student_id, files))];

  // RLS ("pelatih can update own reports") already scopes this to the
  // caller's own reports; the explicit pelatih_id match here is
  // defense-in-depth, not the actual boundary.
  const { error } = await supabase
    .from("progress_reports")
    .update({
      session_date,
      session_number,
      attendance,
      scores,
      notes,
      media_urls,
      next_focus,
      indicator_snapshot,
    })
    .eq("id", report_id)
    .eq("pelatih_id", session.user.id);

  if (error) {
    redirect(back(student_id, program.id, error.message));
  }

  revalidatePath(`/pelatih/murid/${student_id}`);
  revalidatePath("/pelatih");
  revalidatePath("/ortu");
  revalidatePath(`/ortu/anak/${student_id}`);
  redirect(back(student_id, program.id));
}

async function deleteReportActionImpl(formData: FormData) {
  const session = await requirePelatih();

  const report_id = String(formData.get("report_id") ?? "");
  const student_id = String(formData.get("student_id") ?? "");
  if (!report_id) return;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("progress_reports")
    .select("program_id")
    .eq("id", report_id)
    .maybeSingle();
  const program_id = existing?.program_id ?? "";

  // RLS ("pelatih can delete own reports") already scopes this to the
  // caller's own reports; the explicit pelatih_id match here is
  // defense-in-depth, not the actual boundary.
  const { error } = await supabase
    .from("progress_reports")
    .delete()
    .eq("id", report_id)
    .eq("pelatih_id", session.user.id);

  if (error) {
    redirect(back(student_id, program_id, error.message));
  }

  revalidatePath(`/pelatih/murid/${student_id}`);
  revalidatePath("/pelatih");
  revalidatePath("/ortu");
  revalidatePath(`/ortu/anak/${student_id}`);
  redirect(back(student_id, program_id));
}

export const createReportAction = safeAction(createReportActionImpl, "Laporan latihan berhasil disimpan");
export const updateReportAction = safeAction(updateReportActionImpl, "Laporan latihan berhasil diperbarui");
export const deleteReportAction = safeAction(deleteReportActionImpl, "Laporan latihan berhasil dihapus");
