import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { ProgressTrend } from "@/components/progress-trend";
import { LatestReportCard, ReportHistoryCard, type ReportRow } from "@/components/report-history-card";
import { PerformanceRecordsCard } from "@/components/performance-records-card";
import { RecordUnlockCard } from "@/components/record-unlock-card";
import { AssessmentGuideCard } from "@/components/assessment-guide-card";
import { StarScoreLegend } from "@/components/star-score-legend";
import { ChildTabs } from "@/components/child-tabs";
import { ParentIndicatorSummary } from "@/components/parent-indicator-summary";
import { AttendanceConsistencyCard } from "@/components/attendance-consistency-card";
import { SupportProgressCard } from "@/components/support-progress-card";
import { ClassJourneyCard } from "@/components/class-journey-card";
import { PersonalGoalsView } from "@/components/personal-goals";
import { EnrollmentStatusCard } from "@/components/enrollment-status-card";
import {
  computeLatestAchievement,
  computeNextSession,
  computeSessionQuota,
  formatSessionQuota,
  latestAttendedReport,
} from "@/lib/progress";
import { summarizeReportGroups } from "@/lib/report-summary";
import { supportChanges } from "@/lib/level-summary";
import { formatShortDate } from "@/lib/format-date";
import { PRIMARY_BUTTON, SECONDARY_BUTTON, GHOST_BUTTON } from "@/lib/ui-classes";
import { formatAge, type PerformanceRecordRow } from "@/lib/performance";
import { loadIndicatorConfig } from "@/lib/indicator-loader";
import type { IndicatorConfig } from "@/lib/indicators";
import { loadMilestones } from "@/lib/milestone-loader";
import { loadEnrollments } from "@/lib/enrollment-server";
import { computeMilestoneStatuses } from "@/lib/milestones";
import { hasClassAccess, isLive, pickEnrollment } from "@/lib/enrollment";
import { getUserWithRole } from "@/lib/auth";
import { parseTab, tabsFor, usesStars, type ProgramMeta } from "@/lib/programs";
import type { GoalEntry, PersonalGoal } from "@/lib/personal-goals";
import { DAYS } from "@/lib/days";
import { setPackagePreferenceAction } from "./actions";
import { ToastForm } from "@/components/ui/toast-form";

type ScoredReport = ReportRow & { scores: Record<string, number> | null };

