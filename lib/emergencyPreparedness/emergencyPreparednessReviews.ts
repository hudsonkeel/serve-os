// Business orchestration for one Annual Review requirement-finding — which
// outcomes do and don't create person_evidence, and exactly how, per the
// evidence-fact preservation rule: confirming an existing artifact/
// designation/assessment as still current always inserts a NEW, independent
// person_evidence row (own effective_date/expiration_date) rather than
// rewriting or extending the original's dates. supersedes_evidence_id/
// supersedes_document_id is reserved for when the underlying artifact
// actually changes.
//
// The review only walks the 4 requirements genuinely re-confirmed on the
// annual cycle: EP_PLAN_MAINTAINED, EP_DISASTER_COORDINATOR_DESIGNATED,
// EP_RISK_ASSESSMENT_CURRENT, EP_ANNUAL_PLAN_REVIEW. EP_ANNUAL_RESPONSE_DRILL
// is deliberately NOT walked here — "a drill happened" isn't a
// no_change_needed/update_needed reaffirmation of an existing artifact, it's
// its own discrete event, recorded any time via
// recordEmergencyPreparednessDrillOrResponse below (inside or outside a
// review). EP_HHS_NOTIFICATION is purely event-triggered and not part of the
// annual cycle at all — see lib/emergencyPreparedness/constants.ts.
import { createPersonEvidence, getPersonEvidenceForSubject, verifyPersonEvidence } from "../data/personEvidence.ts";
import {
  insertEmergencyPreparednessReviewItem,
} from "../data/emergencyPreparednessReviews.ts";
import { ANNUAL_EVIDENCE_VALIDITY_DAYS, EP_ANNUAL_PLAN_REVIEW, NON_EXPIRING_REQUIREMENT_CODES } from "./constants.ts";
import type { EmergencyPreparednessSatisfactionContext } from "./satisfactionContext.ts";
import type { EmergencyPreparednessReviewItem, EmergencyPreparednessReviewOutcome, PersonEvidence, PersonRequirement } from "../supabase/types.ts";

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function createVerifiedEvidence(input: {
  agencyId: string;
  requirementId: string;
  documentId: string | null;
  effectiveDate: string;
  expirationDate: string | null;
  // Null for an ordinary direct/ad-hoc record (e.g. "Upload Evidence" from
  // a requirement's detail panel, outside any review) — satisfaction_context
  // only carries meaning for the specific annual-review/drill outcomes that
  // need a non-default explanation label; it is not mandatory on every row.
  satisfactionContext: EmergencyPreparednessSatisfactionContext | null;
  supersedesEvidenceId?: string | null;
  actor: string;
  notes: string | null;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  const created = await createPersonEvidence({
    subjectType: "agency",
    subjectId: input.agencyId,
    requirementId: input.requirementId,
    documentId: input.documentId,
    result: null,
    performedAt: input.effectiveDate,
    effectiveDate: input.effectiveDate,
    reviewDueDate: null,
    expirationDate: input.expirationDate,
    enteredBy: input.actor,
    notes: input.notes,
    supersedesEvidenceId: input.supersedesEvidenceId ?? null,
    satisfactionContext: input.satisfactionContext,
  });
  if (created.error || !created.evidence) return { error: created.error };

  // A reviewer's direct attestation is the verification act itself —
  // matching Human Attestation's direct_source_review discipline (there is
  // no second-party sign-off step in this phase).
  const verified = await verifyPersonEvidence({
    evidenceId: created.evidence.id,
    verifiedBy: input.actor,
    result: null,
    notes: input.notes,
  });
  if (verified.error) return { error: verified.error };

  return { evidence: { ...created.evidence, verification_status: "verified", verified_by: input.actor } };
}

export async function recordEmergencyPreparednessRequirementFinding(input: {
  reviewId: string;
  agencyId: string;
  requirement: PersonRequirement;
  outcome: EmergencyPreparednessReviewOutcome;
  notes: string | null;
  actor: string;
  // Only meaningful for outcome = 'update_needed' — the newly uploaded
  // artifact replacing the prior one.
  newDocumentId?: string | null;
}): Promise<{ item?: EmergencyPreparednessReviewItem; error?: string }> {
  const code = input.requirement.requirement_code;
  const nonExpiring = NON_EXPIRING_REQUIREMENT_CODES.has(code);
  let resultingEvidenceId: string | null = null;

  if (input.outcome === "no_change_needed") {
    if (nonExpiring) {
      // EP_PLAN_MAINTAINED / EP_DISASTER_COORDINATOR_DESIGNATED: satisfied
      // by continued existence, not a calendar — the review's confirmation
      // is preserved entirely as this review item, with no resulting
      // evidence row at all, so a missed future review can never cascade
      // into a false failure here.
      resultingEvidenceId = null;
    } else {
      const satisfactionContext: EmergencyPreparednessSatisfactionContext =
        code === EP_ANNUAL_PLAN_REVIEW ? "annual_review_completed" : "annual_reaffirmation";
      const today = new Date();
      const result = await createVerifiedEvidence({
        agencyId: input.agencyId,
        requirementId: input.requirement.id,
        documentId: null,
        effectiveDate: today.toISOString().slice(0, 10),
        expirationDate: addDays(today, ANNUAL_EVIDENCE_VALIDITY_DAYS),
        satisfactionContext,
        actor: input.actor,
        notes: input.notes,
      });
      if (result.error) return { error: result.error };
      resultingEvidenceId = result.evidence!.id;
    }
  } else if (input.outcome === "update_needed") {
    if (!input.newDocumentId) {
      return { error: "A new document is required to record an update." };
    }
    const existingEvidence = await getPersonEvidenceForSubject("agency", input.agencyId);
    const priorForRequirement = existingEvidence
      .filter((e) => e.requirement_id === input.requirement.id && e.lifecycle_status === "active")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    const today = new Date();
    const result = await createVerifiedEvidence({
      agencyId: input.agencyId,
      requirementId: input.requirement.id,
      documentId: input.newDocumentId,
      effectiveDate: today.toISOString().slice(0, 10),
      expirationDate: nonExpiring ? null : addDays(today, ANNUAL_EVIDENCE_VALIDITY_DAYS),
      satisfactionContext: "annual_update",
      supersedesEvidenceId: priorForRequirement?.id ?? null,
      actor: input.actor,
      notes: input.notes,
    });
    if (result.error) return { error: result.error };
    resultingEvidenceId = result.evidence!.id;
  }
  // evidence_needed / needs_review: no evidence written — the requirement
  // stays exactly as the shared evaluator already sees it (missing/
  // requires_review); a corrective action is the caller's separate concern.

  return insertEmergencyPreparednessReviewItem({
    reviewId: input.reviewId,
    itemKind: "requirement_finding",
    requirementId: input.requirement.id,
    outcome: input.outcome,
    resultingEvidenceId,
    description: null,
    notes: input.notes,
    createdBy: input.actor,
  });
}

export async function recordEmergencyPreparednessImprovement(input: {
  reviewId: string;
  description: string;
  notes: string | null;
  actor: string;
}): Promise<{ item?: EmergencyPreparednessReviewItem; error?: string }> {
  return insertEmergencyPreparednessReviewItem({
    reviewId: input.reviewId,
    itemKind: "improvement",
    requirementId: null,
    outcome: null,
    resultingEvidenceId: null,
    description: input.description,
    notes: input.notes,
    createdBy: input.actor,
  });
}

// A direct, review-independent evidence record — "Upload Evidence" /
// "Record/Verify Designation" from a requirement's own detail panel
// (components/emergencyPreparedness/RequirementBoard.tsx), for establishing
// a requirement's evidence the first time or replacing it "whenever
// material circumstances warrant it," per Phase A's own decision language
// for EP_RISK_ASSESSMENT_CURRENT — the Annual Review is not the only path
// to updating EP evidence, only the once-a-year formal reaffirmation of it.
// Always supersedes the prior current evidence for this requirement, if
// any — a direct record always represents a real artifact
// establishment/replacement, never a mere reaffirmation (which only
// happens through the review's own no_change_needed outcome).
export async function recordEmergencyPreparednessEvidence(input: {
  agencyId: string;
  requirement: PersonRequirement;
  documentId: string | null;
  effectiveDate: string;
  notes: string | null;
  actor: string;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  const nonExpiring = NON_EXPIRING_REQUIREMENT_CODES.has(input.requirement.requirement_code);
  const existingEvidence = await getPersonEvidenceForSubject("agency", input.agencyId);
  const prior = existingEvidence
    .filter((e) => e.requirement_id === input.requirement.id && e.lifecycle_status === "active")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return createVerifiedEvidence({
    agencyId: input.agencyId,
    requirementId: input.requirement.id,
    documentId: input.documentId,
    effectiveDate: input.effectiveDate,
    expirationDate: nonExpiring ? null : addDays(new Date(input.effectiveDate), ANNUAL_EVIDENCE_VALIDITY_DAYS),
    satisfactionContext: null,
    supersedesEvidenceId: prior?.id ?? null,
    actor: input.actor,
    notes: input.notes,
  });
}

// EP_ANNUAL_RESPONSE_DRILL's own evidence — a discrete event, recordable
// any time (inside or outside a review), never a no_change_needed
// reaffirmation of a prior artifact. `kind` distinguishes the two P&P
// §256-named evidence types for explanation only
// (classifyEmergencyPreparednessEvidence's satisfied_by_event labels) —
// never a different compliance outcome.
export async function recordEmergencyPreparednessDrillOrResponse(input: {
  agencyId: string;
  requirement: PersonRequirement;
  kind: Extract<EmergencyPreparednessSatisfactionContext, "planned_drill" | "actual_emergency_response">;
  occurredAt: string;
  documentId: string | null;
  notes: string | null;
  actor: string;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  return createVerifiedEvidence({
    agencyId: input.agencyId,
    requirementId: input.requirement.id,
    documentId: input.documentId,
    effectiveDate: input.occurredAt,
    expirationDate: addDays(new Date(input.occurredAt), ANNUAL_EVIDENCE_VALIDITY_DAYS),
    satisfactionContext: input.kind,
    actor: input.actor,
    notes: input.notes,
  });
}
