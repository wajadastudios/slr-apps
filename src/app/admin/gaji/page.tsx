import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { DataRow } from "@/components/ui/data-row";
import {
  computeGaji,
  computeReferralCommission,
  periodBounds,
  resolveRateForDate,
  MONTH_NAMES,
  type RateRow,
  type ReportForPayroll,
} from "@/lib/payroll";
import { MarkPaidForm } from "./mark-paid-form";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

function formatRupiah(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export default async function AdminGajiPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;
  const { start, end } = periodBounds(year, month);

  const supabase = await createClient();

  const [
    { data: pelatihList },
    { data: rateRows },
    { data: reportRows },
    { data: referredStudents },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, title, phone, bank_info")
      .eq("role", "pelatih")
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("pelatih_rates")
      .select("pelatih_id, rate_hadir, rate_izin_sakit, effective_from"),
    supabase
      .from("progress_reports")
      .select("pelatih_id, student_id, session_date, attendance")
      .gte("session_date", start)
      .lt("session_date", end),
    supabase
      .from("students")
      .select("id, referred_by_pelatih_id, referral_komisi_per_sesi")
      .not("referred_by_pelatih_id", "is", null),
    supabase
      .from("payroll_payments")
      .select("pelatih_id, amount, proof_url, paid_at")
      .eq("period_year", year)
      .eq("period_month", month),
  ]);

  const ratesByPelatih = new Map<string, RateRow[]>();
  for (const r of rateRows ?? []) {
    const list = ratesByPelatih.get(r.pelatih_id) ?? [];
    list.push(r);
    ratesByPelatih.set(r.pelatih_id, list);
  }

  const reportsByPelatih = new Map<string, ReportForPayroll[]>();
  const reportCountsByStudent = new Map<string, number>();
  for (const r of reportRows ?? []) {
    reportCountsByStudent.set(
      r.student_id,
      (reportCountsByStudent.get(r.student_id) ?? 0) + 1
    );
    if (!r.pelatih_id) continue;
    const list = reportsByPelatih.get(r.pelatih_id) ?? [];
    list.push({ session_date: r.session_date, attendance: r.attendance });
    reportsByPelatih.set(r.pelatih_id, list);
  }

  const referredByPelatih = new Map<
    string,
    { id: string; referral_komisi_per_sesi: number | null }[]
  >();
  for (const s of referredStudents ?? []) {
    if (!s.referred_by_pelatih_id) continue;
    const list = referredByPelatih.get(s.referred_by_pelatih_id) ?? [];
    list.push({ id: s.id, referral_komisi_per_sesi: s.referral_komisi_per_sesi });
    referredByPelatih.set(s.referred_by_pelatih_id, list);
  }

  const paymentByPelatih = new Map<
    string,
    { amount: number; proof_url: string | null; paid_at: string }
  >();
  for (const p of payments ?? []) {
    paymentByPelatih.set(p.pelatih_id, p);
  }

  const rows = (pelatihList ?? []).map((p) => {
    const gaji = computeGaji(reportsByPelatih.get(p.id) ?? [], ratesByPelatih.get(p.id) ?? []);
    const commission = computeReferralCommission(
      reportCountsByStudent,
      referredByPelatih.get(p.id) ?? []
    );
    const total = gaji.total + commission;
    return { pelatih: p, gaji, commission, total, payment: paymentByPelatih.get(p.id) };
  });

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const years = [now.getFullYear(), now.getFullYear() - 1];

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Gaji Pengajar</h2>
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Bulan</label>
            <GlassSelect name="month" defaultValue={String(month)} className="min-w-[140px]">
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Tahun</label>
            <GlassSelect name="year" defaultValue={String(year)} className="min-w-[100px]">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </GlassSelect>
          </div>
          <GlassButton
            type="submit"
            className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]"
          >
            Tampilkan
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          Total gaji + komisi periode {MONTH_NAMES[month - 1]} {year}
        </p>
        <span className="rounded-full bg-[#EEF9FB] px-3 py-1.5 text-sm font-semibold text-[#35C5D0]">
          {formatRupiah(grandTotal)}
        </span>
      </GlassCard>

      <GlassCard>
        <div className="flex flex-col gap-2">
          {rows.length === 0 && (
            <p className="text-sm text-slate-600">Belum ada pengajar aktif.</p>
          )}
          {rows.map(({ pelatih, gaji, commission, total, payment }) => (
            <DataRow
              key={pelatih.id}
              primary={
                pelatih.title ? `${pelatih.title} ${pelatih.full_name}` : pelatih.full_name
              }
              secondary={
                <>
                  Gaji Mengajar: {formatRupiah(gaji.total)} ({gaji.hadirCount} hadir
                  {gaji.izinSakitCount > 0 ? `, ${gaji.izinSakitCount} izin/sakit` : ""}) ·
                  Komisi Referral: {formatRupiah(commission)}
                  {pelatih.bank_info ? ` · Rekening: ${pelatih.bank_info}` : ""}
                </>
              }
              action={
                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-semibold text-[#17263D]">
                    {formatRupiah(total)}
                  </span>
                  {payment ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#55D6A6]/20 px-3 py-1.5 text-xs font-medium text-[#1a8f6f]">
                        Sudah Dibayar
                      </span>
                      {payment.proof_url && (
                        <a
                          href={payment.proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#35C5D0] underline"
                        >
                          Bukti
                        </a>
                      )}
                    </div>
                  ) : (
                    <MarkPaidForm
                      pelatihId={pelatih.id}
                      year={year}
                      month={month}
                      hadirCount={gaji.hadirCount}
                      izinSakitCount={gaji.izinSakitCount}
                      amount={total}
                    />
                  )}
                </div>
              }
            />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
