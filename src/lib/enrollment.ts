import { DAYS } from "@/lib/days";

export type EnrollmentStatus =
  | "pending_review"
  | "waiting_schedule"
  | "schedule_offered"
  | "scheduled"
  | "active"
  | "cancelled"
  | "rejected";

export const LIVE_STATUSES: EnrollmentStatus[] = [
  "pending_review",
  "waiting_schedule",
  "schedule_offered",
  "scheduled",
  "active",
];

// Only these unlock reports, progress, records and the class schedule.
export function hasClassAccess(status: EnrollmentStatus): boolean {
  return status === "scheduled" || status === "active";
}

export function isLive(status: EnrollmentStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

export const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  pending_review: "Menunggu ditinjau",
  waiting_schedule: "Menunggu jadwal",
  schedule_offered: "Jadwal ditawarkan",
  scheduled: "Jadwal terkonfirmasi",
  active: "Aktif",
  cancelled: "Dibatalkan",
  rejected: "Tidak dapat dilanjutkan",
};

// Badge colours (text always accompanies the colour).
export const STATUS_TONE: Record<EnrollmentStatus, string> = {
  pending_review: "bg-[#FFF3C4] text-[#7a5c00]",
  waiting_schedule: "bg-[#FFF3C4] text-[#7a5c00]",
  schedule_offered: "bg-[#DFF3FF] text-[#0b5f8a]",
  scheduled: "bg-[#DDF7EE] text-[#0f6b52]",
  active: "bg-[#DDF7EE] text-[#0f6b52]",
  cancelled: "bg-slate-200 text-slate-600",
  rejected: "bg-slate-200 text-slate-600",
};

// What the participant reads while the class is not active yet.
export function participantStatusCopy(
  status: EnrollmentStatus,
  programName: string
): { title: string; body: string } {
  switch (status) {
    case "pending_review":
      return {
        title: "Pendaftaran diterima",
        body: `Admin sedang meninjau pendaftaran ${programName} Anda dan akan menghubungi Anda melalui WhatsApp.`,
      };
    case "waiting_schedule":
      return {
        title: "Menunggu jadwal",
        body: "Admin sedang mencarikan jadwal yang sesuai dan akan menghubungi Anda melalui WhatsApp.",
      };
    case "schedule_offered":
      return {
        title: "Jadwal ditawarkan",
        body: "Admin sudah menyiapkan jadwal untuk Anda. Silakan periksa dan pilih setuju atau belum cocok.",
      };
    case "scheduled":
      return {
        title: "Jadwal terkonfirmasi",
        body: "Jadwal kelas Anda sudah dikunci. Sampai bertemu di kelas!",
      };
    case "active":
      return { title: "Kelas aktif", body: "Kelas Anda sedang berjalan." };
    case "cancelled":
      return { title: "Pendaftaran dibatalkan", body: "Pendaftaran ini sudah dibatalkan." };
    case "rejected":
      return {
        title: "Pendaftaran tidak dapat dilanjutkan",
        body: "Silakan hubungi admin untuk informasi lebih lanjut.",
      };
  }
}

// ---------- admin transitions ----------
const ADMIN_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  pending_review: ["waiting_schedule", "schedule_offered", "rejected", "cancelled"],
  waiting_schedule: ["schedule_offered", "rejected", "cancelled"],
  schedule_offered: ["waiting_schedule", "cancelled"],
  scheduled: ["active", "cancelled"],
  active: ["cancelled"],
  cancelled: [],
  rejected: [],
};

export function adminCanMove(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
  return ADMIN_TRANSITIONS[from].includes(to);
}

export function adminMoves(from: EnrollmentStatus): EnrollmentStatus[] {
  return ADMIN_TRANSITIONS[from];
}

// A participant may withdraw until the class actually runs.
export function participantCanCancel(status: EnrollmentStatus): boolean {
  return ["pending_review", "waiting_schedule", "schedule_offered", "scheduled"].includes(status);
}

