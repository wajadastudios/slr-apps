// Detecting a pengajar handover from the report history itself, rather than
// tracing admin slot-reassignment logs: whichever mechanism moved the
// student (updating an existing class_slots row, or creating a new one --
// see applySlotChangeAction in src/app/admin/jadwal/actions.ts), the
// enrollment's report history is the one thing that is always coherent and
// already loaded by the caller. No extra query needed.
//
// Boundary: the current pengajar's first own report (if any). Everything
// strictly before that, written by someone else, is "before you". If the
// current pengajar has not written a single report yet (handover just
// happened), every existing report counts as "before".
export type ReportForHandover = {
  session_date: string;
  pelatih_id?: string | null;
  author_name?: string | null;
};

export type HandoverInfo<T> = {
  // Session date of the current pengajar's first own report -- also the
  // spot to draw the "Mulai bersama Coach X" marker on the trend chart.
  // null when they have not written a report yet (no anchor point exists),
  // even though a "before" summary may still be shown.
  handoverAt: string | null;
  previousPelatihName: string | null;
  // Reports written before the boundary by someone other than the current
  // pengajar, oldest first.
  beforeReports: T[];
};

export function computeHandover<T extends ReportForHandover>(
  reports: T[],
  currentPelatihId: string
): HandoverInfo<T> {
  const chronological = [...reports].sort((a, b) => a.session_date.localeCompare(b.session_date));
  const firstOwn = chronological.find((r) => r.pelatih_id === currentPelatihId);
  const boundary = firstOwn?.session_date ?? null;

  const beforeReports = boundary
    ? chronological.filter((r) => r.session_date < boundary && r.pelatih_id !== currentPelatihId)
    : chronological.filter((r) => r.pelatih_id !== currentPelatihId);

  if (beforeReports.length === 0) {
    return { handoverAt: null, previousPelatihName: null, beforeReports: [] };
  }

  const lastBefore = beforeReports[beforeReports.length - 1];
  return {
    handoverAt: boundary,
    previousPelatihName: lastBefore.author_name ?? null,
    beforeReports,
  };
}
