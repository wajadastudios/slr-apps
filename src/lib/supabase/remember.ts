/**
 * First-party "remember me" marker cookie.
 *
 * `@supabase/ssr`'s browser storage hard-overrides the session cookie's
 * `Max-Age` back to its own ~400-day default on every write (see
 * `storage.setItem` in the library), so the Supabase auth cookie itself
 * can't be used to distinguish "keep me signed in" from "sign me out when
 * the browser closes" — it always behaves like the former.
 *
 * This marker cookie tracks that choice instead: a long-lived cookie when
 * the user opts in at login, a true session cookie (no Max-Age) otherwise.
 * It carries no secret, just a boolean flag, so it doesn't need to be
 * `httpOnly` — `updateSession()` in `proxy.ts` reads it server-side on every
 * request and signs the user out if a Supabase session exists without it.
 */
export const REMEMBER_COOKIE_NAME = "slr_remember";

// Matches the ~400-day lifetime `@supabase/ssr` forces on its own cookie,
// so "remember me" genuinely persists as long as the underlying session can.
const REMEMBER_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Client-side only — call after a successful sign-in. */
export function setRememberCookie(remember: boolean) {
  if (typeof document === "undefined") return;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = remember ? `; Max-Age=${REMEMBER_MAX_AGE_SECONDS}` : "";
  document.cookie = `${REMEMBER_COOKIE_NAME}=1; Path=/; SameSite=Lax${maxAge}${secure}`;
}

/** Client-side only — call on logout so a stale marker doesn't linger. */
export function clearRememberCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${REMEMBER_COOKIE_NAME}=; Path=/; Max-Age=0`;
}
