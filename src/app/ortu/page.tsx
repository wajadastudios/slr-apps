import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { ParentChildCard } from "@/components/parent-child-card";
import { EnrollmentStatusCard } from "@/components/enrollment-status-card";
import { EnrollmentRequestFields } from "@/components/enrollment-request-fields";
import { loadRegistrationPrograms } from "@/lib/registration-data";
import { requestEnrollmentAction } from "./actions";
import type { Gender } from "@/lib/registration-input";
import { GroupAccordion } from "@/components/group-accordion";
import {
  computeNextSession,
  computeSessionQuota,
  formatSessionQuota,
  getGreeting,
} from "@/lib/progress";
import { latestReportPreview } from "@/lib/report-preview";
import { cardLinks, firstNameOf } from "@/lib/programs";
import { loadMilestones } from "@/lib/milestone-loader";
import { summarizeRecordUnlock } from "@/lib/record-summary";
import type { PerformanceRecordRow } from "@/lib/performance";
import { hasClassAccess } from "@/lib/enrollment";
import { loadEnrollments } from "@/lib/enrollment-server";
import { DAYS } from "@/lib/days";
import { billingNote, loadEnrollmentBilling, loadInvoiceSummaries } from "@/lib/billing";
import { ToastForm } from "@/components/ui/toast-form";

