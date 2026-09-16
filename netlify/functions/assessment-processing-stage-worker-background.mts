// Background Function = thin forwarding shim only. This file must import nothing from lib/ or
// any other application module. Netlify's function bundler (generic esbuild, no framework
// awareness) never sets the "react-server" export condition Next.js relies on for
// server-only-guarded code to resolve to its no-op stub -- importing
// lib/assessmentIntelligence/pipeline.ts (or anything under lib/data/*) here throws at MODULE
// LOAD TIME, before the handler function is ever created. That crash is invisible to this
// function's own caller: a Background Function's ~202 acknowledgment goes out before the
// container tries to load the crashing code, so the dispatcher genuinely cannot tell the
// difference between "the worker is running" and "the worker crashed on import" from the HTTP
// response alone.
//
// PROVEN LIVE (2026-09-16): the original version of this file (which imported
// advanceQueuedAssessmentProcessing from pipeline.ts directly) was root-caused this way after the
// first live branch-deploy dispatch test showed all 11 eligible sessions reaching
// processing_diagnostic_stage='invocation_accepted' and never any further. Fixed in commit
// ef4cdfc by rewriting this file as a thin forwarder with zero lib/ imports (see
// app/api/assessment-processing/worker/route.ts for where the real logic now lives).
//
// PROVEN LIVE (2026-09-17, first round): a second live dispatch test again showed all 11
// sessions reaching 'invocation_accepted' and none reaching 'worker_received'. Root-caused to
// this file having ZERO error handling and ZERO observability of its own. Fixed by adding
// try/catch and a 'worker_wrapper_started' diagnostic stage (commit ab8c642).
//
// PROVEN LIVE (2026-09-17, second round): a THIRD live dispatch test showed all 11 sessions
// reaching 'worker_wrapper_started' and STILL none reaching 'worker_received', with no way to
// tell whether the outbound fetch ever completed. Root cause: `new URL(req.url).origin` is
// undocumented for a Background Function's actual asynchronous execution -- Netlify's own docs
// don't confirm it reflects the original public request. Fixed by having the dispatcher side
// (lib/assessmentIntelligence/pipeline.ts's invokeStageWorker(), which already resolves the
// correct build-time-captured base URL via resolveSiteBaseUrl()/GENERATED_DEPLOY_CONTEXT) pass
// that exact value along as `siteBaseUrl` in the request body, so this file never has to guess.
//
// TRUST BOUNDARY (2026-09-17, third round, before this fix ever deployed): this endpoint is
// public -- reachable at /.netlify/functions/<name> by anyone, not just the real dispatcher (see
// the SECURITY note below). Once `siteBaseUrl` became a body-supplied outbound fetch
// destination, an unauthenticated caller could have turned this function into an arbitrary
// HTTPS fetch/proxy by supplying their own siteBaseUrl. Fixed by validating the shared secret
// here, in this file, BEFORE the body is even read -- not just downstream in the Route Handler.
// The two checks now protect different boundaries: this one stops the background endpoint
// itself from being abused as a proxy; the Route Handler's own check (unchanged) protects the
// real processing action. Neither replaces the other.
//
// SECURITY: netlify/functions/*.mts endpoints are reachable over plain HTTP at
// /.netlify/functions/<name> -- nothing about being a "background" function makes that URL
// private.
//
// All real work -- claim the session, run the existing extraction pipeline -- still lives
// entirely in app/api/assessment-processing/worker/route.ts. That route still independently
// validates the same shared secret; this file's own check does not remove or weaken it.
//
// Still declared `config.background = true` -- identical 202/fire-and-forget/15-minute semantics
// as before; only what runs inside changed.

