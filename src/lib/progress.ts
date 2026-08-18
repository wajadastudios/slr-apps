export function computeProgressPercent(
  skillTemplate: string[],
  scores: Record<string, number> | null | undefined
): number | null {
  if (!scores || skillTemplate.length === 0) return null;

  const values = skillTemplate
    .map((skill) => scores[skill])
    .filter((v): v is number => typeof v === "number");

  if (values.length === 0) return null;

  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round((avg / 5) * 100);
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

type SlotInfo = {
  day_of_week: number;
  start_time: string;
  label: string | null;
  pelatihName: string | null;
};

export function computeNextSession(
  slots: SlotInfo[],
  now: Date = new Date()
): SlotInfo | null {
  if (slots.length === 0) return null;

  const nowDow = now.getDay();
  const nowTime = now.toTimeString().slice(0, 8);

  let best: SlotInfo | null = null;
  let bestDist = Infinity;

  for (const slot of slots) {
    let dist = (slot.day_of_week - nowDow + 7) % 7;
    if (dist === 0 && slot.start_time <= nowTime) dist = 7;
    if (dist < bestDist) {
      bestDist = dist;
      best = slot;
    }
  }

  return best;
}
