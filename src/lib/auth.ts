import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { timed } from "@/lib/perf";

export type SessionUser = { id: string; email: string | undefined };

export type UserWithRole = {
  user: SessionUser;
  role: "admin" | "pelatih" | "ortu" | undefined;
  fullName: string | undefined;
  title: string | undefined;
  active: boolean;
};

async function loadUserWithRole(verify: boolean): Promise<UserWithRole | null> {
  const supabase = await createClient();

  let user: SessionUser | null = null;
  if (verify) {
    // Round-trip to Supabase Auth: also rejects sessions revoked server-side.
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    if (u) user = { id: u.id, email: u.email };
  } else {
    // The project signs JWTs with an asymmetric (ES256) key, so getClaims()
    // verifies the signature and expiry locally against the cached JWKS —
    // no network round-trip on every render.
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (claims?.sub) user = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
  }
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name, title, active")
    .eq("id", user.id)
    .single();

  return {
    user,
    role: profile?.role as UserWithRole["role"],
    fullName: profile?.full_name as string | undefined,
    title: profile?.title as string | undefined,
    active: profile?.active !== false,
  };
}

/**
 * Session + profile for rendering. Memoised per request with React cache(),
 * so a layout and its page share ONE lookup instead of repeating it.
 */
export const getUserWithRole = cache(() => timed("auth:getUserWithRole", () => loadUserWithRole(false)));

/**
 * Same, but verified against Supabase Auth. Use for mutations (server
 * actions), where a session revoked elsewhere must not be able to write.
 */
export const getVerifiedUserWithRole = cache(() => timed("auth:getVerifiedUserWithRole", () => loadUserWithRole(true)));