export default async function AnakDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ tab?: string | string[]; program?: string }>;
}) {
  const { studentId } = await params;
  const { tab: tabParam, program: programParam } = await searchParams;
  const supabase = await createClient();

  // RLS (parent_owns_student) already scopes this to the caller's own
  // children — an empty result means access denied.
  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, nickname, birth_date, next_package_preference_id, is_self, kind, user_id")
    .eq("id", studentId)
    .single();

  if (!student) {
    redirect("/ortu");
  }

  // The page follows ONE enrollment (program) at a time; reports, indicators,
  // records and progress of the other programs are never mixed in.
  const allEnrollments = await loadEnrollments(supabase, [studentId]);
  const live = allEnrollments.filter((e) => isLive(e.status));
  const enrollment = pickEnrollment(live, programParam);
  if (!enrollment) {
    redirect("/ortu");
  }
  const program: ProgramMeta = enrollment.program;
  const displayName = student.nickname || student.full_name;
  const age = formatAge(student.birth_date);

  const switcher =
    live.length > 1 ? (
      <nav aria-label="Program" className="flex flex-wrap gap-1.5">
        {live.map((e) => (
          <Link
            key={e.id}
            href={`/ortu/anak/${studentId}?program=${e.program_id}`}
            replace
            aria-current={e.id === enrollment.id ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-xl px-3.5 text-sm font-semibold transition-colors ${
              e.id === enrollment.id
                ? "bg-[#35C5D0] text-white shadow-[0_2px_10px_rgba(53,197,208,0.4)]"
                : "border border-white/60 bg-white/60 text-slate-700 hover:bg-[#35C5D0]/15"
            }`}
          >
            {e.program.name}
          </Link>
        ))}
      </nav>
    ) : null;

  const backLink = (
    <Link
      href={`/ortu#anak-${studentId}-${enrollment.program_id}`}
      className={`-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-xl px-2 text-sm font-medium text-[#1597A3] ${GHOST_BUTTON}`}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M12.5 5.5L8 10l4.5 4.5" />
      </svg>
      Ringkasan
    </Link>
  );

  // An adult registered by someone else is theirs to share: the registering
  // account sees the registration status only, until the participant allows
  // more (the database enforces the same rule).
  const session = await getUserWithRole();
  const isParticipant = student.is_self === true || student.user_id === session?.user.id;
  const restricted =
    student.kind === "adult_family" && !isParticipant && !enrollment.report_access_granted_to_requester;

  // Before the class is scheduled/active: only the registration status.
  if (!hasClassAccess(enrollment.status) || restricted) {
    let offered = null;
    if (enrollment.offered_slot_id) {
      const { data } = await supabase
        .from("class_slots")
        .select("id, label, location, day_of_week, start_time")
        .eq("id", enrollment.offered_slot_id)
        .maybeSingle();
      offered = data;
    }
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        {switcher}
        <EnrollmentStatusCard
          full
          enrollmentId={enrollment.id}
          name={displayName}
          programName={program.name}
          status={enrollment.status}
          preferred={[enrollment.preferred_schedule, enrollment.preferred_location].filter(Boolean).join(" · ") || null}
          offeredSlot={offered}
          restrictedFor={restricted && hasClassAccess(enrollment.status) ? student.full_name : null}
        />
      </div>
    );
  }

  const tabs = tabsFor(program);
  const tab = parseTab(tabParam, tabs);
  const medals = program.records_mode === "medals";
  const goalsMode = program.records_mode === "personal_goals";

  const [
    indicatorConfig,
    { data: reports },
    { data: invoices },
    { data: availablePackages },
    { data: scheduleRows },
    { data: pelatihNames },
  ] = await Promise.all([
    loadIndicatorConfig(supabase, program.id),
    supabase
      .from("progress_reports")
      .select("*")
      .eq("enrollment_id", enrollment.id)
      .order("session_date", { ascending: false }),
    supabase
      .from("invoices")
      .select("sessions_count, status, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("program_packages")
      .select("id, name, sessions_count, price, benefits")
      .eq("program_id", program.id)
      .eq("active", true)
      .order("sessions_count"),
    supabase
      .from("schedules")
      .select("slot:slot_id(day_of_week, start_time, label, pelatih_id, program_id)")
      .eq("student_id", studentId),
    supabase.rpc("get_public_pelatih_names"),
  ]);

  const allReports = (reports ?? []) as ScoredReport[];
  const singleClass = live.filter((e) => hasClassAccess(e.status)).length <= 1;
  const quotaText = singleClass
    ? formatSessionQuota(computeSessionQuota(invoices ?? [], allReports))
    : {
        value: `${allReports.filter((r) => r.attendance === "hadir").length} sesi diikuti`,
        note: "Kuota paket ada di menu Tagihan",
      };
  const quota = computeSessionQuota(invoices ?? [], allReports);
  const currentPackageSessions = (invoices ?? []).find((i) => i.status === "paid")?.sessions_count ?? 0;
  const totalAllSessions = (invoices ?? []).reduce((sum, i) => sum + i.sessions_count, 0);

  // Nudge to pick the next package only when the current paid one is down to
  // its last session and no further invoice (sent/processing) already exists.
  const showRenewalBanner =
    singleClass && currentPackageSessions > 4 && quota.remaining === 1 && totalAllSessions === quota.total;

  const pelatihNameById = new Map<string, string>();
  for (const p of pelatihNames ?? []) {
    pelatihNameById.set(p.id, p.full_name);
  }

  const slotInfos = (scheduleRows ?? [])
    .map(
      (row) =>
        row.slot as unknown as {
          day_of_week: number;
          start_time: string;
          label: string | null;
          pelatih_id: string;
          program_id: string;
        } | null
    )
    .filter((s): s is NonNullable<typeof s> => s !== null && s.program_id === program.id)
    .map((s) => ({
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      label: s.label,
      pelatihName: pelatihNameById.get(s.pelatih_id) ?? null,
    }));

  const nextSession = computeNextSession(slotInfos);
  const nextSessionLabel = nextSession
    ? `${DAYS[nextSession.day_of_week]} · ${nextSession.start_time.slice(0, 5)} WIB${
        nextSession.pelatihName ? ` · Coach ${nextSession.pelatihName}` : ""
      }`
    : null;

  const [latestReport, ...olderReports] = allReports;
  const isObservation = program.assessment_type === "observation";

  // record / goals data only for the tab that needs it
  let records: PerformanceRecordRow[] = [];
  let milestones: Awaited<ReturnType<typeof loadMilestones>> = [];
  if (tab === "record" && medals) {
    const [recordsRes, ms] = await Promise.all([
      supabase.from("performance_records").select("*").eq("enrollment_id", enrollment.id),
      loadMilestones(supabase, program.id),
    ]);
    records = (recordsRes.data ?? []) as PerformanceRecordRow[];
    milestones = ms;
  }

  let goals: PersonalGoal[] = [];
  let goalEntries: GoalEntry[] = [];
  if (tab === "target" && goalsMode) {
    const { data: goalRows } = await supabase
      .from("personal_goals")
      .select("id, label, unit, baseline, target, status")
      .eq("enrollment_id", enrollment.id);
    goals = ((goalRows ?? []) as PersonalGoal[]).map((g) => ({
      ...g,
      baseline: g.baseline === null ? null : Number(g.baseline),
      target: Number(g.target),
    }));
    if (goals.length > 0) {
      const { data } = await supabase
        .from("personal_goal_entries")
        .select("id, goal_id, value, recorded_at, note")
        .in(
          "goal_id",
          goals.map((g) => g.id)
        );
      goalEntries = ((data ?? []) as GoalEntry[]).map((e) => ({ ...e, value: Number(e.value) }));
    }
  }

  const reportsTab = (
    <>
      {!latestReport ? (
        <GlassCard>
          <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
            {isObservation ? "Belum ada catatan sesi" : "Belum ada laporan latihan"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isObservation
              ? "Catatan sesi dari instruktur akan muncul di sini setelah sesi pertama."
              : `Laporan dari pelatih akan muncul di sini setelah sesi latihan pertama ${displayName}.`}
          </p>
        </GlassCard>
      ) : (
        <>
          <LatestReportCard
            report={latestReport}
            indicatorConfig={indicatorConfig}
            title={isObservation ? "Catatan Sesi Terbaru" : "Laporan Terbaru"}
            anchorId={isObservation ? "catatan-terbaru" : "laporan-terbaru"}
          />
          {olderReports.length > 0 && (
            <ReportHistoryCard
              id={isObservation ? "riwayat-catatan" : "riwayat-laporan"}
              title={isObservation ? "Riwayat Catatan" : "Riwayat Laporan"}
              reports={olderReports}
              indicatorConfig={indicatorConfig}
              parentView
            />
          )}
        </>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-3 !bg-white/85">
        {backLink}
        <h1 className="font-[family-name:var(--font-quicksand)] text-xl font-bold leading-tight text-[#17263D]">
          {displayName}
          <span className="text-base font-medium text-slate-500">
            {" "}
            · {program.name}
            {age ? ` · ${age}` : ""}
          </span>
        </h1>
        {switcher}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#FFC800]/45 bg-gradient-to-br from-[#FFF3C4] to-[#FFF8E1] px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-[#8a6900]">Sesi berikutnya</p>
            <p className="text-sm font-semibold leading-snug text-[#17263D]">
              {nextSessionLabel ?? "Belum ada jadwal"}
            </p>
          </div>
          <div className="rounded-2xl bg-[#EEF9FB] px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-slate-500">Kuota sesi</p>
            <p className="text-sm font-semibold leading-snug text-[#17263D]">{quotaText.note}</p>
            <p className="text-[11px] text-slate-500">{quotaText.value}</p>
          </div>
        </div>
      </GlassCard>

      {showRenewalBanner && availablePackages && availablePackages.length > 0 && (
        <GlassCard className="border-[#FFC800]/40 bg-[#FFF8E1]">
          <h2 className="mb-1 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
            Sesi Terakhir di Paket Ini
          </h2>
          <p className="mb-4 text-sm text-slate-700">
            Tinggal 1 sesi lagi di paket {student.full_name} saat ini. Pilih paket untuk sesi berikutnya — pilihan
            Anda akan dilihat admin saat menyiapkan tagihan berikutnya (admin tetap yang mengonfirmasi & mengirim
            tagihannya).
          </p>
          <div className="flex flex-col gap-2">
            {availablePackages.map((pkg) => {
              const selected = pkg.id === student.next_package_preference_id;
              return (
                <ToastForm key={pkg.id} action={setPackagePreferenceAction}>
                  <input type="hidden" name="student_id" value={studentId} />
                  <input type="hidden" name="program_package_id" value={pkg.id} />
                  <DataRow
                    className={selected ? "border-[#35C5D0]/60 bg-[#EEF9FB]" : undefined}
                    primary={
                      <>
                        {pkg.name} &middot; {pkg.sessions_count} sesi &middot; Rp
                        {Number(pkg.price).toLocaleString("id-ID")}
                      </>
                    }
                    secondary={
                      pkg.benefits && pkg.benefits.length > 0 ? pkg.benefits.join(" · ") : undefined
                    }
                    action={
                      <GlassButton
                        type="submit"
                        className={`px-4 py-2 text-sm ${selected ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}
                      >
                        {selected ? "Dipilih" : "Pilih Paket Ini"}
                      </GlassButton>
                    }
                  />
                </ToastForm>
              );
            })}
          </div>
        </GlassCard>
      )}

      <ChildTabs studentId={studentId} programId={program.id} tabs={tabs} active={tab} />

      {(tab === "laporan" || tab === "catatan") && reportsTab}

      {tab === "perkembangan" && (
        <ProgressTab
          program={program}
          reports={allReports}
          indicatorConfig={indicatorConfig}
        />
      )}

      {tab === "perjalanan" && <ClassJourneyCard reports={allReports} />}

      {tab === "record" && medals && (
        <>
          <RecordUnlockCard statuses={computeMilestoneStatuses(records, milestones)} />
          <PerformanceRecordsCard records={records} />
        </>
      )}

      {tab === "target" && goalsMode && <PersonalGoalsView goals={goals} entries={goalEntries} />}
    </div>
  );
}

// Score programs: chart, latest indicator summary, attendance, guide.
// Adaptive Swim: how support levels changed. Never mixes the two scales.
function ProgressTab({
  program,
  reports,
  indicatorConfig,
}: {
  program: ProgramMeta;
  reports: ScoredReport[];
  indicatorConfig: IndicatorConfig;
}) {
  if (!usesStars(program.assessment_type)) {
    return (
      <>
        <SupportProgressCard changes={supportChanges(reports, indicatorConfig, program.assessment_type)} />
        <AttendanceConsistencyCard reports={reports} />
      </>
    );
  }

  const achievement = computeLatestAchievement(reports, indicatorConfig);
  const latestAttended = latestAttendedReport(reports);
  const groups = latestAttended
    ? summarizeReportGroups(
        (latestAttended.scores ?? {}) as Record<string, number>,
        latestAttended.indicator_snapshot,
        indicatorConfig
      )
    : [];

  return (
    <>
      {achievement && (
        <GlassCard className="!bg-gradient-to-br !from-[#E9FBF3] !to-white">
          <p className="text-xs font-medium text-slate-600">Pencapaian terakhir</p>
          <p className="mt-0.5 text-sm font-medium leading-snug text-[#17263D]">{achievement}</p>
        </GlassCard>
      )}

      <ProgressTrend indicatorConfig={indicatorConfig} reports={reports} />

      {latestAttended && groups.length > 0 && (
        <GlassCard>
          <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
            Ringkasan Indikator
          </h2>
          <p className="text-xs text-slate-500">
            Dari sesi terakhir yang diikuti &middot; {formatShortDate(latestAttended.session_date)}
          </p>
          <ParentIndicatorSummary groups={groups} title={null} />
        </GlassCard>
      )}

      <AttendanceConsistencyCard reports={reports} />

      <AssessmentGuideCard indicatorConfig={indicatorConfig} />
      <StarScoreLegend />
    </>
  );
}
