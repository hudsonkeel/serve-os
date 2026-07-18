import { NextResponse } from "next/server";
import { processAllUnprocessedIntakeSubmissions } from "@/lib/actions/intakeEngine";

// Reconciliation backstop — Scope J (Production Intake Unification).
// Intended to be hit on a schedule (pg_cron + pg_net, or a Netlify
// Scheduled Function — see the deployment handoff doc; not configured live
// in this scope). Reuses the exact same unprocessed-submission sweep the
// Intake Queue's manual "Process All" button already calls
// (lib/actions/intakeEngine.ts, unchanged from Scope H) — idempotent by
// construction (intake_find_settled_record()'s existing short-circuit), so
// running this on a timer is always safe even if the webhook already
// processed everything. No genuine submission can be permanently stuck on
// a missed webhook delivery: worst case is a delay until the next sweep.

export async function POST(request: Request) {
  const secret = request.headers.get("x-intake-internal-secret");
  if (!secret || secret !== process.env.INTAKE_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await processAllUnprocessedIntakeSubmissions();
  return NextResponse.json(result);
}
