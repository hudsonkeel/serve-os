import { NextResponse } from "next/server";
import { syncAllConfirmedResidentsCanonical } from "@/lib/data/axiscareClientSync";
import { syncAxisCareOperationalState } from "@/lib/data/axiscareOperationalStateSync";

// AxisCare Client Data Sync — the scheduled entry point. Server-to-server
// only, never a browser session — mirrors app/api/intake/reconcile's
// exact, already-established pattern (shared-secret header, POST-only,
// no cookie/session auth) rather than inventing a new one. Intended to be
// hit on a timer (Netlify Scheduled Function or pg_cron + pg_net — same
// "not configured live in this scope" status the intake reconciliation
// backstop documents; the actual scheduler wiring is a deployment
// concern, not built here). Recommended cadence: daily. Cadence itself
// isn't hardcoded anywhere in this app — it's entirely a property of
// whatever external scheduler calls this route, so it stays operationally
// changeable (e.g. in Netlify's scheduled-function config) without a code
// change here.
//
// Calls the exact same orchestrator "Sync Now" and the post-Confirm-Match
// trigger both use (lib/data/axiscareClientSync.ts) — no separate
// cron-specific reconciliation logic.

export async function POST(request: Request) {
  const secret = request.headers.get("x-axiscare-sync-internal-secret");
  if (!secret || secret !== process.env.AXISCARE_SYNC_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Two independent steps on the same daily trigger, not two separate
  // scheduled jobs (AxisCare Community Mapping + Operational State
  // phase, section 10). The demographic bootstrap sync
  // (syncAllConfirmedResidentsCanonical) is unchanged, per-confirmed-
  // resident, and untouched by this phase. syncAxisCareOperationalState
  // is the new step: one roster fetch, covering every mapped community
  // and every roster record (confirmed, candidate, or unmatched alike —
  // e.g. AxisCare client #40) in a single run.
  const [canonicalResult, operationalStateResult] = await Promise.all([
    syncAllConfirmedResidentsCanonical("Scheduled AxisCare Client Data Sync", "scheduled"),
    syncAxisCareOperationalState(),
  ]);
  return NextResponse.json({ canonicalResult, operationalStateResult });
}
