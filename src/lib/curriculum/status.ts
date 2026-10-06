import type { CurriculumIndicator, CurriculumReport, LevelEvent } from "./types";

export type IndicatorStatus =
  | { state: "belum_dimulai" }
  | { state: "dimulai_belum_dinilai" }
  | { state: "dinilai"; score: number; date: string; reportId: string }
  | { state: "tidak_berlaku"; reason: string; date: string };

export const STATUS_LABEL: Record<IndicatorStatus["state"], string> = {
  belum_dimulai: "Belum dimulai",
  dimulai_belum_dinilai: "Sudah dimulai, belum dinilai",
  dinilai: "Sudah dinilai",
  tidak_berlaku: "Tidak berlaku",
};

// Reports written under the level curriculum, newest first.
function newest(reports: CurriculumReport[]): CurriculumReport[] {
  return reports
    .filter((r) => r.curriculumVersion !== null)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
}

// A skill counts as "started" once any level-curriculum report assessed or
// at least selected it, or a level was recorded for it.
export function skillStarted(
  skillId: string,
  skillIndicatorKeys: string[],
  reports: CurriculumReport[],
  levelEvents: LevelEvent[]
): boolean {
  if (levelEvents.some((e) => e.skillId === skillId)) return true;
  const keys = new Set(skillIndicatorKeys);
  return reports.some(
    (r) =>
      r.curriculumVersion !== null &&
      (r.context.skills?.[skillId] !== undefined || Object.keys(r.scores).some((k) => keys.has(k)))
  );
}

// "Not assessed" is never a score: an indicator the pengajar skipped is simply
// absent from `scores`, so it stays "belum dinilai" instead of reading as 0.
export function indicatorStatus(
  indicator: Pick<CurriculumIndicator, "key">,
  reports: CurriculumReport[],
  started: boolean
): IndicatorStatus {
  for (const r of newest(reports)) {
    const score = r.scores[indicator.key];
    if (typeof score === "number") {
      return { state: "dinilai", score, date: r.sessionDate, reportId: r.id };
    }
    const reason = r.context.na?.[indicator.key];
    if (reason) return { state: "tidak_berlaku", reason, date: r.sessionDate };
  }
  return started ? { state: "dimulai_belum_dinilai" } : { state: "belum_dimulai" };
}

// Legacy reports (before the level curriculum) posted every indicator and
// defaulted untouched ones to 0, so a legacy 0 cannot be read as "belum mampu".
export const LEGACY_ZERO_LABEL = "Belum dapat dipastikan (data lama)";

export function isAmbiguousLegacyZero(report: Pick<CurriculumReport, "curriculumVersion">, score: number): boolean {
  return report.curriculumVersion === null && score === 0;
}
