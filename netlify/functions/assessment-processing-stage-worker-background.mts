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
// app/api/assessment-processing/worker/route.ts for where the real logic now lives) and adding
// netlify/functions/__tests__/noServerOnlyImports.test.ts to prove it loads cleanly outside the
// react-server condition.
//
// STILL UNRESOLVED AS OF 2026-09-17: a second live dispatch test, run against that fix, again
// showed every eligible session reaching 'invocation_accepted' and none reaching
// 'worker_received' -- proving the module-load crash is genuinely fixed (that class of failure
// would have prevented 'invocation_accepted' from ever being written too, since Netlify's 202
// happens before this container loads its code either way -- irrelevant distinction from the
// dispatcher's point of view) but leaving a new, narrower unknown: something between this
// wrapper's own execution and advanceQueuedAssessmentProcessing() being called is still not
// happening, and this file previously had ZERO error handling and ZERO observability of its own
// -- if `new URL(req.url)` or the fetch() below threw for any reason (Netlify's own docs do not
// document whether a Background Function's `req.url` reflects the original public-facing
// request during its actual asynchronous execution, as opposed to the initial synchronous
// accept), the resulting unhandled rejection would be exactly this silent: no console output
// reached (the crash preempts it), and nothing durable recorded anywhere, since this file
// structurally cannot call recordProcessingDiagnosticStage() (see above).
//
// Two changes address this without touching lib/ or duplicating any application logic:
// (1) the entire handler body is now wrapped in try/catch, so any failure returns a well-formed
// error Response instead of an unhandled rejection; (2) recordWrapperStarted() below writes one
// new diagnostic stage, 'worker_wrapper_started' (supabase/migrations/20260917000000_add_
// worker_wrapper_started_diagnostic_stage.sql), directly via a raw PostgREST PATCH -- not
// through the application data layer, which this file cannot import -- as literally the first
// thing this handler does. If the next live test shows this stage present but 'worker_received'
// still absent, that narrows the failure conclusively to the fetch-to-Route-Handler hop itself
// (URL resolution, network, or the Route Handler's own auth/body validation) rather than "did
// the wrapper run at all," which is the one thing today's evidence cannot distinguish.
//
// All real work -- claim the session, run the existing extraction pipeline -- still lives
// entirely in app/api/assessment-processing/worker/route.ts. This file still does not read,
// validate, or duplicate the shared-secret check itself; that remains the Route Handler's sole
// responsibility so there is exactly one place authorization is decided.
//
// Still declared `config.background = true` -- identical 202/fire-and-forget/15-minute semantics
// as before; only what runs inside changed.

// Best-effort, wrapper-side proof-of-life marker. Deliberately uses a raw PostgREST PATCH (the
// same REST API lib/supabase/server.ts's createServerClient() ultimately talks to) rather than
// importing @supabase/supabase-js or any lib/ helper -- this file's only dependency surface is
// the Fetch API already used below. Never throws: a diagnostic write failing must never be the
// reason the real forwarding attempt below doesn't happen.
async function recordWrapperStarted(assessmentSessionId: string): Promise<void> {
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
        processing_diagnostic_stage: "worker_wrapper_started",
        processing_diagnostic_stage_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error("[assessment-processing-stage-worker] recordWrapperStarted failed", err);
  }
}

function extractSessionId(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { assessmentSessionId?: unknown };
    return typeof parsed.assessmentSessionId === "string" ? parsed.assessmentSessionId : null;
  } catch {
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  const rawBody = await req.text();

  const assessmentSessionId = extractSessionId(rawBody);
  if (assessmentSessionId) {
    await recordWrapperStarted(assessmentSessionId);
  }

  try {
    // Resolved from the incoming request's own origin, not an env var -- Netlify Functions only
    // expose URL/SITE_NAME/SITE_ID at runtime (URL is always the production domain, never a
    // branch-specific one), so there is no reliable env var for "this deploy's own base URL"
    // inside a Function at all. This endpoint (unlike the scheduled dispatcher, which only ever
    // fires in production) is invoked from whichever deploy context dispatched it, so reusing
    // whatever host this request itself arrived on is the only self-consistent option -- see the
    // "STILL UNRESOLVED" note above for why this specific line is the leading suspect for the
    // current failure and cannot yet be confirmed without live function logs.
    const baseUrl = new URL(req.url).origin;
    const incomingSecret = req.headers.get("x-assessment-worker-secret") ?? "";

    const response = await fetch(`${baseUrl}/api/assessment-processing/worker`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-assessment-worker-secret": incomingSecret },
      body: rawBody,
    });

    const responseBody = await response.text();
    console.log(`[assessment-processing-stage-worker] ${response.status} ${responseBody}`);

    return new Response(responseBody, { status: response.status, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error forwarding to the worker route.";
    console.error(`[assessment-processing-stage-worker] forwarding failed: ${message}`);
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
