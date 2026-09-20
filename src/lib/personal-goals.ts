export type GoalUnit = "detik" | "meter" | "kali";

export const GOAL_UNITS: { id: GoalUnit; label: string }[] = [
  { id: "detik", label: "Detik (durasi)" },
  { id: "meter", label: "Meter (jarak)" },
  { id: "kali", label: "Kali (jumlah)" },
];

export type PersonalGoal = {
  id: string;
  label: string;
  unit: GoalUnit;
  baseline: number | null;
  target: number;
  status: "active" | "archived";
};

export type GoalEntry = { id: string; goal_id: string; value: number; recorded_at: string; note?: string | null };

export type GoalStanding =
  | "no_data"
  | "in_progress"
  | "above_baseline"
  | "personal_best"
  | "target_reached";

export type GoalProgress = {
  best: number | null;
  latest: number | null;
  standing: GoalStanding;
  // Positive, individual wording. Never compared with anybody else.
  label: string;
};

export const STANDING_LABEL: Record<GoalStanding, string> = {
  no_data: "Belum ada catatan",
  in_progress: "Sedang berproses",
  above_baseline: "Lebih mandiri dari baseline",
  personal_best: "Personal best",
  target_reached: "Target pribadi tercapai",
};

// Every measurement type here grows upward (longer, further, more often).
// Standing is judged against the participant's own baseline and target only.
export function goalProgress(goal: Pick<PersonalGoal, "baseline" | "target">, entries: GoalEntry[]): GoalProgress {
  if (entries.length === 0) {
    return { best: null, latest: null, standing: "no_data", label: STANDING_LABEL.no_data };
  }

  const chronological = [...entries].sort(
    (a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id)
  );
  const values = chronological.map((e) => Number(e.value));
  const best = Math.max(...values);
  const latest = values[values.length - 1];
  const previousBest = values.length > 1 ? Math.max(...values.slice(0, -1)) : null;

  let standing: GoalStanding = "in_progress";
  if (best >= Number(goal.target)) standing = "target_reached";
  else if (previousBest !== null && latest > previousBest) standing = "personal_best";
  else if (goal.baseline !== null && best > Number(goal.baseline)) standing = "above_baseline";

  return { best, latest, standing, label: STANDING_LABEL[standing] };
}

export function formatGoalValue(value: number, unit: GoalUnit): string {
  return `${Math.round(Number(value) * 100) / 100} ${unit}`;
}
