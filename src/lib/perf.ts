// Opt-in performance logging (set PERF_LOG=1). Off by default and in every
// normal deployment. Logs only timings and the Supabase endpoint/table name —
// never query strings, request/response bodies, tokens, or user data.

const enabled = process.env.PERF_LOG === "1";
// Measurement aid only: adds this much latency to every Supabase request to
// emulate an app server that is far from the database region. Requires
// PERF_LOG=1, so it can never be active in a normal deployment.
const simulatedRtt = enabled ? Number(process.env.PERF_SIMULATE_RTT_MS ?? 0) : 0;

function label(input: RequestInfo | URL): string {
  try {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    // /rest/v1/students -> rest:students, /auth/v1/user -> auth:user, rpc kept by name
    const p = url.pathname.replace(/^\/(rest|auth|storage)\/v1\//, "$1:");
    return p.replace(/\/[0-9a-f-]{36}.*/i, "/:id");
  } catch {
    return "unknown";
  }
}

/** fetch wrapper for Supabase clients: logs "[perf] supabase <where> <endpoint> <status> <ms>". */
export function timedFetch(where: string): typeof fetch | undefined {
  if (!enabled) return undefined;
  return async (input, init) => {
    const start = performance.now();
    if (simulatedRtt > 0) await new Promise((r) => setTimeout(r, simulatedRtt));
    const res = await fetch(input, init);
    const ms = performance.now() - start;
    console.log(`[perf] ${Date.now()} supabase ${where} ${(init?.method ?? "GET").toUpperCase()} ${label(input)} ${res.status} ${ms.toFixed(0)}ms`);
    return res;
  };
}

/** Time an async step: "[perf] <name> <ms>". Pass-through when disabled. */
export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`[perf] ${Date.now()} step ${name} ${(performance.now() - start).toFixed(0)}ms`);
  }
}
