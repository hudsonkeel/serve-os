// Whether a proposed Important Person should link to an EXISTING canonical contact, create a
// new one, or require explicit human reconciliation (Slice C.3, 2026-09-19). Pure — takes
// already-fetched candidate contacts and a caller-supplied suppression set; performs no I/O and
// makes no database calls itself.
//
// This is a DIFFERENT, stricter question than importantPeopleProposals.ts's intra-assessment
// slot grouping: here, a proposal is being compared against contacts that may belong to
// completely unrelated people in the system, so it reuses classifyContactMatch()'s own
// thresholds directly, unmodified, rather than the looser same-conversation bar used for
// grouping role-slots within one assessment.

import { classifyContactMatch, type ContactForMatching, type ContactMatchTier } from "./identityMatch.ts";

export type ContactLinkAction = "create_new" | "link_existing" | "requires_reconciliation";

export interface ExistingContactCandidate extends ContactForMatching {
  readonly contactId: string;
}

export interface ContactLinkCandidateMatch {
  readonly contactId: string;
  readonly tier: ContactMatchTier;
  readonly evidence: ReturnType<typeof classifyContactMatch>["evidence"];
}

export interface ContactLinkDecision {
  readonly action: ContactLinkAction;
  /** Set only when action === "link_existing". */
  readonly matchedContactId: string | null;
  /** Every non-"no_match" candidate found, including the one ultimately chosen (if any) — kept
   * for display/advisory purposes (e.g. showing a name-only near-match as an FYI even though the
   * action is "create_new"). Never includes a suppressed contact. */
  readonly candidates: readonly ContactLinkCandidateMatch[];
}

/**
 * suppressedContactIds — contacts already confirmed NOT to be this proposal (typically because a
 * prior confirm-action explicitly rejected them in favor of a different resolution, recording a
 * contact_identity_suppressions row at that time — see lib/actions/importantPeople.ts). Excluded
 * from consideration entirely: a suppressed contact is never returned as a candidate, never
 * causes "requires_reconciliation", and never re-proposes the dismissed merge.
 */
export function evaluateContactLinkForProposal(
  proposal: ContactForMatching,
  existingContacts: readonly ExistingContactCandidate[],
  suppressedContactIds: ReadonlySet<string> = new Set()
): ContactLinkDecision {
  const candidates: ContactLinkCandidateMatch[] = [];

  for (const existing of existingContacts) {
    if (suppressedContactIds.has(existing.contactId)) continue;
    const result = classifyContactMatch(proposal, existing);
    if (result.tier === "no_match") continue;
    candidates.push({ contactId: existing.contactId, tier: result.tier, evidence: result.evidence });
  }

  const exactMatch = candidates.find((c) => c.tier === "exact_strong_match");
  if (exactMatch) {
    return { action: "link_existing", matchedContactId: exactMatch.contactId, candidates };
  }

  const needsReview = candidates.some(
    (c) => c.tier === "conflicting_identity_requires_review" || c.tier === "proposed_match_requires_review"
  );
  if (needsReview) {
    return { action: "requires_reconciliation", matchedContactId: null, candidates };
  }

  // Only name_only_no_merge candidates (if any) or none at all — never silently linked, but any
  // name-only near-match is still returned for advisory display.
  return { action: "create_new", matchedContactId: null, candidates };
}

// Automatic safe projection (Slice C.3 refinement, 2026-09-19): "Do not ask the user to confirm
// what Serve already knows" means the two genuinely unambiguous ContactLinkActions above
// (create_new with no competing signal, link_existing on an exact strong match) now execute
// automatically rather than waiting for a confirmation click. requires_reconciliation always
// stays human-only — that judgment call is exactly what an "obvious duplicate creation" or
// "silent merge" risk would otherwise smuggle past a person.
//
// The one case this function is stricter than evaluateContactLinkForProposal's own action: a
// create_new decision that still carries a name_only_no_merge candidate. That tier already
// guarantees the candidate is never auto-LINKED (a shared name alone is never sufficient to
// merge), but blindly auto-CREATING in that situation would silently produce what looks like an
// obvious duplicate person to whoever notices it later — the exact failure mode this refinement
// exists to avoid on the other side. Genuine judgment (is this really a second person, or the
// same one under a different phone number?) is a human call, so this downgrades that one
// situation to needs_review rather than either auto action.
export type AutomaticProjectionAction = "auto_create" | "auto_link" | "needs_review";

export function decideAutomaticProjectionAction(decision: ContactLinkDecision): AutomaticProjectionAction {
  if (decision.action === "link_existing") return "auto_link";
  if (decision.action === "requires_reconciliation") return "needs_review";
  const hasNameOnlyCandidate = decision.candidates.some((c) => c.tier === "name_only_no_merge");
  return hasNameOnlyCandidate ? "needs_review" : "auto_create";
}

/** Short, human-facing reason for a needs_review state — never a paragraph, never the raw
 * evidence array. Picks the single most relevant candidate's tier (a proposal can only reach
 * needs_review via requires_reconciliation, or via create_new with a name_only_no_merge
 * candidate — see decideAutomaticProjectionAction above). */
export function describeNeedsReviewReason(decision: ContactLinkDecision): string {
  if (decision.candidates.some((c) => c.tier === "conflicting_identity_requires_review")) {
    return "Conflicting information with an existing contact";
  }
  if (decision.candidates.some((c) => c.tier === "proposed_match_requires_review")) {
    return "Possible match with an existing contact";
  }
  return "Same name as an existing contact";
}
