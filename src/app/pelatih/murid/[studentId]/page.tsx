import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { SkillScoresField } from "@/components/skill-scores-field";
import { LevelScoresField } from "@/components/level-scores-field";
import { AttendanceProvider, AttendanceSelect, PresentOnly } from "@/components/report-attendance";
import { PerformanceRecordField } from "@/components/performance-record-field";
import { PerformanceRecordsManager } from "@/components/performance-records-manager";
import { PersonalGoalsManager } from "@/components/personal-goals";
import { RecordUnlockCard } from "@/components/record-unlock-card";
import { ReportHistoryCard } from "@/components/report-history-card";
import { ToastForm } from "@/components/ui/toast-form";
import { computeMilestoneStatuses } from "@/lib/milestones";
import { computeLatestAchievement, latestAttendedReport } from "@/lib/progress";
import { formGroups, relevantGroupIds } from "@/lib/indicators";
import { loadIndicatorConfig } from "@/lib/indicator-loader";
import { loadMilestones } from "@/lib/milestone-loader";
import { requirePelatih } from "@/lib/create-account";
import { formatAge } from "@/lib/performance";
import { jakartaToday, toISODate } from "@/lib/week";
import {
  PROGRAM_SELECT,
  levelsFor,
  normalizeProgram,
  reportTitle,
  usesStars,
} from "@/lib/programs";
import { hasClassAccess, type EnrollmentStatus } from "@/lib/enrollment";
import type { GoalEntry, PersonalGoal } from "@/lib/personal-goals";
import { createReportAction, updateReportAction, deleteReportAction } from "./actions";
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
  searchParams: Promise<{ error?: string; tanggal?: string; program?: string }>;
}) {
  const { studentId } = await params;
  const { error, tanggal, program: programParam } = await searchParams;
  const supabase = await createClient();
  const session = await requirePelatih();

  // RLS (pelatih_teaches_student) already scopes this to students this
  // pelatih actually teaches — an empty result means access denied.
  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, birth_date")
    .eq("id", studentId)
    .single();

  if (!student) {
    redirect("/pelatih");
  }

  // Only the enrollments (programs) assigned to this pengajar, with class access.
  const { data: mine } = await supabase.rpc("pelatih_enrollments");
  const myEnrollments = ((mine ?? []) as MyEnrollment[]).filter(
    (e) => e.student_id === studentId && hasClassAccess(e.status)
  );
  if (myEnrollments.length === 0) {
    redirect("/pelatih");
  }

  const enrollment =
    myEnrollments.find((e) => e.program_id === programParam) ??
    (myEnrollments.length === 1 ? myEnrollments[0] : null);

  const { data: programRows } = await supabase
    .from("programs")
    .select(PROGRAM_SELECT)
    .in(
      "id",
      myEnrollments.map((e) => e.program_id)
    );
  const programs = (programRows ?? []).map(normalizeProgram);

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

  const [indicatorConfig, milestones, reportsRes, recordsRes, goalsRes] = await Promise.all([
    loadIndicatorConfig(supabase, program.id),
    medals ? loadMilestones(supabase, program.id) : Promise.resolve([]),
    supabase
      .from("progress_reports")
      .select("*")
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
  ]);
  const reports = reportsRes.data ?? [];
  const performanceRecords = recordsRes.data ?? [];
  const goals = ((goalsRes.data ?? []) as PersonalGoal[]).map((g) => ({
    ...g,
    baseline: g.baseline === null ? null : Number(g.baseline),
    target: Number(g.target),
  }));

  let goalEntries: GoalEntry[] = [];
  if (goalsMode && goals.length > 0) {
    const { data } = await supabase
      .from("personal_goal_entries")
      .select("id, goal_id, value, recorded_at, note")
      .in(
        "goal_id",
        goals.map((g) => g.id)
      );
    goalEntries = ((data ?? []) as GoalEntry[]).map((e) => ({ ...e, value: Number(e.value) }));
  }

  const nextSessionNumber = reports.length + 1;
  // Jakarta calendar date (not UTC), or the session date the dashboard sent us
  // from when filling in a report for a specific day.
  const todayIso = toISODate(jakartaToday());
  const today = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : todayIso;
  const latestScores = latestAttendedReport(reports)?.scores as Record<string, number> | null | undefined;
  // A single percent score was dropped per product decision -- a short,
  // concrete achievement ("Meningkat pada X" / "Sudah baik pada Y") is more
  // meaningful than one averaged number, and simply hides itself (returns
  // null) when there isn't enough data to say something true.
  const latestAchievement = usesStars(type)
    ? computeLatestAchievement(reports, indicatorConfig)
    : null;
  const formGroupList = formGroups(indicatorConfig);
  const openGroups = relevantGroupIds(formGroupList, latestScores);
  const hidden = { program: program.id };

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

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>
          {isObservation ? "Isi Catatan Sesi Aquanatal" : `Isi ${reportTitle(type)} Baru`}
        </h2>
        <ToastForm action={createReportAction} resetOnSuccess className="flex flex-col gap-4">
          <AttendanceProvider>
            <input type="hidden" name="student_id" value={studentId} />
            <input type="hidden" name="enrollment_id" value={enrollment.id} />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Tanggal</label>
                <GlassInput name="session_date" type="date" defaultValue={today} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Nomor Sesi</label>
                <GlassInput name="session_number" type="number" min={1} defaultValue={nextSessionNumber} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Kehadiran</label>
                <AttendanceSelect />
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
                    initiallyOpen={openGroups}
                  />
                ) : (
                  <SkillScoresField groups={formGroupList} initiallyOpen={openGroups} />
                )}
                {medals && <PerformanceRecordField />}
              </div>
            </PresentOnly>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">{isObservation ? "Catatan Instruktur" : "Catatan"}</label>
              <GlassTextarea name="notes" rows={3} />
            </div>

            {!isObservation && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-slate-800">Foto/Video (opsional)</label>
                <div className="rounded-2xl border border-dashed border-white/50 bg-white/30 px-4 py-3">
                  <input
                    type="file"
                    name="media"
                    multiple
                    accept="image/*,video/*"
                    className="w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-[#35C5D0] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#2bb0ba]"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">
                {isObservation ? "Fokus Sesi Berikutnya" : "Rekomendasi Fokus Sesi Berikutnya"}
              </label>
              <GlassTextarea name="next_focus" rows={2} />
            </div>

            {error && <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>}

            <GlassButton type="submit" className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]">
              {isObservation ? "Simpan Catatan" : "Simpan Laporan"}
            </GlassButton>
          </AttendanceProvider>
        </ToastForm>
      </GlassCard>

      {medals && (
        <>
          <RecordUnlockCard statuses={computeMilestoneStatuses(performanceRecords, milestones)} />
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

      <ReportHistoryCard
        reports={reports}
        indicatorConfig={indicatorConfig}
        title={isObservation ? "Riwayat Catatan" : "Riwayat Laporan"}
        editable
        studentId={studentId}
        updateAction={updateReportAction}
        deleteAction={deleteReportAction}
      />
    </div>
  );
}
