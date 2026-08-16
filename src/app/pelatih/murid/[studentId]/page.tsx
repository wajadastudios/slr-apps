import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { GlassButton } from "@/components/ui/glass-button";
import { createReportAction } from "./actions";

const ATTENDANCE_LABEL: Record<string, string> = {
  hadir: "Hadir",
  izin: "Izin",
  sakit: "Sakit",
};

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
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
        {student.full_name}{" "}
        <span className="text-base font-normal text-slate-600 dark:text-slate-400">
          &mdash; {program?.name}
        </span>
      </h1>

      <GlassCard>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Isi Laporan Sesi Baru
        </h2>
        <form action={createReportAction} className="flex flex-col gap-4">
          <input type="hidden" name="student_id" value={studentId} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800 dark:text-slate-200">
                Tanggal
              </label>
              <GlassInput
                name="session_date"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800 dark:text-slate-200">
                Nomor Sesi
              </label>
              <GlassInput
                name="session_number"
                type="number"
                min={1}
                defaultValue={nextSessionNumber}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-slate-800 dark:text-slate-200">
                Kehadiran
              </label>
              <GlassSelect name="attendance" required defaultValue="hadir">
                <option value="hadir">Hadir</option>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
              </GlassSelect>
            </div>
          </div>

          {skillTemplate.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-slate-800 dark:text-slate-200">
                Skor Skill (1&ndash;5)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {skillTemplate.map((skill, i) => (
                  <div key={skill} className="flex flex-col gap-1.5">
                    <label className="text-sm text-slate-700 dark:text-slate-300">
                      {skill}
                    </label>
                    <GlassSelect name={`score_${i}`} defaultValue="">
                      <option value="">-</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </GlassSelect>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Catatan
            </label>
            <GlassTextarea name="notes" rows={3} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Foto/Video (opsional)
            </label>
            <input
              type="file"
              name="media"
              multiple
              accept="image/*,video/*"
              className="text-sm text-slate-700 dark:text-slate-300"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800 dark:text-slate-200">
              Rekomendasi Fokus Sesi Berikutnya
            </label>
            <GlassTextarea name="next_focus" rows={2} />
          </div>

          {error && (
            <p className="text-sm text-red-700 dark:text-red-300">
              {decodeURIComponent(error)}
            </p>
          )}

          <GlassButton type="submit" className="w-fit">
            Simpan Laporan
          </GlassButton>
        </form>
      </GlassCard>

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
