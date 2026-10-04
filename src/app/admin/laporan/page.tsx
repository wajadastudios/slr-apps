import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { ToastForm } from "@/components/ui/toast-form";
import { ReportHistoryCard } from "@/components/report-history-card";
import { PerformanceRecordsManager } from "@/components/performance-records-manager";
import { PersonalGoalsManager } from "@/components/personal-goals";
import { RecordUnlockCard } from "@/components/record-unlock-card";
import { AssessmentGuideCard } from "@/components/assessment-guide-card";
import { StarScoreLegend } from "@/components/star-score-legend";
import { computeLatestAchievement } from "@/lib/progress";
import { computeMilestoneStatuses } from "@/lib/milestones";
import { formatAge } from "@/lib/performance";
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
import { resolveReportCorrectionAction } from "./correction-actions";
import { decideQuotaAction } from "./quota-actions";
import { formatShortDate } from "@/lib/format-date";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

type PendingCorrection = {
  id: string;
  reason: string;
  created_at: string;
  report: { id: string; session_date: string; enrollment_id: string | null; student: { full_name: string } | null } | null;
  reporter: { full_name: string } | null;
};

// Admin reads a participant per ENROLLMENT (person + program): reports,
// indicators, records and goals of different programs never share a page.
export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const { id, error } = await searchParams;
  const supabase = await createClient();

  const [{ data: pendingCorrectionRows }, { data: pendingQuotaRows }] = await Promise.all([
    supabase
      .from("report_corrections")
      .select(
        "id, reason, created_at, report:report_id(id, session_date, enrollment_id, student:student_id(full_name)), reporter:reported_by(full_name)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    // Late-notice izin waiting for an admin decision (0046). Before that
    // migration runs the columns do not exist and this simply returns nothing.
    supabase
      .from("progress_reports")
      .select("id, session_date, session_number, enrollment_id, student:student_id(full_name), program:program_id(name), pelatih:pelatih_id(full_name)")
      .eq("attendance", "izin")
      .eq("late_notice", true)
      .is("quota_decision", null)
      .eq("status", "final")
      .order("session_date", { ascending: true }),
  ]);
  const pendingCorrections = (pendingCorrectionRows ?? []) as unknown as PendingCorrection[];
  const pendingQuota = (pendingQuotaRows ?? []) as unknown as {
    id: string;
    session_date: string;
    session_number: number | null;
    enrollment_id: string | null;
    student: { full_name: string } | null;
    program: { name: string } | null;
    pelatih: { full_name: string } | null;
  }[];

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
        .order("session_date", { ascending: false })
        .order("updated_at", { ascending: false }),
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
    // A single percent score was dropped per product decision -- see the
    // same change in src/app/pelatih/murid/[studentId]/page.tsx.
    const latestAchievement = stars ? computeLatestAchievement(reports, indicatorConfig) : null;
    const age = formatAge(student.birth_date);

    body = (
      <>
        <GlassCard className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-700">
            {student.full_name} &middot; {program.name}
            {age ? ` · ${age}` : ""}
          </p>
          {latestAchievement && (
            <span className="rounded-full bg-[#EEF9FB] px-3 py-1.5 text-sm font-semibold text-[#35C5D0]">
              {latestAchievement}
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
      <GlassCard tone="soft" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          Ada sesi yang laporannya belum diisi pengajar? Lihat daftarnya dan kirim pengingat WhatsApp.
        </p>
        <a
          href="/admin/laporan/pengingat"
          className="inline-flex min-h-10 items-center rounded-2xl border border-[#0E7C89]/70 bg-[#0E7C89] px-4 text-sm font-semibold text-white hover:bg-[#0A6570]"
        >
          Laporan belum diisi
        </a>
      </GlassCard>

      {pendingQuota.length > 0 && (
        <GlassCard className="!border-[#FFC800]/50 !bg-[#FFF8E1]/70">
          <h2 className={`mb-1 ${HEADING}`}>
            Perlu keputusan: sesi terpakai?
            <span className="ml-2 rounded-full bg-[#FFC800]/30 px-2.5 py-0.5 text-xs font-semibold text-[#6b5200]">
              {pendingQuota.length}
            </span>
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Pengajar melaporkan izin yang kabarnya diterima setelah pengajar tiba di kolam. &ldquo;Sesi terpakai&rdquo;
            mengurangi kuota paket dan dibayar ke pengajar dengan tarif sesi terpakai; &ldquo;Izin biasa&rdquo; tidak.
          </p>
          <ul className="flex flex-col gap-3">
            {pendingQuota.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/60 p-3">
                <div>
                  <p className="text-sm font-semibold text-[#17263D]">
                    {r.student?.full_name ?? "Murid"} &middot; {r.program?.name ?? "-"}
                  </p>
                  <p className="text-xs text-slate-600">
                    {r.session_number ? `Sesi ${r.session_number} · ` : ""}
                    {formatShortDate(r.session_date)} &middot; dilaporkan {r.pelatih?.full_name ?? "pengajar"}
                    {r.enrollment_id && (
                      <>
                        {" · "}
                        <a href={`/admin/laporan?id=${r.enrollment_id}`} className="font-medium text-[#1597A3] underline">
                          Lihat laporan
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ToastForm action={decideQuotaAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="used" />
                    <GlassButton type="submit" className="!bg-[#0E7C89] px-3 py-1.5 text-xs !text-white hover:!bg-[#0A6570]">
                      Tetapkan sesi terpakai
                    </GlassButton>
                  </ToastForm>
                  <ToastForm action={decideQuotaAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="not_used" />
                    <GlassButton type="submit" className="px-3 py-1.5 text-xs">
                      Tetap izin biasa
                    </GlassButton>
                  </ToastForm>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {pendingCorrections.length > 0 && (
        <GlassCard className="!border-[#FFC800]/50 !bg-[#FFF8E1]/70">
          <h2 className={`mb-3 ${HEADING}`}>
            Ajukan koreksi menunggu tinjauan
            <span className="ml-2 rounded-full bg-[#FFC800]/30 px-2.5 py-0.5 text-xs font-semibold text-[#6b5200]">
              {pendingCorrections.length}
            </span>
          </h2>
          <ul className="flex flex-col gap-3">
            {pendingCorrections.map((c) => (
              <li key={c.id} className="rounded-xl border border-white/60 bg-white/60 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-[#17263D]">
                    {c.report?.student?.full_name ?? "Murid tidak ditemukan"}
                    {c.report && ` · sesi ${formatShortDate(c.report.session_date)}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Diajukan {c.reporter?.full_name ?? "-"} &middot; {formatShortDate(c.created_at)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-700">{c.reason}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {c.report?.enrollment_id && (
                    <a
                      href={`/admin/laporan?id=${c.report.enrollment_id}`}
                      className="text-xs font-medium text-[#1597A3] underline"
                    >
                      Lihat laporan
                    </a>
                  )}
                  <ToastForm action={resolveReportCorrectionAction} className="flex flex-1 flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <GlassInput name="admin_note" placeholder="Catatan (opsional)" className="min-w-[160px] flex-1 text-xs" />
                    <GlassButton type="submit" className="!bg-[#35C5D0] px-3 py-1.5 text-xs !text-white hover:!bg-[#2bb0ba]">
                      Tandai selesai
                    </GlassButton>
                  </ToastForm>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

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
