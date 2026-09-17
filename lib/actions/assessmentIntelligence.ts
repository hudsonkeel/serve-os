"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { createServerClient } from "@/lib/supabase/server";
import {
  createPastedTranscriptSource,
  updateAssessmentSessionStatus,
  getDraftFactsForSession,
  getConflictsForSession,
  resolveFactConflict,
  requeueSessionForRetry,
  getApprovedFactsForResident,
  getApprovedFactsForSession,
  approveAssessmentSession,
  writeAssessmentDecision,
  writeAssessmentOutput,
  getOutputsForSession,
  getAssessmentSession,
  getAssessmentSessionsForResident,
  getAxisCareIdentityLinkState,
  type AssessmentSessionRecord,
} from "@/lib/data/assessmentIntelligence";
import { computeReviewExceptions, type ApprovedFactInput, type DraftFactForReview } from "@/lib/assessmentIntelligence/reviewExceptions";
import { computeAssessmentCoverage, buildCanonicalCoverageFacts, type CanonicalResidentProfileFacts, type AssessmentCoverageSummary } from "@/lib/assessmentIntelligence/coverage";
import { buildCanonicalProfileEffectiveFacts, approvedFactInputsToEffectiveFacts, type EffectiveFact } from "@/lib/assessmentIntelligence/assessmentProjection";
import { buildApprovedAssessmentSnapshot, type AssessmentDocumentSnapshot } from "@/lib/assessmentIntelligence/assessmentSnapshot";
import { isReviewReadyStatus, selectCurrentAssessmentState, type CurrentAssessmentState, type PendingAssessmentSummary } from "@/lib/assessmentIntelligence/currentAssessmentSelection";
import { decideRetryEligibility, MAX_PROCESSING_ATTEMPTS } from "@/lib/assessmentIntelligence/processingQueue";
import { recommendPricing, PRICING_RULES_VERSION, type FactForPricing } from "@/lib/assessmentIntelligence/pricingEngine";
import { PRICING_CATALOG_VERSION } from "@/lib/assessmentIntelligence/pricingCatalog";
import { computeAxisCareReadiness, buildAxisCarePayloadPreview } from "@/lib/assessmentIntelligence/axiscareReadiness";
import { buildCinchProjection } from "@/lib/assessmentIntelligence/cinchProjection";
import type { AssertionState } from "@/lib/assessmentIntelligence/factTypes";
import { getRequirementByCode } from "@/lib/data/personRequirements";
import { getPersonEvidenceForSubject } from "@/lib/data/personEvidence";
import { evaluateRequirementSetStatus } from "@/lib/compliance/requirementSetStatus";
import { recordAssessmentEvidence, recordAssessmentIspEvidence } from "@/lib/clientReadiness/evidence";
import { CR_ASSESSMENT_CURRENT, CR_ISP_ON_FILE_AND_CURRENT } from "@/lib/clientReadiness/constants";
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
 * transcript_text, the same source-agnostic boundary a future transcription pipeline would use.
 *
 * Deliberately does NOT run extraction here (2026-09-16 async queue slice) — persists the
 * transcript and marks the session 'queued', then returns immediately. A scheduled dispatcher +
 * background worker (lib/assessmentIntelligence/pipeline.ts's dispatchEligibleAssessmentProcessing()
 * / advanceQueuedAssessmentProcessing()) picks it up from there and runs the exact same
 * extraction pipeline this used to call directly. This is what keeps a slow provider call (or a
 * platform function timeout) from ever stranding the browser request that submitted the
 * transcript — see docs on the incident this fixes. */
export async function submitPastedTranscriptAndExtract(
  assessmentSessionId: string,
  transcriptText: string
): Promise<{ error?: string; queued?: boolean }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };
  if (!transcriptText || !transcriptText.trim()) return { error: "A transcript is required." };

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };

  const source = await createPastedTranscriptSource({ assessmentSessionId, transcriptText });
  if (!source) return { error: "Could not save the transcript." };

  const queued = await updateAssessmentSessionStatus(assessmentSessionId, "queued");
  if (!queued) return { error: "Transcript saved, but the assessment could not be queued for processing." };

  return { queued: true };
}

