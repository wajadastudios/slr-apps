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
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as string | undefined;
  const home = role ? ROLE_HOME[role] : undefined;

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
