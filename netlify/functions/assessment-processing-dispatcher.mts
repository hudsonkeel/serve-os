import { dispatchEligibleAssessmentProcessing } from "../../lib/assessmentIntelligence/pipeline.ts";

// Scheduled Function = dispatcher only (2026-09-16 async extraction queue). Netlify Scheduled
// Functions have a documented hard execution limit far shorter than a real provider call could
// take, so this function must never itself run extraction — it only recovers stuck sessions and
// finds newly-queued work, then fires an async invocation of
// assessment-processing-stage-worker-background.mts for each, via
// dispatchEligibleAssessmentProcessing(). That invocation resolves as soon as the background
// function acknowledges receipt (Netlify's background-function ~202 behavior), not after
// extraction actually finishes, so this stays comfortably fast regardless of how long any
// individual session's provider call takes.
//
// Modeled on feature/assessment-aws-transcription-pipeline's equivalent dispatcher (a general
// Netlify-Functions lesson, not anything AWS-specific) and this repo's own existing
// axiscare-scheduled-sync.mts for the schedule-config convention.
//
// IDEMPOTENCY: safe to run concurrently with itself, and safe to over-dispatch a session that's
// already being worked on by a still-running background invocation — see the conditional-update
// claim in claimSessionForProcessing() (lib/data/assessmentIntelligence.ts) for why a duplicate
// dispatch never causes duplicate extraction work.

const handler = async (): Promise<Response> => {
  try {
    const results = await dispatchEligibleAssessmentProcessing();
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

// Every 2 minutes — frequent enough that a normal assessment's processing starts and finishes
// well within the visit, infrequent enough to stay cheap. Standard cron syntax, evaluated in UTC
// by Netlify. Scheduled Functions only run automatically in the production context — see
// resolveSiteBaseUrl()'s own comment on why that's also true of the base-URL this dispatcher
// resolves for its own background-worker calls.
export const config = {
  schedule: "*/2 * * * *",
};
