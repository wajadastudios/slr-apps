export function isAbsent(attendance: string | null | undefined): boolean {
  return attendance === "izin" || attendance === "sakit";
}

// Skill scores describe what the child can do, so a session they missed
// (izin/sakit) says nothing about that -- progress is read from the newest
// session they actually attended. Expects reports newest-first.
export function latestAttendedReport<T extends { attendance?: string | null }>(
  reports: T[]
): T | undefined {
  return reports.find((r) => !isAbsent(r.attendance));
}

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

// Both functions below key off Asia/Jakarta wall-clock time, not the
// server's own timezone. Vercel runs in UTC, so a naive new Date().getHours()
// or .getDay() would be off by 7 hours -- e.g. reporting "Selamat malam" at
// 6am WIB, or thinking a session slot is still "next week" when it's later
// today. See lib/week.ts for the same fix applied to the pengganti view.
export function getGreeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now)
  );
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

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  // day_of_week uses 0 = Minggu, matching class_slots; a Date built from
  // the Jakarta y/m/d (not the raw instant) gives the correct weekday
  // regardless of the server's own timezone.
  const nowDow = new Date(
    Number(part("year")),
    Number(part("month")) - 1,
    Number(part("day"))
  ).getDay();
  const nowTime = `${part("hour")}:${part("minute")}:${part("second")}`;

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
