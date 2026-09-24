import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const ROLE_HOME: Record<string, string> = {
  admin: "/admin",
  pelatih: "/pelatih",
  ortu: "/ortu",
};

const PROTECTED_PREFIXES = ["/admin", "/pelatih", "/ortu"];

export async function proxy(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user) {
    if (isProtected) {
      // Carries the full original path+query as ?next=, which the login
      // page's own client-side handler already reads and returns to after
      // sign-in (see src/app/login/page.tsx) -- without this, the original
      // destination is lost the moment the user is bounced to /login.
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
    return response;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, active")
    .eq("id", user.id)
    .single();

  const role = profile?.role as string | undefined;
  const home = role ? ROLE_HOME[role] : undefined;

  // A deactivated account keeps a valid Supabase session, so the block has
  // to live here rather than at sign-in. /login stays reachable so they can
  // actually see why they are locked out.
  if (profile?.active === false) {
    if (pathname === "/login") return response;
    const url = new URL("/login", request.url);
    url.searchParams.set("nonaktif", "1");
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    // Already signed in: honor ?next= if it points back into this account's
    // own area (never off to another role's pages, never off-site), else
    // fall back to the role home -- same destination the login page's own
    // client-side redirect would have picked, for the case this route is
    // hit directly (e.g. a stale bookmark) rather than through the form.
    const next = request.nextUrl.searchParams.get("next");
    const safeNext = next && home && next.startsWith(home) ? next : null;
    const url = new URL(safeNext ?? home ?? "/", request.url);
    return NextResponse.redirect(url);
  }

  if (isProtected && (!home || !pathname.startsWith(home))) {
    const url = new URL(home ?? "/login", request.url);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
