// Assessment community resolution (Phase E/F completion, section 1/2) —
// pure decision logic, no I/O, mirroring the
// lib/relationships/communityIntegrity.ts split already established this
// phase. Priority order, per the governing instruction:
//   1. linked resident's own community_id;
//   2. linked relationship/prospect's own community_id;
//   3. the creator's current single-community context.
// Disagreement between available sources is rejected outright, never
// silently resolved by picking one. An all_communities context with no
// resident/relationship source is also rejected — explicit selection is
// required for a partner/community assessment rather than creating
// ambiguous ownership. An unassigned context with no resident/relationship
// source resolves to null (genuinely unassigned), matching the existing
// resident/relationship precedent from earlier in this phase.

export type AssessmentCurrentContext =
  | { readonly mode: "single"; readonly communityId: string }
  | { readonly mode: "all" }
  | { readonly mode: "none" };

export type AssessmentCommunityResolution =
  | { readonly ok: true; readonly communityId: string | null }
  | { readonly ok: false; readonly error: string };

export function resolveAssessmentCommunity(input: {
  readonly hasResident: boolean;
  readonly residentCommunityId: string | null;
  readonly hasRelationship: boolean;
  readonly relationshipCommunityId: string | null;
  readonly currentContext: AssessmentCurrentContext;
}): AssessmentCommunityResolution {
  // Only a source that itself resolved a real value "votes" — a linked
  // resident/relationship with no community of its own yet simply isn't a
  // source, not a vote for null.
  const votes: string[] = [];
  if (input.hasResident && input.residentCommunityId) votes.push(input.residentCommunityId);
  if (input.hasRelationship && input.relationshipCommunityId) votes.push(input.relationshipCommunityId);
  const uniqueVotes = [...new Set(votes)];

  if (uniqueVotes.length > 1) {
    return {
      ok: false,
      error: "The linked resident and relationship disagree about which community this assessment belongs to. Resolve the conflict before continuing.",
    };
  }
  if (uniqueVotes.length === 1) {
    return { ok: true, communityId: uniqueVotes[0] };
  }

  // No resident/relationship source resolved a value.
  if (input.currentContext.mode === "single") {
    return { ok: true, communityId: input.currentContext.communityId };
  }
  if (input.currentContext.mode === "all") {
    return {
      ok: false,
      error: "Select a specific community before starting this assessment — no resident or relationship community was found, and multiple communities are available.",
    };
  }
  // mode "none" (unassigned): genuinely unassigned, valid and structural
  // (never guessed, never defaulted to Frisco) — also the correct shape
  // for a future direct-home Traditional Care assessment with no partner
  // community at all.
  return { ok: true, communityId: null };
}
