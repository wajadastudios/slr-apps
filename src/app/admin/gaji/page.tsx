import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { DataRow } from "@/components/ui/data-row";
import { Badge } from "@/components/admin/ui";
import { KeuanganTabs } from "../keuangan/keuangan-tabs";
import {
  computeGaji,
  computeReferralCommission,
  periodBounds,
  MONTH_NAMES,
  type RateRow,
  type ReportForPayroll,
} from "@/lib/payroll";
import { MarkPaidForm } from "./mark-paid-form";
import { saveDraftAction, approveAction, cancelPayrollAction, reopenPayrollAction } from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

function formatRupiah(amount: number) {
  return `Rp${Math.round(amount).toLocaleString("id-ID")}`;
}

const STATUS_LABEL: Record<string, string> = { draft: "Draft", disetujui: "Disetujui", dibayar: "Sudah Dibayar", dibatalkan: "Dibatalkan" };
const STATUS_TONE: Record<string, "neutral" | "warn" | "ok" | "danger" | "info"> = {
  draft: "neutral",
  disetujui: "info",
  dibayar: "ok",
  dibatalkan: "danger",
};

type Payment = {
  id: string;
  status: string;
  amount: number;
  gross_amount: number | null;
  adjustment_amount: number;
  adjustment_reason: string | null;
  tax_deduction_amount: number;
  tax_deduction_note: string | null;
  net_amount: number | null;
  payment_method: string | null;
  proof_url: string | null;
  paid_at: string;
  cancelled_reason: string | null;
};

