import { formatShortDate } from "@/lib/format-date";

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

export type ChildTab = "laporan" | "perkembangan" | "record";

export const CHILD_TABS: { id: ChildTab; label: string }[] = [
  { id: "laporan", label: "Laporan" },
  { id: "perkembangan", label: "Perkembangan" },
  { id: "record", label: "Record" },
];

// Anything unknown falls back to the report tab, so a stale or hand-edited
// link never lands on an empty page.
export function parseChildTab(raw: string | string[] | undefined): ChildTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return CHILD_TABS.some((t) => t.id === value) ? (value as ChildTab) : "laporan";
}

export function childHref(studentId: string, tab: ChildTab, hash?: string): string {
  return `/ortu/anak/${studentId}?tab=${tab}${hash ? `#${hash}` : ""}`;
}
