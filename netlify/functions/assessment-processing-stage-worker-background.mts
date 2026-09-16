// Background Function = thin forwarding shim only (rewritten 2026-09-16 — see below for why).
// This file must import nothing from lib/ or any other application module. Netlify's function
// bundler (generic esbuild, no framework awareness) never sets the "react-server" export
// condition Next.js relies on for server-only-guarded code to resolve to its no-op stub --
// importing lib/assessmentIntelligence/pipeline.ts (or anything under lib/data/*) here throws at
// MODULE LOAD TIME, before the handler function is ever created. That crash is invisible to this
// function's own caller: a Background Function's ~202 acknowledgment goes out before the
// container tries to load the crashing code, so the dispatcher genuinely cannot tell the
// difference between "the worker is running" and "the worker crashed on import" from the HTTP
// response alone.
//
// PROVEN LIVE: the previous version of this file (which imported advanceQueuedAssessmentProcessing
// from pipeline.ts directly) was root-caused this way after the first live branch-deploy dispatch
// test showed all 11 eligible sessions reaching processing_diagnostic_stage='invocation_accepted'
// (proving this endpoint DID receive and accept every invocation) and never any further -- zero
// reached 'worker_received', zero were claimed, processing_attempt_count stayed 0 for all of
// them. Confirmed via direct reproduction: dynamically importing lib/assessmentIntelligence/
// pipeline.ts outside the "react-server" condition throws exactly this package's error
// ("This module cannot be imported from a Client Component module...") at import time.
//
// All real work -- claim the session, run the existing extraction pipeline -- lives entirely in
// app/api/assessment-processing/worker/route.ts (advanceQueuedAssessmentProcessing() in
// lib/assessmentIntelligence/pipeline.ts). This file only forwards the incoming request one more
// HTTP hop, unchanged (secret header and JSON body verbatim) -- it does not read, validate, or
// duplicate the shared-secret check itself; that stays the Route Handler's sole responsibility so
// there is exactly one place authorization is decided. Mirrors netlify/functions/
// axiscare-scheduled-sync.mts's already-proven-in-production pattern.
//
// Still declared `config.background = true` -- identical 202/fire-and-forget/15-minute semantics
// as before; only what runs inside changed.
const handler = async (req: Request): Promise<Response> => {
  // Resolved from the incoming request's own origin, not an env var. Unlike the scheduled
  // dispatcher (which only ever fires in production), this endpoint is invoked from whichever
  // deploy context dispatched it -- production eventually via the real scheduled dispatcher, but
  // also a branch/preview deploy via the admin manual trigger, which already resolves the correct
  // per-deploy base URL (lib/assessmentIntelligence/pipeline.ts's resolveSiteBaseUrl()) before
  // invoking this function. Reusing whatever host this request itself arrived on guarantees the
  // follow-up fetch stays on that same deploy, without this file needing to re-derive deploy
  // context itself -- which it structurally cannot do without importing lib/ code (see above).
  const baseUrl = new URL(req.url).origin;
  const incomingSecret = req.headers.get("x-assessment-worker-secret") ?? "";
  const rawBody = await req.text();

  const response = await fetch(`${baseUrl}/api/assessment-processing/worker`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-assessment-worker-secret": incomingSecret },
    body: rawBody,
  });

  const responseBody = await response.text();
  console.log(`[assessment-processing-stage-worker] ${response.status} ${responseBody}`);

  return new Response(responseBody, { status: response.status, headers: { "content-type": "application/json" } });
};

export default handler;

export const config = {
  background: true,
};
