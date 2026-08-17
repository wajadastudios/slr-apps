import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { SkillScoresField } from "@/components/skill-scores-field";
import { ReportHistoryCard } from "@/components/report-history-card";
import { createReportAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function MuridReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { studentId } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  // RLS (pelatih_teaches_student) already scopes this to students this
  // pelatih actually teaches — an empty result means access denied.
  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, program:program_id(name, skill_template)")
    .eq("id", studentId)
    .single();

  if (!student) {
    redirect("/pelatih");
  }

  const program = student.program as unknown as {
    name: string;
    skill_template: string[];
  } | null;
  const skillTemplate = program?.skill_template ?? [];

  const { data: reports } = await supabase
    .from("progress_reports")
    .select(
      "id, session_date, session_number, attendance, scores, notes, next_focus, media_urls"
    )
    .eq("student_id", studentId)
    .order("session_date", { ascending: false });

  const nextSessionNumber = (reports?.length ?? 0) + 1;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        {student.full_name}{" "}
        <span className="text-base font-normal text-slate-600">
          &mdash; {program?.name}
        </span>
      </h1>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Isi Laporan Sesi Baru</h2>
        <form action={createReportAction} className="flex flex-col gap-4">
          <input type="hidden" name="student_id" value={studentId} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Tanggal</label>
              <GlassInput
                name="session_date"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Nomor Sesi</label>
              <GlassInput
                name="session_number"
                type="number"
                min={1}
                defaultValue={nextSessionNumber}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800">Kehadiran</label>
              <GlassSelect name="attendance" required defaultValue="hadir">
                <option value="hadir">Hadir</option>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
              </GlassSelect>
            </div>
          </div>

          <SkillScoresField initialSkills={skillTemplate} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Catatan</label>
            <GlassTextarea name="notes" rows={3} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Foto/Video (opsional)
            </label>
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

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">
              Rekomendasi Fokus Sesi Berikutnya
            </label>
            <GlassTextarea name="next_focus" rows={2} />
          </div>

          {error && (
            <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
          )}

          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] w-fit !text-white hover:!bg-[#2bb0ba]"
          >
            Simpan Laporan
          </GlassButton>
        </form>
      </GlassCard>

      <ReportHistoryCard reports={reports ?? []} />
    </div>
  );
}