export default async function AdminGajiPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; return?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;
  const { start, end } = periodBounds(year, month);
  const back = `/admin/gaji?year=${year}&month=${month}`;

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
      .select(
        "id, pelatih_id, status, amount, gross_amount, adjustment_amount, adjustment_reason, tax_deduction_amount, tax_deduction_note, net_amount, payment_method, proof_url, paid_at, cancelled_reason"
      )
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
    reportCountsByStudent.set(r.student_id, (reportCountsByStudent.get(r.student_id) ?? 0) + 1);
    if (!r.pelatih_id) continue;
    const list = reportsByPelatih.get(r.pelatih_id) ?? [];
    list.push({ session_date: r.session_date, attendance: r.attendance });
    reportsByPelatih.set(r.pelatih_id, list);
  }

  const referredByPelatih = new Map<string, { id: string; referral_komisi_per_sesi: number | null }[]>();
  for (const s of referredStudents ?? []) {
    if (!s.referred_by_pelatih_id) continue;
    const list = referredByPelatih.get(s.referred_by_pelatih_id) ?? [];
    list.push({ id: s.id, referral_komisi_per_sesi: s.referral_komisi_per_sesi });
    referredByPelatih.set(s.referred_by_pelatih_id, list);
  }

  const paymentByPelatih = new Map<string, Payment>();
  for (const p of payments ?? []) paymentByPelatih.set(p.pelatih_id, p as Payment);

  const rows = (pelatihList ?? []).map((p) => {
    const gaji = computeGaji(reportsByPelatih.get(p.id) ?? [], ratesByPelatih.get(p.id) ?? []);
    const commission = computeReferralCommission(reportCountsByStudent, referredByPelatih.get(p.id) ?? []);
    const liveTotal = gaji.total + commission;
    return { pelatih: p, gaji, commission, liveTotal, payment: paymentByPelatih.get(p.id) };
  });

  const grandTotal = rows.reduce((sum, r) => sum + (r.payment ? Number(r.payment.net_amount ?? r.payment.amount) : r.liveTotal), 0);

  const years = [now.getFullYear(), now.getFullYear() - 1];

  return (
    <div className="flex flex-col gap-6">
      <KeuanganTabs active="gaji-pengajar" />
      <GlassCard>
        <h2 className={`mb-4 ${HEADING}`}>Gaji Pengajar</h2>
        <p className="mb-3 text-xs text-slate-500">
          Total sesi dihitung dari laporan sesi yang benar-benar diisi pengajar, bukan dari jadwal -- sesi yang terjadwal tapi tidak dilaporkan tidak pernah dihitung layak dibayar.
        </p>
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Bulan</label>
            <GlassSelect name="month" defaultValue={String(month)} className="min-w-[140px]">
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </GlassSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-800">Tahun</label>
            <GlassSelect name="year" defaultValue={String(year)} className="min-w-[100px]">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </GlassSelect>
          </div>
          <GlassButton type="submit" className="!bg-[#35C5D0] px-4 py-2 text-sm !text-white hover:!bg-[#2bb0ba]">
            Tampilkan
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">Total gaji + komisi periode {MONTH_NAMES[month - 1]} {year}</p>
        <span className="rounded-full bg-[#EEF9FB] px-3 py-1.5 text-sm font-semibold text-[#35C5D0]">{formatRupiah(grandTotal)}</span>
      </GlassCard>

      <GlassCard>
        <div className="flex flex-col gap-3">
          {rows.length === 0 && <p className="text-sm text-slate-600">Belum ada pengajar aktif.</p>}
          {rows.map(({ pelatih, gaji, commission, liveTotal, payment }) => (
            <div key={pelatih.id} className="flex flex-col gap-2">
              <DataRow
                primary={pelatih.title ? `${pelatih.title} ${pelatih.full_name}` : pelatih.full_name}
                secondary={
                  <>
                    Gaji Mengajar: {formatRupiah(gaji.total)} ({gaji.hadirCount} hadir
                    {gaji.izinSakitCount > 0 ? `, ${gaji.izinSakitCount} izin/sakit` : ""}) &middot;
                    Komisi Referral: {formatRupiah(commission)}
                    {pelatih.bank_info ? ` · Rekening: ${pelatih.bank_info}` : ""}
                  </>
                }
                action={
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="font-semibold text-[#17263D]">
                      {formatRupiah(payment ? Number(payment.net_amount ?? payment.amount) : liveTotal)}
                    </span>
                    {payment && <Badge tone={STATUS_TONE[payment.status] ?? "neutral"}>{STATUS_LABEL[payment.status] ?? payment.status}</Badge>}
                  </div>
                }
              />

              {/* Belum ada baris payroll sama sekali -- buat draft, atau bayar langsung tanpa draft. */}
              {!payment && (
                <details className="rounded-xl border border-white/40 bg-white/30 px-3 py-2 text-xs">
                  <summary className="cursor-pointer select-none font-medium text-[#0B6470]">Buat draft gaji (opsional: sesuaikan manual)</summary>
                  <ToastForm action={saveDraftAction} pendingLabel="Menyimpan..." className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="pelatih_id" value={pelatih.id} />
                    <input type="hidden" name="period_year" value={year} />
                    <input type="hidden" name="period_month" value={month} />
                    <input type="hidden" name="hadir_count" value={gaji.hadirCount} />
                    <input type="hidden" name="izin_sakit_count" value={gaji.izinSakitCount} />
                    <input type="hidden" name="gross_amount" value={liveTotal} />
                    <input type="hidden" name="return" value={back} />
                    <label className="flex flex-col gap-1 text-slate-600">
                      Penyesuaian (Rp, boleh negatif)
                      <GlassInput name="adjustment_amount" type="number" defaultValue={0} className="w-32" />
                    </label>
                    <label className="flex flex-col gap-1 text-slate-600">
                      Alasan penyesuaian
                      <GlassInput name="adjustment_reason" placeholder="Wajib bila di atas ≠ 0" className="w-56" />
                    </label>
                    <label className="flex flex-col gap-1 text-slate-600">
                      Potongan pajak (estimasi, opsional)
                      <GlassInput name="tax_deduction_amount" type="number" defaultValue={0} className="w-32" />
                    </label>
                    <GlassButton type="submit" className={`${"border border-white/40 bg-white/40"} px-3 py-1.5 text-xs`}>
                      Simpan draft
                    </GlassButton>
                  </ToastForm>
                </details>
              )}
              {!payment && (
                <div className="pl-1">
                  <MarkPaidForm
                    pelatihId={pelatih.id}
                    year={year}
                    month={month}
                    hadirCount={gaji.hadirCount}
                    izinSakitCount={gaji.izinSakitCount}
                    amount={liveTotal}
                  />
                </div>
              )}

              {payment?.status === "draft" && (
                <div className="flex flex-col gap-2 rounded-xl border border-white/40 bg-white/30 px-3 py-2 text-xs text-slate-700">
                  <p>
                    Bruto {formatRupiah(payment.gross_amount ?? 0)}
                    {payment.adjustment_amount ? ` · Penyesuaian ${payment.adjustment_amount > 0 ? "+" : ""}${formatRupiah(payment.adjustment_amount)} (${payment.adjustment_reason ?? "-"})` : ""}
                    {payment.tax_deduction_amount ? ` · Potongan pajak (estimasi) ${formatRupiah(payment.tax_deduction_amount)}` : ""}
                    {" · "}Bersih {formatRupiah(payment.net_amount ?? payment.amount)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <ToastForm action={approveAction} pendingLabel="Memproses...">
                      <input type="hidden" name="id" value={payment.id} />
                      <input type="hidden" name="return" value={back} />
                      <GlassButton type="submit" className="!bg-[#35C5D0] px-3 py-1.5 text-xs !text-white hover:!bg-[#2bb0ba]">Setujui</GlassButton>
                    </ToastForm>
                    <details>
                      <summary className="cursor-pointer select-none text-[#A3183C]">Batalkan</summary>
                      <ToastForm action={cancelPayrollAction} pendingLabel="Memproses..." className="mt-1 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={payment.id} />
                        <input type="hidden" name="return" value={back} />
                        <GlassInput name="cancelled_reason" placeholder="Alasan (wajib)" required className="w-56" />
                        <GlassButton type="submit" className="border border-[#F3C6D1] bg-[#FFE3EA] px-3 py-1.5 text-xs text-[#A3183C]">Batalkan</GlassButton>
                      </ToastForm>
                    </details>
                  </div>
                </div>
              )}

              {payment?.status === "disetujui" && (
                <div className="flex flex-col gap-2 rounded-xl border border-white/40 bg-white/30 px-3 py-2 text-xs text-slate-700">
                  <p>Sudah disetujui, siap dibayar. Bersih {formatRupiah(payment.net_amount ?? payment.amount)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <MarkPaidForm
                      pelatihId={pelatih.id}
                      year={year}
                      month={month}
                      hadirCount={gaji.hadirCount}
                      izinSakitCount={gaji.izinSakitCount}
                      amount={Number(payment.net_amount ?? payment.amount)}
                    />
                    <details>
                      <summary className="cursor-pointer select-none text-[#A3183C]">Batalkan</summary>
                      <ToastForm action={cancelPayrollAction} pendingLabel="Memproses..." className="mt-1 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={payment.id} />
                        <input type="hidden" name="return" value={back} />
                        <GlassInput name="cancelled_reason" placeholder="Alasan (wajib)" required className="w-56" />
                        <GlassButton type="submit" className="border border-[#F3C6D1] bg-[#FFE3EA] px-3 py-1.5 text-xs text-[#A3183C]">Batalkan</GlassButton>
                      </ToastForm>
                    </details>
                  </div>
                </div>
              )}

              {payment?.status === "dibayar" && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-full bg-[#55D6A6]/20 px-3 py-1.5 font-medium text-[#1a8f6f]">
                    Dibayar {payment.payment_method ? `· ${payment.payment_method}` : ""}
                  </span>
                  {payment.proof_url && (
                    <a href={payment.proof_url} target="_blank" rel="noreferrer" className="text-[#35C5D0] underline">Bukti</a>
                  )}
                </div>
              )}

              {payment?.status === "dibatalkan" && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#A3183C]">
                  <span>Dibatalkan: {payment.cancelled_reason}</span>
                  <ToastForm action={reopenPayrollAction} pendingLabel="Memproses...">
                    <input type="hidden" name="id" value={payment.id} />
                    <input type="hidden" name="return" value={back} />
                    <GlassButton type="submit" className="border border-white/40 bg-white/40 px-3 py-1 text-xs text-slate-800">Buka ulang draft</GlassButton>
                  </ToastForm>
                </div>
              )}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
