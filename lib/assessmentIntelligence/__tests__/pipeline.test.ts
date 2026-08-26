import assert from "node:assert/strict";
import {
  transcribeAndExtractAssessmentAudio,
  DEFAULT_DISPATCH_LIMIT,
  resolveSiteBaseUrl,
  pingStageWorker,
  STAGE_WORKER_BACKGROUND_PATH,
} from "../pipeline.ts";
import type { GeneratedDeployContext } from "../generatedDeployContext.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("PHI GATE: the automatic audio pipeline refuses a real session id when the PHI flag is not confirmed, before ever touching the database", async () => {
  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  // A syntactically-real-looking but nonexistent session id — if this test ever reached the
  // database layer it would need real Supabase credentials configured; it must not get there.
  const result = await transcribeAndExtractAssessmentAudio("00000000-0000-0000-0000-000000000000");
  assert.equal(result.phiGateBlocked, true);
  assert.match(result.error ?? "", /PHI processing is not confirmed/);
  assert.equal(result.draftFactCount, undefined, "must not have attempted extraction");
});

test("SYNTHETIC OVERRIDE: requesting it without PHI_SYNTHETIC_TEST_MODE set still refuses a real session id, before ever touching the database — the override is not a blanket bypass", async () => {
  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  delete process.env.PHI_SYNTHETIC_TEST_MODE;
  const result = await transcribeAndExtractAssessmentAudio("00000000-0000-0000-0000-000000000000", { syntheticTestOverride: true });
  assert.equal(result.phiGateBlocked, true);
});

// REGRESSION (2026-08-25 synthetic acceptance test): the first manual dispatch tick left a
// clean, newly-finished synthetic session completely untouched — not because anything failed,
// but because getSessionsEligibleForProcessing() orders eligible sessions oldest-`finished_at`
// -first with no other filtering, and 8 real, permanently-PHI-gate-blocked sessions (predating
// this gate) sat ahead of the synthetic session in that FIFO queue. With the previous default
// limit of 5, no number of dispatch ticks could ever have reached a 9th-or-later session — those
// 8 sessions never leave status='processing', so they are always re-selected first. This asserts
// only that the exported default stays comfortably above that known 8-session backlog, so a
// regression back to a too-small default (e.g. someone "simplifying" it back to 5) would be
// caught here rather than silently starving the next session behind a backlog again. The
// dispatcher/eligibility query itself is I/O (Supabase) and is live-verified, not unit-mocked
// here — matching this file's own PHI-gate tests above.
test("DEFAULT_DISPATCH_LIMIT stays comfortably above the known permanently-blocked-session backlog (8, as of the 2026-08-25 incident) so a newer/synthetic session is never starved behind it", () => {
  assert.ok(
    DEFAULT_DISPATCH_LIMIT > 8,
    `DEFAULT_DISPATCH_LIMIT (${DEFAULT_DISPATCH_LIMIT}) must exceed the known blocked-session backlog (8) or newer sessions can be starved indefinitely`
  );
});

// REGRESSION (2026-08-26 handoff-diagnosis fix): the first live run of the handoff diagnostic on a
// real Deploy Preview showed the dispatcher resolving to the PRODUCTION site's base URL — because
// the previous implementation read process.env.DEPLOY_PRIME_URL, which Netlify never actually
// forwards into a Function's runtime process.env (confirmed against Netlify's own docs — only
// URL/SITE_NAME/SITE_ID are runtime-available; see generatedDeployContext.ts). Every real
// invocation therefore silently fell through to process.env.URL, which Netlify defines as ALWAYS
// the site's production address regardless of deploy context. The fix removes that fallback
// entirely: resolveSiteBaseUrl() now resolves exclusively from a build-time-captured
// GeneratedDeployContext (injected here directly, never via process.env mutation, since real
// callers get it from the generated file instead).

function deployContext(overrides: Partial<GeneratedDeployContext>): GeneratedDeployContext {
  return { context: null, deployPrimeUrl: null, url: null, ...overrides };
}

