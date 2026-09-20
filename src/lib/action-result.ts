// Shared (client + server) shape returned by every form-backed server action.
// `id` is unique per result so the UI can show exactly one toast per submit.
export type ActionResult = {
  ok: boolean;
  // ok: the success copy ("Laporan latihan berhasil disimpan")
  // !ok: a human-safe reason shown under "Data belum tersimpan"
  message: string;
  // Where the action wanted to send the user after it finished (only set
  // when that differs from staying on the current page).
  redirectTo?: string;
  id: string;
};

export type ActionState = ActionResult | null;

export const DEFAULT_SUCCESS_MESSAGE = "Data terbaru berhasil disimpan";
export const DEFAULT_ERROR_HINT = "Periksa kembali data yang diisi, lalu coba lagi.";

// Raw database / driver / framework messages are noise for a parent or admin;
// anything that looks technical is replaced by a generic hint.
const TECHNICAL =
  /violates|constraint|relation "|column "|PGRST|JWT|syntax|permission denied|row-level security|duplicate key|null value|invalid input|function .* does not exist|schema cache|Server Components render|digest/i;

export function isTechnicalMessage(raw: string): boolean {
  return TECHNICAL.test(raw);
}

export function toUserMessage(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  if (!text || TECHNICAL.test(text)) return DEFAULT_ERROR_HINT;
  return text;
}
