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

export type SlotFill = "penuh" | "hampir_penuh" | "tersedia";

// Full at capacity, "almost full" when at most one seat (or a fifth of the
// seats) is left.
export function slotFill(filled: number, capacity: number): SlotFill {
  if (filled >= capacity) return "penuh";
  const left = capacity - filled;
  if (left <= 1 || left / capacity <= 0.2) return "hampir_penuh";
  return "tersedia";
}

export const FILL_LABEL: Record<SlotFill, string> = {
  penuh: "Penuh",
  hampir_penuh: "Hampir penuh",
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
