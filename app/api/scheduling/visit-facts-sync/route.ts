import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { runRollingVisitFactsSync } from "@/lib/scheduling/visitFactsRollingSync";

// TEMPORARY DIAGNOSTIC (remove after the persistent-401 investigation
// concludes — see the "Serve Visit Sync — Safe Runtime Secret Diagnostic"
// task). Compares only non-sensitive metadata about the incoming header
// vs. process.env: presence, length, whitespace, and a short (10-hex-char)
// SHA-256 prefix — never the raw value or a full hash. Logged server-side
// only (console.log, same aggregation path the rest of this route already
// uses), never returned in the response body, since a response body is a
// wider exposure surface than a Netlify Function log. Does not change the
// auth comparison itself or its outcome.
function secretDiagnosticMetadata(value: string | null) {
  const v = value ?? "";
  return {
    present: value !== null && value !== "",
    length: v.length,
    trimmedLength: v.trim().length,
    hasLeadingOrTrailingWhitespace: v !== v.trim(),
    sha256Prefix: createHash("sha256").update(v, "utf8").digest("hex").slice(0, 10),
  };
}

// Historical Visit Fact Rolling Sync — the scheduled entry point.
// Server-to-server only, never a browser session — mirrors
// app/api/axiscare/scheduled-sync's exact, already-established pattern
// (shared-secret header, POST-only, no cookie/session auth) rather than
// inventing a new one. Intended to be hit on a timer (Netlify Scheduled
// Function — see netlify/functions/scheduling-visit-facts-sync.mts).
//
// Calls the exact same orchestrator a manual dry run would
// (lib/scheduling/visitFactsRollingSync.ts) — no separate cron-specific
// logic, no Visit normalization or persistence code here.
export async function POST(request: Request) {
  const secret = request.headers.get("x-scheduling-visit-sync-internal-secret");
  const expectedSecret = process.env.SCHEDULING_VISIT_SYNC_INTERNAL_SECRET ?? null;
  if (!secret || secret !== expectedSecret) {
    console.log(
      "[scheduling:visit-facts-sync:auth-diagnostic]",
      JSON.stringify({
        incomingHeader: secretDiagnosticMetadata(secret),
        runtimeEnv: secretDiagnosticMetadata(expectedSecret),
      })
    );
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runRollingVisitFactsSync();

  // Structured, sanitized result only — RollingSyncResult carries counts,
  // dates, and diagnostic ids/fingerprints (themselves free of PHI — see
  // visitIdentityDiagnostics.ts), never a name, address, or raw payload.
  console.log("[scheduling:visit-facts-sync]", JSON.stringify(result));

  return NextResponse.json(result);
}