/** Operator-visible Retry for a failed session (requirement: the transcript/source is already
 * durable, so retry must never create a duplicate session — it only requeues this one). Uses
 * decideRetryEligibility() for the exact same bounded-attempt / already-failed check the data
 * layer's conditional update enforces, so the error message a double-click or an
 * already-exhausted session sees is specific and honest rather than a generic failure. */
export async function retryFailedAssessmentProcessing(assessmentSessionId: string): Promise<{ error?: string; retried?: boolean }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };

  const eligibility = decideRetryEligibility({
    status: session.status,
    processingAttemptCount: session.processing_attempt_count,
    processingClaimedAt: session.processing_claimed_at,
  });
  if (!eligibility.allowed) return { error: eligibility.reason };

  // requeueSessionForRetry()'s own conditional update is the real idempotency guard — even if
  // it loses a race (someone else's retry, or the dispatcher, already moved this session), that
  // is not an error: the session is already back in the queue, which is what this call wanted.
  await requeueSessionForRetry(assessmentSessionId, MAX_PROCESSING_ATTEMPTS);
  return { retried: true };
}

export interface ReviewData {
  session: Awaited<ReturnType<typeof getAssessmentSession>>;
  draftFacts: Awaited<ReturnType<typeof getDraftFactsForSession>>;
  reviewSummary: ReturnType<typeof computeReviewExceptions>;
  coverage: AssessmentCoverageSummary;
  /** Reliable canonical resident/profile facts (DOB, phone, physician, family contact, address —
   * already established before this conversation), turned into displayable EffectiveFacts
   * (source "profile") for the Assessment tab's "From Serve profile" indicator. The SAME
   * underlying resident fields also feed `coverage` above (via buildCanonicalCoverageFacts()),
   * so a topic satisfied here is exactly why it's not showing as missing there — one resident
   * read, two consistent views over it, never two independently-derived answers. */
  canonicalProfileFacts: EffectiveFact[];
  /** Null until this session has been approved. Once present, this is the immutable rendering
   * source for the "Assessment" tab's approved/read-only view — never recomputed from
   * canonicalProfileFacts/draftFacts above, which stay live/mutable and would silently rewrite a
   * historical assessment's displayed content as the resident's profile changes after approval. */
  approvedSnapshot: AssessmentDocumentSnapshot | null;
}

function residentToCanonicalProfileFacts(resident: {
  date_of_birth: string | null;
  phone: string | null;
  community_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  physician_name: string | null;
  physician_phone: string | null;
  family_contact_name: string | null;
}): CanonicalResidentProfileFacts {
  return {
    dateOfBirth: resident.date_of_birth,
    phone: resident.phone,
    communityId: resident.community_id,
    addressLine1: resident.address,
    city: resident.city,
    state: resident.state,
    postalCode: resident.zip_code,
    physicianName: resident.physician_name,
    physicianPhone: resident.physician_phone,
    primaryContactName: resident.family_contact_name,
  };
}

export async function getAssessmentReviewData(assessmentSessionId: string): Promise<ReviewData | null> {
  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return null;

  const draftFactRows = await getDraftFactsForSession(assessmentSessionId);
  const conflicts = await getConflictsForSession(assessmentSessionId);
  const resident = await getResidentById(session.resident_id);

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
    conflicts.map((c) => ({
      id: c.id,
      fieldPath: c.field_path,
      factADraftId: c.fact_a_draft_id,
      factBDraftId: c.fact_b_draft_id,
      status: c.status as "open" | "resolved",
      resolvedFactId: c.resolved_fact_id,
    }))
  );

  const canonicalResidentFacts = resident ? residentToCanonicalProfileFacts(resident) : null;

  const coverage = computeAssessmentCoverage(
    draftFactsForReview.map((f) => ({ fieldPath: f.fieldPath, assertionState: f.assertionState })),
    canonicalResidentFacts ? buildCanonicalCoverageFacts(canonicalResidentFacts) : []
  );

  const canonicalProfileFacts = canonicalResidentFacts ? buildCanonicalProfileEffectiveFacts(canonicalResidentFacts) : [];

  const approvedSnapshot = await getApprovedAssessmentSnapshot(assessmentSessionId);

  return { session, draftFacts: draftFactRows, reviewSummary, coverage, canonicalProfileFacts, approvedSnapshot };
}

