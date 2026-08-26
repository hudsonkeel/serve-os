"use server";

import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/server";
import {
  dispatchEligibleAssessmentProcessing,
  resolveSiteBaseUrl,
  pingStageWorker,
  STAGE_WORKER_BACKGROUND_PATH,
  DEFAULT_DISPATCH_LIMIT,
} from "@/lib/assessmentIntelligence/pipeline";
import { createSyntheticAssessmentSession, getSessionsEligibleForProcessing } from "@/lib/data/assessmentIntelligence";
import { setResidentCommunityId } from "@/lib/data/residents";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { resolveAssessmentCommunity } from "@/lib/assessmentIntelligence/communityResolution";
import { getServeAwsCredentials } from "@/lib/assessmentIntelligence/awsCredentials";

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

  const results = await dispatchEligibleAssessmentProcessing();
  const dispatched = results.filter((r) => r.dispatched).length;
  const failures = results.filter((r) => !r.dispatched);

  return {
    considered: results.length,
    dispatched,
    failed: failures.length,
    failures: failures.map((f) => ({ assessmentSessionId: f.assessmentSessionId, error: f.error })),
  };
}

// ─── Dispatcher -> background-worker handoff diagnostic (2026-08-26) ───────────────────────
// Built specifically because the 2026-08-25/26 synthetic acceptance test hit a real
// observability gap: a Background Function's HTTP response proves the URL was reachable, not
// that its handler's own secret check passed (Netlify acknowledges the connection before the
// handler necessarily finishes — see pipeline.ts's pingStageWorker() for the full explanation).
// Everything below is read-only or side-effect-free: resolving env-derived facts, listing which
// sessions the dispatcher's own query currently considers eligible (no dispatch performed), and
// pinging the worker with `{ ping: true }`, which the worker answers without ever calling
// advanceAssessmentProcessing() or touching any session. Reports only non-secret operational
// facts — never the worker secret's value, and the response body is fully controlled by this
// same codebase (see pingStageWorker's own comment), so there is no PHI/secret exposure risk in
// echoing it back.
//
// UPDATED (2026-08-26 handoff-diagnosis fix): the first real run of this diagnostic on a Deploy
// Preview surfaced a genuine bug, not a preview quirk — resolveSiteBaseUrl() was reading
// process.env.DEPLOY_PRIME_URL, which Netlify never actually forwards into a Function's runtime
// (only URL/SITE_NAME/SITE_ID are), so every invocation silently fell back to process.env.URL —
// always the site's PRODUCTION address, regardless of deploy context. See pipeline.ts's
// resolveSiteBaseUrl() for the fix (build-time-captured GENERATED_DEPLOY_CONTEXT, no more `url`
// fallback at all). deploymentContext and productionFallbackWarning are now reported here so this
// panel visibly shows which deployment this is and would loudly flag it if a non-production
// deployment's resolved URL ever matched production's — see resolveSiteBaseUrl's own comment for
// why that specific scenario should now be structurally impossible, not just detected.

export interface AssessmentDispatchHandoffDiagnosticResult {
  error?: string;
  deploymentContext?: string | null;
  baseUrl?: string | null;
  baseUrlSource?: "DEPLOY_PRIME_URL" | "none";
  productionFallbackWarning?: boolean;
  workerRoute?: string;
  secretConfigured?: boolean;
  reached?: boolean;
  httpStatus?: number;
  responseBody?: string;
  pingError?: string;
  dispatchLimit?: number;
  eligibleSessionCount?: number;
  eligibleSessionIds?: string[];
  allEligibleSessionsFitInOneBatch?: boolean;
}

export async function checkAssessmentDispatchHandoff(): Promise<AssessmentDispatchHandoffDiagnosticResult> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in." };
  if (profile.role !== "admin") {
    return { error: "Only an admin can run the dispatch handoff diagnostic." };
  }

  const { baseUrl, source, deploymentContext, productionFallbackWarning } = resolveSiteBaseUrl();
  const secretConfigured = Boolean(process.env.ASSESSMENT_PROCESSING_WORKER_SECRET);

  const ping = await pingStageWorker();

  // Deliberately re-queries with limit + 1 so allEligibleSessionsFitInOneBatch is a real
  // comparison against what actually exists, not just "at most `limit` because that's what we
  // asked for" — if a (limit + 1)th session exists, the query still returns at most that many
  // rows and the count check below correctly reports false.
  const eligible = await getSessionsEligibleForProcessing(DEFAULT_DISPATCH_LIMIT + 1);

  return {
    deploymentContext,
    baseUrl,
    baseUrlSource: source,
    productionFallbackWarning,
    workerRoute: STAGE_WORKER_BACKGROUND_PATH,
    secretConfigured,
    reached: ping.reached,
    httpStatus: ping.httpStatus,
    responseBody: ping.responseBody,
    pingError: ping.error,
    dispatchLimit: DEFAULT_DISPATCH_LIMIT,
    eligibleSessionCount: eligible.length,
    eligibleSessionIds: eligible.map((s) => s.id),
    allEligibleSessionsFitInOneBatch: eligible.length <= DEFAULT_DISPATCH_LIMIT,
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

// ─── AWS identity diagnostic (2026-08-16, Netlify credential correction) ───────────────────
// The smallest safe way to prove the deployed background worker is actually authenticating as
// serve-netlify-assessment-pipeline and not some other principal, before trusting any real
// Transcribe/Bedrock call. Server-side only, admin-gated, same discipline as every other action
// in this file. Returns ONLY the AWS account id and principal ARN — never any credential
// material, never logged anywhere. sts:GetCallerIdentity requires no IAM policy grant at all
// (well-established AWS behavior — it works for any principal presenting valid credentials,
// specifically so identity checks work even under a maximally restrictive policy), so a failure
// here means the credentials themselves are missing/invalid/misconfigured, not a permissions gap.
// Safe to leave in place indefinitely — it discloses nothing sensitive — but it is exactly the
// kind of check that only matters before/during the synthetic test, not a feature to build out
// further.

export interface AwsIdentityCheckResult {
  error?: string;
  account?: string;
  arn?: string;
}

export async function checkAwsIdentity(): Promise<AwsIdentityCheckResult> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in." };
  if (profile.role !== "admin") {
    return { error: "Only an admin can check the AWS identity." };
  }

  let credentials;
  try {
    credentials = getServeAwsCredentials();
  } catch (err) {
    // getServeAwsCredentials() never includes the credential values themselves in its error
    // messages — safe to surface directly.
    return { error: err instanceof Error ? err.message : "AWS credentials are not configured." };
  }

  try {
    const client = new STSClient({ region: "us-east-1", credentials });
    const result = await client.send(new GetCallerIdentityCommand({}));
    return { account: result.Account, arn: result.Arn };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not verify the AWS identity — see server logs." };
  }
}