export default async function OrtuDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; child_added?: string; terdaftar?: string; terhubung?: string }>;
}) {
  const { error, child_added, terdaftar, terhubung } = await searchParams;
  const supabase = await createClient();
  const session = await getUserWithRole();

  const [
    { data: children },
    invoices,
    billingByEnrollment,
    { data: reports },
    { data: scheduleRows },
    { data: pelatihNames },
    registration,
  ] = await Promise.all([
    supabase.from("students").select("id, full_name, nickname, is_self, kind, user_id, gender").order("full_name"),
    loadInvoiceSummaries(supabase),
    loadEnrollmentBilling(supabase),
    supabase
      .from("progress_reports")
      .select("student_id, program_id, session_date, session_number, attendance, notes")
      .order("session_date", { ascending: false }),
    supabase
      .from("schedules")
      .select("student_id, slot:slot_id(day_of_week, start_time, pelatih_id, program_id)"),
    supabase.rpc("get_public_pelatih_names"),
    loadRegistrationPrograms(),
  ]);

  const childList = children ?? [];
  const enrollments = (await loadEnrollments(
    supabase,
    childList.map((c) => c.id)
  )).filter((e) => ["pending_review", "waiting_schedule", "schedule_offered", "scheduled", "active"].includes(e.status));

  // Offered slots, for the "approve this schedule" cards.
  const offeredIds = enrollments.map((e) => e.offered_slot_id).filter(Boolean) as string[];
  const { data: offeredSlots } = offeredIds.length
    ? await supabase
        .from("class_slots")
        .select("id, label, location, day_of_week, start_time")
        .in("id", offeredIds)
    : { data: [] };
  const offeredById = new Map((offeredSlots ?? []).map((s) => [s.id, s]));

  const invoicesByStudent = new Map<string, NonNullable<typeof invoices>>();
  for (const inv of invoices ?? []) {
    const list = invoicesByStudent.get(inv.student_id) ?? [];
    list.push(inv);
    invoicesByStudent.set(inv.student_id, list);
  }

  // reports and schedules are always looked up per participant AND program
  const reportsByEnrollment = new Map<string, NonNullable<typeof reports>>();
  for (const r of reports ?? []) {
    const key = `${r.student_id}|${r.program_id ?? ""}`;
    const list = reportsByEnrollment.get(key) ?? [];
    list.push(r);
    reportsByEnrollment.set(key, list);
  }

  const pelatihNameById = new Map<string, string>();
  for (const p of pelatihNames ?? []) {
    pelatihNameById.set(p.id, p.full_name);
  }

  const slotsByEnrollment = new Map<
    string,
    { day_of_week: number; start_time: string; label: string | null; pelatihName: string | null }[]
  >();
  for (const row of scheduleRows ?? []) {
    const slot = row.slot as unknown as {
      day_of_week: number;
      start_time: string;
      pelatih_id: string;
      program_id: string;
    } | null;
    if (!slot) continue;
    const key = `${row.student_id}|${slot.program_id}`;
    const list = slotsByEnrollment.get(key) ?? [];
    list.push({
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      label: null,
      pelatihName: pelatihNameById.get(slot.pelatih_id) ?? null,
    });
    slotsByEnrollment.set(key, list);
  }

  const accessCount = new Map<string, number>();
  for (const e of enrollments) {
    if (hasClassAccess(e.status)) accessCount.set(e.student_id, (accessCount.get(e.student_id) ?? 0) + 1);
  }

  // Record Unlock on the card: only for a participant who attends class
  // themselves (not a child), in a program that awards medals, once the class
  // is scheduled/active. The program's own milestones are used; when the admin
  // has configured none, summarizeRecordUnlock() returns null and the block
  // stays hidden.
  const recordEnrollments = enrollments.filter(
    (e) =>
      hasClassAccess(e.status) &&
      e.program.records_mode === "medals" &&
      (childList.find((c) => c.id === e.student_id)?.is_self ||
        childList.find((c) => c.id === e.student_id)?.user_id === session?.user.id)
  );
  const recordSummaryByEnrollment = new Map<string, ReturnType<typeof summarizeRecordUnlock>>();
  if (recordEnrollments.length > 0) {
    const [{ data: recordRows }, milestoneSets] = await Promise.all([
      supabase
        .from("performance_records")
        .select("*")
        .in(
          "enrollment_id",
          recordEnrollments.map((e) => e.id)
        ),
      Promise.all(
        [...new Set(recordEnrollments.map((e) => e.program_id))].map(
          async (programId) => [programId, await loadMilestones(supabase, programId)] as const
        )
      ),
    ]);
    const milestonesByProgram = new Map(milestoneSets);
    for (const e of recordEnrollments) {
      recordSummaryByEnrollment.set(
        e.id,
        summarizeRecordUnlock(
          ((recordRows ?? []) as (PerformanceRecordRow & { enrollment_id?: string })[]).filter(
            (r) => r.enrollment_id === e.id
          ),
          milestonesByProgram.get(e.program_id) ?? []
        )
      );
    }
  }

  const mySelf = childList.find((c) => c.is_self);
  // children of this family account, with the programs they are already in
  const childOptions = childList
    .filter((c) => c.kind === "child")
    .map((c) => ({
      id: c.id,
      name: c.nickname || c.full_name,
      enrolledProgramIds: enrollments.filter((e) => e.student_id === c.id).map((e) => e.program_id),
    }));
  const hasEnrollments = enrollments.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        {getGreeting()}, {session?.fullName ?? "Orang Tua"} 👋
      </h1>

      {terdaftar && (
        <GlassCard className="!border-[#55D6A6]/50 !bg-[#55D6A6]/10">
          <p className="text-sm text-[#0f6b52]">
            Pendaftaran Anda diterima. Admin akan menghubungi Anda melalui WhatsApp untuk mencarikan jadwal.
          </p>
        </GlassCard>
      )}

      {terhubung && (
        <GlassCard className="!border-[#55D6A6]/50 !bg-[#55D6A6]/10">
          <p className="text-sm text-[#0f6b52]">
            Akun Anda sudah terhubung. Jadwal dan laporan kelas Anda pribadi; atur apakah pendaftar boleh ikut melihatnya
            di Pengaturan.
          </p>
        </GlassCard>
      )}

      {!hasEnrollments && (
        <GlassCard>
          <p className="text-sm text-slate-600">Belum ada kelas terdaftar.</p>
        </GlassCard>
      )}

      {hasEnrollments && (
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Kelas Saya</h2>
      )}

      <div className={`grid gap-4 ${enrollments.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {enrollments.map((enrollment) => {
          const child = childList.find((c) => c.id === enrollment.student_id);
          if (!child) return null;
          const name = child.nickname || child.full_name;
          const key = `${enrollment.student_id}|${enrollment.program_id}`;
          const me = session?.user.id;
          // the participant themselves (own account, or an adult who registered
          // themselves) -- as opposed to a parent or someone registering another adult
          const isParticipant = child.is_self === true || child.user_id === me;
          // an adult registered by someone else: the registering account only
          // sees the status unless the participant allowed more
          const restricted =
            child.kind === "adult_family" && !isParticipant && !enrollment.report_access_granted_to_requester;

          if (!hasClassAccess(enrollment.status) || restricted) {
            const offered = enrollment.offered_slot_id ? offeredById.get(enrollment.offered_slot_id) : undefined;
            return (
              <EnrollmentStatusCard
                key={enrollment.id}
                enrollmentId={enrollment.id}
                name={name}
                programName={enrollment.program.name}
                status={enrollment.status}
                preferred={[enrollment.preferred_schedule, enrollment.preferred_location].filter(Boolean).join(" · ") || null}
                offeredSlot={offered ?? null}
                restrictedFor={restricted && hasClassAccess(enrollment.status) ? child.full_name : null}
                billingNote={billingNote(billingByEnrollment.get(enrollment.id), invoices)}
              />
            );
          }

          const enrollmentReports = reportsByEnrollment.get(key) ?? [];
          // paid packages belong to the participant, so the quota is only
          // meaningful when they have a single running class
          const singleClass = (accessCount.get(enrollment.student_id) ?? 0) <= 1;
          const quota = singleClass
            ? formatSessionQuota(computeSessionQuota(invoicesByStudent.get(child.id) ?? [], enrollmentReports))
            : {
                value: `${enrollmentReports.filter((r) => r.attendance === "hadir").length} sesi diikuti`,
                note: "Kuota paket ada di menu Tagihan",
              };

          const nextSession = computeNextSession(slotsByEnrollment.get(key) ?? []);
          const nextSessionLabel = nextSession
            ? `${DAYS[nextSession.day_of_week]} · ${nextSession.start_time.slice(0, 5)} WIB${
                nextSession.pelatihName ? ` · Coach ${nextSession.pelatihName}` : ""
              }`
            : null;

          return (
            <ParentChildCard
              key={enrollment.id}
              studentId={child.id}
              programId={enrollment.program_id}
              name={name}
              program={enrollment.program.name}
              links={cardLinks(enrollment.program, {
                isSelf: isParticipant,
                firstName: firstNameOf(name),
              })}
              nextSessionLabel={nextSessionLabel}
              quota={quota}
              preview={latestReportPreview(enrollmentReports)}
              record={recordSummaryByEnrollment.get(enrollment.id) ?? null}
              billingNote={billingNote(billingByEnrollment.get(enrollment.id), invoices)}
            />
          );
        })}
      </div>

      {/* One registration flow for everybody in the family. Folded away so the classes come first. */}
      <GlassCard tone="soft" className="flex flex-col gap-2">
        <GroupAccordion
          defaultOpen={!hasEnrollments}
          header={
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-[#17263D]">Daftar Kelas Baru</span>
              <span className="text-xs text-slate-500">
                Untuk Anda sendiri, anak, atau pasangan / anggota keluarga
              </span>
            </span>
          }
        >
          <div className="px-4 pb-4 pt-1">
            <ToastForm action={requestEnrollmentAction} resetOnSuccess>
              <EnrollmentRequestFields
                programs={registration.programs}
                loadError={registration.error}
                initialGender={(mySelf?.gender as Gender | null | undefined) ?? null}
                childOptions={childOptions}
              />
            </ToastForm>
          </div>
        </GroupAccordion>

        {child_added && (
          <p className="text-sm text-[#1a8f6f]">Pendaftaran berhasil! Admin akan segera menghubungi Anda.</p>
        )}
        {error && <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>}
      </GlassCard>
    </div>
  );
}
