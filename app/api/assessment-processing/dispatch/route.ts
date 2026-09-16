import { NextResponse } from "next/server";
import { dispatchEligibleAssessmentProcessing } from "@/lib/assessmentIntelligence/pipeline";

// Assessment-processing dispatch — the scheduled/manual entry point. Server-to-server only,
// mirrors app/api/axiscare/scheduled-sync/route.ts's exact pattern (shared-secret header,
// POST-only, no cookie/session auth).
//
// Exists so netlify/functions/assessment-processing-dispatcher.mts (a standalone Netlify
// Function, bundled by Netlify's generic esbuild-based function bundler) never has to import
// lib/assessmentIntelligence/pipeline.ts -- or anything under lib/data/* -- directly. Those
// modules are "server-only"-guarded (see lib/data/assessmentIntelligence.ts's first import), and
// the `server-only` package only resolves to its no-op stub under the "react-server" export
// condition, which Next.js sets and Netlify's function bundler does not. Importing it from a
// standalone .mts function throws at MODULE LOAD TIME, before the handler is ever invoked --
// invisible to a Background/Scheduled Function's caller, since Netlify's 202 acknowledgment
// already went out before the container tries to load the crashing code. (Root-caused 2026-09-16:
// all 11 sessions dispatched during the first live branch-deploy test reached
// "invocation_accepted" and got no further -- see processing_diagnostic_stage on
// intake_assessment_sessions, and this route's sibling app/api/assessment-processing/worker/
// route.ts for the background-worker half of the same fix.)
//
// This route runs inside Next's own server runtime, where the "react-server" condition is set
// correctly, so calling the real logic here (over one HTTP hop from the .mts file) is what
// actually works. Calls the exact same dispatchEligibleAssessmentProcessing() the admin manual
// trigger (lib/actions/assessmentProcessingAdmin.ts) already calls directly -- no separate
// dispatch-specific logic lives here or there.

export async function POST(request: Request) {
  const secret = request.headers.get("x-assessment-worker-secret");
  if (!secret || secret !== process.env.ASSESSMENT_PROCESSING_WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const results = await dispatchEligibleAssessmentProcessing();
  const dispatched = results.filter((r) => r.dispatched).length;
  const failedToDispatch = results.length - dispatched;

  // Per-session detail (including each DispatchOutcome's own `error`, which can carry a raw
  // fetch/network message) stays server-side in the log line only -- the response returned to
  // the calling .mts wrapper is a safe, operational-only summary, never the raw per-session
  // outcome objects.
  for (const r of results.filter((r) => !r.dispatched)) {
    console.error(`[assessment-processing-dispatch] failed to dispatch ${r.assessmentSessionId}: ${r.error}`);
  }
  if (results.length > 0) {
    console.log(
      `[assessment-processing-dispatch] ${results.length} session(s) eligible, ${dispatched} dispatched, ${failedToDispatch} failed to dispatch.`
    );
  }

  return NextResponse.json({ ok: true, considered: results.length, dispatched, failedToDispatch });
}
