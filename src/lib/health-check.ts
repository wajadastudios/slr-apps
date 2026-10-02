import { createHash, timingSafeEqual } from "node:crypto";

// Everything the /api/health/supabase route decides lives here, with the
// secret and the database call injected, so it can be unit-tested without a
// real Supabase project and without ever touching a real secret.

const SERVICE = "slr-app";

export type HealthDeps = {
  // value of SLR_HEALTHCHECK_SECRET (server-side env); undefined = not set up
  secret: string | undefined;
  // calls the health_check() database function; resolves to the Supabase
  // { data, error } shape, throws on network failure
  probe: () => Promise<{ data: unknown; error: unknown }>;
  now?: () => Date;
};

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

// Hash both sides first so the comparison is constant-time even when the
// lengths differ.
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function handleHealthRequest(request: Request, deps: HealthDeps): Promise<Response> {
  const checkedAt = (deps.now?.() ?? new Date()).toISOString();

  // Not configured: refuse everything rather than run unauthenticated. The
  // body is the same generic shape as an outage, so it says nothing about why.
  if (!deps.secret) {
    return json(503, { ok: false, service: SERVICE, database: "unreachable", checkedAt });
  }

  const header = request.headers.get("authorization");
  if (!header) {
    return json(401, { ok: false, error: "unauthorized" }, { "WWW-Authenticate": "Bearer" });
  }
  const match = /^Bearer (.+)$/.exec(header);
  if (!match || !secretMatches(match[1], deps.secret)) {
    return json(403, { ok: false, error: "forbidden" });
  }

  try {
    const { data, error } = await deps.probe();
    if (error || data !== "ok") {
      // never echo the database error to the caller
      console.error("[health] database check failed");
      return json(503, { ok: false, service: SERVICE, database: "unreachable", checkedAt });
    }
    return json(200, { ok: true, service: SERVICE, database: "reachable", checkedAt });
  } catch {
    console.error("[health] database check threw");
    return json(503, { ok: false, service: SERVICE, database: "unreachable", checkedAt });
  }
}
