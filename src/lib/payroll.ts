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
  effective_from: string; // YYYY-MM-DD
};

export type ReportForPayroll = {
  session_date: string; // YYYY-MM-DD
  attendance: string | null;
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

export function computeGaji(
  reports: ReportForPayroll[],
  rates: RateRow[]
): { hadirCount: number; izinSakitCount: number; total: number } {
  let hadirCount = 0;
  let izinSakitCount = 0;
  let total = 0;

  for (const report of reports) {
    const rate = resolveRateForDate(rates, report.session_date);
    if (!rate) continue; // no rate was ever set as of this session's date

    if (report.attendance === "hadir") {
      hadirCount += 1;
      total += rate.rate_hadir;
    } else {
      izinSakitCount += 1;
      total += rate.rate_izin_sakit;
    }
  }

  return { hadirCount, izinSakitCount, total };
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
