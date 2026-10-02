import { test } from "node:test";
import assert from "node:assert/strict";
import { handleHealthRequest, type HealthDeps } from "../src/lib/health-check";

const SECRET = "test-secret-not-real";
const NOW = new Date("2026-10-02T01:00:00.000Z");

function req(auth?: string) {
  return new Request("https://example.test/api/health/supabase", {
    headers: auth === undefined ? {} : { authorization: auth },
  });
}

function deps(over: Partial<HealthDeps> = {}): HealthDeps & { calls: number } {
  const d = {
    secret: SECRET,
    now: () => NOW,
    calls: 0,
    probe: async () => {
      d.calls++;
      return { data: "ok", error: null };
    },
    ...over,
  };
  return d;
}

test("no Authorization header -> 401, database never touched", async () => {
  const d = deps();
  const res = await handleHealthRequest(req(), d);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(d.calls, 0);
});

test("wrong token / wrong scheme -> 403, database never touched", async () => {
  for (const auth of ["Bearer nope", `Bearer ${SECRET}x`, SECRET, `Basic ${SECRET}`, "Bearer "]) {
    const d = deps();
    const res = await handleHealthRequest(req(auth), d);
    assert.equal(res.status, 403, auth);
    assert.equal(d.calls, 0, auth);
  }
});

test("correct token -> 200 with only the documented fields", async () => {
  const d = deps();
  const res = await handleHealthRequest(req(`Bearer ${SECRET}`), d);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), {
    ok: true,
    service: "slr-app",
    database: "reachable",
    checkedAt: NOW.toISOString(),
  });
  assert.equal(d.calls, 1);
});

test("database error or throw -> 503 that leaks nothing", async () => {
  const leaky = "connection to db.secret-project.supabase.co refused: password authentication failed";
  const cases: Partial<HealthDeps>[] = [
    { probe: async () => ({ data: null, error: { message: leaky, code: "XX000" } }) },
    { probe: async () => { throw new Error(leaky); } },
    { probe: async () => ({ data: "something-else", error: null }) },
  ];
  for (const c of cases) {
    const res = await handleHealthRequest(req(`Bearer ${SECRET}`), deps(c));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const text = await res.text();
    assert.ok(!text.includes("secret-project") && !text.includes("password") && !text.includes(SECRET));
    assert.equal(JSON.parse(text).ok, false);
  }
});

test("secret not configured on the server -> refuses everything, even a matching-looking header", async () => {
  const d = deps({ secret: undefined });
  const res = await handleHealthRequest(req("Bearer "), d);
  assert.equal(res.status, 503);
  assert.equal(d.calls, 0);
  const res2 = await handleHealthRequest(req("Bearer undefined"), deps({ secret: "" }));
  assert.equal(res2.status, 503);
});
