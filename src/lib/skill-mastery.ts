import { isAbsent } from "@/lib/progress";
import { allKeys, displayName, type IndicatorConfig } from "@/lib/indicators";

// Display-only reading of the scores a parent already sees: which indicators
// are mastered, which are being trained, which have not started, and what
// to focus on next. Never changes a score, a report or the curriculum order.

export const MASTERED_SCORE = 5;
// "Dikuasai": the latest score is 5/5 and so is the one before it.
export const MASTERY_MIN_STREAK = 2;

export type SkillStatus = "mastered" | "training" | "not_started";

export type MasteryReport = {
  session_date: string;
  attendance?: string | null;
  next_focus?: string | null;
  scores: Record<string, number> | null;
};

export type SkillProgress = {
  key: string;
  name: string; // "Dasar - Adaptasi di Air"
  label: string; // "Adaptasi di Air"
  status: SkillStatus;
  scores: number[]; // assessed sessions only, oldest first
  latest: number | null;
  // trailing run of 5/5 (only meaningful when mastered)
  streak: number;
  // the indicator just before this one in the curriculum is mastered
  // (curriculum order only -- not a claim about what was taught)
  afterMastered: string | null;
};

export type MasteryOverview = {
  skills: SkillProgress[]; // curriculum order
  mastered: SkillProgress[];
  training: SkillProgress[];
  notStarted: SkillProgress[];
  // the coach's own "fokus berikutnya" from the latest assessed report;
  // never guessed by the app
  nextFocus: string | null;
};

function trailingStreak(scores: number[]) {
  let n = 0;
  for (let i = scores.length - 1; i >= 0 && scores[i] === MASTERED_SCORE; i--) n++;
  return n;
}

export function skillStatus(scores: number[]): SkillStatus {
  const latest = scores[scores.length - 1];
  if (latest === undefined || latest <= 0) return "not_started";
  return trailingStreak(scores) >= MASTERY_MIN_STREAK ? "mastered" : "training";
}

export function computeMastery(config: IndicatorConfig, reports: MasteryReport[]): MasteryOverview {
  const chronological = [...reports].sort((a, b) => a.session_date.localeCompare(b.session_date));
  const assessed = chronological.filter((r) => !isAbsent(r.attendance) && r.scores);

  const skills: SkillProgress[] = [];
  for (const key of allKeys(config)) {
    const scores = assessed
      .map((r) => r.scores?.[key])
      .filter((s): s is number => typeof s === "number");
    const status = skillStatus(scores);
    // an inactive indicator nobody ever scored is simply not shown
    if (status === "not_started" && !config.byKey[key]?.active) continue;
    skills.push({
      key,
      name: displayName(config, key),
      label: config.byKey[key]?.label ?? displayName(config, key),
      status,
      scores,
      latest: scores.length ? scores[scores.length - 1] : null,
      streak: status === "mastered" ? trailingStreak(scores) : 0,
      afterMastered: null,
    });
  }
  for (let i = 1; i < skills.length; i++) {
    if (skills[i].status !== "mastered" && skills[i - 1].status === "mastered") {
      skills[i].afterMastered = skills[i - 1].label;
    }
  }

  const mastered = skills.filter((s) => s.status === "mastered");
  const training = skills.filter((s) => s.status === "training");
  const notStarted = skills.filter((s) => s.status === "not_started");

  // Only what the coach wrote on the latest report; an older note is not
  // carried forward and nothing is picked automatically.
  const nextFocus = assessed[assessed.length - 1]?.next_focus?.trim() || null;

  return { skills, mastered, training, notStarted, nextFocus };
}
