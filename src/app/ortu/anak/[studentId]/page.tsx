import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import { ProgressTrend } from "@/components/progress-trend";
import { ReportHistoryCard } from "@/components/report-history-card";
import { setPackagePreferenceAction } from "./actions";

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
    .select(
      "id, full_name, birth_date, program_id, next_package_preference_id, program:program_id(name, skill_template)"
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

  const [{ data: reports }, { data: invoices }, { data: availablePackages }] =
    await Promise.all([
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
          {student.full_name}{" "}
          <span className="text-base font-normal text-slate-600">
            &mdash; {program?.name ?? "Belum ada program"}
          </span>
        </h1>
        {student.birth_date && (
          <p className="text-sm text-slate-600">Lahir: {student.birth_date}</p>
        )}
      </div>

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
