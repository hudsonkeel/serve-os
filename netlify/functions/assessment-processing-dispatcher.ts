import type { Config } from "@netlify/functions";
import { dispatchEligibleAssessmentProcessing } from "../../lib/assessmentIntelligence/pipeline.ts";

// Scheduled Function = dispatcher only (2026-08-15 hardening pass — see
// docs/architecture/ASSESSMENT_TRANSCRIPTION_ORCHESTRATION.md). Netlify Scheduled Functions have
// a documented hard 30-second execution limit, so this function must never itself perform
// potentially long-running assessment work (audio assembly, S3 staging, an AWS Transcribe or
// Bedrock call) — it only finds eligible sessions and fires an async invocation of
// assessment-processing-stage-worker-background.ts for each, via
// dispatchEligibleAssessmentProcessing(). That invocation resolves as soon as the background
// function acknowledges receipt (Netlify's background-function ~202 behavior), not after the
// actual stage work finishes, so this function comfortably stays well under 30 seconds
// regardless of how long any individual session's AWS work takes.
//
// This supersedes the earlier single-function design (assessment-processing-worker.ts, now
// removed) which called advanceAssessmentProcessing() directly, in a loop, inside the scheduled
// function itself — correct in isolation but not safe against Netlify's real execution limit for
// a stage that can involve ffmpeg assembly + an S3 upload + starting an AWS Transcribe job.
//
// IDEMPOTENCY: safe to run concurrently with itself, and safe to over-dispatch a session that's
// already being worked on by a still-running background invocation — see
// dispatchEligibleAssessmentProcessing()'s and the background stage worker's own claim/lease
// logic (lib/assessmentIntelligence/pipeline.ts, lib/data/assessmentIntelligence.ts) for why a
// duplicate dispatch never causes duplicate AWS work.

const handler = async (): Promise<Response> => {
  try {
    const results = await dispatchEligibleAssessmentProcessing(5);
    const dispatched = results.filter((r) => r.dispatched).length;
    const failed = results.filter((r) => !r.dispatched).length;
    if (results.length > 0) {
      console.log(`[assessment-processing-dispatcher] tick: ${results.length} session(s) eligible, ${dispatched} dispatched, ${failed} failed to dispatch.`);
      for (const r of results.filter((r) => !r.dispatched)) {
        console.error(`[assessment-processing-dispatcher] failed to dispatch ${r.assessmentSessionId}: ${r.error}`);
      }
    }
    return new Response(JSON.stringify({ ok: true, considered: results.length, results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[assessment-processing-dispatcher] tick failed", err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export default handler;

// Every 2 minutes — frequent enough that a normal 10-30 minute assessment's processing starts
// and finishes well within the visit, infrequent enough to stay cheap. Standard cron syntax,
// evaluated in UTC by Netlify. Deploy Previews do not run scheduled functions automatically —
// see the admin-only manual trigger (lib/actions/assessmentProcessingAdmin.ts) for exercising
// this same dispatch path on a preview.
export const config: Config = {
  schedule: "*/2 * * * *",
};
