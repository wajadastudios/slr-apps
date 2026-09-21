import { dayName, formatClock } from "./format";

export type SlotLike = {
  id?: string;
  program_id: string;
  pelatih_id: string;
  location: string | null;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
};

export type SlotContext = SlotLike & {
  id: string;
  programName: string;
  pelatihName: string;
};

export type Conflict = {
  kind: "pelatih" | "duplicate" | "location" | "capacity" | "participant";
  // "block": cannot be saved. "warn": allowed after an explicit confirmation.
  severity: "block" | "warn";
  message: string;
};

export function minutesOf(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function overlaps(a: SlotLike, b: SlotLike): boolean {
  if (a.day_of_week !== b.day_of_week) return false;
  const aStart = minutesOf(a.start_time);
  const bStart = minutesOf(b.start_time);
  return aStart < bStart + b.duration_minutes && bStart < aStart + a.duration_minutes;
}

const sameText = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

// Everything that can be wrong with a slot before it is saved. Certain
// conflicts block; a shared pool is only a warning (several classes may share
// one pool) and needs an explicit confirmation.
export function checkSlot(
  candidate: SlotLike,
  others: SlotContext[],
  names: { programName: string; pelatihName: string },
  filledNow = 0
): Conflict[] {
  const out: Conflict[] = [];

  if (!Number.isInteger(candidate.capacity) || candidate.capacity < 1) {
    out.push({ kind: "capacity", severity: "block", message: "Kapasitas minimal 1 peserta." });
  } else if (candidate.capacity < filledNow) {
    out.push({
      kind: "capacity",
      severity: "block",
      message: `Kapasitas ${candidate.capacity} lebih kecil dari jumlah peserta saat ini (${filledNow}). Pindahkan peserta terlebih dahulu.`,
    });
  }

  const others2 = others.filter((o) => o.id !== candidate.id);

  for (const o of others2) {
    const identical =
      o.program_id === candidate.program_id &&
      o.pelatih_id === candidate.pelatih_id &&
      o.day_of_week === candidate.day_of_week &&
      minutesOf(o.start_time) === minutesOf(candidate.start_time) &&
      sameText(o.location, candidate.location);
    if (identical) {
      out.push({
        kind: "duplicate",
        severity: "block",
        message: `Slot yang sama sudah ada: ${o.programName} · ${dayName(o.day_of_week)} ${formatClock(o.start_time)} · ${o.location ?? "tanpa lokasi"}.`,
      });
    }
  }

  for (const o of others2) {
    if (o.pelatih_id === candidate.pelatih_id && overlaps(candidate, o)) {
      out.push({
        kind: "pelatih",
        severity: "block",
        message: `${names.pelatihName} sudah mengajar ${o.programName}${o.location ? ` di ${o.location}` : ""} pada ${dayName(o.day_of_week)} pukul ${formatClock(o.start_time)}.`,
      });
    }
  }

  for (const o of others2) {
    if (
      o.pelatih_id !== candidate.pelatih_id &&
      candidate.location &&
      sameText(o.location, candidate.location) &&
      overlaps(candidate, o)
    ) {
      out.push({
        kind: "location",
        severity: "warn",
        message: `${candidate.location} sudah dipakai ${o.programName} (${o.pelatihName}) pada ${dayName(o.day_of_week)} pukul ${formatClock(o.start_time)}. Lanjutkan hanya jika kolam memang cukup untuk dua kelas.`,
      });
    }
  }

  return out;
}

export const blocking = (c: Conflict[]) => c.filter((x) => x.severity === "block");
export const warnings = (c: Conflict[]) => c.filter((x) => x.severity === "warn");

// A participant cannot attend two overlapping classes.
export function participantConflicts(
  slot: SlotLike,
  participantName: string,
  theirSlots: SlotContext[]
): Conflict[] {
  return theirSlots
    .filter((o) => o.id !== slot.id && overlaps(slot, o))
    .map((o) => ({
      kind: "participant" as const,
      severity: "block" as const,
      message: `${participantName} sudah punya jadwal ${o.programName} pada ${dayName(o.day_of_week)} pukul ${formatClock(o.start_time)}.`,
    }));
}

// Slots that already overlap in today's data (legacy), for the dashboard.
export function existingConflicts(slots: SlotContext[]): { a: SlotContext; b: SlotContext; kind: "pelatih" | "location" }[] {
  const found: { a: SlotContext; b: SlotContext; kind: "pelatih" | "location" }[] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (!overlaps(a, b)) continue;
      if (a.pelatih_id === b.pelatih_id) found.push({ a, b, kind: "pelatih" });
      else if (a.location && sameText(a.location, b.location)) found.push({ a, b, kind: "location" });
    }
  }
  return found;
}
