import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ReportHistoryCard } from "@/components/report-history-card";
import { PerformanceRecordsCard } from "@/components/performance-records-card";
import { MilestoneBadgesCard } from "@/components/milestone-badges-card";
import { AssessmentGuideCard } from "@/components/assessment-guide-card";
import { computeProgressPercent } from "@/lib/progress";
import { formatAge } from "@/lib/performance";

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
      "id, full_name, birth_date, program:program_id!inner(name, skill_template), schedules!inner(class_slots!inner(label))"
    )
    .eq("program.name", "Kids Swim")
    .eq("schedules.class_slots.label", "Private")
    .order("full_name");

  const selectedId = id || students?.[0]?.id;

  const [{ data: reports }, { data: performanceRecords }] = selectedId
    ? await Promise.all([
        supabase
          .from("progress_reports")
          .select(
            "id, session_date, session_number, attendance, scores, notes, next_focus, media_urls, substitute_for"
          )
          .eq("student_id", selectedId)
          .order("session_date", { ascending: false }),
        supabase
          .from("performance_records")
          .select("id, metric_type, stroke, distance_m, duration_seconds, recorded_at")
          .eq("student_id", selectedId),
      ])
    : [{ data: null }, { data: null }];

  const selectedStudent = students?.find((s) => s.id === selectedId);
  const selectedSkillTemplate =
    (selectedStudent?.program as unknown as { skill_template: string[] } | null)
      ?.skill_template ?? [];
  const progressPercent = computeProgressPercent(
    selectedSkillTemplate,
    reports?.[0]?.scores as Record<string, number> | null | undefined
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
          <MilestoneBadgesCard records={performanceRecords ?? []} />
          <PerformanceRecordsCard records={performanceRecords ?? []} />
          <ReportHistoryCard reports={reports ?? []} />
          <AssessmentGuideCard />
        </>
      )}
    </div>
  );
}