/** Reads back the immutable assessment_document output written at approval, if any — the sole
 * read path the approved/read-only view uses. Returns null both when the session was never
 * approved and (defensively) when a row exists but fails to parse as AssessmentDocumentSnapshot,
 * since a malformed stored snapshot must never crash the review page — see reconcile below for
 * how a missing snapshot on an already-approved session gets closed. */
async function getApprovedAssessmentSnapshot(assessmentSessionId: string): Promise<AssessmentDocumentSnapshot | null> {
  const outputs = await getOutputsForSession(assessmentSessionId);
  const documentOutput = outputs.find((o) => o.output_type === "assessment_document");
  if (!documentOutput) return null;
  return documentOutput.content as unknown as AssessmentDocumentSnapshot;
}

/** Composes the Current Picture card's 3-state view (none / needs_review / multiple_needs_review
 * / approved) — the one read path components/residents/CurrentAssessmentCard.tsx uses.
 *
 * "Approved" is read from CR_ASSESSMENT_CURRENT's own evidence, through the SAME platform
 * evaluateRequirementSetStatus() Audit Readiness already uses — not a second, parallel notion of
 * "current." A requirement whose most recent non-superseded evidence exists at all (satisfied,
 * expiring_soon, or even expired) still means a Current Assessment is on file and viewable; only
 * a genuinely missing requirement (no evidence recorded, or its external_reference somehow can't
 * be resolved back to a session) falls through to the pending-review bucket below. */
export async function getCurrentAssessmentSummary(residentId: string): Promise<CurrentAssessmentState> {
  const requirement = await getRequirementByCode(CR_ASSESSMENT_CURRENT);
  const evidence = requirement ? await getPersonEvidenceForSubject("resident", residentId) : [];
  const latestEvidence = requirement
    ? (evaluateRequirementSetStatus([requirement], evidence).requirements[0]?.latestEvidence ?? null)
    : null;

  const approved =
    latestEvidence && latestEvidence.external_reference
      ? {
          assessmentSessionId: latestEvidence.external_reference,
          approvedAt: latestEvidence.verified_at ?? latestEvidence.created_at,
          approvedBy: latestEvidence.verified_by ?? latestEvidence.entered_by,
          pdfDocumentId: null, // automated PDF generation is deliberately deferred past Slice B
        }
      : null;

  const sessions = await getAssessmentSessionsForResident(residentId);
  const pendingSessionRecords = sessions.filter((s) => isReviewReadyStatus(s.status));
  const pendingSessions: PendingAssessmentSummary[] = [];
  for (const session of pendingSessionRecords) {
    const reviewData = await getAssessmentReviewData(session.id);
    if (!reviewData) continue;
    pendingSessions.push({
      assessmentSessionId: session.id,
      assessmentDate: session.finished_at ?? session.started_at,
      factsCapturedCount: reviewData.draftFacts.length,
      openConflictsCount: reviewData.reviewSummary.exceptions.filter(
        (e) => e.kind === "conflicting" && e.resolvedFactId === null
      ).length,
      coverageQuestionsCount: reviewData.coverage.missingTopics.length,
    });
  }

  return selectCurrentAssessmentState({ approved, pendingSessions });
}

/** Durably resolves every open conflict row for one field_path in this session to a specific
 * fact — the moment a reviewer picks "which is correct," not deferred until the whole
 * assessment is approved, so the choice survives a reload or another session picking up the
 * review from here. Resolves ALL conflict rows for the field_path (not just one), since a field
 * can in principle have more than one open question about it (e.g. a self-flagged singleton
 * alongside a paired conflict) — the field isn't truly settled until every one of them points
 * to the same answer. Looks conflicts up by session + field_path rather than taking a raw
 * conflict row id, so the client never needs to know assessment_fact_conflicts' internal ids. */
export async function resolveAssessmentConflict(input: {
  assessmentSessionId: string;
  fieldPath: string;
  resolvedFactId: string;
}): Promise<{ error?: string }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const conflicts = await getConflictsForSession(input.assessmentSessionId);
  const fieldConflicts = conflicts.filter((c) => c.field_path === input.fieldPath);
  if (fieldConflicts.length === 0) return { error: "No conflict found for this field." };

  for (const conflict of fieldConflicts) {
    const result = await resolveFactConflict({
      conflictId: conflict.id,
      resolvedFactId: input.resolvedFactId,
      resolvedBy: authResult.actor,
    });
    if (result.error) return { error: result.error };
  }
  return {};
}

