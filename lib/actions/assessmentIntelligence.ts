"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { createServerClient } from "@/lib/supabase/server";
import {
  createPastedTranscriptSource,
  updateAssessmentSessionStatus,
  getDraftFactsForSession,
  getOpenConflictsForSession,
  getApprovedFactsForResident,
  approveAssessmentSession,
  writeAssessmentDecision,
  writeAssessmentOutput,
  getAssessmentSession,
  getAxisCareIdentityLinkState,
} from "@/lib/data/assessmentIntelligence";
import { runExtractionPipelineForSession } from "@/lib/assessmentIntelligence/pipeline";
import { computeReviewExceptions, type DraftFactForReview } from "@/lib/assessmentIntelligence/reviewExceptions";
import { recommendPricing, PRICING_RULES_VERSION, type FactForPricing } from "@/lib/assessmentIntelligence/pricingEngine";
import { PRICING_CATALOG_VERSION } from "@/lib/assessmentIntelligence/pricingCatalog";
import { computeAxisCareReadiness, buildAxisCarePayloadPreview } from "@/lib/assessmentIntelligence/axiscareReadiness";
import { buildCinchProjection } from "@/lib/assessmentIntelligence/cinchProjection";
import type { AssertionState } from "@/lib/assessmentIntelligence/factTypes";
import { getRequirementByCode } from "@/lib/data/personRequirements";
import { recordAssessmentEvidence } from "@/lib/clientReadiness/evidence";
import { CR_ASSESSMENT_CURRENT } from "@/lib/clientReadiness/constants";
import { getResidentById, setResidentCommunityId } from "@/lib/data/residents";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { resolveAssessmentCommunity } from "@/lib/assessmentIntelligence/communityResolution";

// Server actions for the assessment intelligence layer — see docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md. Distinct from lib/actions/assessmentCapture.ts
// (the existing "Capture Assessment" voice-handoff action, untouched by this file) and
// lib/actions/intakeEngine.ts (the unrelated website-form Intake Intelligence Engine).

async function requireActor(): Promise<{ actor: string } | { error: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in." };
  if (!canEditResidentProfile(profile.role)) {
    return { error: "You do not have permission to work with assessments." };
  }
  return { actor: profile.full_name || profile.email };
}

export interface StartAssessmentResult {
  assessmentSessionId?: string;
  residentId?: string;
  error?: string;
}

/** Existing Resident/Prospect/Client — attaches to the SAME canonical resident_id, never
 * creates a new person. */
export async function startAssessmentForExistingPerson(residentId: string): Promise<StartAssessmentResult> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };
  if (!residentId) return { error: "Missing resident." };

  // Community identity (Phase E/F completion, section 1/2): the linked
  // resident's own community is the strongest source. No relationship is
  // consulted here — this action only ever takes a residentId, no
  // relationshipId exists to check (see communityResolution.ts's own
  // priority order for when one does).
  const resident = await getResidentById(residentId);
  if (!resident) return { error: "Resident not found." };
  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const communityResolution = resolveAssessmentCommunity({
    hasResident: true,
    residentCommunityId: resident.community_id,
    hasRelationship: false,
    relationshipCommunityId: null,
    currentContext: communityFilter,
  });
  if (!communityResolution.ok) {
    return { error: communityResolution.error };
  }

  const supabase = createServerClient();
  const { data: session, error } = await supabase
    .from("intake_assessment_sessions")
    .insert([
      {
        resident_id: residentId,
        status: "recording",
        initiated_from: "existing_person",
        started_by: authResult.actor,
        community_id: communityResolution.communityId,
      },
    ])
    .select("id")
    .single();

  if (error || !session) return { error: "Could not start the assessment session." };
  return { assessmentSessionId: (session as { id: string }).id, residentId };
}

/** Name-only new prospect — reuses the SAME governed create_provisional_resident_from_intake
 * RPC the Capture Assessment PWA handoff already uses. Nothing except a name is required. */
export async function startAssessmentForNewProspect(displayName: string): Promise<StartAssessmentResult> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };
  if (!displayName || !displayName.trim()) return { error: "A name is required to begin." };

  // Community identity (Phase E/F completion, sections 1/2/7) — resolved
  // BEFORE creating anything: no resident or relationship exists yet, so
  // the creator's current context is the only available source. An
  // all_communities context with no other source is rejected outright
  // (explicit selection required for a partner/community assessment)
  // rather than creating an orphaned, community-less resident record
  // that would then have nothing to attach a session to. An unassigned
  // context leaves both genuinely unassigned, never defaulted to Frisco.
  const profile = await getCurrentAuthorizedUser();
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

  const supabase = createServerClient();
  const { data: resident, error: residentError } = await supabase.rpc("create_provisional_resident_from_intake", {
    p_display_name: displayName.trim(),
    p_actor: authResult.actor,
  });
  if (residentError || !resident) return { error: "Could not create a new prospect record." };

  const residentId = (resident as { id: string }).id;
  if (communityResolution.communityId) {
    await setResidentCommunityId(residentId, communityResolution.communityId);
  }

  const { data: session, error: sessionError } = await supabase
    .from("intake_assessment_sessions")
    .insert([
      {
        resident_id: residentId,
        status: "recording",
        initiated_from: "new_provisional",
        started_by: authResult.actor,
        community_id: communityResolution.communityId,
      },
    ])
    .select("id")
    .single();
  if (sessionError || !session) return { error: "Could not start the assessment session." };

  return { assessmentSessionId: (session as { id: string }).id, residentId };
}

