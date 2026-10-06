import type {
  CurriculumIndicator,
  CurriculumReport,
  CurriculumSkill,
  Level,
  LevelEvent,
  SkillRule,
  TestResult,
  TestTarget,
  TestType,
} from "./types";
import { checkTarget, targetOf } from "./results";

// Proposed defaults, used only when a skill has no rule row. Configurable per
// skill/level in admin -- not a universal standard.
export const DEFAULT_RULE = { masteryMinScore: 4, minEvidenceSessions: 2, requiresTest: false };

export function ruleFor(rules: SkillRule[], skillId: string, level: Level | null): SkillRule {
  return (
    rules.find((r) => r.skillId === skillId && r.level === level) ?? {
      skillId,
      level,
      ...DEFAULT_RULE,
    }
  );
}

// ---------- level per stroke ----------
function eventOrder(a: LevelEvent, b: LevelEvent) {
  return a.effectiveOn.localeCompare(b.effectiveOn) || a.createdAt.localeCompare(b.createdAt);
}

export function levelTimeline(skillId: string, events: LevelEvent[]): LevelEvent[] {
  return events.filter((e) => e.skillId === skillId).sort(eventOrder);
}

// Level is per stroke: a child can be Level 2 in Bebas and Level 1 in Dada.
export function currentLevel(skillId: string, events: LevelEvent[]): { level: Level; since: string; kind: LevelEvent["kind"] } | null {
  const list = levelTimeline(skillId, events);
  const last = list[list.length - 1];
  return last ? { level: last.level, since: last.effectiveOn, kind: last.kind } : null;
}

// ---------- evidence ----------
type Evidence = { latest: { score: number; date: string } | null; sessionsMeeting: number };

function indicatorEvidence(key: string, reports: CurriculumReport[], minScore: number): Evidence {
  const dated = reports
    .filter((r) => r.curriculumVersion !== null && typeof r.scores[key] === "number")
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  const sessions = new Set(dated.filter((r) => r.scores[key] >= minScore).map((r) => r.sessionDate));
  return {
    latest: dated[0] ? { score: dated[0].scores[key], date: dated[0].sessionDate } : null,
    sessionsMeeting: sessions.size,
  };
}

// Mastered = the latest assessment meets the rule's minimum AND enough
// separate sessions did. A later drop below the minimum un-masters it, and a
// skipped session changes nothing (it is not a score).
export function isMastered(ev: Evidence, rule: Pick<SkillRule, "masteryMinScore" | "minEvidenceSessions">): boolean {
  return ev.latest !== null && ev.latest.score >= rule.masteryMinScore && ev.sessionsMeeting >= rule.minEvidenceSessions;
}

export type MasteryStats = {
  total: number;
  mastered: number;
  masteredLabels: string[];
  needsPractice: string[]; // assessed, not mastered yet
  notAssessed: string[];
};

// "Dikuasai" for the non-level skills (Dasar, Water Safety). Counts only this
// skill's own required indicators -- adding another skill never changes it.
export function masteryStats(
  skill: CurriculumSkill,
  indicators: CurriculumIndicator[],
  reports: CurriculumReport[],
  rules: SkillRule[]
): MasteryStats {
  const rule = ruleFor(rules, skill.id, null);
  const own = indicators
    .filter((i) => i.skillId === skill.id && i.level === null && i.required && i.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const stats: MasteryStats = { total: own.length, mastered: 0, masteredLabels: [], needsPractice: [], notAssessed: [] };
  for (const i of own) {
    const ev = indicatorEvidence(i.key, reports, rule.masteryMinScore);
    if (isMastered(ev, rule)) {
      stats.mastered++;
      stats.masteredLabels.push(i.label);
    } else if (ev.latest) stats.needsPractice.push(i.label);
    else stats.notAssessed.push(i.label);
  }
  return stats;
}

// ---------- level eligibility ----------
export type EligibilityCheck = { key: string; label: string; ok: boolean; detail: string };
export type Eligibility = { eligible: boolean; checks: EligibilityCheck[] };

// Whether a child may be put forward for passing `level` of a stroke. Never an
// average: every required indicator of that level must meet the rule and the
// level's required test must be met. The pengajar still has to confirm.
export function levelEligibility(args: {
  skill: CurriculumSkill;
  level: Level;
  indicators: CurriculumIndicator[];
  reports: CurriculumReport[];
  results: TestResult[];
  testTypes: TestType[];
  targets: TestTarget[];
  rules: SkillRule[];
}): Eligibility {
  const { skill, level, indicators, results, testTypes, targets, rules } = args;
  const rule = ruleFor(rules, skill.id, level);
  // only sessions assessed AT this level count toward this level's rubric
  const reports = args.reports.filter((r) => r.context.skills?.[skill.id]?.level === level);

  const own = indicators
    .filter((i) => i.skillId === skill.id && i.level === level && i.required && i.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const checks: EligibilityCheck[] = own.map((i) => {
    const ev = indicatorEvidence(i.key, reports, rule.masteryMinScore);
    const ok = isMastered(ev, rule);
    const detail = ev.latest
      ? `Skor terbaru ${ev.latest.score} (${ev.latest.date}); ${ev.sessionsMeeting}/${rule.minEvidenceSessions} sesi bernilai ${rule.masteryMinScore}+`
      : "Belum dinilai pada level ini";
    return { key: i.key, label: i.label, ok, detail };
  });

  if (own.length === 0) {
    checks.push({ key: "indikator", label: "Indikator level", ok: false, detail: "Belum ada indikator wajib untuk level ini" });
  }

  if (rule.requiresTest) {
    const type = testTypes.find((t) => t.skillId === skill.id && t.levelSpecific && t.measure === "distance_m" && t.active);
    const target = type ? targets.find((t) => t.testTypeId === type.id && t.level === level && t.active) : undefined;
    if (!type || !target) {
      checks.push({ key: "tes", label: "Tes wajib", ok: false, detail: "Belum ada target tes untuk level ini" });
    } else {
      const meeting = results
        .filter((r) => r.testTypeId === type.id && r.level === level)
        .map((r) => ({ r, check: checkTarget(r, type, targetOf(r, targets) ?? target) }))
        .find((x) => x.check.met);
      checks.push({
        key: "tes",
        label: `${type.label} (target ${target.value} m)`,
        ok: !!meeting,
        detail: meeting ? `Tercapai pada ${meeting.r.sessionDate}` : "Belum ada hasil yang memenuhi target, bantuan, dan syarat teknik",
      });
    }
  }

  return { eligible: checks.length > 0 && checks.every((c) => c.ok), checks };
}
