"use server";

// Admin-only manual trigger for the assessment-processing dispatcher. Exists because Netlify
// Scheduled Functions are correctly registered on branch/preview deploys (confirmed against the
// live deploy record — the schedule is declared) but do not execute automatically there, only
// on the production deploy (confirmed against Netlify's own documentation) — so there is
// otherwise no repeatable way to exercise the real dispatcher -> background-worker -> claim path
// before this feature reaches production, where the schedule runs on its own.
//
// Calls the exact same dispatchEligibleAssessmentProcessing() the real scheduled function calls
// (netlify/functions/assessment-processing-dispatcher.mts) — no queue-discovery,
// worker-invocation, or extraction logic duplicated here, and this action itself never touches
// the extraction provider or a session row directly. Same governance boundary as every other
// admin/manager/executive-tier action in this codebase (lib/auth/permissions.ts) — this is a
// diagnostic capability, not part of the normal assessor workflow, so it lives in Settings, not
// on any resident's assessment page.

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { dispatchEligibleAssessmentProcessing } from "@/lib/assessmentIntelligence/pipeline";
import { runDispatchTrigger, type DispatchTriggerResult } from "@/lib/assessmentIntelligence/processingQueue";
import { getSessionsWithProcessingDiagnostics, type ProcessingDiagnosticRow } from "@/lib/data/assessmentIntelligence";

export type TriggerAssessmentProcessingResult = DispatchTriggerResult;

export async function triggerAssessmentProcessingDispatch(): Promise<TriggerAssessmentProcessingResult> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in." };

  return runDispatchTrigger(canEditResidentProfile(profile.role), dispatchEligibleAssessmentProcessing);
}

const DIAGNOSTICS_LIMIT = 25;

export type AssessmentProcessingDiagnosticsResult = { rows: ProcessingDiagnosticRow[] } | { error: string };

/** Refreshes just the "In-flight sessions" diagnostics table (components/settings/
 * AssessmentProcessingDiagnostics.tsx) without reloading the rest of Settings. Same
 * management-tier gate as app/settings/page.tsx's canViewManagement (which controls whether the
 * table is rendered at all) -- role !== "operations" -- not canEditResidentProfile above, since
 * viewing this table is a read, not a resident-profile edit. */
export async function getAssessmentProcessingDiagnostics(): Promise<AssessmentProcessingDiagnosticsResult> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || profile.role === "operations") {
    return { error: "You do not have permission to view this." };
  }

  return { rows: await getSessionsWithProcessingDiagnostics(DIAGNOSTICS_LIMIT) };
}
