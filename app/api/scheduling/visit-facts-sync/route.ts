import { NextResponse } from "next/server";
import { runRollingVisitFactsSync } from "@/lib/scheduling/visitFactsRollingSync";

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
  if (!secret || secret !== process.env.SCHEDULING_VISIT_SYNC_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runRollingVisitFactsSync();

  // Structured, sanitized result only — RollingSyncResult carries counts,
  // dates, and diagnostic ids/fingerprints (themselves free of PHI — see
  // visitIdentityDiagnostics.ts), never a name, address, or raw payload.
  console.log("[scheduling:visit-facts-sync]", JSON.stringify(result));

  return NextResponse.json(result);
}
