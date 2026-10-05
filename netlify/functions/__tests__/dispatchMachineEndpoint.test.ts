import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isPublicPath, PUBLIC_PATHS } from "../../../lib/auth/publicPaths.ts";
import { isAuthorizedWorkerSecret } from "../../../lib/assessmentIntelligence/processingQueue.ts";

// Merge-readiness B2 regression: production's scheduled dispatcher POSTs (no cookies, shared
// secret header) to /api/assessment-processing/dispatch. The sign-in proxy didn't list that path,
// so every run was 307-redirected to /login, fetch followed it, and the login page's markup was
// logged as the "result" — the dispatch route never ran. These tests pin all three halves: the
// proxy lets the machine endpoint through, the route's own secret check still refuses anything
// else, and the dispatcher only ever accepts a JSON response (never follows a redirect).

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const codeOf = (rel: string) =>
  readFileSync(join(repoRoot, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ─── proxy ────────────────────────────────────────────────────────────────────────────────────

test("proxy permits the dispatch machine endpoint without a user session (no /login redirect)", () => {
  assert.equal(isPublicPath("/api/assessment-processing/dispatch"), true);
});

test("the exemption is exact — it does not open other assessment-processing paths or user pages", () => {
  assert.equal(isPublicPath("/api/assessment-processing"), false);
  assert.equal(isPublicPath("/api/assessment-processing/dispatcher"), false);
  assert.equal(isPublicPath("/api/assessment-processing/worker"), false);
  assert.equal(isPublicPath("/residents"), false);
  assert.equal(isPublicPath("/settings"), false);
  assert.equal(isPublicPath("/api/axiscare/clients"), false);
});

test("existing public paths are unchanged", () => {
  for (const p of ["/login", "/forgot-password", "/reset-password", "/get-started", "/careers", "/api/intake", "/api/axiscare/scheduled-sync"]) {
    assert.ok(PUBLIC_PATHS.includes(p), p);
  }
  assert.equal(PUBLIC_PATHS.length, 8);
});

test("STATIC: proxy.ts uses the shared public-path list and lets public paths through before any cookie check", () => {
  const proxy = codeOf("proxy.ts");
  assert.match(proxy, /import \{ isPublicPath \} from "@\/lib\/auth\/publicPaths";/);
  assert.ok(!/const PUBLIC_PATHS/.test(proxy), "no second, divergent list in proxy.ts");
  const body = proxy.split("export async function proxy")[1];
  const pub = body.indexOf("if (isPublicPath(pathname))");
  assert.ok(pub > 0 && pub < body.indexOf("redirectToLogin(request)"));
  assert.match(body.slice(pub, pub + 120), /return NextResponse\.next\(\);/);
});

// ─── route authorization ──────────────────────────────────────────────────────────────────────

test("route secret check: missing or incorrect worker secret is rejected", () => {
  assert.equal(isAuthorizedWorkerSecret(null, "s3cret"), false, "missing header");
  assert.equal(isAuthorizedWorkerSecret("", "s3cret"), false, "empty header");
  assert.equal(isAuthorizedWorkerSecret("wrong", "s3cret"), false, "wrong secret");
  assert.equal(isAuthorizedWorkerSecret("s3cret ", "s3cret"), false, "not trimmed/fuzzy");
  assert.equal(isAuthorizedWorkerSecret("s3cret", "s3cret"), true);
});

test("route secret check fails closed when the secret isn't configured", () => {
  assert.equal(isAuthorizedWorkerSecret("anything", undefined), false);
  assert.equal(isAuthorizedWorkerSecret("", ""), false);
  assert.equal(isAuthorizedWorkerSecret(undefined, undefined), false);
});

test("STATIC: the dispatch route refuses (401 JSON) before dispatching, and answers JSON", () => {
  const route = codeOf("app/api/assessment-processing/dispatch/route.ts");
  const post = route.split("export async function POST")[1];
  const check = post.indexOf('isAuthorizedWorkerSecret(request.headers.get("x-assessment-worker-secret"), process.env.ASSESSMENT_PROCESSING_WORKER_SECRET)');
  assert.ok(check > 0, "uses the shared secret check on the worker-secret header");
  assert.ok(check < post.indexOf("dispatchEligibleAssessmentProcessing("), "authorization precedes any dispatch");
  assert.match(post.slice(check, check + 300), /return NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\);/);
  assert.match(post, /return NextResponse\.json\(\{ ok: true, considered:/);
  assert.match(route, /^export async function POST/m);
  assert.ok(!/export async function GET/.test(route), "POST-only");
});

// ─── scheduled dispatcher ─────────────────────────────────────────────────────────────────────

type FetchCall = { url: string; init: RequestInit };
async function runDispatcher(respond: (call: FetchCall) => Response): Promise<{ response: Response; calls: FetchCall[]; logs: string[] }> {
  const calls: FetchCall[] = [];
  const logs: string[] = [];
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const realError = console.error;
  process.env.ASSESSMENT_PROCESSING_WORKER_SECRET = "test-worker-secret";
  process.env.URL = "https://serve.example.test";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  console.log = (...a: unknown[]) => void logs.push(a.join(" "));
  console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  try {
    const mod = await import("../assessment-processing-dispatcher.mts");
    const response = await mod.default();
    return { response, calls, logs };
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
    console.error = realError;
  }
}

test("scheduled dispatch calls the machine route with the secret and never follows redirects", async () => {
  const { calls } = await runDispatcher(() => Response.json({ ok: true, considered: 0, dispatched: 0, failedToDispatch: 0 }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://serve.example.test/api/assessment-processing/dispatch");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal((calls[0].init.headers as Record<string, string>)["x-assessment-worker-secret"], "test-worker-secret");
});

test("scheduled dispatch receives and returns the route's JSON", async () => {
  const { response } = await runDispatcher(() => Response.json({ ok: true, considered: 0, dispatched: 0, failedToDispatch: 0 }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, considered: 0, dispatched: 0, failedToDispatch: 0 });
});

test("a login redirect or HTML page is reported as a failure — never logged or returned as the dispatch result", async () => {
  const LOGIN_HTML = "<!DOCTYPE html><html><title>Sign in</title>LOGIN_PAGE_MARKER</html>";
  for (const make of [
    () => new Response(null, { status: 307, headers: { location: "https://serve.example.test/login?next=%2Fapi%2Fassessment-processing%2Fdispatch" } }),
    () => new Response(LOGIN_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
  ]) {
    const { response, logs } = await runDispatcher(make);
    assert.equal(response.status, 502);
    const body = (await response.json()) as { ok: boolean };
    assert.equal(body.ok, false);
    assert.ok(!logs.join("\n").includes("LOGIN_PAGE_MARKER"), "page markup is never logged");
    assert.ok(logs.some((l) => l.includes("did not return JSON")));
  }
});

test("the route's 401 JSON (wrong secret) passes through as 401, not as success", async () => {
  const { response } = await runDispatcher(() => Response.json({ error: "Unauthorized." }, { status: 401 }));
  assert.equal(response.status, 401);
});

let passed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
