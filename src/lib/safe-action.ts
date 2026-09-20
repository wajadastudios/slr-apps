import "server-only";
import { unstable_rethrow } from "next/navigation";
import {
  DEFAULT_ERROR_HINT,
  DEFAULT_SUCCESS_MESSAGE,
  isTechnicalMessage,
  type ActionResult,
  type ActionState,
} from "@/lib/action-result";

// Query flags that only exist so a page can show its own inline "saved"
// banner after a redirect. The toast replaces them, so they are dropped from
// the redirect target instead of producing a second confirmation.
const FLASH_PARAMS = [
  "saved",
  "rate_saved",
  "account_updated",
  "child_added",
  "diajukan",
];

function friendlyError(raw: string): string {
  if (!raw) return DEFAULT_ERROR_HINT;
  if (isTechnicalMessage(raw)) {
    console.error("[action] technical error hidden from UI:", raw);
    return DEFAULT_ERROR_HINT;
  }
  return raw;
}

function readRedirectUrl(err: unknown): string | null {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) return null;
  // NEXT_REDIRECT;<type>;<url>;<status>;
  const parts = digest.split(";");
  return parts.slice(2, -2).join(";") || null;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ok(message: string, redirectTo?: string): ActionResult {
  return { ok: true, message, redirectTo, id: newId() };
}

function fail(message: string, redirectTo?: string): ActionResult {
  return { ok: false, message: friendlyError(message), redirectTo, id: newId() };
}

type Impl = (formData: FormData) => Promise<void>;

/**
 * Wraps a redirect-style server action so callers get a structured result
 * instead of a navigation:
 *  - `redirect("/x?error=...")`  -> { ok: false, message }
 *  - any other `redirect(...)`   -> { ok: true }, plus the target if the
 *                                   page should actually move
 *  - normal return               -> { ok: true }
 *  - thrown error                -> { ok: false }
 * The wrapped action can be used as `useActionState`'s reducer
 * `(prevState, formData)`; it also tolerates being called with just a
 * FormData.
 */
export function safeAction(impl: Impl, successMessage: string = DEFAULT_SUCCESS_MESSAGE) {
  return async (prevOrForm: unknown, maybeForm?: FormData): Promise<ActionState> => {
    const formData = maybeForm instanceof FormData ? maybeForm : (prevOrForm as FormData);

    try {
      await impl(formData);
      return ok(successMessage);
    } catch (err) {
      const target = readRedirectUrl(err);
      if (target === null) {
        // notFound(), dynamic-rendering signals etc. must keep propagating.
        unstable_rethrow(err);
        if (err instanceof Error && err.message === "Unauthorized") {
          return fail("Anda tidak memiliki akses untuk melakukan aksi ini.");
        }
        console.error("[action] unexpected error:", err);
        return fail("");
      }

      const url = new URL(target, "http://local");

      if (url.pathname.startsWith("/login")) {
        return fail("Sesi Anda berakhir. Silakan masuk kembali.", target);
      }

      const errorParam = url.searchParams.get("error");
      if (errorParam) return fail(errorParam);

      for (const key of FLASH_PARAMS) url.searchParams.delete(key);
      const cleaned = `${url.pathname}${url.search}`;
      return ok(successMessage, cleaned);
    }
  };
}
