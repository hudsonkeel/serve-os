// Combines the two separate dimensions of an AxisCare client record:
// lifecycle (clientLifecycle.ts — what AxisCare says the record's
// operational state is, computed from status/class fields) and
// disposition (clientDisposition.ts — whether the record represents a
// true operational client at all, a durable human override). Neither
// module is changed by this one; this is purely a combinator, so a
// future People We Serve UI (or any other consumer) has one place to
// get the answer that actually matters operationally, without
// re-deriving the combination rule itself.
import type { ServeClientLifecycle } from "./clientLifecycle.ts";
import type { AxisCareClientDisposition } from "./clientDisposition.ts";
import { isExcludedFromLifecycleCounts } from "./clientDisposition.ts";
import type { ClientMatchBasis, ClientMatchResult } from "./clientIdentityMatching.ts";

export type AxisCareClientOperationalBucket = ServeClientLifecycle | "excluded";

// A disposition-excluded record (non_client_related_person,
// administrative_record, test_placeholder) is always "excluded",
// regardless of what the computed lifecycle says — the human override
// wins. Absence of a disposition row, or a non-excluding disposition
// (real_client, prospect, needs_review), leaves the computed lifecycle
// untouched — it must never silently disappear.
export function resolveAxisCareClientOperationalBucket(
  computedLifecycle: ServeClientLifecycle,
  disposition: AxisCareClientDisposition | null
): AxisCareClientOperationalBucket {
  if (isExcludedFromLifecycleCounts(disposition)) {
    return "excluded";
  }
  return computedLifecycle;
}

// Identity confidence is a separate dimension from the operational
// bucket above — never used to decide whether a record counts as a
// real Active/Inactive/Prospect client, only to describe how sure Serve
// is about *which* resident (if any) this AxisCare record refers to.
export type AxisCareIdentityStatus = "confirmed" | "candidate" | "needs_identity_review" | "unmatched";

export function resolveAxisCareIdentityStatus(residentMatch: {
  readonly residentId: string | null;
  readonly requiresReview: boolean;
  readonly confirmedLinkStatus: string | null;
}): AxisCareIdentityStatus {
  if (residentMatch.confirmedLinkStatus === "confirmed") {
    return "confirmed";
  }
  if (residentMatch.residentId === null) {
    return "unmatched";
  }
  if (residentMatch.requiresReview) {
    return "needs_identity_review";
  }
  return "candidate";
}

export interface ResolvedResidentMatch {
  readonly residentId: string | null;
  readonly basis: ClientMatchBasis;
  readonly requiresReview: boolean;
}

// A confirmed human decision always wins over a fresh deterministic
// recomputation of the same evidence — even if the underlying AxisCare
// data has since changed in a way that would no longer deterministically
// match, a confirmed link stays confirmed (a later, real disagreement
// is a reconciliation question, not something this function silently
// resolves). A rejected decision must never resurface its rejected
// candidate as if still open for review — the fresh match is
// suppressed entirely here, not just re-displayed with a stale "needs
// review" flag. Any other state (proposed, deferred, or no link at
// all) uses the current deterministic computation, since a human
// hasn't made a final call yet and the freshest evidence should win.
export function resolveAxisCareResidentMatch(
  freshMatch: ClientMatchResult,
  existingLink: { readonly subject_id: string | null; readonly status: string } | null
): ResolvedResidentMatch {
  if (existingLink?.status === "confirmed") {
    return { residentId: existingLink.subject_id, basis: freshMatch.basis, requiresReview: false };
  }
  if (existingLink?.status === "rejected") {
    return { residentId: null, basis: "none", requiresReview: false };
  }
  return { residentId: freshMatch.residentId, basis: freshMatch.basis, requiresReview: freshMatch.requiresReview };
}
