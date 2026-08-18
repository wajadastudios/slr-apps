import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { ProgressTrend } from "@/components/progress-trend";
import { ReportHistoryCard } from "@/components/report-history-card";
import { ChildSummaryWidget } from "@/components/child-summary-widget";
import { computeProgressPercent, computeNextSession, getGreeting } from "@/lib/progress";
import { DAYS } from "@/lib/days";
import { setPackagePreferenceAction } from "./actions";

export default async function AnakDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();
  const session = await getUserWithRole();

  // RLS (parent_owns_student) already scopes this to the caller's own
  // children — an empty result means access denied.
  const { data: student } = await supabase
    .from("students")
    .select(
      "id, full_name, nickname, birth_date, program_id, next_package_preference_id, program:program_id(name, skill_template)"
    )
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

  const [
    { data: reports },
    { data: invoices },
    { data: availablePackages },
    { data: scheduleRows },
    { data: pelatihNames },
  ] = await Promise.all([
    supabase
      .from("progress_reports")
      .select(
        "id, session_date, session_number, attendance, scores, notes, next_focus, media_urls"
      )
      .eq("student_id", studentId)
      .order("session_date", { ascending: false }),
    supabase
      .from("invoices")
      .select("sessions_count, status, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("program_packages")
      .select("id, name, sessions_count, price, benefits")
      .eq("program_id", student.program_id)
      .eq("active", true)
      .order("sessions_count"),
    supabase
      .from("schedules")
      .select("slot:slot_id(day_of_week, start_time, label, pelatih_id)")
      .eq("student_id", studentId),
    supabase.rpc("get_public_pelatih_names"),
  ]);

  const hadirCount = (reports ?? []).filter((r) => r.attendance === "hadir").length;
  const confirmedInvoices = (invoices ?? []).filter((i) =>
    ["sent", "paid"].includes(i.status)
  );
  const totalConfirmedSessions = confirmedInvoices.reduce(
    (sum, i) => sum + i.sessions_count,
    0
  );
  const totalAllSessions = (invoices ?? []).reduce(
    (sum, i) => sum + i.sessions_count,
    0
  );
  const currentPackageSessions = confirmedInvoices[0]?.sessions_count ?? 0;
  const remaining = totalConfirmedSessions - hadirCount;

  const showRenewalBanner =
    currentPackageSessions > 4 &&
    remaining === 1 &&
    totalAllSessions === totalConfirmedSessions;

  const pelatihNameById = new Map<string, string>();
  for (const p of pelatihNames ?? []) {
    pelatihNameById.set(p.id, p.full_name);
  }

  const slotInfos = (scheduleRows ?? [])
    .map((row) => row.slot as unknown as {
      day_of_week: number;
      start_time: string;
      label: string | null;
      pelatih_id: string;
    } | null)
    .filter((s): s is NonNullable<typeof s> => s !== null)
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

  const latestInvoice = invoices?.[0];
  const tagihanOk = latestInvoice?.status === "paid";
  const tagihanLabel = !latestInvoice
    ? "Belum Ada Tagihan"
    : latestInvoice.status === "paid"
      ? "Lunas"
      : "Belum Bayar";

  const progressPercent = computeProgressPercent(
    skillTemplate,
    reports?.[0]?.scores as Record<string, number> | null | undefined
  );

  return (
    <div className="flex flex-col gap-6">
      <ChildSummaryWidget
        greeting={`${getGreeting()}, ${session?.fullName ?? "Orang Tua"}`}
        childLabel={`${student.nickname || student.full_name} · ${program?.name ?? "Belum ada program"}`}
        kehadiranLabel={`${hadirCount} / ${totalConfirmedSessions} sesi`}
        tagihanLabel={tagihanLabel}
        tagihanOk={tagihanOk}
        progressPercent={progressPercent}
        laporanTersedia={(reports?.length ?? 0) > 0}
        nextSessionLabel={nextSessionLabel}
      />

      {showRenewalBanner && availablePackages && availablePackages.length > 0 && (
        <GlassCard className="border-[#FFC800]/40 bg-[#FFF8E1]">
          <h2 className="mb-1 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
            Sesi Terakhir di Paket Ini
          </h2>
          <p className="mb-4 text-sm text-slate-700">
            Tinggal 1 sesi lagi di paket {student.full_name} saat ini. Pilih
            paket untuk sesi berikutnya — pilihan Anda akan dilihat admin
            saat menyiapkan tagihan berikutnya (admin tetap yang
            mengonfirmasi & mengirim tagihannya).
          </p>
          <div className="flex flex-col gap-2">
            {availablePackages.map((pkg) => {
              const selected = pkg.id === student.next_package_preference_id;
              return (
                <form key={pkg.id} action={setPackagePreferenceAction}>
                  <input type="hidden" name="student_id" value={studentId} />
                  <input
                    type="hidden"
                    name="program_package_id"
                    value={pkg.id}
                  />
                  <DataRow
                    className={selected ? "border-[#35C5D0]/60 bg-[#EEF9FB]" : undefined}
                    primary={
                      <>
                        {pkg.name} &middot; {pkg.sessions_count} sesi
                        &middot; Rp{Number(pkg.price).toLocaleString("id-ID")}
                      </>
                    }
                    secondary={
                      pkg.benefits && pkg.benefits.length > 0
                        ? pkg.benefits.join(" · ")
                        : undefined
                    }
                    action={
                      <GlassButton
                        type="submit"
                        className={
                          selected
                            ? "!bg-[#35C5D0] px-4 py-2 text-sm !text-white"
                            : "px-4 py-2 text-sm"
                        }
                      >
                        {selected ? "Dipilih" : "Pilih Paket Ini"}
                      </GlassButton>
                    }
                  />
                </form>
              );
            })}
          </div>
        </GlassCard>
      )}

      <ProgressTrend skillTemplate={skillTemplate} reports={reports ?? []} />

      <ReportHistoryCard reports={reports ?? []} />
    </div>
  );
}
