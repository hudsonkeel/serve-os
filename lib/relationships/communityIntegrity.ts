// The approved invariant (Phase E/F, section 9): when a relationship has a
// resident_id, its community_id must agree with that resident's
// community_id. Enforced here, at the application write/link layer — not
// a DB trigger yet (explicit instruction: propose one only if this proves
// insufficient). Never silently rewrites one side to match the other; a
// real mismatch is rejected, not resolved for the caller.
//
// Pure decision logic (no I/O) lives in this file and is directly unit
// tested; the one real lookup (fetching the resident) is a thin wrapper
// around it, matching the communityScope.ts/currentCommunity.ts split
// already established elsewhere in this phase.
import "server-only";
import { getResidentById } from "../data/residents.ts";

export interface ResolvedRelationshipCommunity {
  readonly communityId: string | null;
  readonly error?: string;
}

// Priority order (Phase E/F, section 8): an explicitly linked resident is
// the strongest source (its own community_id is authoritative);
// otherwise the creator's current single-community context applies
// automatically; otherwise (no resident, and the creator has no single
// community selected — all_communities or unassigned scope) the
// relationship is genuinely unassigned rather than guessed.
export function pickCommunityForCreation(input: {
  readonly hasResident: boolean;
  readonly residentCommunityId: string | null;
  readonly currentSingleCommunityId: string | null;
}): string | null {
  if (input.hasResident) {
    return input.residentCommunityId;
  }
  return input.currentSingleCommunityId;
}

// Used at relationship CREATION time, before any row exists — there is
// nothing to "mismatch" yet, only a community to resolve.
export async function resolveRelationshipCommunityIdForCreation(input: {
  readonly residentId: string | null;
  readonly currentSingleCommunityId: string | null;
}): Promise<ResolvedRelationshipCommunity> {
  if (input.residentId) {
    const resident = await getResidentById(input.residentId);
    if (!resident) {
      return { communityId: null, error: "The linked resident could not be found." };
    }
    return { communityId: pickCommunityForCreation({ hasResident: true, residentCommunityId: resident.community_id, currentSingleCommunityId: input.currentSingleCommunityId }) };
  }
  return { communityId: pickCommunityForCreation({ hasResident: false, residentCommunityId: null, currentSingleCommunityId: input.currentSingleCommunityId }) };
}

export type CommunityLinkReconciliation =
  | { readonly ok: true; readonly resolvedCommunityId: string | null }
  | { readonly ok: false; readonly error: string };

// Used when LINKING an already-existing relationship to an already-existing
// resident. Two distinct outcomes, deliberately not conflated:
//   - the relationship has no community yet (null) -> it inherits the
//     resident's, since linking is exactly the moment that ambiguity
//     resolves for a genuinely pre-resident inquiry. Not a "rewrite" — the
//     value was never set.
//   - the relationship already has a DIFFERENT community than the
//     resident -> a real mismatch, rejected outright. The caller must
//     resolve it deliberately rather than have either side silently
//     overwritten.
export function reconcileCommunityForLinking(input: {
  readonly relationshipCommunityId: string | null;
  readonly residentCommunityId: string | null;
}): CommunityLinkReconciliation {
  if (input.relationshipCommunityId === null) {
    return { ok: true, resolvedCommunityId: input.residentCommunityId };
  }
  if (input.relationshipCommunityId !== input.residentCommunityId) {
    return {
      ok: false,
      error:
        "This relationship's community does not match the resident's community. Resolve the mismatch before linking rather than overwriting either record.",
    };
  }
  return { ok: true, resolvedCommunityId: input.relationshipCommunityId };
}

export async function reconcileRelationshipCommunityIdForLinking(input: {
  readonly relationshipCommunityId: string | null;
  readonly residentId: string;
}): Promise<CommunityLinkReconciliation> {
  const resident = await getResidentById(input.residentId);
  if (!resident) {
    return { ok: false, error: "The resident being linked could not be found." };
  }
  return reconcileCommunityForLinking({
    relationshipCommunityId: input.relationshipCommunityId,
    residentCommunityId: resident.community_id,
  });
}
