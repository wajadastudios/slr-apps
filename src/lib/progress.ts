import { formatSkillName } from "@/lib/skill-names";

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

export type SessionQuota = {
  hadir: number;
  total: number;
  remaining: number;
};

// Quota only comes from packages that are actually paid: an invoice that is
// still draft/approved/sent/processing has not been settled, so its sessions
// must not count until it flips to "paid".
export function computeSessionQuota(
  invoices: { status: string; sessions_count: number }[],
  reports: { attendance: string | null }[]
): SessionQuota {
  const hadir = reports.filter((r) => r.attendance === "hadir").length;
  const total = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.sessions_count, 0);
  return { hadir, total, remaining: Math.max(0, total - hadir) };
}

export function formatSessionQuota(q: SessionQuota): { value: string; note: string } {
  if (q.total === 0) {
    return { value: `${q.hadir} sesi diikuti`, note: "Belum ada paket lunas" };
  }
  return {
    value: `${q.hadir} / ${q.total} sesi diikuti`,
    note: `Sisa ${q.remaining} sesi`,
  };
}

// Progress reads from the newest session the child actually attended
// (attendance === "hadir"); izin/sakit sessions never affect it.
// Expects reports newest-first.
export function latestHadirReport<T extends { attendance?: string | null }>(
  reports: T[]
): T | undefined {
  return reports.find((r) => r.attendance === "hadir");
}

// The trainer's own "Rekomendasi Fokus Sesi Berikutnya" from the newest
// attended session that actually has one -- never generated, never dated.
// Expects reports newest-first.
export function latestNextFocus(
  reports: { attendance?: string | null; next_focus?: string | null }[]
): string | null {
  for (const r of reports) {
    if (r.attendance !== "hadir") continue;
    const focus = r.next_focus?.trim();
    if (focus) return focus;
  }
  return null;
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" dan ");
  return `${names[0]}, ${names[1]}, dan ${names.length - 2} indikator lainnya`;
}

// A short positive note that the assessment data itself supports:
//  - with a previous attended session: indicators whose score went up
//  - first assessed session: indicators already scored 3 ("Baik") or higher
// Anything else (flat, lower, or too little data) returns null so the card
// simply hides the block instead of inventing praise.
// Expects reports newest-first.
export function computeLatestAchievement(
  reports: { attendance?: string | null; scores: unknown }[],
  skillTemplate: string[]
): string | null {
  const attended = reports.filter(
    (r) => r.attendance === "hadir" && r.scores && typeof r.scores === "object"
  );
  if (attended.length === 0) return null;

  const latest = attended[0].scores as Record<string, number>;
  const previous = attended[1]?.scores as Record<string, number> | undefined;

  if (previous) {
    const improved = skillTemplate
      .map((skill, order) => ({
        skill,
        order,
        delta:
          typeof latest[skill] === "number" ? latest[skill] - (previous[skill] ?? 0) : 0,
      }))
      .filter((x) => x.delta > 0)
      .sort((a, b) => b.delta - a.delta || a.order - b.order)
      .map((x) => formatSkillName(x.skill));
    return improved.length > 0 ? `Meningkat pada ${joinNames(improved)}` : null;
  }

  const strong = skillTemplate
    .filter((skill) => typeof latest[skill] === "number" && latest[skill] >= 3)
    .map(formatSkillName);
  return strong.length > 0 ? `Sudah baik pada ${joinNames(strong)}` : null;
}
