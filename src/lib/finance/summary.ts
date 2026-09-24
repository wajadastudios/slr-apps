// Pure aggregation over already-fetched rows -- no Supabase dependency, so
// these are reused unchanged by the dashboard pages and the Excel export
// builder (same numbers everywhere, computed once).

export type CashFlowEntryLite = {
  id: string;
  entry_date: string;
  direction: "masuk" | "keluar";
  category: string;
  amount: number;
  status: string;
  program_id: string | null;
  location: string | null;
  is_test?: boolean;
};

export type InvoiceLite = {
  id: string;
  amount: number;
  status: string;
  sent_at: string | null;
  program_id?: string | null;
  is_test?: boolean;
};

function inPeriod(dateISO: string, from: string, to: string): boolean {
  return dateISO >= from && dateISO <= to;
}

// "Jangan menghitung invoice draft, dibatalkan, atau pembayaran gagal
// sebagai uang masuk" -- cash_flow_entries only ever gets a 'pembayaran_murid'
// row via syncPaidInvoicesToCashFlow, which only reads status='paid'
// invoices, so a cancelled/draft invoice can never appear here by
// construction. 'dibatalkan' cash-flow rows (a mis-entered manual row the
// admin cancelled) are excluded from every sum below.
export function sumCashFlow(
  entries: CashFlowEntryLite[],
  direction: "masuk" | "keluar",
  from: string,
  to: string,
  category?: string
): number {
  return entries
    .filter((e) => e.direction === direction && e.status !== "dibatalkan" && inPeriod(e.entry_date, from, to))
    .filter((e) => !category || e.category === category)
    .reduce((sum, e) => sum + Number(e.amount), 0);
}

export type RingkasanTotals = {
  uangMasuk: number;
  uangKeluar: number;
  saldoBersih: number;
  piutang: number;
  piutangJatuhTempo: number;
  gajiBelumDibayar: number;
};

export function computeRingkasanTotals(params: {
  cashFlow: CashFlowEntryLite[];
  from: string;
  to: string;
  receivableInvoices: InvoiceLite[]; // status in (sent, processing)
  overdueInvoiceIds: Set<string>;
  payrollUnpaidNet: number; // sum of net_amount for status in (draft, disetujui)
}): RingkasanTotals {
  const uangMasuk = sumCashFlow(params.cashFlow, "masuk", params.from, params.to);
  const uangKeluar = sumCashFlow(params.cashFlow, "keluar", params.from, params.to);
  const piutang = params.receivableInvoices.reduce((sum, i) => sum + Number(i.amount), 0);
  const piutangJatuhTempo = params.receivableInvoices
    .filter((i) => params.overdueInvoiceIds.has(i.id))
    .reduce((sum, i) => sum + Number(i.amount), 0);
  return {
    uangMasuk,
    uangKeluar,
    saldoBersih: uangMasuk - uangKeluar,
    piutang,
    piutangJatuhTempo,
    gajiBelumDibayar: params.payrollUnpaidNet,
  };
}

export function groupCashFlowBy(
  entries: CashFlowEntryLite[],
  from: string,
  to: string,
  direction: "masuk" | "keluar",
  keyOf: (e: CashFlowEntryLite) => string
): { key: string; total: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.direction !== direction || e.status === "dibatalkan" || !inPeriod(e.entry_date, from, to)) continue;
    const key = keyOf(e);
    map.set(key, (map.get(key) ?? 0) + Number(e.amount));
  }
  return [...map.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
}

export type MonthlyTrendPoint = { month: string; masuk: number; keluar: number };

// Last `months` calendar months up to and including the month `to` falls in.
export function monthlyTrend(entries: CashFlowEntryLite[], to: string, months = 6): MonthlyTrendPoint[] {
  const [ty, tm] = to.split("-").map(Number);
  const points: MonthlyTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ty, tm - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    const from = `${monthKey}-01`;
    const end = new Date(y, m, 0).getDate();
    const toDate = `${monthKey}-${String(end).padStart(2, "0")}`;
    points.push({
      month: monthKey,
      masuk: sumCashFlow(entries, "masuk", from, toDate),
      keluar: sumCashFlow(entries, "keluar", from, toDate),
    });
  }
  return points;
}
