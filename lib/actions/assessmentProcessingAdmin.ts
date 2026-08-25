"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/server";
import { dispatchEligibleAssessmentProcessing } from "@/lib/assessmentIntelligence/pipeline";
import { createSyntheticAssessmentSession } from "@/lib/data/assessmentIntelligence";
import { setResidentCommunityId } from "@/lib/data/residents";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { resolveAssessmentCommunity } from "@/lib/assessmentIntelligence/communityResolution";

// Admin-only manual trigger for the assessment processing dispatcher (2026-08-15 hardening
// pass — see docs/architecture/ASSESSMENT_TRANSCRIPTION_ORCHESTRATION.md). Exists because
// Netlify Scheduled Functions do NOT run automatically on Deploy Previews, so without this there
// would be no way to exercise the full dispatcher -> background-stage-worker pipeline on a
// preview deployment short of waiting for a production deploy.
//
// Calls dispatchEligibleAssessmentProcessing() directly — the EXACT SAME function
// netlify/functions/assessment-processing-dispatcher.ts calls on its schedule. Not a parallel or
// simplified reimplementation: this action exercises the real HTTP hand-off to
// assessment-processing-stage-worker-background.ts (including the shared-secret check), so a
// manual click on a preview genuinely tests the same path production relies on.
//
// Does NOT touch, weaken, or bypass the PHI gate in any way. PHI_AWS_PROCESSING_CONFIRMED /
// PHI_OPENAI_PROCESSING_CONFIRMED are still checked exactly where they always were — deep inside
// advanceAssessmentProcessing() -> startTranscriptionStage(), which the background stage worker
// calls after this action's dispatch. If the gate is unconfirmed (the expected state on every
// Deploy Preview and in every environment until a human explicitly confirms it), sessions are
// dispatched but each stage worker invocation no-ops at the gate check, exactly as it would on a
// scheduled tick. This action can never cause real PHI processing that wasn't already possible.
//
// Restricted to role === "admin" specifically — stricter than canEditResidentProfile() or the
// "management tier" (admin/manager/executive) used elsewhere in Settings, because this triggers
// real outbound AWS calls (when the gate is confirmed) and is an operational/infra action, not a
// normal care-workflow action.

export interface TriggerDispatchResult {
  error?: string;
  considered?: number;
  dispatched?: number;
  failed?: number;
  failures?: { assessmentSessionId: string; error?: string }[];
}

export async function triggerAssessmentProcessingDispatch(): Promise<TriggerDispatchResult> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in." };
  if (profile.role !== "admin") {
    return { error: "Only an admin can manually trigger assessment processing." };
  }

  const results = await dispatchEligibleAssessmentProcessing(5);
  const dispatched = results.filter((r) => r.dispatched).length;
  const failures = results.filter((r) => !r.dispatched);

  return {
    considered: results.length,
    dispatched,
    failed: failures.length,
    failures: failures.map((f) => ({ assessmentSessionId: f.assessmentSessionId, error: f.error })),
  };
}

// ─── Synthetic assessment session creation (2026-08-16, AWS Synthetic Assessment Deployment
// Preflight) ─────────────────────────────────────────────────────────────────────────────────
// The admin-controlled entry point for the acceptance test plan's real-device synthetic
// recording — see docs/architecture/ASSESSMENT_TRANSCRIPTION_ORCHESTRATION.md. This is the ONLY
// way is_synthetic_test ever becomes true for a session: never inferred from a resident's name,
// never settable through the normal "Capture Assessment" flow. role === "admin" only, same
// discipline as triggerAssessmentProcessingDispatch above, for the same reason — this session
// will be eligible for real AWS Transcribe/Bedrock calls once PHI_SYNTHETIC_TEST_MODE is also
// enabled on the deployment (see isSessionAuthorizedForConfiguredTranscriptionProvider in
// pipeline.ts), so creating one is itself a meaningful operational action, not a normal
// care-workflow one.
//
// Always creates a FRESH provisional resident (reusing the same governed
// create_provisional_resident_from_intake RPC startAssessmentForNewProspect already uses,
// lib/actions/assessmentIntelligence.ts) rather than accepting an arbitrary existing resident id
// — deliberately, so there is no way to fat-finger a real resident's id and accidentally attach
// a synthetic-test marker to their real record. The admin supplies only a display name; name it
// clearly (e.g. "SYNTHETIC TEST — 2026-08-16") so it's unambiguous everywhere it's visible.

export interface CreateSyntheticAssessmentSessionResult {
  error?: string;
  residentId?: string;
  assessmentSessionId?: string;
}

export async function createSyntheticAssessmentSessionAction(
  residentDisplayName: string
): Promise<CreateSyntheticAssessmentSessionResult> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in." };
  if (profile.role !== "admin") {
    return { error: "Only an admin can create a synthetic assessment session." };
  }
  if (!residentDisplayName || !residentDisplayName.trim()) {
    return { error: "A display name is required for the synthetic test resident." };
  }

  const actor = profile.full_name || profile.email;
  const supabase = createServerClient();

  // Community identity (mirrors startAssessmentForNewProspect's identical resolution,
  // lib/actions/assessmentIntelligence.ts): no resident or relationship exists yet, so the
  // admin's own current community context is the only available source. Resolved BEFORE
  // creating the resident so an unresolvable context (e.g. "all communities" with nothing else
  // to disambiguate it) fails cleanly rather than leaving an orphaned test resident behind.
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const communityResolution = resolveAssessmentCommunity({
    hasResident: false,
    residentCommunityId: null,
    hasRelationship: false,
    relationshipCommunityId: null,
    currentContext: communityFilter,
  });
  if (!communityResolution.ok) {
    return { error: communityResolution.error };
  }

  const { data: resident, error: residentError } = await supabase.rpc("create_provisional_resident_from_intake", {
    p_display_name: residentDisplayName.trim(),
    p_actor: actor,
  });
  if (residentError || !resident) {
    return { error: "Could not create the synthetic test resident." };
  }
  const residentId = (resident as { id: string }).id;
  if (communityResolution.communityId) {
    await setResidentCommunityId(residentId, communityResolution.communityId);
  }

  const { session, error } = await createSyntheticAssessmentSession({
    residentId,
    startedBy: actor,
    communityId: communityResolution.communityId,
  });
  if (error || !session) {
    return { error: error ?? "Could not create the synthetic assessment session." };
  }

  return { residentId, assessmentSessionId: session.id };
}