/** Writes the immutable assessment_document snapshot for an already-approved session, exactly
 * once. Idempotent by construction, not by luck: checks getOutputsForSession() for an existing
 * assessment_document row first (the fast path — true on every retry/reconciliation call after
 * the first success), and if writeAssessmentOutput() still fails — the one case that check can't
 * rule out, a genuine concurrent caller (a double-click, or a reconciliation racing a second
 * approval attempt) that inserted its own row in the gap between the check and this insert —
 * re-checks before treating it as a real failure. assessment_outputs_one_document_per_session
 * (the partial unique index added alongside output_type='assessment_document') is what makes
 * that race safe to lose rather than a corrupted duplicate: the loser's insert simply errors,
 * and the re-check finds the winner's row already there.
 *
 * assessmentFacts is typed as the Pick<> approvedFactInputsToEffectiveFacts() itself accepts, not
 * the full ApprovedFactInput[] — this lets both callers pass what they actually have in hand:
 * approveAssessment() has the just-submitted ApprovedFactInput[] payload, while
 * reconcileApprovedAssessmentArtifacts() only has ApprovedFactRow[] read back from
 * assessment_approved_facts (no approval payload survives past the original request). */
async function ensureApprovedAssessmentSnapshot(input: {
  session: AssessmentSessionRecord;
  approvedAt: string;
  approvedBy: string;
  assessmentFacts: readonly Pick<ApprovedFactInput, "field_path" | "value" | "assertion_state">[];
}): Promise<{ error?: string }> {
  const existingOutputs = await getOutputsForSession(input.session.id);
  if (existingOutputs.some((o) => o.output_type === "assessment_document")) return {};

  const resident = await getResidentById(input.session.resident_id);
  const canonicalProfileFacts = resident
    ? buildCanonicalProfileEffectiveFacts(residentToCanonicalProfileFacts(resident))
    : [];

  const snapshot = buildApprovedAssessmentSnapshot({
    assessmentSessionId: input.session.id,
    residentId: input.session.resident_id,
    assessmentDate: input.session.finished_at ?? input.session.started_at,
    approvedAt: input.approvedAt,
    approvedBy: input.approvedBy,
    assessmentFacts: approvedFactInputsToEffectiveFacts(input.assessmentFacts),
    canonicalProfileFacts,
  });

  const result = await writeAssessmentOutput({
    assessmentSessionId: input.session.id,
    outputType: "assessment_document",
    content: snapshot as unknown as Record<string, unknown>,
    generatedBy: input.approvedBy,
  });
  if (result) return {};

  const recheck = await getOutputsForSession(input.session.id);
  if (recheck.some((o) => o.output_type === "assessment_document")) return {};
  return { error: "Assessment approved, but the assessment document snapshot could not be saved." };
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

  // Immutable approved-assessment snapshot (Assessment Workflow Slice B): the authoritative
  // rendering source for the formal Serve Assessment artifact and for the Current Assessment
  // view — a deterministic projection over exactly what was just approved, never a second
  // LLM pass. Sequential with approveAssessmentSession() above, same discipline as Client
  // Readiness evidence below: a failure here is surfaced honestly rather than folded into a
  // false "success," and reconcileApprovedAssessmentArtifacts() can close the gap later
  // without re-approving.
  const snapshotResult = await ensureApprovedAssessmentSnapshot({
    session,
    approvedAt: new Date().toISOString(),
    approvedBy: authResult.actor,
    assessmentFacts: input.approvedFacts,
  });
  const snapshotError = snapshotResult.error;

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
    } else if (evidenceResult.evidence) {
      // Same approved session also serves as the operational ISP — see
      // recordAssessmentIspEvidence()'s own comment for why this is
      // substantiated, not a filename-based guess. A failure here is
      // surfaced honestly, same discipline as the Assessment evidence
      // write above — it never masks itself as a false "success," and
      // reconcileApprovedAssessmentArtifacts() below can close the
      // gap later without re-approving.
      const ispRequirement = await getRequirementByCode(CR_ISP_ON_FILE_AND_CURRENT);
      if (ispRequirement) {
        const ispResult = await recordAssessmentIspEvidence({
          residentId: session.resident_id,
          requirementId: ispRequirement.id,
          assessmentEvidenceId: evidenceResult.evidence.id,
          assessmentSessionId: input.assessmentSessionId,
          effectiveDate: (session.finished_at ?? session.started_at).slice(0, 10),
          assessor: session.started_by,
          approvingActor: authResult.actor,
        });
        if (ispResult.error) {
          clientReadinessError = `Assessment approved, but ISP evidence could not be recorded: ${ispResult.error}`;
        }
      }
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

  const combinedError = [snapshotError, clientReadinessError].filter(Boolean).join(" ");
  if (combinedError) {
    return { error: combinedError, pricingStatus: pricingOutput.status };
  }
  return { pricingStatus: pricingOutput.status };
}

