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
// ToastForm's catch block (src/components/ui/toast-form.tsx) hits this when
// the browser's fetch for the Server Action itself fails or the server
// returns something that isn't a valid action response -- e.g. a request
// rejected at the hosting platform's own body-size limit (Vercel enforces
// ~4.5MB on serverless functions regardless of Next's own
// serverActions.bodySizeLimit) before the action ever runs, or a genuine
// connectivity drop. This never reaches safeAction's own try/catch, since
// that only wraps the action's execution on the server.
const NETWORK_ERROR_HINT =
  "Koneksi ke server terputus atau lampiran terlalu besar. Periksa koneksi internet, kecilkan ukuran foto/video jika ada, lalu coba simpan lagi.";

// Raw database / driver / framework messages are noise for a parent or admin;
// anything that looks technical is replaced by a generic hint.
const TECHNICAL =
  /violates|constraint|relation "|column "|PGRST|JWT|syntax|permission denied|row-level security|duplicate key|null value|invalid input|function .* does not exist|schema cache|Server Components render|digest/i;

// The browser/React runtime's own error text when a Server Action's request
// or response couldn't be completed -- never a message our own code wrote,
// so never in Indonesian and never something a validation-error branch would
// use "unexpected response", "failed to fetch", "network error", etc.
const NETWORK_LEVEL =
  /unexpected response|failed to fetch|network error|network request failed|load failed|ECONNRESET|ETIMEDOUT|body exceeded|payload too large|request entity too large/i;

export function isTechnicalMessage(raw: string): boolean {
  return TECHNICAL.test(raw);
}

export function toUserMessage(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  if (!text) return DEFAULT_ERROR_HINT;
  if (NETWORK_LEVEL.test(text)) return NETWORK_ERROR_HINT;
  if (TECHNICAL.test(text)) return DEFAULT_ERROR_HINT;
  return text;
}
