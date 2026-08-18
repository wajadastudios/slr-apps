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
      const url = request.nextUrl.clone();
      url.pathname = "/login";
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
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("nonaktif", "1");
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = home ?? "/";
    return NextResponse.redirect(url);
  }

  if (isProtected && (!home || !pathname.startsWith(home))) {
    const url = request.nextUrl.clone();
    url.pathname = home ?? "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
