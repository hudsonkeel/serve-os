import { NextResponse } from "next/server";
import { advanceQueuedAssessmentProcessing } from "@/lib/assessmentIntelligence/pipeline";

// Assessment-processing background worker — the entry point netlify/functions/assessment-
// processing-stage-worker-background.mts forwards every request to unchanged (secret header and
// JSON body verbatim). See app/api/assessment-processing/dispatch/route.ts's header comment for
// why this logic lives here, inside Next's server runtime, rather than in the standalone .mts
// file itself: server-only-guarded application code (lib/assessmentIntelligence/pipeline.ts and
// everything under lib/data/*) throws at import time outside the "react-server" export
// condition, which only Next.js's own bundler sets -- never Netlify's generic function bundler.
// Mirrors app/api/intake/transcribe/route.ts's exact secret/body-parsing shape.
//
// Calls the exact same advanceQueuedAssessmentProcessing() -- claim, then the existing
// extraction pipeline, entirely unchanged -- no duplicated claim/extraction/conflict logic here.
// That function's own first statement already records the "worker_received" processing
// diagnostic stage, which is now genuinely the earliest point a session-scoped marker can be
// written safely: this route has already validated the shared secret and parsed/type-checked
// assessmentSessionId by the time it's called, so no separate pre-auth marker is needed or added
// here -- see the 2026-09-16 diagnostics-slice conversation for why an earlier marker isn't safe
// (a session id isn't known, and can't be associated with anything, before body parsing succeeds).

export async function POST(request: Request) {
  const secret = request.headers.get("x-assessment-worker-secret");
  if (!secret || secret !== process.env.ASSESSMENT_PROCESSING_WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { assessmentSessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  const assessmentSessionId = body.assessmentSessionId;
  if (!assessmentSessionId || typeof assessmentSessionId !== "string") {
    return NextResponse.json({ error: "Missing assessmentSessionId." }, { status: 400 });
  }

  const result = await advanceQueuedAssessmentProcessing(assessmentSessionId);
  console.log(`[assessment-processing-worker] ${assessmentSessionId}: ${result.outcome}${result.error ? ` — ${result.error}` : ""}`);
  return NextResponse.json({ ok: true, result });
}
