// Background Function = the real worker. Imports lib/assessmentIntelligence/backgroundCore/
// directly and runs advanceQueuedAssessmentProcessing() in-process -- no HTTP callback, no
// Route Handler, no siteBaseUrl.
//
// HISTORY -- three architecture changes to get here, each proven or disproven by a live test:
//
// 1. (2026-09-16) Originally imported advanceQueuedAssessmentProcessing from
//    lib/assessmentIntelligence/pipeline.ts directly. Crashed at MODULE LOAD TIME: Netlify's
//    function bundler never sets the "react-server" export condition Next.js relies on for
//    `server-only` (pipeline.ts's own top-level import, and lib/data/assessmentIntelligence.ts's
//    transitively) to resolve to its no-op stub -- proven live when all 11 sessions in the first
//    dispatch test reached 'invocation_accepted' and no further.
//
// 2. (2026-09-16/17) Fixed by routing through a Next.js Route Handler instead
//    (app/api/assessment-processing/worker/route.ts): this file became a thin fetch()-only
//    forwarder with zero lib/ imports, calling back into the site's own Next.js runtime over
//    HTTP. This stopped the crash but introduced a new failure: THREE separate live tests (each
//    after a different attempted fix -- missing error handling, then req.url-based origin
//    guessing replaced with a build-time-captured siteBaseUrl) all showed the exact same
//    symptom -- the outbound fetch to /api/assessment-processing/worker never resolved or
//    rejected, for at least 60+ seconds, across every attempt. Investigation found a
//    Netlify-staff-confirmed platform behavior (loop/self-invocation detection for same-site
//    function-to-function HTTP calls) consistent with, though not proven identical to, this
//    exact symptom -- see the 2026-09-17 investigation for the full writeup. No live test ever
//    got this same-site callback to complete successfully.
//
// 3. (2026-09-17, this version) Root cause of #1 addressed properly instead of routed around:
//    lib/assessmentIntelligence/backgroundCore/ now holds advanceQueuedAssessmentProcessing()
//    and its entire dependency graph (Supabase data access, provider selection, both extraction
//    providers) with NO `import "server-only"` and NO React/Next dependency -- safe to import
//    from any Node runtime, including this one. This file goes back to calling it directly,
//    in-process, exactly like attempt #1, except this time the import doesn't crash. Eliminates
//    the same-site HTTP hop that #2 never got working, without giving up the extended ~15-minute
//    Background Function execution budget a real OpenAI/Bedrock extraction call needs. See
//    lib/assessmentIntelligence/backgroundCore/dataAccess.ts's header comment for the full
//    rationale behind the module split itself.
//
// SECURITY: netlify/functions/*.mts endpoints are reachable over plain HTTP at
// /.netlify/functions/<name> -- nothing about being a "background" function makes that URL
// private. This function is the one place in the queue that spends real provider-call money, so
// it refuses any request that doesn't present the same shared secret the dispatcher was
// configured with (ASSESSMENT_PROCESSING_WORKER_SECRET) -- validated here, first, before
// anything else runs. Never logs or otherwise exposes either the expected or provided secret
// value.
//
// Still declared `config.background = true` -- the real reason this needs the extended
// execution budget (one real OpenAI/Bedrock extraction call plus draft-fact/conflict-detection
// writes) is unchanged from the very first version of this file.
import { advanceQueuedAssessmentProcessing } from "../../lib/assessmentIntelligence/backgroundCore/processingCore.ts";

function parseSessionId(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { assessmentSessionId?: unknown };
    return typeof parsed.assessmentSessionId === "string" ? parsed.assessmentSessionId : null;
  } catch {
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  const providedSecret = req.headers.get("x-assessment-worker-secret");
  const expectedSecret = process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const assessmentSessionId = parseSessionId(rawBody);
  if (!assessmentSessionId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing assessmentSessionId." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await advanceQueuedAssessmentProcessing(assessmentSessionId);
    console.log(`[assessment-processing-stage-worker] ${assessmentSessionId}: ${result.outcome}${result.error ? ` — ${result.error}` : ""}`);
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    console.error(`[assessment-processing-stage-worker] ${assessmentSessionId} threw an unhandled error`, err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export default handler;

export const config = {
  background: true,
};
