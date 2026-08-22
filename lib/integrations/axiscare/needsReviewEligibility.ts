// AxisCare Reconciliation + Multi-Source Identity Ingestion phase.
//
// Which stored axiscare_client_operational_state rows are actionable
// community "Needs Review" work — pure, unit-testable, no DB dependency.
// This is deliberately NOT gated on computed_lifecycle's value: every
// lifecycle bucket (active_client/inactive_client/prospect/needs_review)
// can represent a real, community-affiliated person Serve doesn't yet
// have a canonical match for — an AxisCare-level "needs_review" lifecycle
// already means "ambiguous, a human should look at this," which is
// exactly what this queue is for, not a reason to hide it. The actual
// noise (synthetic/test AxisCare rows, structural placeholders, denylisted
// non-resident contacts) is filtered out by the OTHER conditions below,
// never by lifecycle bucket.
import { isExcludedFromLifecycleCounts, type AxisCareClientDisposition } from "./clientDisposition.ts";

export interface NeedsReviewEligibilityInput {
  readonly resolvedCommunityId: string | null;
  readonly matchedResidentId: string | null;
  readonly isPlaceholderRecord: boolean;
  readonly isNameDenylisted: boolean;
  readonly disposition: AxisCareClientDisposition | null;
}

export function isEligibleForCommunityNeedsReview(input: NeedsReviewEligibilityInput): boolean {
  // A record with no resolved community must never surface under any
  // single community, and (per this phase's own instruction) is not shown
  // in the "All Communities" composed view either — it stays solely in the
  // broader /reconciliation queue until its community is genuinely known.
  if (input.resolvedCommunityId === null) return false;
  // Already resolved to a canonical person — not unresolved work.
  if (input.matchedResidentId !== null) return false;
  if (input.isPlaceholderRecord) return false;
  if (input.isNameDenylisted) return false;
  if (isExcludedFromLifecycleCounts(input.disposition)) return false;
  return true;
}
