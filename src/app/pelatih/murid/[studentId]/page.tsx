import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { SkillScoresField } from "@/components/skill-scores-field";
import { LevelScoresField } from "@/components/level-scores-field";
import { AttendanceProvider, AttendanceSelect, LateNoticeField, PresentOnly } from "@/components/report-attendance";
import { PerformanceRecordField } from "@/components/performance-record-field";
import { PerformanceRecordsManager } from "@/components/performance-records-manager";
import { PersonalGoalsManager } from "@/components/personal-goals";
import { RecordUnlockCard } from "@/components/record-unlock-card";
import { ReportHistoryCard, type ReportRevision, type ReportRow } from "@/components/report-history-card";
import { EvaluationSummary } from "@/components/evaluation-summary";
import { ToastForm } from "@/components/ui/toast-form";
import { MediaFileInput } from "@/components/media-file-input";
import { CurriculumReportForm } from "@/components/curriculum-report-form";
import { CurriculumProgress } from "@/components/curriculum/progress-view";
import { PerformanceRecordsCard } from "@/components/performance-records-card";
import { confirmLevelUpAction } from "./level-actions";
import { loadCurriculumData, loadCurriculumMode, loadReportTestResults } from "@/lib/curriculum/loader";
import { initialFormState, stateFromReport } from "@/lib/curriculum/form-state";
import { computeMilestoneStatuses, formatMilestoneValue, pickNextTarget } from "@/lib/milestones";
import { computeLatestAchievement, latestAttendedReport, latestNextFocus } from "@/lib/progress";
import { formGroups, relevantGroupIds, resolveReportIndicators } from "@/lib/indicators";
import { loadIndicatorConfig } from "@/lib/indicator-loader";
import { loadMilestones } from "@/lib/milestone-loader";
import { requireRole } from "@/lib/require-role";
import { formatAge } from "@/lib/performance";
import { formatShortDate } from "@/lib/format-date";
import { jakartaToday, toISODate } from "@/lib/week";
import { computeHandover } from "@/lib/handover";
import { countCycleReports, cyclePositionsOf, narrativeRequired } from "@/lib/narrative-cycle";
import { NarrativeField } from "@/components/narrative-field";
import {
  PROGRAM_SELECT,
  levelsFor,
  normalizeProgram,
  reportTitle,
  usesStars,
} from "@/lib/programs";
import { hasClassAccess, type EnrollmentStatus } from "@/lib/enrollment";
import type { GoalEntry, PersonalGoal } from "@/lib/personal-goals";
import {
  createReportAction,
  updateReportAction,
  deleteReportAction,
  submitReportCorrectionAction,
} from "./actions";
import { updatePerformanceRecordAction, deletePerformanceRecordAction } from "./record-actions";
import {
  addGoalEntryAction,
  archiveGoalAction,
  createPersonalGoalAction,
  deleteGoalEntryAction,
} from "./goal-actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

type MyEnrollment = {
  id: string;
  student_id: string;
  program_id: string;
  status: EnrollmentStatus;
  adjustment_note: string | null;
};

