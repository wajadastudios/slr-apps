// Administrative acknowledgement shown when a program asks for one (Aquanatal).
// It is a plain confirmation, not a health questionnaire: the app never asks
// for or stores diagnoses. Bump the version when the wording changes.
export const ACK_VERSION = "aquanatal-2026-09b";
export const ACK_INTRO = "Aquanatal ditujukan untuk peserta hamil.";
export const ACK_STATEMENT =
  "Saya menyatakan peserta yang didaftarkan akan mengikuti proses administrasi dan arahan keselamatan sebelum kelas dimulai.";

export type Gender = "male" | "female" | "undisclosed";

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "Laki-laki" },
  { value: "female", label: "Perempuan" },
  { value: "undisclosed", label: "Memilih tidak menyebutkan" },
];

export function genderLabel(value: string | null | undefined): string {
  return GENDER_OPTIONS.find((g) => g.value === value)?.label ?? "Belum diisi";
}

export const RELATIONSHIPS = ["Pasangan", "Anak", "Orang tua", "Saudara", "Anggota keluarga lain"] as const;

export type ParticipantKind = "self" | "other";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Indonesian mobile numbers are kept as digits; a leading 0 becomes 62.
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (digits.startsWith("8")) digits = `62${digits}`;
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

// "Sabtu pagi · Kolam CDR" for the admin message; null when nothing was given.
export function preferenceSummary(schedule: string, location: string): string | null {
  const parts = [schedule.trim(), location.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// ---------- who is taking the class ----------
export type EnrollmentRequest = {
  for: ParticipantKind;
  program_id: string;
  // the participant (only for "other"; "self" uses the account's own profile)
  participant_name: string;
  participant_phone: string;
  birth_date: string | null;
  gender: Gender | null;
  relationship: string;
  preferred_schedule: string;
  preferred_location: string;
  acknowledged: boolean;
};

export function parseEnrollmentRequest(raw: {
  for?: unknown;
  program_id?: unknown;
  participant_name?: unknown;
  participant_phone?: unknown;
  birth_date?: unknown;
  gender?: unknown;
  relationship?: unknown;
  preferred_schedule?: unknown;
  preferred_location?: unknown;
  acknowledged?: unknown;
}): ParseResult<EnrollmentRequest> {
  const who = String(raw.for ?? "");
  if (who !== "self" && who !== "other") {
    return { ok: false, error: "Pilih siapa yang akan mengikuti kelas." };
  }

  const program_id = String(raw.program_id ?? "").trim();
  if (!program_id) return { ok: false, error: "Pilih program terlebih dahulu." };

  const genderRaw = String(raw.gender ?? "").trim();
  if (genderRaw && !GENDER_OPTIONS.some((g) => g.value === genderRaw)) {
    return { ok: false, error: "Jenis kelamin peserta tidak valid." };
  }
  const gender = (genderRaw || null) as Gender | null;

  const birth = String(raw.birth_date ?? "").trim();
  if (birth && (!DATE.test(birth) || Number.isNaN(Date.parse(birth)))) {
    return { ok: false, error: "Tanggal lahir tidak valid." };
  }

  let participant_name = "";
  let participant_phone = "";
  let relationship = "";

  if (who === "other") {
    participant_name = String(raw.participant_name ?? "").trim();
    const phone = normalizePhone(String(raw.participant_phone ?? ""));
    relationship = String(raw.relationship ?? "").trim();
    if (participant_name.length < 2) return { ok: false, error: "Nama lengkap peserta wajib diisi." };
    if (!phone) return { ok: false, error: "Nomor WhatsApp peserta tidak valid." };
    if (!relationship) return { ok: false, error: "Pilih hubungan peserta dengan Anda." };
    if (!gender) return { ok: false, error: "Pilih jenis kelamin peserta." };
    participant_phone = phone;
  }

  return {
    ok: true,
    value: {
      for: who,
      program_id,
      participant_name,
      participant_phone,
      birth_date: birth || null,
      gender,
      relationship,
      preferred_schedule: String(raw.preferred_schedule ?? "").trim().slice(0, 200),
      preferred_location: String(raw.preferred_location ?? "").trim().slice(0, 200),
      acknowledged: raw.acknowledged === "on" || raw.acknowledged === "true" || raw.acknowledged === true,
    },
  };
}

// A program may state who it is meant for (Aquanatal: pregnant participants).
// Only a clear mismatch is stopped; "undisclosed" and unknown go to admin
// review, so gender is never the sole eligibility rule.
export function programSuitsGender(
  intendedGender: "male" | "female" | null | undefined,
  gender: Gender | null | undefined
): boolean {
  if (!intendedGender || !gender || gender === "undisclosed") return true;
  return gender === intendedGender;
}

export function unsuitableProgramMessage(programName: string, who: ParticipantKind): string {
  return who === "self"
    ? `${programName} ditujukan untuk peserta hamil. Jika Anda mendaftarkan pasangan, pilih “Pasangan / anggota keluarga”.`
    : `${programName} ditujukan untuk peserta hamil. Periksa kembali jenis kelamin peserta, atau pilih program lain.`;
}

// Everything that can be checked about a request once the program is known.
// Run BEFORE an account is created, so a wrong choice never leaves a
// half-registered account behind.
export function checkRequestAgainstProgram(
  program: {
    name: string;
    active: boolean;
    self_registration: boolean;
    requires_acknowledgement: boolean;
    intended_gender?: "male" | "female" | null;
  } | null,
  request: Pick<EnrollmentRequest, "for" | "gender" | "acknowledged">
): string | null {
  if (!program || !program.active || !program.self_registration) {
    return "Program ini belum dibuka untuk pendaftaran mandiri.";
  }
  if (program.requires_acknowledgement && !request.acknowledged) {
    return "Mohon setujui pernyataan konfirmasi terlebih dahulu.";
  }
  if (!programSuitsGender(program.intended_gender, request.gender)) {
    return unsuitableProgramMessage(program.name, request.for);
  }
  return null;
}

// ---------- public account creation (adult registration page) ----------
export type AccountInput = { full_name: string; email: string; password: string; phone: string };

export function parseAccountInput(raw: {
  full_name?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  website?: unknown; // honeypot: humans leave it empty
}): ParseResult<AccountInput> {
  if (String(raw.website ?? "").trim() !== "") {
    return { ok: false, error: "Pendaftaran tidak dapat diproses." };
  }
  const full_name = String(raw.full_name ?? "").trim();
  const email = String(raw.email ?? "").trim().toLowerCase();
  const password = String(raw.password ?? "");
  const phone = normalizePhone(String(raw.phone ?? ""));

  if (full_name.length < 2) return { ok: false, error: "Nama lengkap Anda wajib diisi." };
  if (!EMAIL.test(email)) return { ok: false, error: "Email tidak valid." };
  if (password.length < 8) return { ok: false, error: "Password minimal 8 karakter." };
  if (!phone) return { ok: false, error: "Nomor WhatsApp Anda tidak valid." };
  return { ok: true, value: { full_name, email, password, phone } };
}
