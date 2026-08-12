import { NextResponse } from "next/server";
import { transcribeAndExtractAssessmentAudio } from "@/lib/assessmentIntelligence/pipeline";

// Service-to-service receiver for the captured-audio pipeline. Called by serve-intake-mvp's
// netlify/functions/intake-finish.js immediately after it marks an assessment session's audio
// as fully uploaded — the automatic trigger for "captured audio -> transcription -> transcript
// segments -> the existing extraction pipeline" (docs/architecture/
// AUDIO_TRANSCRIPTION_PIPELINE.md). Never called from a browser: verified via a shared secret,
// matching the exact pattern already established at app/api/intake/process/route.ts.
//
// This route deliberately calls transcribeAndExtractAssessmentAudio() directly (a plain
// function, not a "use server" action) rather than anything requiring a human Serve OS session
// — there is no such session in a webhook call from another site. The PHI governance gate
// (lib/assessmentIntelligence/phiGovernance.ts) is enforced inside that function, not here.

export async function POST(request: Request) {
  const secret = request.headers.get("x-intake-transcribe-secret");
  if (!secret || secret !== process.env.INTAKE_TRANSCRIBE_WEBHOOK_SECRET) {
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

  const result = await transcribeAndExtractAssessmentAudio(assessmentSessionId);

  // A PHI-gate block or a missing/not-yet-uploaded source are expected, recorded outcomes, not
  // transport failures — respond 200 so the caller (intake-finish.js) doesn't treat this as a
  // reason to retry or fail the user-facing Finish response. Genuine errors are still visible
  // in result.error either way.
  return NextResponse.json(result);
}
