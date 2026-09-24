import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/create-account";
import { jakartaToday, toISODate } from "@/lib/week";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader, StatTile } from "@/components/admin/ui";
import { FinanceFilterBar } from "@/components/admin/finance-filter-bar";
import { KeuanganTabs } from "../keuangan-tabs";
import { rupiah } from "@/lib/admin/format";
import { isOverdue } from "@/lib/admin/quota";
import { syncAllToCashFlow } from "@/lib/finance/sync";
import { loadProgramsAndLocations } from "@/lib/finance/lookups";
import { resolvePeriod } from "@/lib/finance/shared";
import { computeRingkasanTotals, groupCashFlowBy, monthlyTrend, type CashFlowEntryLite, type InvoiceLite } from "@/lib/finance/summary";

type Params = { from?: string; to?: string; program?: string; location?: string; test?: string };

export default async function KeuanganRingkasanPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const todayISO = toISODate(jakartaToday());
  const period = resolvePeriod(sp, todayISO);
  // "Data test bisa difilter atau dikecualikan dari laporan produksi...
  // laporan tetap dapat menampilkan data test bila admin sengaja memilih
  // mode QA" -- excluded by default, opt-in via ?test=1.
  const includeTest = sp.test === "1";
  // widen the read window for the 6-month trend chart, independent of the
  // filter period shown in the stat tiles above it.
  const wideFrom = new Date(period.to);
  wideFrom.setMonth(wideFrom.getMonth() - 5);
  wideFrom.setDate(1);
  const wideFromISO = toISODate(wideFrom);

  await syncAllToCashFlow(supabase, session.user.id);

  const [{ programs, locations }, { data: cashFlowRows }, { data: overdueSetting }, { data: receivableRows }, { data: payrollUnpaidRows }] =
    await Promise.all([
      loadProgramsAndLocations(supabase),
      supabase
        .from("cash_flow_entries")
        .select("id, entry_date, direction, category, amount, status, program_id, location, is_test")
        .gte("entry_date", wideFromISO)
        .lte("entry_date", period.to),
      supabase.from("site_settings").select("value").eq("key", "jatuh_tempo_hari").maybeSingle(),
      supabase.from("invoices").select("id, amount, status, sent_at, is_test").in("status", ["sent", "processing"]),
      supabase.from("payroll_payments").select("net_amount, amount, status, is_test").in("status", ["draft", "disetujui"]),
    ]);

  const overdueDays = Number(overdueSetting?.value) > 0 ? Number(overdueSetting?.value) : 7;

  const allCashFlow = (cashFlowRows ?? []) as CashFlowEntryLite[];
  const filtered = allCashFlow.filter(
    (e) =>
      (includeTest || !e.is_test) &&
      (!sp.program || e.program_id === sp.program) &&
      (!sp.location || e.location === sp.location)
  );

  const receivableInvoices: InvoiceLite[] = (receivableRows ?? []).filter((i) => includeTest || !i.is_test);
  const overdueInvoiceIds = new Set(
    receivableInvoices.filter((i) => isOverdue({ status: i.status, sent_at: (i as unknown as { sent_at: string | null }).sent_at }, overdueDays)).map((i) => i.id)
  );
  const payrollUnpaidNet = (payrollUnpaidRows ?? [])
    .filter((p) => includeTest || !p.is_test)
    .reduce((sum, p) => sum + Number(p.net_amount ?? p.amount ?? 0), 0);

  const totals = computeRingkasanTotals({
    cashFlow: filtered,
    from: period.from,
    to: period.to,
    receivableInvoices,
    overdueInvoiceIds,
    payrollUnpaidNet,
  });

  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const perProgram = groupCashFlowBy(filtered, period.from, period.to, "masuk", (e) => e.program_id ?? "__none").map((r) => ({
    label: r.key === "__none" ? "Tanpa program" : (programName.get(r.key) ?? r.key),
    total: r.total,
  }));
  const perLokasi = groupCashFlowBy(filtered, period.from, period.to, "masuk", (e) => e.location ?? "__none").map((r) => ({
    label: r.key === "__none" ? "Tanpa lokasi" : r.key,
    total: r.total,
  }));

  const tren = monthlyTrend(filtered, period.to, 6);
  const trenMax = Math.max(1, ...tren.map((t) => Math.max(t.masuk, t.keluar)));

  const testCount = allCashFlow.filter((e) => e.is_test).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Ringkasan Keuangan" subtitle="Uang masuk hanya dari invoice yang benar-benar lunas; draft dan dibatalkan tidak dihitung." />
      <KeuanganTabs active="ringkasan" />

      <FinanceFilterBar
        action="/admin/keuangan/ringkasan"
        from={period.from}
        to={period.to}
        program={sp.program}
        location={sp.location}
        programs={programs}
        locations={locations}
      />

      {testCount > 0 && (
        <p className="rounded-xl bg-[#FFF1CC] px-3 py-2 text-xs text-[#7A5400]">
          {testCount} transaksi berlabel [TEST] ada dalam rentang data ini.{" "}
          {includeTest ? (
            <>
              Sedang <strong>disertakan</strong> (mode QA) --{" "}
              <a href={`?${new URLSearchParams({ from: period.from, to: period.to, program: sp.program ?? "", location: sp.location ?? "" }).toString()}`} className="underline">
                kembali ke laporan produksi (kecualikan data uji)
              </a>
              .
            </>
          ) : (
            <>
              Sudah <strong>dikecualikan</strong> dari angka di bawah --{" "}
              <a
                href={`?${new URLSearchParams({ from: period.from, to: period.to, program: sp.program ?? "", location: sp.location ?? "", test: "1" }).toString()}`}
                className="underline"
              >
                sertakan data uji (mode QA)
              </a>
              .
            </>
          )}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Uang masuk (periode)" value={rupiah(totals.uangMasuk)} />
        <StatTile label="Uang keluar (periode)" value={rupiah(totals.uangKeluar)} />
        <StatTile
          label="Saldo bersih (periode)"
          value={rupiah(totals.saldoBersih)}
          hint={totals.saldoBersih < 0 ? "Pengeluaran lebih besar dari pemasukan" : undefined}
        />
        <StatTile label="Piutang (belum dibayar)" value={rupiah(totals.piutang)} hint={`termasuk ${rupiah(totals.piutangJatuhTempo)} jatuh tempo`} />
        <StatTile label="Gaji belum dibayar" value={rupiah(totals.gajiBelumDibayar)} hint="draft + disetujui, belum ditandai dibayar" />
        <StatTile label="Tagihan jatuh tempo" value={rupiah(totals.piutangJatuhTempo)} hint={`lewat ${overdueDays} hari sejak dikirim`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="flex flex-col gap-2">
          <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Pendapatan per program</h2>
          {perProgram.length === 0 ? (
            <p className="text-sm text-slate-600">Belum ada pemasukan pada periode ini.</p>
          ) : (
            perProgram.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2 rounded-xl bg-white/40 px-3 py-2 text-sm">
                <span className="text-slate-700">{r.label}</span>
                <span className="font-semibold text-[#17263D]">{rupiah(r.total)}</span>
              </div>
            ))
          )}
        </GlassCard>
        <GlassCard className="flex flex-col gap-2">
          <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Pendapatan per lokasi</h2>
          {perLokasi.length === 0 ? (
            <p className="text-sm text-slate-600">Belum ada pemasukan pada periode ini.</p>
          ) : (
            perLokasi.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2 rounded-xl bg-white/40 px-3 py-2 text-sm">
                <span className="text-slate-700">{r.label}</span>
                <span className="font-semibold text-[#17263D]">{rupiah(r.total)}</span>
              </div>
            ))
          )}
        </GlassCard>
      </div>

      <GlassCard className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">Tren 6 bulan terakhir</h2>
        <div className="flex flex-col gap-2">
          {tren.map((t) => (
            <div key={t.month} className="flex items-center gap-3 text-xs">
              <span className="w-16 shrink-0 text-slate-600">{t.month}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 rounded-full bg-[#35C5D0]" style={{ width: `${Math.max(2, (t.masuk / trenMax) * 100)}%` }} />
                  <span className="text-slate-600">{rupiah(t.masuk)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 rounded-full bg-[#F97066]" style={{ width: `${Math.max(2, (t.keluar / trenMax) * 100)}%` }} />
                  <span className="text-slate-600">{rupiah(t.keluar)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#35C5D0] align-middle" /> Uang masuk
          <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-full bg-[#F97066] align-middle" /> Uang keluar
        </p>
      </GlassCard>
    </div>
  );
}
