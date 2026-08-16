import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressTrend } from "@/components/progress-trend";

const ATTENDANCE_LABEL: Record<string, string> = {
  hadir: "Hadir",
  izin: "Izin",
  sakit: "Sakit",
};

export default async function AnakDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  // RLS (parent_owns_student) already scopes this to the caller's own
  // children — an empty result means access denied.
  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, birth_date, program:program_id(name, skill_template)")
    .eq("id", studentId)
    .single();

  if (!student) {
    redirect("/ortu");
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {student.full_name}{" "}
          <span className="text-base font-normal text-slate-600 dark:text-slate-400">
            &mdash; {program?.name ?? "Belum ada program"}
          </span>
        </h1>
        {student.birth_date && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Lahir: {student.birth_date}
          </p>
        )}
      </div>

      <ProgressTrend skillTemplate={skillTemplate} reports={reports ?? []} />

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Riwayat Laporan
        </h2>
        <div className="flex flex-col gap-3">
          {(!reports || reports.length === 0) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada laporan.
            </p>
          )}
          {reports?.map((r) => {
            const scores = (r.scores as Record<string, number>) ?? {};
            return (
              <div
                key={r.id}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900 dark:text-white">
                    Sesi {r.session_number ?? "-"} &mdash; {r.session_date}
                  </span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {ATTENDANCE_LABEL[r.attendance ?? ""] ?? r.attendance}
                  </span>
                </div>
                {Object.keys(scores).length > 0 && (
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    {Object.entries(scores)
                      .map(([skill, score]) => `${skill}: ${score}`)
                      .join(" · ")}
                  </p>
                )}
                {r.notes && (
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    {r.notes}
                  </p>
                )}
                {r.next_focus && (
                  <p className="mt-1 text-sm italic text-slate-600 dark:text-slate-400">
                    Fokus berikutnya: {r.next_focus}
                  </p>
                )}
                {r.media_urls && r.media_urls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.media_urls.map((url: string) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-700 underline dark:text-blue-300"
                      >
                        Lampiran
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