// Reconciliation path for the non-transactional gaps in approveAssessment(): if
// approve_assessment_session() succeeded but a follow-up step (Client Readiness evidence, the
// assessment_document snapshot) failed, this lets those gaps be closed WITHOUT re-approving.
// Deliberately does not call approveAssessmentSession() again — that RPC has no "already
// approved" guard (unlike complete_audit_session/complete_emergency_preparedness_review, it
// never checks the session's current status before re-inserting facts and re-transitioning it),
// so a naive retry of the whole approval action would insert a second, duplicate set of approved
// facts and fire a second resident_timeline entry. Every step this action re-runs is genuinely
// idempotent on its own (recordAssessmentEvidence() dedupes on assessmentSessionId;
// ensureApprovedAssessmentSnapshot() checks for an existing assessment_document row first) —
// safe to call any number of times, including when there is nothing to reconcile.
//
// Renamed from reconcileClientReadinessAssessmentEvidence() (Assessment Workflow Slice B) when
// the snapshot step was added to its scope — confirmed zero external callers before renaming.
export async function reconcileApprovedAssessmentArtifacts(
  assessmentSessionId: string
): Promise<{ error?: string; alreadyRecorded?: boolean }> {
  const authResult = await requireActor();
  if ("error" in authResult) return { error: authResult.error };

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };
  if (session.status !== "approved") {
    return { error: "This assessment has not been approved yet — nothing to reconcile." };
  }

  // The snapshot has no natural "approved_at" of its own to recover once the original request
  // has ended — the closest honest proxy is the latest approved_at actually recorded on this
  // session's own approved-fact rows (set by approve_assessment_session() itself, not client
  // clock skew). Session status is already confirmed 'approved' above, so in every real case at
  // least one row exists; the current-time fallback only guards a pathological empty session.
  // approve_assessment_session() stamps every row it inserts in one call with the same
  // approved_by, so any row here names the actual approving actor — never started_by, which is
  // whoever ran the conversation, not whoever approved it.
  const sessionFactRows = await getApprovedFactsForSession(assessmentSessionId);
  const approvedAt = sessionFactRows.reduce<string>(
    (latest, f) => (f.approved_at > latest ? f.approved_at : latest),
    sessionFactRows[0]?.approved_at ?? new Date().toISOString()
  );
  const snapshotResult = await ensureApprovedAssessmentSnapshot({
    session,
    approvedAt,
    approvedBy: sessionFactRows[0]?.approved_by ?? authResult.actor,
    assessmentFacts: sessionFactRows,
  });
  if (snapshotResult.error) return { error: snapshotResult.error };

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

  if (result.evidence) {
    const ispRequirement = await getRequirementByCode(CR_ISP_ON_FILE_AND_CURRENT);
    if (ispRequirement) {
      const ispResult = await recordAssessmentIspEvidence({
        residentId: session.resident_id,
        requirementId: ispRequirement.id,
        assessmentEvidenceId: result.evidence.id,
        assessmentSessionId,
        effectiveDate: (session.finished_at ?? session.started_at).slice(0, 10),
        assessor: session.started_by,
        approvingActor: authResult.actor,
      });
      if (ispResult.error) return { error: ispResult.error };
    }
  }

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
