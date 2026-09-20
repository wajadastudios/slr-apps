import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ReportHistoryCard } from "@/components/report-history-card";
import { PerformanceRecordsManager } from "@/components/performance-records-manager";
import { PersonalGoalsManager } from "@/components/personal-goals";
import { RecordUnlockCard } from "@/components/record-unlock-card";
import { AssessmentGuideCard } from "@/components/assessment-guide-card";
import { StarScoreLegend } from "@/components/star-score-legend";
import { computeProgressPercent, latestAttendedReport } from "@/lib/progress";
import { computeMilestoneStatuses } from "@/lib/milestones";
import { formatAge } from "@/lib/performance";
import { activeKeys } from "@/lib/indicators";
import { loadIndicatorConfig } from "@/lib/indicator-loader";
import { loadMilestones } from "@/lib/milestone-loader";
import { PROGRAM_SELECT, normalizeProgram, usesStars } from "@/lib/programs";
import type { GoalEntry, PersonalGoal } from "@/lib/personal-goals";
import { jakartaToday, toISODate } from "@/lib/week";
import {
  addPerformanceRecordAction,
  updatePerformanceRecordAction,
  deletePerformanceRecordAction,
} from "./record-actions";
import {
  addGoalEntryAction,
  archiveGoalAction,
  createPersonalGoalAction,
  deleteGoalEntryAction,
} from "./goal-actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

// Admin reads a participant per ENROLLMENT (person + program): reports,
// indicators, records and goals of different programs never share a page.
export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const { id, error } = await searchParams;
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("enrollments")
    .select(`id, status, student:student_id(id, full_name, birth_date), program:program_id(${PROGRAM_SELECT})`)
    .in("status", ["scheduled", "active"]);

  const enrollments = ((rows ?? []) as unknown as {
    id: string;
    status: string;
    student: { id: string; full_name: string; birth_date: string | null } | null;
    program: Parameters<typeof normalizeProgram>[0] | null;
  }[])
    .filter((e) => e.student && e.program)
    .map((e) => ({ id: e.id, student: e.student!, program: normalizeProgram(e.program!) }))
    .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, "id") || a.program.name.localeCompare(b.program.name));

  const selected = enrollments.find((e) => e.id === id) ?? enrollments[0];

  const today = toISODate(jakartaToday());
  let body: React.ReactNode = null;

  if (selected) {
    const { program, student } = selected;
    const medals = program.records_mode === "medals";
    const goalsMode = program.records_mode === "personal_goals";

    const [indicatorConfig, milestones, reportsRes, recordsRes, goalsRes] = await Promise.all([
      loadIndicatorConfig(supabase, program.id),
      medals ? loadMilestones(supabase, program.id) : Promise.resolve([]),
      supabase
        .from("progress_reports")
        .select("*")
        .eq("enrollment_id", selected.id)
        .order("session_date", { ascending: false }),
      medals
        ? supabase.from("performance_records").select("*").eq("enrollment_id", selected.id)
        : Promise.resolve({ data: [] as never[] }),
      goalsMode
        ? supabase
            .from("personal_goals")
            .select("id, label, unit, baseline, target, status")
            .eq("enrollment_id", selected.id)
        : Promise.resolve({ data: [] as never[] }),
    ]);
    const reports = reportsRes.data ?? [];
    const records = recordsRes.data ?? [];
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

    const stars = usesStars(program.assessment_type);
    const progressPercent = stars
      ? computeProgressPercent(
          activeKeys(indicatorConfig),
          latestAttendedReport(reports)?.scores as Record<string, number> | null | undefined
        )
      : null;
    const age = formatAge(student.birth_date);

    body = (
      <>
        <GlassCard className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-700">
            {student.full_name} &middot; {program.name}
            {age ? ` · ${age}` : ""}
          </p>
          {progressPercent !== null && (
            <span className="rounded-full bg-[#EEF9FB] px-3 py-1.5 text-sm font-semibold text-[#35C5D0]">
              Progress {progressPercent}%
            </span>
          )}
        </GlassCard>

        {medals && (
          <>
            <RecordUnlockCard statuses={computeMilestoneStatuses(records, milestones)} />
            <PerformanceRecordsManager
              records={records}
              studentId={student.id}
              role="admin"
              viewerId={null}
              addAction={addPerformanceRecordAction}
              updateAction={updatePerformanceRecordAction}
              deleteAction={deletePerformanceRecordAction}
              today={today}
              hidden={{ enrollment_id: selected.id }}
            />
          </>
        )}

        {goalsMode && (
          <PersonalGoalsManager
            goals={goals}
            entries={goalEntries}
            hidden={{ enrollment_id: selected.id, back_id: selected.id }}
            today={today}
            createAction={createPersonalGoalAction}
            entryAction={addGoalEntryAction}
            deleteEntryAction={deleteGoalEntryAction}
            archiveAction={archiveGoalAction}
          />
        )}

        {stars && (
          <>
            <AssessmentGuideCard indicatorConfig={indicatorConfig} />
            <StarScoreLegend />
          </>
        )}

        <ReportHistoryCard
          reports={reports}
          indicatorConfig={indicatorConfig}
          title={program.assessment_type === "observation" ? "Riwayat Catatan" : "Riwayat Laporan"}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Laporan Perkembangan Peserta</h2>
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Pilih Peserta &amp; Program</label>
            <GlassSelect name="id" defaultValue={selected?.id ?? ""} className="min-w-[260px]" glassChevron>
              {enrollments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.student.full_name} — {e.program.name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton type="submit" className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]">
            Tampilkan
          </GlassButton>
        </form>
        {enrollments.length === 0 && <p className="mt-3 text-sm text-slate-600">Belum ada peserta dengan kelas aktif.</p>}
        {error && <p className="mt-3 text-sm text-red-700">{decodeURIComponent(error)}</p>}
      </GlassCard>

      {body}
    </div>
  );
}