/** Temporary development/validation input adapter (docs/architecture/
 * ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §3A) — writes only to intake_sources.
 * transcript_text, the same source-agnostic boundary a future transcription pipeline would
 * use. Runs extraction immediately after. */
export async function submitPastedTranscriptAndExtract(
  assessmentSessionId: string,
  transcriptText: string
): Promise<{ error?: string; draftFactCount?: number; rejectedCount?: number }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };
  if (!transcriptText || !transcriptText.trim()) return { error: "A transcript is required." };

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };

  const source = await createPastedTranscriptSource({ assessmentSessionId, transcriptText });
  if (!source) return { error: "Could not save the transcript." };

  await updateAssessmentSessionStatus(assessmentSessionId, "processing");

  return runExtractionPipelineForSession(assessmentSessionId, session.resident_id, source.id);
}

export interface ReviewData {
  session: Awaited<ReturnType<typeof getAssessmentSession>>;
  draftFacts: Awaited<ReturnType<typeof getDraftFactsForSession>>;
  reviewSummary: ReturnType<typeof computeReviewExceptions>;
}

export async function getAssessmentReviewData(assessmentSessionId: string): Promise<ReviewData | null> {
  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return null;

  const draftFactRows = await getDraftFactsForSession(assessmentSessionId);
  const openConflicts = await getOpenConflictsForSession(assessmentSessionId);

  const draftFactsForReview: DraftFactForReview[] = draftFactRows.map((f) => ({
    id: f.id,
    fieldPath: f.field_path,
    value: f.value,
    assertionState: f.assertion_state as AssertionState,
    collectionMethod: f.collection_method,
    reporter: f.reporter,
    evidence: f.evidence,
    confidence: f.confidence as DraftFactForReview["confidence"],
  }));

  const reviewSummary = computeReviewExceptions(
    draftFactsForReview,
    openConflicts.map((c) => ({ id: c.id, fieldPath: c.field_path, factADraftId: c.fact_a_draft_id, factBDraftId: c.fact_b_draft_id, status: c.status as "open" | "resolved" }))
  );

  return { session, draftFacts: draftFactRows, reviewSummary };
}

export interface ApprovedFactInput {
  field_path: string;
  value: unknown;
  assertion_state: string;
  collection_method: string | null;
  reporter: string | null;
  evidence: string | null;
  confidence: string;
  source_draft_fact_id: string | null;
  supersedes_fact_id: string | null;
}

/** The governed approval action — human review checkpoint. Runs the deterministic pricing
 * engine over the just-approved facts as part of the same action (pricing is a decision about
 * approved facts, never draft ones). */
export async function approveAssessment(input: {
  assessmentSessionId: string;
  approvedFacts: ApprovedFactInput[];
  rationale?: string;
}): Promise<{ error?: string; pricingStatus?: string }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const result = await approveAssessmentSession({
    assessmentSessionId: input.assessmentSessionId,
    actor: authResult.actor,
    approvedFacts: input.approvedFacts,
    rationale: input.rationale,
  });
  if (!result.success) return { error: result.error };

  const session = await getAssessmentSession(input.assessmentSessionId);
  if (!session) return { error: "Assessment approved, but the session could not be reloaded for pricing." };

  // Client Readiness — Serve-native governed evidence (approved architecture
  // Phase 3): approval itself creates/refreshes CR_ASSESSMENT_CURRENT's
  // evidence directly — no second Verify From Source action. This call is
  // sequential, not transactional, with approveAssessmentSession() above;
  // recordAssessmentEvidence() is idempotent (dedupes on
  // assessmentSessionId), so re-running this action later is always safe,
  // and a failure here is surfaced honestly rather than folded into a
  // false "success."
  let clientReadinessError: string | undefined;
  const clientReadinessRequirement = await getRequirementByCode(CR_ASSESSMENT_CURRENT);
  if (clientReadinessRequirement) {
    const evidenceResult = await recordAssessmentEvidence({
      residentId: session.resident_id,
      requirementId: clientReadinessRequirement.id,
      assessmentSessionId: input.assessmentSessionId,
      effectiveDate: (session.finished_at ?? session.started_at).slice(0, 10),
      assessor: session.started_by,
      approvingActor: authResult.actor,
    });
    if (evidenceResult.error) {
      clientReadinessError = `Assessment approved, but Client Readiness evidence could not be recorded: ${evidenceResult.error}`;
    }
  }

  const approvedFactRows = await getApprovedFactsForResident(session.resident_id);
  const factsForPricing: FactForPricing[] = approvedFactRows.map((f) => ({
    fieldPath: f.field_path,
    assertionState: f.assertion_state as AssertionState,
    value: f.value,
  }));

  const pricingOutput = recommendPricing(factsForPricing);
  await writeAssessmentDecision({
    assessmentSessionId: input.assessmentSessionId,
    decisionType: "pricing",
    inputFactIds: approvedFactRows.map((f) => f.id),
    output: pricingOutput,
    rationale: pricingOutput.status === "recommended" ? pricingOutput.rationale : pricingOutput.reason,
    catalogVersion: PRICING_CATALOG_VERSION,
    rulesVersion: PRICING_RULES_VERSION,
  });

  if (clientReadinessError) {
    return { error: clientReadinessError, pricingStatus: pricingOutput.status };
  }
  return { pricingStatus: pricingOutput.status };
}

