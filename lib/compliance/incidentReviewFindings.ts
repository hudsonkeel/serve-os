// Incident Corrective Action Lifecycle v0.1 — pure mirror of
// mark_incident_reviewed's review_findings write decision (supabase/
// migrations/20260910000000_add_incident_corrective_action_lifecycle.sql),
// field for field, so this function's test coverage stands in for the
// SQL's own correctness — this codebase tests business logic as pure
// functions, never against a live database (see lib/compliance/__tests__/
// incidentResolutionEligibility.ts for the same pattern applied to
// resolve_incident's gate).
//
// review_findings is frozen once non-null, exactly like reviewed_by/
// reviewed_at — with one narrow exception: an incident reviewed before
// this column existed (or otherwise reviewed with no findings recorded)
// gets exactly one legacy-backfill write, on whichever re-affirm call
// first supplies a non-blank value. reviewed_by/reviewed_at are never
// touched by this decision — this function only ever answers "what should
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
