// Scheduled Function = cron trigger only, and NOTHING else (rewritten 2026-09-16 — see below for
// why). This file must import nothing from lib/ or any other application module. Netlify's
// function bundler (generic esbuild, no framework awareness) never sets the "react-server" export
// condition Next.js relies on for server-only-guarded code to resolve to its no-op stub --
// importing lib/assessmentIntelligence/pipeline.ts (or anything under lib/data/*) here throws at
// MODULE LOAD TIME, before the handler function is ever created. That crash is invisible to this
// function's own caller (Netlify's own scheduler): a Background/Scheduled Function's 202
// acknowledgment goes out before the container tries to load the crashing code.
//
// PROVEN LIVE: the previous version of this file (which imported dispatchEligibleAssessmentProcessing
// from pipeline.ts directly) was root-caused this way after the first live branch-deploy dispatch
// test showed all 11 eligible sessions reaching processing_diagnostic_stage='invocation_accepted'
// and never any further -- see assessment-processing-stage-worker-background.mts's identical
// history for the background-worker half of the same bug, and
// app/api/assessment-processing/dispatch/route.ts for where the real logic now lives.
//
// All real work -- recover stale sessions, find newly-queued work, invoke the background worker
// per session -- lives entirely in app/api/assessment-processing/dispatch/route.ts
// (dispatchEligibleAssessmentProcessing() in lib/assessmentIntelligence/pipeline.ts), the exact
// same code path the admin manual trigger (lib/actions/assessmentProcessingAdmin.ts) already
// calls directly from within Next's own server runtime. This file never duplicates that logic --
// it only calls it over HTTP, mirroring netlify/functions/axiscare-scheduled-sync.mts's
// already-proven-in-production pattern exactly.
const handler = async (): Promise<Response> => {
  const secret = process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  if (!secret) {
    console.error("[assessment-processing-dispatcher] ASSESSMENT_PROCESSING_WORKER_SECRET is not set — skipping this run.");
    return new Response("ASSESSMENT_PROCESSING_WORKER_SECRET is not configured.", { status: 500 });
  }

  // Netlify injects URL (the site's primary production URL) into every function automatically.
  // Scheduled Functions only ever fire in the production context (Netlify does not run them
  // automatically on branch/preview deploys), so -- unlike the background worker's own wrapper,
  // which can be invoked from any deploy context and resolves its base URL differently -- the
  // production URL is always the correct target here. Mirrors axiscare-scheduled-sync.mts's
  // identical choice, for the identical reason.
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!baseUrl) {
    console.error("[assessment-processing-dispatcher] No site URL available from the Netlify runtime environment.");
    return new Response("No site URL available.", { status: 500 });
  }

  const response = await fetch(`${baseUrl}/api/assessment-processing/dispatch`, {
    method: "POST",
    headers: { "x-assessment-worker-secret": secret },
  });

  const body = await response.text();
  console.log(`[assessment-processing-dispatcher] ${response.status} ${body}`);

  return new Response(body, { status: response.status, headers: { "content-type": "application/json" } });
};

export default handler;

// Every 2 minutes — see the previous version of this file's identical comment for why this
// cadence. Unchanged by this rewrite.
export const config = {
  schedule: "*/2 * * * *",
};