// ---------- capacity ----------
export function remainingSeats(capacity: number, filled: number): number {
  return Math.max(0, capacity - filled);
}

export type OfferOutcome = "accepted" | "declined" | "slot_full" | "expired" | "not_pending" | "not_found";

export function offerOutcomeMessage(outcome: string): { ok: boolean; message: string } {
  switch (outcome as OfferOutcome) {
    case "accepted":
      return { ok: true, message: "Jadwal berhasil dikonfirmasi. Sampai bertemu di kelas!" };
    case "declined":
      return {
        ok: true,
        message: "Baik, terima kasih. Admin akan mencarikan jadwal lain dan menghubungi Anda melalui WhatsApp.",
      };
    case "slot_full":
      return {
        ok: false,
        message:
          "Mohon maaf, jadwal ini baru saja terisi. Pendaftaran Anda tetap tersimpan dan admin akan menawarkan jadwal lain melalui WhatsApp.",
      };
    case "expired":
      return {
        ok: false,
        message:
          "Penawaran jadwal ini sudah berakhir. Admin akan menghubungi Anda kembali untuk jadwal yang baru.",
      };
    case "not_pending":
      return { ok: false, message: "Penawaran jadwal ini sudah tidak berlaku." };
    default:
      return { ok: false, message: "Link penawaran tidak ditemukan." };
  }
}

// Which enrollment a page should show: the one named in ?program=, else a
// class-accessible one, else the newest live one.
export function pickEnrollment<T extends { program_id: string; status: EnrollmentStatus; created_at?: string }>(
  enrollments: T[],
  programParam: string | undefined
): T | null {
  const live = enrollments.filter((e) => isLive(e.status));
  if (live.length === 0) return null;
  const named = programParam ? live.find((e) => e.program_id === programParam) : undefined;
  if (named) return named;
  return (
    live.find((e) => e.status === "active") ??
    live.find((e) => e.status === "scheduled") ??
    [...live].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0]
  );
}

// ---------- WhatsApp copy ----------
export function slotDescription(slot: { day_of_week: number; start_time: string }): string {
  return `${DAYS[slot.day_of_week]} · ${slot.start_time.slice(0, 5).replace(":", ".")}`;
}

export function adminNewRegistrationMessage(input: {
  program: string;
  name: string;
  phone: string | null;
  preferred: string | null;
  link: string;
}): string {
  return [
    `Pendaftar baru — ${input.program}`,
    "",
    `Nama: ${input.name}`,
    `WhatsApp: ${input.phone || "-"}`,
    `Program: ${input.program}`,
    ...(input.preferred ? [`Pilihan jadwal/lokasi: ${input.preferred}`] : []),
    "",
    `Lihat Pendaftar: ${input.link}`,
  ].join("\n");
}

export function scheduleOfferMessage(input: {
  name: string;
  program: string;
  slot: { day_of_week: number; start_time: string; location: string | null };
  link: string;
}): string {
  return [
    `Halo ${input.name}, admin Sari Les Renang sudah menyiapkan jadwal untuk Anda.`,
    "",
    `Program: ${input.program}`,
    `Jadwal: ${slotDescription(input.slot)}`,
    `Lokasi: ${input.slot.location || "-"}`,
    "",
    `Silakan setujui jadwal melalui link berikut: ${input.link}`,
  ].join("\n");
}

export function scheduleConfirmedMessage(input: {
  program: string;
  slot: { day_of_week: number; start_time: string; location: string | null };
}): string {
  return [
    "Halo, jadwal kelas Anda sudah dikonfirmasi.",
    "",
    `Program: ${input.program}`,
    `Jadwal: ${slotDescription(input.slot)}`,
    `Lokasi: ${input.slot.location || "-"}`,
    "",
    "Sampai bertemu di kelas!",
  ].join("\n");
}
