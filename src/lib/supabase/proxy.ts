import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { REMEMBER_COOKIE_NAME } from "@/lib/supabase/remember";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // "Remember me" enforcement. `@supabase/ssr` forces its own session
  // cookie to live ~400 days on every write, so that cookie alone can't
  // tell a "keep me signed in" session from a "sign out when the browser
  // closes" one — see the note in `remember.ts`. Our first-party marker
  // cookie carries that distinction instead: if a Supabase session exists
  // but the marker is gone, the browser was closed without "remember me",
  // so sign out here and let the redirect logic in `src/proxy.ts` treat
  // this request as logged-out.
  if (user && !request.cookies.get(REMEMBER_COOKIE_NAME)) {
    await supabase.auth.signOut();
    return { response, user: null, supabase };
  }

  return { response, user, supabase };
}
