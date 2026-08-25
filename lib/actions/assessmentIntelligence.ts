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
  getCombinedTranscriptText,
  getAssessmentSessionWithFailureState,
} from "@/lib/data/assessmentIntelligence";
import { runExtractionPipelineForSession, retryFailedAssessmentProcessing } from "@/lib/assessmentIntelligence/pipeline";
import { computeReviewExceptions, type DraftFactForReview } from "@/lib/assessmentIntelligence/reviewExceptions";
import { recommendPricing, PRICING_RULES_VERSION, type FactForPricing } from "@/lib/assessmentIntelligence/pricingEngine";
import { PRICING_CATALOG_VERSION } from "@/lib/assessmentIntelligence/pricingCatalog";
import { computeAxisCareReadiness, buildAxisCarePayloadPreview } from "@/lib/assessmentIntelligence/axiscareReadiness";
import { buildCinchProjection } from "@/lib/assessmentIntelligence/cinchProjection";
import type { AssertionState } from "@/lib/assessmentIntelligence/factTypes";

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

  const supabase = createServerClient();
  const { data: session, error } = await supabase
    .from("intake_assessment_sessions")
    .insert([{ resident_id: residentId, status: "recording", initiated_from: "existing_person", started_by: authResult.actor }])
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

  const supabase = createServerClient();
  const { data: resident, error: residentError } = await supabase.rpc("create_provisional_resident_from_intake", {
    p_display_name: displayName.trim(),
    p_actor: authResult.actor,
  });
  if (residentError || !resident) return { error: "Could not create a new prospect record." };

  const residentId = (resident as { id: string }).id;
  const { data: session, error: sessionError } = await supabase
    .from("intake_assessment_sessions")
    .insert([{ resident_id: residentId, status: "recording", initiated_from: "new_provisional", started_by: authResult.actor }])
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

// ─── Transcript review (Phase 12) ──────────────────────────────────────────
// A secure, server-mediated read — no RLS was loosened to expose this. Authorization is the
// same application-layer canEditResidentProfile() check every other assessment action in this
// file already uses; RLS on intake_sources remains zero-policy/service-role-only exactly as
// before. "Unauthorized access denied" means this function itself refuses, every time, for
// anyone who isn't an authorized reviewer — not a policy change on the table.
export interface AssessmentTranscriptResult {
  transcriptText?: string;
  error?: string;
}

export async function getAssessmentTranscriptForReview(assessmentSessionId: string): Promise<AssessmentTranscriptResult> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };

  const transcriptText = await getCombinedTranscriptText(assessmentSessionId);
  return { transcriptText };
}

// ─── Failure/retry (Phase 13) ──────────────────────────────────────────────
export async function getAssessmentFailureState(assessmentSessionId: string) {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const session = await getAssessmentSessionWithFailureState(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };
  return { session };
}

export async function retryFailedAssessment(assessmentSessionId: string): Promise<{ success?: boolean; error?: string }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  try {
    const result = await retryFailedAssessmentProcessing(assessmentSessionId);
    if (result.error) return { error: result.error };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Retry failed." };
  }
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

  return { pricingStatus: pricingOutput.status };
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
