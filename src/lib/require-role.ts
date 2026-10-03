import "server-only";
import { redirect } from "next/navigation";
import { getUserWithRole, type UserWithRole } from "@/lib/auth";

/**
 * Guard for a role area's layout. Replaces the per-request role lookup the
 * proxy used to do: the layout loads the profile anyway (memoised, shared
 * with the page), so the check costs no extra round-trip.
 *
 *  - not signed in        → /login
 *  - deactivated account  → /login?nonaktif=1 (the login page explains why)
 *  - another role's area  → /login, which the proxy sends to the user's own home
 */
export async function requireRole(role: NonNullable<UserWithRole["role"]>): Promise<UserWithRole> {
  const session = await getUserWithRole();
  if (!session) redirect("/login");
  if (!session.active) redirect("/login?nonaktif=1");
  if (session.role !== role) redirect("/login");
  return session;
}
