// Rate-resolution and payroll calculation core.
//
// pelatih_rates stores a new row per rate change rather than updating one
// in place, so a session's pay always resolves to whatever rate was in
// effect on that session's own date -- rate changes are never retroactive.
// This is why resolveRateForDate does a point-in-time lookup instead of
// just reading "the current rate": a session taught two weeks ago must
// keep paying at the rate that was live back then, even if admin has
// since raised it for future sessions.

export type RateRow = {
  rate_hadir: number;
  rate_izin_sakit: number;
  // "Izin — sesi terpakai" (0046): set per coach by an admin; null = not set
  rate_izin_terpakai?: number | null;
  effective_from: string; // YYYY-MM-DD
};

export type ReportForPayroll = {
  session_date: string; // YYYY-MM-DD
  attendance: string | null;
  late_notice?: boolean | null;
  quota_decision?: string | null;
};

export function resolveRateForDate(
  rates: RateRow[],
  date: string
): RateRow | null {
  let best: RateRow | null = null;
  for (const rate of rates) {
    if (rate.effective_from > date) continue;
    if (!best || rate.effective_from > best.effective_from) best = rate;
  }
  return best;
}

// The used-izin rate is resolved on its own: the newest row that actually
// sets it, in effect on the session's date. A later rate change that leaves
// it empty therefore keeps the previous value instead of erasing it.
export function resolveIzinTerpakaiRate(rates: RateRow[], date: string): number | null {
  let best: RateRow | null = null;
  for (const rate of rates) {
    if (rate.rate_izin_terpakai == null || rate.effective_from > date) continue;
    if (!best || rate.effective_from > best.effective_from) best = rate;
  }
  return best ? Number(best.rate_izin_terpakai) : null;
}

export function computeGaji(
  reports: ReportForPayroll[],
  rates: RateRow[]
): {
  hadirCount: number;
  izinSakitCount: number;
  total: number;
  unratedCount: number;
  /** izin an admin counted as a used session, paid at rate_izin_terpakai */
  izinTerpakaiCount: number;
  /** ...of which no rate_izin_terpakai is set yet: NOT paid until it is */
  izinTerpakaiUnratedCount: number;
  /** late-notice izin still waiting for the admin's decision */
  pendingDecisionCount: number;
} {
  let hadirCount = 0;
  let izinSakitCount = 0;
  let izinTerpakaiCount = 0;
  let izinTerpakaiUnratedCount = 0;
  let pendingDecisionCount = 0;
  let total = 0;
  // Sessions that really happened (a real report row -- duplicates are
  // already prevented upstream by progress_reports' own unique(enrollment_
  // id, session_date) guard, see 0040_audit_fixes.sql) but couldn't be
  // priced because no pelatih_rates row was ever in effect on that date.
  // These must never silently read as "Rp0 gaji" -- the caller shows an
  // explicit "tarif belum diatur" warning instead.
  let unratedCount = 0;

  for (const report of reports) {
    const rate = resolveRateForDate(rates, report.session_date);
    if (!rate) {
      unratedCount += 1;
      continue; // no rate was ever set as of this session's date
    }

    if (report.attendance === "hadir") {
      hadirCount += 1;
      total += rate.rate_hadir;
    } else if (report.attendance === "izin" && report.quota_decision === "used") {
      izinTerpakaiCount += 1;
      // Never silently Rp0: an unset rate is flagged and blocks the transfer.
      const terpakaiRate = resolveIzinTerpakaiRate(rates, report.session_date);
      if (terpakaiRate == null) izinTerpakaiUnratedCount += 1;
      else total += terpakaiRate;
    } else {
      // A late izin not decided yet is paid like any izin for now, and flagged.
      if (report.attendance === "izin" && report.late_notice && !report.quota_decision) pendingDecisionCount += 1;
      izinSakitCount += 1;
      total += rate.rate_izin_sakit;
    }
  }

  return { hadirCount, izinSakitCount, total, unratedCount, izinTerpakaiCount, izinTerpakaiUnratedCount, pendingDecisionCount };
}

/**
 * Why a payroll must not be approved/transferred yet, or null. Shown on the
 * payroll page and enforced again server-side before approval and transfer.
 */
export function payrollBlocker(g: { izinTerpakaiUnratedCount: number; pendingDecisionCount: number }): string | null {
  if (g.izinTerpakaiUnratedCount > 0) {
    return `Tarif sesi terpakai belum diisi untuk ${g.izinTerpakaiUnratedCount} sesi. Isi tarifnya di halaman pengajar (dengan "Berlaku Mulai" paling lambat tanggal sesi tersebut) sebelum gaji disetujui atau ditransfer.`;
  }
  if (g.pendingDecisionCount > 0) {
    return `${g.pendingDecisionCount} izin mendadak belum diputuskan (sesi terpakai atau izin biasa). Putuskan di halaman Laporan sebelum gaji disetujui atau ditransfer.`;
  }
  return null;
}

export type ReferredStudent = {
  id: string;
  referral_komisi_per_sesi: number | null;
};

// Commission counts every report row for the student in the period,
// regardless of attendance or who taught it -- it rewards the recruiting
// pengajar for the student staying enrolled, not for who showed up to teach.
export function computeReferralCommission(
  reportCountsByStudent: Map<string, number>,
  referredStudents: ReferredStudent[]
): number {
  let total = 0;
  for (const s of referredStudents) {
    const count = reportCountsByStudent.get(s.id) ?? 0;
    total += count * (s.referral_komisi_per_sesi ?? 0);
  }
  return total;
}

// Period bounds as [start, end) date strings, for a straightforward
// .gte(start).lt(end) query against session_date.
export function periodBounds(
  year: number,
  month: number
): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${pad(nextMonth)}-01`;
  return { start, end };
}

export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
