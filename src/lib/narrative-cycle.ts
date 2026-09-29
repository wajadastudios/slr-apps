// Mirrors the database's narrative_required()/guard_narrative_cycle()
// exactly (supabase/migrations/0044_narrative_report_cycle.sql) so the UI
// can show the right copy and required-ness without a round-trip -- the
// database trigger remains the actual enforcement boundary, this is
// display/validation-hint only. Keep both in sync if the policy semantics
// ever change.

export type NarrativePolicy = "none" | "every_4" | "every_2" | "every_1";

// Only sessions dated on or after this join the cycle; migrated/historical
// reports before it are never retroactively required to have a narrative.
export const NARRATIVE_CYCLE_START = "2026-10-01";

const INTERVAL: Record<NarrativePolicy, number> = {
  none: 0,
  every_1: 1,
  every_2: 2,
  every_4: 4,
};

export function narrativeRequired(policy: NarrativePolicy, position: number): boolean {
  const n = INTERVAL[policy];
  return n > 0 && position > 0 && position % n === 0;
}

type CycleReport = {
  status?: string | null;
  attendance?: string | null;
  session_date: string;
};

function isCycleEligible(r: CycleReport): boolean {
  return r.status === "final" && r.attendance === "hadir" && r.session_date >= NARRATIVE_CYCLE_START;
}

// Count of valid (final, hadir, on/after the cutoff) reports for one
// enrollment -- the same count the database trigger computes before an
// insert/update, so "the next report would be position N" is `count + 1`.
export function countCycleReports(reports: CycleReport[]): number {
  return reports.filter(isCycleEligible).length;
}

// The section-4 reminder copy, generalized beyond the every_4 examples in
// the spec: for every_1, every position is due, so there's no "N laporan
// lagi" countdown -- it's always due.
export function narrativeReminder(policy: NarrativePolicy, position: number): string | null {
  const n = INTERVAL[policy];
  if (n === 0 || position <= 0) return null;
  if (n === 1) return "Rangkuman perkembangan wajib dilengkapi pada sesi ini";

  const posInCycle = ((position - 1) % n) + 1;
  if (posInCycle === n) return "Rangkuman perkembangan wajib dilengkapi pada sesi ini";
  if (posInCycle === 1) return `Rangkuman perkembangan wajib pada laporan ke-${n}`;
  const remaining = n - posInCycle;
  return `${remaining} laporan lagi menuju rangkuman perkembangan`;
}

// How many more valid sessions until the next periodic narrative is due --
// used for the parent-facing "Rangkuman berikutnya dibuat setelah N laporan
// sesi lagi" copy (a different sentence than narrativeReminder()'s pengajar
// wording, built from the same interval math). null when the policy never
// requires one, or the position itself is already due (nothing to count down).
export function remainingUntilNarrative(policy: NarrativePolicy, position: number): number | null {
  const n = INTERVAL[policy];
  if (n === 0 || n === 1 || position <= 0) return null;
  const posInCycle = ((position - 1) % n) + 1;
  return posInCycle === n ? null : n - posInCycle;
}

// Which already-saved reports ARE a cycle's periodic summary (final, hadir,
// on/after the cutoff, and landed on a required position) -- used to badge
// "Rangkuman laporan ke-N" in history and to pick out the report worth a
// more prominent card on the parent side. Keyed by report id.
export function cyclePositionsOf<T extends CycleReport & { id: string }>(
  reports: T[],
  policy: NarrativePolicy
): Map<string, number> {
  const chronological = [...reports]
    .filter(isCycleEligible)
    .sort((a, b) => a.session_date.localeCompare(b.session_date));

  const positions = new Map<string, number>();
  chronological.forEach((r, i) => {
    const position = i + 1;
    if (narrativeRequired(policy, position)) positions.set(r.id, position);
  });
  return positions;
}
