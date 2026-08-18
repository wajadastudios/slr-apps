import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ReportHistoryCard } from "@/components/report-history-card";
import { computeProgressPercent } from "@/lib/progress";

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
    .select("id, full_name, program:program_id(name, skill_template)")
    .order("full_name");

  const selectedId = id || students?.[0]?.id;

  const { data: reports } = selectedId
    ? await supabase
        .from("progress_reports")
        .select(
          "id, session_date, session_number, attendance, scores, notes, next_focus, media_urls"
        )
        .eq("student_id", selectedId)
        .order("session_date", { ascending: false })
    : { data: null };

  const selectedStudent = students?.find((s) => s.id === selectedId);
  const selectedSkillTemplate =
    (selectedStudent?.program as unknown as { skill_template: string[] } | null)
      ?.skill_template ?? [];
  const progressPercent = computeProgressPercent(
    selectedSkillTemplate,
    reports?.[0]?.scores as Record<string, number> | null | undefined
  );

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
          {progressPercent !== null && (
            <GlassCard className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-700">
                Progress keseluruhan {selectedStudent.full_name}
              </p>
              <span className="rounded-full bg-[#EEF9FB] px-3 py-1.5 text-sm font-semibold text-[#35C5D0]">
                {progressPercent}%
              </span>
            </GlassCard>
          )}
          <ReportHistoryCard reports={reports ?? []} />
        </>
      )}
    </div>
  );
}
