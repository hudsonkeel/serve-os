// Generalized (Infection Lifecycle & Learning Loop v0.1 reuse review) from
// the Incident-only lib/compliance/incidentReviewFindings.ts — this
// function was already fully domain-agnostic (pure string logic, zero
// Incident types) and now backs BOTH mark_incident_reviewed's and
// mark_infection_reviewed's identical review_findings write decision
// (supabase/migrations/20260910000000_add_incident_corrective_action_lifecycle.sql
// and 20260913000000_add_infection_follow_up_lifecycle.sql respectively) —
// two separate hand-written SQL functions against two separate tables, not
// a shared SQL function, but the same TS reference behavior mirrors both,
// field for field. This function's test coverage stands in for both SQL
// functions' own correctness — this codebase tests business logic as pure
// functions, never against a live database (see lib/compliance/__tests__/
// incidentResolutionEligibility.test.ts for the same pattern).
//
// review_findings is frozen once non-null, exactly like reviewed_by/
// reviewed_at — with one narrow exception: a record reviewed before this
// column existed (or otherwise reviewed with no findings recorded) gets
// exactly one legacy-backfill write, on whichever re-affirm call first
// supplies a non-blank value. reviewed_by/reviewed_at are never touched by
// this decision — this function only ever answers "what should
// review_findings become," nothing else.

export function resolveReviewFindingsOnReaffirm(
  currentReviewFindings: string | null,
  proposedReviewFindings: string | null | undefined
): string | null {
  if (currentReviewFindings !== null) {
    // Already populated — frozen. A later substantive change is future
    // amendment-capability work, not this path.
    return currentReviewFindings;
  }

  const trimmed = (proposedReviewFindings ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}