export default async function MuridReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ error?: string; tanggal?: string; program?: string; edit?: string }>;
}) {
  const { studentId } = await params;
  const { error, tanggal, program: programParam, edit: editParam } = await searchParams;
  const supabase = await createClient();
  // Independent lookups run together (one round-trip instead of four):
  // session (memoised, shared with the layout), the student, this pengajar's
  // enrollments, and the (small) programs table.
  const [session, { data: student }, { data: mine }, { data: allPrograms }] = await Promise.all([
    requireRole("pelatih"),
    // RLS (pelatih_teaches_student) already scopes this to students this
    // pelatih actually teaches — an empty result means access denied.
    supabase.from("students").select("id, full_name, birth_date").eq("id", studentId).single(),
    // Only the enrollments (programs) assigned to this pengajar, with class access.
    supabase.rpc("pelatih_enrollments"),
    supabase.from("programs").select(PROGRAM_SELECT),
  ]);

  if (!student) {
    redirect("/pelatih");
  }

  const myEnrollments = ((mine ?? []) as MyEnrollment[]).filter(
    (e) => e.student_id === studentId && hasClassAccess(e.status)
  );
  if (myEnrollments.length === 0) {
    redirect("/pelatih");
  }

  const enrollment =
    myEnrollments.find((e) => e.program_id === programParam) ??
    (myEnrollments.length === 1 ? myEnrollments[0] : null);

  const myProgramIds = new Set(myEnrollments.map((e) => e.program_id));
  const programs = (allPrograms ?? []).filter((p) => myProgramIds.has(p.id)).map(normalizeProgram);

  // One person, several programs: choose which class to write for.
  if (!enrollment) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
          {student.full_name}
        </h1>
        <GlassCard>
          <h2 className={`mb-1 ${HEADING}`}>Pilih program</h2>
          <p className="mb-3 text-sm text-slate-600">
            Peserta ini punya lebih dari satu program. Laporan, indikator, dan rekor dicatat terpisah per program.
          </p>
          <div className="flex flex-col gap-2">
            {programs.map((p) => (
              <Link
                key={p.id}
                href={`/pelatih/murid/${studentId}?program=${p.id}`}
                className="rounded-2xl border border-white/60 bg-white/55 px-4 py-3 text-sm font-semibold text-[#17263D] transition-colors hover:bg-[#35C5D0]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0]"
              >
                {p.name}
              </Link>
            ))}
          </div>
        </GlassCard>
      </div>
    );
  }

  const program = programs.find((p) => p.id === enrollment.program_id)!;
  const type = program.assessment_type;
  const levels = levelsFor(type);
  const isObservation = type === "observation";
  const medals = program.records_mode === "medals";
  const goalsMode = program.records_mode === "personal_goals";
  const age = formatAge(student.birth_date);

  const [indicatorConfig, milestones, reportsRes, recordsRes, goalsRes, quotaRes, curriculumMode] = await Promise.all([
    loadIndicatorConfig(supabase, program.id),
    medals ? loadMilestones(supabase, program.id) : Promise.resolve([]),
    supabase
      .from("progress_reports")
      .select("*, author:pelatih_id(full_name)")
      .eq("enrollment_id", enrollment.id)
      .order("session_date", { ascending: false })
      .order("updated_at", { ascending: false }),
    medals
      ? supabase.from("performance_records").select("*").eq("enrollment_id", enrollment.id)
      : Promise.resolve({ data: [] as never[] }),
    goalsMode
      ? supabase
          .from("personal_goals")
          .select("id, label, unit, baseline, target, status")
          .eq("enrollment_id", enrollment.id)
      : Promise.resolve({ data: [] as never[] }),
    supabase.rpc("pelatih_session_quota", { p_enrollment_id: enrollment.id }),
    // Only Kids-style (star) programs can run the level curriculum; for every
    // other program this stays "legacy" and nothing below changes.
    usesStars(type) ? loadCurriculumMode(supabase, program.id) : Promise.resolve("legacy" as const),
  ]);
  const curriculumOn = curriculumMode === "levels_v1";
  const curriculumData = curriculumOn ? await loadCurriculumData(supabase, { programId: program.id, enrollmentId: enrollment.id }) : null;
  const rawReports = (reportsRes.data ?? []) as unknown as (Omit<ReportRow, "author_name" | "revisions"> & {
    author: { full_name: string | null } | null;
  })[];
  const reports: ReportRow[] = rawReports.map((r) => ({ ...r, author_name: r.author?.full_name ?? null }));
  const performanceRecords = recordsRes.data ?? [];
  // `used` = hadir + izin terpakai (0046); older databases return only `attended`.
  const quota = quotaRes.data?.[0] as { total_sessions: number; attended: number; used?: number; remaining: number } | undefined;
  const goals = ((goalsRes.data ?? []) as PersonalGoal[]).map((g) => ({
    ...g,
    baseline: g.baseline === null ? null : Number(g.baseline),
    target: Number(g.target),
  }));

  // Revision history for "Riwayat perubahan": only fetched for reports the
  // viewer themself wrote (activity_log RLS only exposes those anyway --
  // see 0043_report_history_and_corrections.sql). Fetched together with the
  // goal entries — both only depend on the batch above.
  const ownReportIds = reports.filter((r) => r.pelatih_id === session.user.id).map((r) => r.id);
  const [goalEntriesRes, logRes] = await Promise.all([
    goalsMode && goals.length > 0
      ? supabase
          .from("personal_goal_entries")
          .select("id, goal_id, value, recorded_at, note")
          .in(
            "goal_id",
            goals.map((g) => g.id)
          )
      : Promise.resolve({ data: [] as GoalEntry[] }),
    ownReportIds.length > 0
      ? supabase
          .from("activity_log")
          .select("entity_id, created_at, actor_name, changes")
          .eq("entity_type", "progress_reports")
          .eq("action", "update")
          .in("entity_id", ownReportIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const goalEntries: GoalEntry[] = ((goalEntriesRes.data ?? []) as GoalEntry[]).map((e) => ({ ...e, value: Number(e.value) }));

  const nextSessionNumber = reports.length + 1;
  // Jakarta calendar date (not UTC), or the session date the dashboard sent us
  // from when filling in a report for a specific day.
  const todayIso = toISODate(jakartaToday());
  const today = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : todayIso;
  // A draft is not a real report yet -- it must not affect scores/trend/
  // achievement/handover before the pengajar actually finalizes it.
  const finalReports = reports.filter((r) => r.status === "final");
  const latestScores = latestAttendedReport(finalReports)?.scores as Record<string, number> | null | undefined;
  // A single percent score was dropped per product decision -- a short,
  // concrete achievement ("Meningkat pada X" / "Sudah baik pada Y") is more
  // meaningful than one averaged number, and simply hides itself (returns
  // null) when there isn't enough data to say something true.
  const latestAchievement = usesStars(type) && !curriculumOn
    ? computeLatestAchievement(finalReports, indicatorConfig)
    : null;
  const formGroupList = formGroups(indicatorConfig);
  const openGroups = relevantGroupIds(formGroupList, latestScores);
  const hidden = { program: program.id };

  // Periodic narrative cycle (requirement: narrative report cycle). Position
  // is always derived from what's already committed -- see
  // src/lib/narrative-cycle.ts and 0044_narrative_report_cycle.sql (the
  // database trigger is the actual enforcement; this only drives the form).
  const cycleCount = countCycleReports(finalReports);
  const narrativeDue = narrativeRequired(program.narrative_policy, cycleCount + 1);
  const cyclePositions = cyclePositionsOf(finalReports, program.narrative_policy);
  // If today's session already has an unfinished draft of the caller's own,
  // resume it instead of trying to create a second row for the same date
  // (progress_reports_enrollment_session_date_unique would refuse that).
  const todayDraftAny = reports.find(
    (r) => r.session_date === today && r.pelatih_id === session.user.id && r.status === "draft"
  );
  // On the level curriculum a draft from before the switch cannot be resumed
  // (it was written with the old indicators); only a curriculum draft can.
  const todayDraft = curriculumOn && todayDraftAny && todayDraftAny.curriculum_version == null ? undefined : todayDraftAny;
  const blockedLegacyDraft = curriculumOn && !!todayDraftAny && !todayDraft;

  // A saved curriculum report opens in the same form via ?edit=<id>; so does today's draft.
  const editReport = curriculumOn && editParam
    ? reports.find((r) => r.id === editParam && r.pelatih_id === session.user.id && r.curriculum_version != null)
    : undefined;
  const formReport = editReport ?? todayDraft;
  let curriculumInitialState = curriculumData ? initialFormState(curriculumData) : null;
  if (curriculumData && formReport) {
    const results = await loadReportTestResults(supabase, formReport.id, formReport.session_date);
    curriculumInitialState = stateFromReport(
      curriculumData,
      { scores: (formReport.scores ?? {}) as Record<string, number>, context: formReport.assessment_context ?? {} },
      results,
      { lockLevels: formReport.status === "final" }
    );
  }

  const revisionsByReport = new Map<string, ReportRevision[]>();
  {
    for (const row of (logRes.data ?? []) as {
      entity_id: string;
      created_at: string;
      actor_name: string | null;
      changes: Record<string, [unknown, unknown]>;
    }[]) {
      const list = revisionsByReport.get(row.entity_id) ?? [];
      list.push({ created_at: row.created_at, actor_name: row.actor_name, changes: row.changes });
      revisionsByReport.set(row.entity_id, list);
    }
  }
  const reportsWithRevisions = reports.map((r) => ({ ...r, revisions: revisionsByReport.get(r.id) }));

  // "Handover pengajar" (requirement #2): derived purely from who wrote what,
  // when -- see src/lib/handover.ts for why this needs no admin log lookup.
  const handover = computeHandover(finalReports, session.user.id);
  const showHandoverSummary = handover.beforeReports.length > 0;
  const beforeLatest = handover.beforeReports[handover.beforeReports.length - 1];
  const beforeResolved = beforeLatest
    ? resolveReportIndicators(
        (beforeLatest.scores as Record<string, number>) ?? {},
        beforeLatest.indicator_snapshot as never,
        indicatorConfig
      )
    : [];
  const beforeLatestIndicator = beforeResolved[beforeResolved.length - 1] ?? null;
  const beforeNextFocus = latestNextFocus(handover.beforeReports);

  // "Evaluasi Perkembangan" summary strip (requirement #3).
  const attendedForEval = finalReports.filter((r) => r.attendance === "hadir" && r.scores && typeof r.scores === "object");
  const evalLatest = attendedForEval[0];
  const evalPrevious = attendedForEval[1];
  let evalLatestIndicatorLabel: string | null = null;
  if (evalLatest) {
    const latestScoreMap = evalLatest.scores as Record<string, number>;
    const previousScoreMap = (evalPrevious?.scores as Record<string, number>) ?? {};
    const changedKeys = Object.keys(latestScoreMap).filter((k) => latestScoreMap[k] !== (previousScoreMap[k] ?? 0));
    const resolvedLatest = resolveReportIndicators(latestScoreMap, evalLatest.indicator_snapshot as never, indicatorConfig);
    const pick = resolvedLatest.find((r) => changedKeys.includes(r.key)) ?? resolvedLatest[resolvedLatest.length - 1];
    evalLatestIndicatorLabel = pick ? `${pick.group} - ${pick.label}` : null;
  }
  const milestoneStatuses = medals ? computeMilestoneStatuses(performanceRecords, milestones) : [];
  const nextTarget = medals && !curriculumOn ? pickNextTarget(milestoneStatuses) : null;
  const nextTargetLabel = nextTarget
    ? `${nextTarget.status.milestone.label} · ${formatMilestoneValue(nextTarget.status.milestone.metric_type, nextTarget.value)}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
          {student.full_name}{" "}
          <span className="text-base font-normal text-slate-600">
            &mdash; {program.name}
            {age ? ` · ${age}` : ""}
          </span>
        </h1>
        {latestAchievement && (
          <span className="rounded-full bg-[#EEF9FB] px-3 py-1.5 text-sm font-semibold text-[#35C5D0]">
            {latestAchievement}
          </span>
        )}
      </div>

      {myEnrollments.length > 1 && (
        <nav aria-label="Program peserta" className="flex flex-wrap gap-1.5">
          {programs.map((p) => (
            <Link
              key={p.id}
              href={`/pelatih/murid/${studentId}?program=${p.id}`}
              replace
              aria-current={p.id === program.id ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-medium transition-colors ${
                p.id === program.id
                  ? "bg-[#35C5D0] text-white"
                  : "border border-white/60 bg-white/60 text-slate-700 hover:bg-[#35C5D0]/15"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      {enrollment.adjustment_note && (
        <GlassCard tone="soft">
          <p className="text-xs font-medium text-slate-500">Catatan penyesuaian dari admin</p>
          <p className="mt-0.5 text-sm text-[#17263D]">{enrollment.adjustment_note}</p>
        </GlassCard>
      )}

      {showHandoverSummary && (
        <GlassCard tone="soft">
          <h2 className={HEADING}>Ringkasan sebelum Anda mengajar</h2>
          {handover.previousPelatihName && (
            <p className="mt-1 text-sm text-slate-600">
              Sebelumnya diajar oleh <span className="font-medium text-[#17263D]">{handover.previousPelatihName}</span>.
            </p>
          )}
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {beforeLatestIndicator && (
              <div>
                <dt className="text-[11px] font-medium text-slate-500">Indikator terakhir dinilai</dt>
                <dd className="text-sm text-[#17263D]">
                  {beforeLatestIndicator.group} - {beforeLatestIndicator.label}
                </dd>
              </div>
            )}
            {beforeNextFocus && (
              <div>
                <dt className="text-[11px] font-medium text-slate-500">Fokus latihan berikutnya</dt>
                <dd className="text-sm text-[#17263D]">{beforeNextFocus}</dd>
              </div>
            )}
            {beforeLatest?.notes && (
              <div>
                <dt className="text-[11px] font-medium text-slate-500">Catatan penting terakhir</dt>
                <dd className="text-sm text-[#17263D]">{beforeLatest.notes}</dd>
              </div>
            )}
            {nextTargetLabel && (
              <div>
                <dt className="text-[11px] font-medium text-slate-500">Rekor aktif &middot; target berikutnya</dt>
                <dd className="text-sm text-[#17263D]">{nextTargetLabel}</dd>
              </div>
            )}
            {quota && (
              <div>
                <dt className="text-[11px] font-medium text-slate-500">Sesi dibeli / terpakai / tersisa</dt>
                <dd className="text-sm text-[#17263D]">
                  {quota.total_sessions} / {quota.used ?? quota.attended} / {quota.remaining}
                  {(quota.used ?? quota.attended) > quota.attended && (
                    <span className="text-xs text-slate-500"> ({quota.attended} hadir)</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
          {beforeLatest && (
            <p className="mt-3 text-xs text-slate-500">Data per {formatShortDate(beforeLatest.session_date)}.</p>
          )}
        </GlassCard>
      )}

      <GlassCard>
        <h2 id="form-laporan" className={`mb-4 scroll-mt-20 ${HEADING}`}>
          {editReport && editReport.status === "final"
            ? "Ubah Laporan Sesi"
            : formReport
              ? "Lanjutkan Draft Sesi Ini"
              : isObservation
                ? "Isi Catatan Sesi Aquanatal"
                : `Isi ${reportTitle(type)} Baru`}
        </h2>
        {blockedLegacyDraft && (
          <p className="mb-3 rounded-xl bg-[#FFF8E1] px-3 py-2 text-xs text-[#6b5200]">
            Ada draft untuk tanggal ini dari sebelum kurikulum level. Draft itu tidak bisa dilanjutkan dengan form baru;
            hapus dulu dari Riwayat Laporan, lalu isi laporan baru.
          </p>
        )}
        {editReport && (
          <p className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#EEF9FB] px-3 py-2 text-xs text-slate-700">
            Anda sedang mengubah laporan tanggal {formatShortDate(editReport.session_date)}.
            <Link href={`/pelatih/murid/${studentId}?program=${program.id}`} className="font-semibold text-[#1597A3] underline">
              Batal, kembali ke form baru
            </Link>
          </p>
        )}
        {curriculumData && curriculumInitialState ? (
          <CurriculumReportForm
            key={formReport?.id ?? "new"}
            studentId={studentId}
            enrollmentId={enrollment.id}
            data={curriculumData}
            defaultDate={today}
            defaultSessionNumber={nextSessionNumber}
            editing={
              formReport
                ? {
                    reportId: formReport.id,
                    sessionDate: formReport.session_date,
                    sessionNumber: formReport.session_number,
                    attendance: formReport.attendance,
                    lateNotice: formReport.late_notice === true,
                    notes: formReport.notes,
                    nextFocus: formReport.next_focus,
                    isDraft: formReport.status === "draft",
                  }
                : null
            }
            narrativeDue={narrativeDue}
            action={formReport ? updateReportAction : createReportAction}
            initialState={curriculumInitialState}
            error={error}
          />
        ) : (
        <>
        {todayDraft && (
          <p className="mb-3 rounded-xl bg-[#FFF8E1] px-3 py-2 text-xs text-[#6b5200]">
            Sesi ini punya draft yang belum difinalisasi. Melanjutkan mengisi di bawah akan memperbarui draft yang
            sama, bukan membuat laporan baru.
          </p>
        )}
        <ToastForm action={todayDraft ? updateReportAction : createReportAction} resetOnSuccess className="flex flex-col gap-4">
          <AttendanceProvider initial={todayDraft?.attendance ?? "hadir"}>
            {todayDraft && <input type="hidden" name="report_id" value={todayDraft.id} />}
            <input type="hidden" name="student_id" value={studentId} />
            <input type="hidden" name="enrollment_id" value={enrollment.id} />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Tanggal</label>
                <GlassInput name="session_date" type="date" defaultValue={todayDraft?.session_date ?? today} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Nomor Sesi</label>
                <GlassInput
                  name="session_number"
                  type="number"
                  min={1}
                  defaultValue={todayDraft?.session_number ?? nextSessionNumber}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Kehadiran</label>
                <AttendanceSelect initial={todayDraft?.attendance ?? "hadir"} />
                <LateNoticeField initial={todayDraft?.late_notice === true} />
              </div>
            </div>

            <PresentOnly>
              <div className="flex flex-col gap-4">
                {levels ? (
                  <LevelScoresField
                    groups={formGroupList}
                    levels={levels}
                    legend={
                      isObservation
                        ? "Observasi sesi (pilih yang paling sesuai untuk tiap butir)"
                        : "Tingkat dukungan per indikator (pilih yang paling sesuai)"
                    }
                    initialScores={(todayDraft?.scores as Record<string, number>) ?? undefined}
                    initiallyOpen={openGroups}
                  />
                ) : (
                  <SkillScoresField
                    groups={formGroupList}
                    initialScores={(todayDraft?.scores as Record<string, number>) ?? undefined}
                    initiallyOpen={openGroups}
                  />
                )}
                {medals && <PerformanceRecordField />}
              </div>
            </PresentOnly>

            <NarrativeField required={narrativeDue} defaultValue={todayDraft?.notes ?? ""} />

            {!isObservation && <MediaFileInput label="Foto/Video (opsional)" />}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">
                {isObservation ? "Fokus Sesi Berikutnya" : "Rekomendasi Fokus Sesi Berikutnya"}
              </label>
              <GlassTextarea name="next_focus" rows={2} defaultValue={todayDraft?.next_focus ?? ""} />
            </div>

            {error && <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>}

            <GlassButton type="submit" name="intent" value="final" className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]">
              {isObservation ? "Simpan Catatan" : "Simpan Laporan"}
            </GlassButton>
          </AttendanceProvider>
        </ToastForm>
        </>
        )}
      </GlassCard>

      {curriculumOn && curriculumData && (
        <>
          <CurriculumProgress
            data={curriculumData}
            audience="pelatih"
            studentId={studentId}
            enrollmentId={enrollment.id}
            confirmAction={confirmLevelUpAction}
            hasPreCurriculum={reports.some((r) => r.curriculum_version == null && r.attendance === "hadir")}
          />
          {medals && performanceRecords.length > 0 && (
            <PerformanceRecordsCard records={performanceRecords} title="Rekor lama (sebelum kurikulum level)" />
          )}
        </>
      )}

      {medals && !curriculumOn && (
        <>
          <RecordUnlockCard statuses={milestoneStatuses} />
          <PerformanceRecordsManager
            records={performanceRecords}
            studentId={studentId}
            role="pelatih"
            viewerId={session.user.id}
            updateAction={updatePerformanceRecordAction}
            deleteAction={deletePerformanceRecordAction}
            today={today}
            hidden={hidden}
          />
        </>
      )}

      {goalsMode && (
        <PersonalGoalsManager
          goals={goals}
          entries={goalEntries}
          hidden={{ student_id: studentId, program: program.id, enrollment_id: enrollment.id }}
          today={today}
          createAction={createPersonalGoalAction}
          entryAction={addGoalEntryAction}
          deleteEntryAction={deleteGoalEntryAction}
          archiveAction={archiveGoalAction}
        />
      )}

      {!isObservation && !curriculumOn && (
        <EvaluationSummary
          indicatorConfig={indicatorConfig}
          reports={finalReports}
          latestIndicatorLabel={evalLatestIndicatorLabel}
          nextFocus={latestNextFocus(finalReports)}
          nextTargetLabel={nextTargetLabel}
          handoverAt={handover.handoverAt}
          currentPelatihName={session.fullName ?? null}
        />
      )}

      <ReportHistoryCard
        reports={reportsWithRevisions}
        indicatorConfig={indicatorConfig}
        title={isObservation ? "Riwayat Catatan" : "Riwayat Laporan"}
        editable
        viewerId={session.user.id}
        studentId={studentId}
        updateAction={updateReportAction}
        deleteAction={deleteReportAction}
        correctionAction={submitReportCorrectionAction}
        cyclePositions={cyclePositions}
        draftNarrativeDue={narrativeDue}
        curriculum={curriculumData}
        editBase={`/pelatih/murid/${studentId}?program=${program.id}`}
      />
    </div>
  );
}
