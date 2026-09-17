// The immutable approved-assessment snapshot — Assessment Workflow Slice B (2026-09-17). Stored
// once, at approval, as an assessment_outputs row (output_type='assessment_document'). Pure and
// deterministic: composed entirely from buildAssessmentProjection()/mergeEffectiveFacts()
// (Slice A), never a new LLM narrative pass, never re-derived from anything mutable. See
// docs/architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §11.
//
// WHY THIS IS FROZEN, NOT RE-COMPUTED LATER: assessmentFacts and canonicalProfileFacts are both
// passed in already-resolved, by the caller (lib/actions/assessmentIntelligence.ts's
// approveAssessment(), which reads the resident's canonical profile fresh, exactly once, at the
// moment of approval). Nothing in this module reads the database. A later edit to the resident's
// profile (DOB corrected, phone updated, moved communities) must never silently rewrite a
// historical assessment's displayed content -- the snapshot this function returns is exactly and
// only what was true at approval time, baked into plain data, never a live view.

import { buildAssessmentProjection, mergeEffectiveFacts, type EffectiveFact, type ProjectedDomainSection } from "./assessmentProjection.ts";

export const ASSESSMENT_SNAPSHOT_SCHEMA_VERSION = 1;

export interface AssessmentDocumentSnapshot {
  readonly schemaVersion: number;
  readonly assessmentSessionId: string;
  readonly residentId: string;
  /** The assessment's own date (session.finished_at ?? session.started_at) -- when the
   * conversation happened, distinct from approvedAt below (when a human signed off on it). */
  readonly assessmentDate: string;
  readonly approvedAt: string;
  readonly approvedBy: string;
  /** Domain-grouped, professional structure -- the exact same shape and rules
   * buildAssessmentProjection() produces for the live pre-approval preview
   * (serve_relationship_intelligence excluded, five display states, per-field provenance). */
  readonly sections: readonly ProjectedDomainSection[];
}

export function buildApprovedAssessmentSnapshot(input: {
  readonly assessmentSessionId: string;
  readonly residentId: string;
  readonly assessmentDate: string;
  readonly approvedAt: string;
  readonly approvedBy: string;
  readonly assessmentFacts: readonly EffectiveFact[];
  readonly canonicalProfileFacts: readonly EffectiveFact[];
}): AssessmentDocumentSnapshot {
  const merged = mergeEffectiveFacts(input.assessmentFacts, input.canonicalProfileFacts);
  const sections = buildAssessmentProjection(merged);
  return {
    schemaVersion: ASSESSMENT_SNAPSHOT_SCHEMA_VERSION,
    assessmentSessionId: input.assessmentSessionId,
    residentId: input.residentId,
    assessmentDate: input.assessmentDate,
    approvedAt: input.approvedAt,
    approvedBy: input.approvedBy,
    sections,
  };
}