// Reconciliation path for the one non-transactional gap in
// approveAssessment(): if approve_assessment_session() succeeded but the
// follow-up Client Readiness evidence write failed, this lets the gap be
// closed WITHOUT re-approving. Deliberately does not call
// approveAssessmentSession() again — that RPC has no "already approved"
// guard (unlike complete_audit_session/complete_emergency_preparedness_review,
// it never checks the session's current status before re-inserting facts
// and re-transitioning it), so a naive retry of the whole approval action
// would insert a second, duplicate set of approved facts and fire a
// second resident_timeline entry. This action only re-runs the evidence
// step, which is genuinely idempotent (recordAssessmentEvidence() dedupes
// on assessmentSessionId) — safe to call any number of times, including
// when there is nothing to reconcile.
export async function reconcileClientReadinessAssessmentEvidence(
  assessmentSessionId: string
): Promise<{ error?: string; alreadyRecorded?: boolean }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };
  if (session.status !== "approved") {
    return { error: "This assessment has not been approved yet — nothing to reconcile." };
  }

  const requirement = await getRequirementByCode(CR_ASSESSMENT_CURRENT);
  if (!requirement) {
    return { error: "CR_ASSESSMENT_CURRENT requirement not found — has the Client Readiness seed migration been applied?" };
  }

  const result = await recordAssessmentEvidence({
    residentId: session.resident_id,
    requirementId: requirement.id,
    assessmentSessionId,
    effectiveDate: (session.finished_at ?? session.started_at).slice(0, 10),
    assessor: session.started_by,
    approvingActor: authResult.actor,
  });
  if (result.error) return { error: result.error };
  return { alreadyRecorded: result.alreadyRecorded };
}

/** AxisCare readiness + payload PREVIEW only — no write adapter exists, and none is invoked
 * here. Reuses the existing person_vendor_identity_links mechanism; never resolves an
 * ambiguous match itself. */
export async function generateAxisCarePreview(assessmentSessionId: string): Promise<{ error?: string; readiness?: string }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };

  const approvedFactRows = await getApprovedFactsForResident(session.resident_id);
  const facts = approvedFactRows.map((f) => ({
    fieldPath: f.field_path,
    assertionState: f.assertion_state as AssertionState,
    value: f.value,
  }));

  const identityLink = await getAxisCareIdentityLinkState(session.resident_id);
  const readiness = computeAxisCareReadiness(facts, identityLink);

  const payload =
    readiness.proposedAction != null ? buildAxisCarePayloadPreview(facts, readiness.proposedAction) : null;

  await writeAssessmentDecision({
    assessmentSessionId,
    decisionType: "axiscare_readiness",
    inputFactIds: approvedFactRows.map((f) => f.id),
    output: { readiness },
  });

  await writeAssessmentOutput({
    assessmentSessionId,
    outputType: "axiscare_payload_preview",
    content: { readiness, payload },
    generatedBy: authResult.actor,
  });

  await updateAssessmentSessionStatus(assessmentSessionId, "operationalized");

  return { readiness: readiness.readiness };
}

export async function generateCinchProjection(assessmentSessionId: string): Promise<{ error?: string }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };

  const approvedFactRows = await getApprovedFactsForResident(session.resident_id);
  const facts = approvedFactRows.map((f) => ({
    fieldPath: f.field_path,
    assertionState: f.assertion_state as AssertionState,
    value: f.value,
    evidence: f.evidence,
  }));

  const projection = buildCinchProjection(facts);

  await writeAssessmentOutput({
    assessmentSessionId,
    outputType: "cinch_projection",
    content: projection as unknown as Record<string, unknown>,
    generatedBy: authResult.actor,
  });

  return {};
}
