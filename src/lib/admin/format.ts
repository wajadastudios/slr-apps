import { DAYS } from "@/lib/days";

// "15:00:00" -> "15.00"
export function formatClock(time: string | null | undefined): string {
  if (!time) return "-";
  const [h = "00", m = "00"] = time.split(":");
  return `${h.padStart(2, "0")}.${m.padStart(2, "0")}`;
}

// 15.00-16.00
export function formatRange(start: string, minutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const end = h * 60 + m + minutes;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatClock(start)}-${pad(Math.floor(end / 60) % 24)}.${pad(end % 60)}`;
}

export function dayName(day: number): string {
  return DAYS[day] ?? "-";
}

export function coachName(p: { full_name: string; title?: string | null } | null | undefined): string {
  if (!p) return "-";
  return p.title ? `${p.title} ${p.full_name}` : p.full_name;
}

export type SlotFill = "penuh" | "hampir_penuh" | "terisi_sebagian" | "tersedia";

// 0 filled = Tersedia (never "hampir penuh" just because capacity is small,
// e.g. 0/1); full at capacity = Penuh; >= 80% filled = Hampir penuh;
// anything else in between = Terisi sebagian.
export function slotFill(filled: number, capacity: number): SlotFill {
  if (filled <= 0) return "tersedia";
  if (filled >= capacity) return "penuh";
  const percent = capacity > 0 ? filled / capacity : 0;
  if (percent >= 0.8) return "hampir_penuh";
  return "terisi_sebagian";
}

export const FILL_LABEL: Record<SlotFill, string> = {
  penuh: "Penuh",
  hampir_penuh: "Hampir penuh",
  terisi_sebagian: "Terisi sebagian",
  tersedia: "Tersedia",
};

// "12 Sep 2026, 15.30" in Jakarta time, for activity logs and follow-ups.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const date = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
  const time = d
    .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" })
    .replace(":", ".");
  return `${date}, ${time}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

export function rupiah(n: number | string): string {
  return `Rp${Number(n).toLocaleString("id-ID")}`;
}
