import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Verifies the recovery/magiclink token server-side via verifyOtp(), which
// only needs the token_hash from the email link -- unlike the PKCE code
// exchange the client SDK does automatically, it does not require the
// browser that opens the link to be the same one that requested it. Email
// links are opened on a different device (phone mail app) far more often
// than not, so relying on PKCE here silently strands the user on the
// reset-password page forever with no session and no error shown.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // {{ .RedirectTo }} in the email template renders as the full absolute
      // URL originally passed to resetPasswordForEmail() (e.g.
      // "https://sarilesrenang.com/reset-password"), not a bare path -- so
      // prefixing it with `origin` again produced a mangled, unreachable
      // URL. Only fall back to origin-relative joining if `next` really is
      // just a path.
      const redirectUrl = /^https?:\/\//.test(next) ? next : `${origin}${next}`;
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      "Tautan reset password tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru."
    )}`
  );
}