test("resolveSiteBaseUrl resolves a Deploy Preview to ITS OWN deployPrimeUrl, never the production url", () => {
  const result = resolveSiteBaseUrl(
    deployContext({
      context: "deploy-preview",
      deployPrimeUrl: "https://deploy-preview-123--example.netlify.app",
      url: "https://example.netlify.app",
    })
  );
  assert.equal(result.baseUrl, "https://deploy-preview-123--example.netlify.app");
  assert.equal(result.source, "DEPLOY_PRIME_URL");
  assert.equal(result.deploymentContext, "deploy-preview");
  assert.equal(result.productionFallbackWarning, false);
});

// This is the core regression test for the actual incident: previously, an unset/unresolved
// DEPLOY_PRIME_URL meant silently using `url` instead (always production). Now it must fail
// closed — never fall back to `url` under any circumstance.
test("resolveSiteBaseUrl on a non-production deploy with no deployPrimeUrl captured FAILS CLOSED — never falls back to the production url", () => {
  const result = resolveSiteBaseUrl(
    deployContext({ context: "deploy-preview", deployPrimeUrl: null, url: "https://example.netlify.app" })
  );
  assert.equal(result.baseUrl, null);
  assert.equal(result.source, "none");
});

test("resolveSiteBaseUrl lets production resolve its own production deployPrimeUrl", () => {
  const result = resolveSiteBaseUrl(
    deployContext({ context: "production", deployPrimeUrl: "https://example.netlify.app", url: "https://example.netlify.app" })
  );
  assert.equal(result.baseUrl, "https://example.netlify.app");
  assert.equal(result.source, "DEPLOY_PRIME_URL");
  assert.equal(result.productionFallbackWarning, false);
});

test("resolveSiteBaseUrl reports 'none' with a null baseUrl and null deploymentContext when the generator never ran (local dev), rather than guessing", () => {
  const result = resolveSiteBaseUrl(deployContext({}));
  assert.equal(result.baseUrl, null);
  assert.equal(result.source, "none");
  assert.equal(result.deploymentContext, null);
});

test("resolveSiteBaseUrl raises productionFallbackWarning if a non-production deploy's own deployPrimeUrl ever matched production's url", () => {
  // Pathological/defensive case only — should never happen from a real Netlify build, since
  // deployPrimeUrl and url are distinct values for any real preview/branch deploy. Guards the
  // warning's own wiring, not a scenario expected to occur in practice.
  const result = resolveSiteBaseUrl(
    deployContext({ context: "branch-deploy", deployPrimeUrl: "https://example.netlify.app", url: "https://example.netlify.app" })
  );
  assert.equal(result.productionFallbackWarning, true);
});

test("STAGE_WORKER_BACKGROUND_PATH matches the deployed Background Function's actual route", () => {
  assert.equal(STAGE_WORKER_BACKGROUND_PATH, "/.netlify/functions/assessment-processing-stage-worker-background");
});

// REGRESSION: pingStageWorker() must fail with a clear, actionable reason — never attempt a
// network call — when either prerequisite is missing. These are exactly the two silent-no-op
// preconditions invokeStageWorker() already guarded; pingStageWorker() must guard them
// identically so the diagnostic can't itself produce a misleading "reached: true". Each test
// injects an explicit deploy context so only the one precondition under test is missing.
test("pingStageWorker refuses to attempt a network call when no site URL is resolvable", async () => {
  process.env.ASSESSMENT_PROCESSING_WORKER_SECRET = "test-secret";
  const result = await pingStageWorker(deployContext({ context: "deploy-preview", deployPrimeUrl: null }));
  assert.equal(result.reached, false);
  assert.match(result.error ?? "", /No site URL available/);
  delete process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
});

test("pingStageWorker refuses to attempt a network call when the worker secret is not configured", async () => {
  delete process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  const result = await pingStageWorker(
    deployContext({ context: "production", deployPrimeUrl: "https://example.netlify.app", url: "https://example.netlify.app" })
  );
  assert.equal(result.reached, false);
  assert.match(result.error ?? "", /Missing ASSESSMENT_PROCESSING_WORKER_SECRET/);
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
