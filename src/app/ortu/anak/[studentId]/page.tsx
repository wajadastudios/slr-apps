import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { ProgressTrend } from "@/components/progress-trend";
import { setPackagePreferenceAction } from "./actions";

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

      {showRenewalBanner && availablePackages && availablePackages.length > 0 && (
        <GlassCard className="border-amber-300/40 bg-amber-100/20 dark:bg-amber-300/10">
          <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">
            Sesi Terakhir di Paket Ini
          </h2>
          <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">
            Tinggal 1 sesi lagi di paket {student.full_name} saat ini. Pilih
            paket untuk sesi berikutnya — pilihan Anda akan dilihat admin
            saat menyiapkan tagihan berikutnya (admin tetap yang
            mengonfirmasi & mengirim tagihannya).
          </p>
          <div className="flex flex-col gap-2">
            {availablePackages.map((pkg) => (
              <form
                key={pkg.id}
                action={setPackagePreferenceAction}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5"
              >
                <input type="hidden" name="student_id" value={studentId} />
                <input type="hidden" name="program_package_id" value={pkg.id} />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {pkg.name} &middot; {pkg.sessions_count} sesi &middot; Rp
                    {Number(pkg.price).toLocaleString("id-ID")}
                  </p>
                  {pkg.benefits && pkg.benefits.length > 0 && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {pkg.benefits.join(" · ")}
                    </p>
                  )}
                </div>
                <GlassButton
                  type="submit"
                  className={`px-4 py-2 text-sm ${
                    pkg.id === student.next_package_preference_id
                      ? "border-blue-400/60 bg-blue-400/30"
                      : ""
                  }`}
                >
                  {pkg.id === student.next_package_preference_id
                    ? "Dipilih"
                    : "Pilih Paket Ini"}
                </GlassButton>
              </form>
            ))}
          </div>
        </GlassCard>
      )}

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