// Best-effort, wrapper-side diagnostic writer. Deliberately uses a raw PostgREST PATCH (the same
// REST API lib/supabase/server.ts's createServerClient() ultimately talks to) rather than
// importing @supabase/supabase-js or any lib/ helper -- this file's only dependency surface is
// the Fetch API already used below. Never throws: a diagnostic write failing must never be the
// reason the real forwarding attempt does or doesn't happen. `wrapperFetchStatus` is always
// either null or a bounded HTTP status integer -- never a response body, exception message, URL,
// header, or provider error.
async function recordWrapperDiagnosticStage(
  assessmentSessionId: string,
  stage: "worker_wrapper_started" | "worker_wrapper_fetch_failed",
  wrapperFetchStatus: number | null = null
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
    await fetch(`${supabaseUrl}/rest/v1/intake_assessment_sessions?id=eq.${encodeURIComponent(assessmentSessionId)}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        processing_diagnostic_stage: stage,
        processing_diagnostic_stage_at: new Date().toISOString(),
        processing_diagnostic_wrapper_fetch_status: wrapperFetchStatus,
      }),
    });
  } catch (err) {
    console.error(`[assessment-processing-stage-worker] recordWrapperDiagnosticStage(${stage}) failed`, err);
  }
}

function parseIncomingBody(rawBody: string): { assessmentSessionId: string | null; siteBaseUrl: string | null } {
  try {
    const parsed = JSON.parse(rawBody) as { assessmentSessionId?: unknown; siteBaseUrl?: unknown };
    return {
      assessmentSessionId: typeof parsed.assessmentSessionId === "string" ? parsed.assessmentSessionId : null,
      siteBaseUrl: typeof parsed.siteBaseUrl === "string" ? parsed.siteBaseUrl : null,
    };
  } catch {
    return { assessmentSessionId: null, siteBaseUrl: null };
  }
}

// Only https absolute URLs are trusted -- not a full untrusted-input hardening pass (the secret
// check above already establishes this request is from the real dispatcher), just a cheap
// sanity check against something malformed making it into a fetch() target.
function isPlausibleSiteBaseUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  // Authenticate first, before reading the body or touching siteBaseUrl at all -- see the TRUST
  // BOUNDARY note above. An unauthenticated request gets a flat 401 and nothing else happens: no
  // body read, no diagnostic write, no outbound fetch. Never logs either secret's value.
  const providedSecret = req.headers.get("x-assessment-worker-secret");
  const expectedSecret = process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const { assessmentSessionId, siteBaseUrl } = parseIncomingBody(rawBody);

  if (assessmentSessionId) {
    await recordWrapperDiagnosticStage(assessmentSessionId, "worker_wrapper_started");
  }

  if (!siteBaseUrl || !isPlausibleSiteBaseUrl(siteBaseUrl)) {
    console.error("[assessment-processing-stage-worker] No usable siteBaseUrl in the request body -- refusing to guess a destination.");
    if (assessmentSessionId) {
      await recordWrapperDiagnosticStage(assessmentSessionId, "worker_wrapper_fetch_failed", null);
    }
    return new Response(JSON.stringify({ ok: false, error: "No usable siteBaseUrl provided." }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const response = await fetch(`${siteBaseUrl}/api/assessment-processing/worker`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-assessment-worker-secret": providedSecret },
      body: rawBody,
    });

    const responseBody = await response.text();
    console.log(`[assessment-processing-stage-worker] ${response.status} ${responseBody}`);

    if (!response.ok && assessmentSessionId) {
      // A real HTTP response was received, just not a 2xx -- distinct from the fetch never
      // getting a response at all (the catch branch below). The exact status code (401/404/5xx/
      // etc) is recorded, not the response body -- enough to narrow the next investigation
      // without needing another diagnostic deployment for a code we didn't anticipate.
      await recordWrapperDiagnosticStage(assessmentSessionId, "worker_wrapper_fetch_failed", response.status);
    }

    return new Response(responseBody, { status: response.status, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error forwarding to the worker route.";
    console.error(`[assessment-processing-stage-worker] forwarding failed: ${message}`);
    if (assessmentSessionId) {
      // No HTTP response was ever received (network/DNS/timeout) -- status left null,
      // distinguishing this from a real-but-rejected response above.
      await recordWrapperDiagnosticStage(assessmentSessionId, "worker_wrapper_fetch_failed", null);
    }
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
};

export default handler;

export const config = {
  background: true,
};
