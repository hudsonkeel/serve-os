import { NextResponse } from "next/server";
import { processIntakeSubmission } from "@/lib/actions/intakeEngine";

// Database Webhook receiver — Scope J (Production Intake Unification).
// Supabase fires this on every INSERT into `intake_submissions`; this
// route's only job is to trigger the existing Serve Intake Intelligence
// Engine (lib/actions/intakeEngine.ts, unchanged from Scope H) for the new
// row. This is the fast path — app/api/intake/reconcile is the backstop
// for anything a missed or delayed webhook doesn't catch. Never called by
// a browser: verified via a shared secret configured on the Database
// Webhook itself (see docs/integrations/WEBSITE_TO_SERVE_INTAKE_CONTRACT.md,
// "Deployment").

export async function POST(request: Request) {
  const secret = request.headers.get("x-intake-internal-secret");
  if (!secret || secret !== process.env.INTAKE_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { record?: { id?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  const submissionId = body.record?.id;
  if (!submissionId) {
    return NextResponse.json({ error: "Missing record.id." }, { status: 400 });
  }

  const result = await processIntakeSubmission(submissionId);
  if (result.error) {
    // Failure is already recorded (recordIntakeProcessingFailure, visible
    // in the Intake Queue's Failed tab) — respond 200 so Supabase doesn't
    // endlessly retry a delivery that already did its job (recorded the
    // failure); the reconciliation sweep will pick up genuine transient
    // failures on its own schedule.
    return NextResponse.json({ error: result.error });
  }

  return NextResponse.json({ processed: true, recordId: result.record?.id ?? null });
}
