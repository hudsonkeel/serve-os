import type { Config } from "@netlify/functions";
import { advanceAssessmentProcessing } from "../../lib/assessmentIntelligence/pipeline.ts";

// Background Function = bounded stage worker (2026-08-15 hardening pass — see
// docs/architecture/ASSESSMENT_TRANSCRIPTION_ORCHESTRATION.md). Invoked exclusively by
// assessment-processing-dispatcher.ts (the scheduled dispatcher) or the admin-only manual
// trigger (lib/actions/assessmentProcessingAdmin.ts) — never directly by a browser, and never by
// anything without the shared secret below.
//
// Declared as a background function explicitly via `config.background = true` below (the
// current Netlify-recommended approach) rather than relying on the legacy "-background" filename
// suffix convention — Netlify docs confirm the suffix still works, but new functions should
// prefer the explicit config declaration. The filename here still happens to end in
// "-background" (preserved on purpose so the route, /.netlify/functions/
// assessment-processing-stage-worker-background, stays byte-for-byte identical for the
// dispatcher and everything else that references it) but that substring carries no special
// meaning to Netlify anymore — `config.background` is what actually declares the behavior now.
//
// Either way, the platform behavior is the same: the HTTP request that invokes this gets an
// immediate ~202 acknowledgment while this handler keeps running for up to 15 minutes — long
// enough for one real stage (audio assembly + S3 staging + starting one AWS Transcribe job; a
// single Transcribe completion check + transcript persistence; or one Bedrock extraction call),
// never for polling a job to completion. advanceAssessmentProcessing() itself still never
// sleeps/loops waiting on AWS — it performs at most one stage transition (or falls straight into
// extraction once a transcript is freshly available in the same invocation, since extraction is
// one fast provider call, not a long-running external job) and returns.
//
// Whatever this handler returns is NOT delivered back to its caller — Netlify has already closed
// that connection with the 202 by the time this finishes. The response body here exists only for
// Netlify's own function logs; the session's real, durable outcome is only ever visible via its
// own DB row (and from there, the UI) — never via this response.
//
// SECURITY: netlify/functions/*.ts endpoints are reachable over plain HTTP at
// /.netlify/functions/<name> — nothing about being a "background" function makes that URL
// private. This function performs the one place in the native capture pipeline that spends real
// AWS calls and money, so it refuses any request that doesn't present the same shared secret the
// dispatcher was configured with (ASSESSMENT_PROCESSING_WORKER_SECRET) — mirrors the existing
// app/api/intake/transcribe/route.ts webhook secret pattern exactly.

const handler = async (req: Request): Promise<Response> => {
  const providedSecret = req.headers.get("x-assessment-worker-secret");
  const expectedSecret = process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: { assessmentSessionId?: string; ping?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Malformed JSON body." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Side-effect-free probe path for the admin-only handoff diagnostic
  // (checkAssessmentDispatchHandoff() / pingStageWorker() in pipeline.ts) — reaches this point
  // only after the secret check above has already passed, so a real response here is genuine
  // proof the shared secret matched, which the dispatcher's own fire-and-forget invocation can
  // never observe (see pingStageWorker()'s own comment on why a bare 2xx isn't proof of that).
  // Never calls advanceAssessmentProcessing() and never touches any session.
  if (body.ping === true) {
    return new Response(JSON.stringify({ ok: true, pong: true }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const assessmentSessionId = body.assessmentSessionId;
  if (!assessmentSessionId || typeof assessmentSessionId !== "string") {
    return new Response(JSON.stringify({ ok: false, error: "Missing assessmentSessionId." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await advanceAssessmentProcessing(assessmentSessionId);
    console.log(
      `[assessment-processing-stage-worker] ${assessmentSessionId}: ${result.outcome}${result.stage ? ` (${result.stage})` : ""}${result.error ? ` — ${result.error}` : ""}`
    );
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

// The current, recommended way to declare a background function — see the comment at the top of
// this file. Same 202/fire-and-forget/15-minute semantics as the legacy filename-suffix
// convention this replaces.
export const config: Config = {
  background: true,
};
