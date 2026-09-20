import { formatShortDate } from "@/lib/format-date";
import type { ChildTab } from "@/lib/programs";

export type ReportPreview = {
  dateLabel: string;
  sessionNumber: number | null;
  attendance: string | null;
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

// The newest report is what a parent wants to see first. Expects reports
// newest-first (the same order the pages query them in).
export function latestReportPreview(
  reports: {
    session_date: string;
    session_number?: number | null;
    attendance?: string | null;
    notes?: string | null;
  }[]
): ReportPreview | null {
  const latest = reports[0];
  if (!latest) return null;
  return {
    dateLabel: formatShortDate(latest.session_date),
    sessionNumber: latest.session_number ?? null,
    attendance: latest.attendance ?? null,
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
