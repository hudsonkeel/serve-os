import { advanceQueuedAssessmentProcessing } from "../../lib/assessmentIntelligence/pipeline.ts";

// Background Function = bounded extraction worker (2026-09-16 async extraction queue). Invoked
// exclusively by assessment-processing-dispatcher.mts (the scheduled dispatcher) — never
// directly by a browser, and never by anything without the shared secret below.
//
// Declared as a background function via `config.background = true` — the HTTP request that
// invokes this gets an immediate ~202 acknowledgment while this handler keeps running for up to
// 15 minutes, long enough for one real extraction call plus draft-fact/conflict-detection
// writes. advanceQueuedAssessmentProcessing() performs exactly one session's worth of work and
// returns; it never loops or polls.
//
// Whatever this handler returns is NOT delivered back to its caller — Netlify has already closed
// that connection with the 202 by the time this finishes. The response body exists only for
// Netlify's own function logs; the session's real, durable outcome is only ever visible via its
// own DB row (and from there, the UI).
//
// SECURITY: netlify/functions/*.mts endpoints are reachable over plain HTTP at
// /.netlify/functions/<name> — nothing about being a "background" function makes that URL
// private. This function is the one place in the queue that spends real provider-call money, so
// it refuses any request that doesn't present the same shared secret the dispatcher was
// configured with (ASSESSMENT_PROCESSING_WORKER_SECRET) — mirrors the existing
// app/api/intake/transcribe/route.ts webhook secret pattern.
//
// Modeled on feature/assessment-aws-transcription-pipeline's equivalent stage worker (a general
// Netlify-Functions lesson, not anything AWS-specific) — this version has no processing_stage or
// job-id handling because extraction is one bounded step, not a resumable multi-tick job.

const handler = async (req: Request): Promise<Response> => {
  const providedSecret = req.headers.get("x-assessment-worker-secret");
  const expectedSecret = process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: { assessmentSessionId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Malformed JSON body." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const assessmentSessionId = body.assessmentSessionId;
  if (!assessmentSessionId || typeof assessmentSessionId !== "string") {
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
