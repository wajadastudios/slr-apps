import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ReportHistoryCard } from "@/components/report-history-card";
import { PerformanceRecordsManager } from "@/components/performance-records-manager";
import { RecordUnlockCard } from "@/components/record-unlock-card";
import { computeMilestoneStatuses } from "@/lib/milestones";
import { AssessmentGuideCard } from "@/components/assessment-guide-card";
import { StarScoreLegend } from "@/components/star-score-legend";
import { computeProgressPercent, latestAttendedReport } from "@/lib/progress";
import { formatAge } from "@/lib/performance";
import { activeKeys } from "@/lib/indicators";
import { loadIndicatorConfig } from "@/lib/indicator-loader";
import { loadMilestones } from "@/lib/milestone-loader";
import {
  addPerformanceRecordAction,
  updatePerformanceRecordAction,
  deletePerformanceRecordAction,
} from "./record-actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select(
      "id, full_name, birth_date, program_id, program:program_id!inner(name), schedules!inner(class_slots!inner(label))"
    )
    .eq("program.name", "Kids Swim")
    .eq("schedules.class_slots.label", "Private")
    .order("full_name");

  const selectedId = id || students?.[0]?.id;

  const [{ data: reports }, { data: performanceRecords }] = selectedId
    ? await Promise.all([
        supabase
          .from("progress_reports")
          .select("*")
          .eq("student_id", selectedId)
          .order("session_date", { ascending: false }),
        supabase
          .from("performance_records")
          .select("*")
          .eq("student_id", selectedId),
      ])
    : [{ data: null }, { data: null }];

  const selectedStudent = students?.find((s) => s.id === selectedId);
  const [indicatorConfig, milestones] = await Promise.all([
    loadIndicatorConfig(supabase, selectedStudent?.program_id),
    loadMilestones(supabase),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const progressPercent = computeProgressPercent(
    activeKeys(indicatorConfig),
    latestAttendedReport(reports ?? [])?.scores as
      | Record<string, number>
      | null
      | undefined
  );
  const selectedAge = formatAge(selectedStudent?.birth_date);

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Laporan Perkembangan Siswa</h2>
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Pilih Siswa</label>
            <GlassSelect
              name="id"
              defaultValue={selectedId ?? ""}
              className="min-w-[220px]"
            >
              {students?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {(s.program as unknown as { name: string } | null)?.name
                    ? ` — ${(s.program as unknown as { name: string }).name}`
                    : ""}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
          >
            Tampilkan
          </GlassButton>
        </form>
        {(!students || students.length === 0) && (
          <p className="mt-3 text-sm text-slate-600">Belum ada siswa.</p>
        )}
      </GlassCard>

      {selectedStudent && (
        <>
          <GlassCard className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-700">
              {selectedStudent.full_name}
              {selectedAge ? ` · ${selectedAge}` : ""}
            </p>
            {progressPercent !== null && (
              <span className="rounded-full bg-[#EEF9FB] px-3 py-1.5 text-sm font-semibold text-[#35C5D0]">
                Progress {progressPercent}%
              </span>
            )}
          </GlassCard>
          <RecordUnlockCard statuses={computeMilestoneStatuses(performanceRecords ?? [], milestones)} />
          <PerformanceRecordsManager
            records={performanceRecords ?? []}
            studentId={selectedStudent.id}
            role="admin"
            viewerId={null}
            addAction={addPerformanceRecordAction}
            updateAction={updatePerformanceRecordAction}
            deleteAction={deletePerformanceRecordAction}
            today={today}
          />
          <AssessmentGuideCard indicatorConfig={indicatorConfig} />
          <StarScoreLegend />
          <ReportHistoryCard
            reports={reports ?? []}
            indicatorConfig={indicatorConfig}
          />
        </>
      )}
    </div>
  );
}
