import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { DataRow } from "@/components/ui/data-row";
import {
  computeGaji,
  computeReferralCommission,
  periodBounds,
  MONTH_NAMES,
} from "@/lib/payroll";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

function formatRupiah(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export default async function PelatihGajiPage() {
  const session = await getUserWithRole();
  const pelatihId = session?.user.id ?? "";
  const supabase = await createClient();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const { start, end } = periodBounds(year, month);

  const [
    { data: rateRows },
    { data: reportRows },
    { data: referredStudents },
    { data: payments },
    { data: referralCodes },
  ] = await Promise.all([
    supabase
      .from("pelatih_rates")
      .select("rate_hadir, rate_izin_sakit, effective_from")
      .eq("pelatih_id", pelatihId),
    supabase
      .from("progress_reports")
      .select("student_id, session_date, attendance")
      .eq("pelatih_id", pelatihId)
      .gte("session_date", start)
      .lt("session_date", end),
    supabase
      .from("students")
      .select("id, referral_komisi_per_sesi")
      .eq("referred_by_pelatih_id", pelatihId),
    supabase
      .from("payroll_payments")
      .select("period_year, period_month, amount, proof_url, paid_at")
      .eq("pelatih_id", pelatihId)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false }),
    supabase
      .from("referral_codes")
      .select("code, discount_type, discount_value, komisi_per_sesi, active")
      .eq("pelatih_id", pelatihId)
      .order("created_at", { ascending: false }),
  ]);

  // Commission only cares that a session happened for the referred student
  // in the period, regardless of who taught it -- so this student-scoped
  // report count query is separate from the pelatih-scoped one above.
  const studentIds = (referredStudents ?? []).map((s) => s.id);
  const reportCountsByStudent = new Map<string, number>();
  if (studentIds.length > 0) {
    const { data: referredReports } = await supabase
      .from("progress_reports")
      .select("student_id")
      .in("student_id", studentIds)
      .gte("session_date", start)
      .lt("session_date", end);
    for (const r of referredReports ?? []) {
      reportCountsByStudent.set(
        r.student_id,
        (reportCountsByStudent.get(r.student_id) ?? 0) + 1
      );
    }
  }

  const gaji = computeGaji(reportRows ?? [], rateRows ?? []);
  const commission = computeReferralCommission(
    reportCountsByStudent,
    referredStudents ?? []
  );
  const total = gaji.total + commission;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-quicksand)] text-2xl font-bold text-[#17263D]">
        Gaji
      </h1>

      <GlassCard>
        <div className="mb-2 flex items-center justify-between">
          <h2 className={HEADING}>
            Estimasi {MONTH_NAMES[month - 1]} {year}
          </h2>
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-700">
            Belum final
          </span>
        </div>
        <p className="text-sm text-slate-600">
          Gaji Mengajar: {formatRupiah(gaji.total)} ({gaji.hadirCount} hadir
          {gaji.izinSakitCount > 0 ? `, ${gaji.izinSakitCount} izin/sakit` : ""}) · Komisi
          Referral: {formatRupiah(commission)}
        </p>
        <p className="mt-2 text-lg font-semibold text-[#17263D]">
          Total: {formatRupiah(total)}
        </p>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Riwayat Pembayaran</h2>
        <div className="flex flex-col gap-2">
          {(!payments || payments.length === 0) && (
            <p className="text-sm text-slate-600">Belum ada riwayat pembayaran.</p>
          )}
          {payments?.map((p) => (
            <DataRow
              key={`${p.period_year}-${p.period_month}`}
              primary={`${MONTH_NAMES[p.period_month - 1]} ${p.period_year}`}
              secondary={`Diterima ${new Date(p.paid_at).toLocaleDateString("id-ID")}`}
              action={
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#17263D]">
                    {formatRupiah(p.amount)}
                  </span>
                  {p.proof_url && (
                    <a
                      href={p.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#35C5D0] underline"
                    >
                      Bukti
                    </a>
                  )}
                </div>
              }
            />
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Kode Referral Saya</h2>
        <div className="flex flex-col gap-2">
          {(!referralCodes || referralCodes.length === 0) && (
            <p className="text-sm text-slate-600">
              Belum ada kode referral. Hubungi admin untuk membuatkan kode.
            </p>
          )}
          {referralCodes?.map((c) => (
            <DataRow
              key={c.code}
              muted={!c.active}
              primary={
                <>
                  {c.code}
                  {!c.active && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Nonaktif
                    </span>
                  )}
                </>
              }
              secondary={`Diskon ${
                c.discount_type === "percent"
                  ? `${c.discount_value}%`
                  : formatRupiah(c.discount_value)
              } untuk siswa · Komisi ${formatRupiah(c.komisi_per_sesi)}/sesi`}
            />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
