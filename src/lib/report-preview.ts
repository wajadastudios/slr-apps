import { formatShortDate } from "@/lib/format-date";
import type { ChildTab } from "@/lib/programs";

export type ReportPreview = {
  dateLabel: string;
  sessionNumber: number | null;
  attendance: string | null;
  quota_decision?: string | null;
  // Trainer's written note; null when the report has none.
  note: string | null;
};

const ATTENDANCE_LABEL: Record<string, string> = {
  hadir: "Hadir",
  izin: "Izin",
  sakit: "Sakit",
};

export function attendanceLabel(attendance: string | null | undefined): string | null {
  return attendance ? (ATTENDANCE_LABEL[attendance] ?? attendance) : null;
}

// "Izin — sesi terpakai" (0046). Parents only ever see the FINAL status: a
// late izin still waiting for the admin reads as a plain "Izin" to them,
// while staff see that it is pending.
export type AttendanceInfo = {
  attendance?: string | null;
  late_notice?: boolean | null;
  quota_decision?: string | null;
};

export const IZIN_TERPAKAI_LABEL = "Izin — sesi terpakai";
export const IZIN_TERPAKAI_NOTE = "Kabar izin diterima setelah pengajar tiba di kolam.";

export function isIzinTerpakai(r: AttendanceInfo | null | undefined): boolean {
  return r?.attendance === "izin" && r.quota_decision === "used";
}

export function attendanceText(r: AttendanceInfo | null | undefined, audience: "parent" | "staff"): string | null {
  if (!r?.attendance) return null;
  if (isIzinTerpakai(r)) return IZIN_TERPAKAI_LABEL;
  if (audience === "staff" && r.attendance === "izin" && r.late_notice && !r.quota_decision) {
    return "Izin · menunggu keputusan admin";
  }
  return attendanceLabel(r.attendance);
}

// The newest report is what a parent wants to see first. Expects reports
// newest-first (the same order the pages query them in).
export function latestReportPreview(
  reports: {
    session_date: string;
    session_number?: number | null;
    attendance?: string | null;
    quota_decision?: string | null;
    notes?: string | null;
  }[]
): ReportPreview | null {
  const latest = reports[0];
  if (!latest) return null;
  return {
    dateLabel: formatShortDate(latest.session_date),
    sessionNumber: latest.session_number ?? null,
    attendance: latest.attendance ?? null,
    quota_decision: latest.quota_decision ?? null,
    note: latest.notes?.trim() || null,
  };
}

// `program` keeps a participant with several enrollments on the right one.
export function childHref(
  studentId: string,
  tab: ChildTab,
  hash?: string,
  program?: string
): string {
  return `/ortu/anak/${studentId}?tab=${tab}${program ? `&program=${program}` : ""}${hash ? `#${hash}` : ""}`;
}
