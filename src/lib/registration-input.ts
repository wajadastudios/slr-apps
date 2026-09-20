// Administrative acknowledgement shown when a program asks for one (Aquanatal).
// It is a plain confirmation, not a health questionnaire: the app never asks
// for or stores diagnoses. Bump the version when the wording changes.
export const ACK_VERSION = "aquanatal-2026-09";
export const ACK_STATEMENTS = [
  "Saya memahami Aquanatal adalah aktivitas kebugaran air berdampak rendah, bukan terapi atau layanan medis.",
  "Saya akan menyampaikan kepada instruktur bila merasa tidak nyaman, dan mengikuti arahan instruktur selama sesi.",
  "Bila saya memiliki kondisi khusus, saya akan berkonsultasi terlebih dahulu dengan dokter atau tenaga kesehatan.",
];

export type AdultRegistrationInput = {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  program_id: string;
  preferred_schedule: string;
  preferred_location: string;
  acknowledged: boolean;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Indonesian mobile numbers are kept as digits; a leading 0 becomes 62.
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (digits.startsWith("8")) digits = `62${digits}`;
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

export function parseAdultRegistration(raw: {
  full_name?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  program_id?: unknown;
  preferred_schedule?: unknown;
  preferred_location?: unknown;
  acknowledged?: unknown;
  website?: unknown; // honeypot: humans leave it empty
}): ParseResult<AdultRegistrationInput> {
  if (String(raw.website ?? "").trim() !== "") {
    return { ok: false, error: "Pendaftaran tidak dapat diproses." };
  }

  const full_name = String(raw.full_name ?? "").trim();
  const email = String(raw.email ?? "").trim().toLowerCase();
  const password = String(raw.password ?? "");
  const phone = normalizePhone(String(raw.phone ?? ""));
  const program_id = String(raw.program_id ?? "").trim();

  if (full_name.length < 2) return { ok: false, error: "Nama lengkap wajib diisi." };
  if (!EMAIL.test(email)) return { ok: false, error: "Email tidak valid." };
  if (password.length < 8) return { ok: false, error: "Password minimal 8 karakter." };
  if (!phone) return { ok: false, error: "Nomor WhatsApp tidak valid." };
  if (!program_id) return { ok: false, error: "Pilih program terlebih dahulu." };

  return {
    ok: true,
    value: {
      full_name,
      email,
      password,
      phone,
      program_id,
      preferred_schedule: String(raw.preferred_schedule ?? "").trim().slice(0, 200),
      preferred_location: String(raw.preferred_location ?? "").trim().slice(0, 200),
      acknowledged: raw.acknowledged === "on" || raw.acknowledged === "true" || raw.acknowledged === true,
    },
  };
}

// "Sabtu pagi · Kolam CDR" for the admin message; null when nothing was given.
export function preferenceSummary(schedule: string, location: string): string | null {
  const parts = [schedule.trim(), location.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
