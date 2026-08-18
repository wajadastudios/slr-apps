// Week maths for the pengajar-pengganti view.
//
// Everything is computed against the calendar date in Asia/Jakarta, not the
// server's timezone. Vercel runs in UTC, so between 00:00-07:00 WIB a naive
// `new Date()` would still report yesterday and label the wrong card
// "Hari Ini" — visible to the pengajar as a plain bug.

export function jakartaToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// Weeks run Minggu -> Sabtu to match class_slots.day_of_week (0 = Minggu),
// so slot.day_of_week can index straight off the week start.
export function startOfWeek(base: Date, offsetWeeks = 0): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - d.getDay() + offsetWeeks * 7);
  return d;
}

// Local formatting, never toISOString() — that converts to UTC and would
// shift the date back a day for the whole WIB morning.
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDayDate(d: Date): string {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long" });
}

export function formatRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = sameMonth
    ? start.getDate().toString()
    : start.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  const endLabel = end.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
  });
  return `${startLabel}-${endLabel}`;
}
