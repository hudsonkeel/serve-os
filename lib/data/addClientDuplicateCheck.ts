// Add New Client phase — "search existing Serve people using the current
// identity framework" (never a new, third matching engine). Composes the
// TWO existing deterministic engines this codebase already has, in order:
//
//   Tier 1 — the AxisCare/roster contact matcher
//   (findFreshCredibleResidentMatch -> matchAxisCareClientToResident):
//   name + email + phone + community/apartment + confirmed
//   aliases/redirects, cross-community by construction. The exact same
//   fresh-duplicate-check function createResidentFromAxisCareRecord and
//   createResidentFromRosterRow already call immediately before creating
//   a resident.
//
//   Tier 2 — the identity-signal engine (lib/residents/addClient/
//   duplicateCheckLogic.ts, pure/unit-tested — same identitySignals.ts +
//   householdSignals.ts + confidenceBands.ts machinery Community Roster
//   Import Pass 2/3 already established), reached only when Tier 1 finds
//   nothing: adds DOB and name-edit-distance/compound-name-variant
//   evidence Tier 1 doesn't have. Checked in-community first, then
//   cross-community (framed as a possible move, never auto-selected,
//   never changes anyone's community_id).
//
// Name alone is never proof in either tier: Tier 1 always requires a
// second corroborating field (email/phone/community/apartment); Tier 2's
// confidenceBand requires either two strong identity signals or one
// strong signal plus household corroboration before returning anything.
import "server-only";
import { findFreshCredibleResidentMatch } from "./axiscareClientOperationalSummary.ts";
import { getResidentById } from "./residents.ts";
import { loadLiveResidentsForCommunity, loadLiveResidentsExcludingCommunity } from "./residentRoster.ts";
import { loadConfirmedAliases } from "./residentIdentity.ts";
import { scanForIdentitySignalMatches, type NewClientCandidatePerson } from "../residents/addClient/duplicateCheckLogic.ts";
import type { ClientMatchBasis } from "../integrations/axiscare/clientIdentityMatching.ts";

export interface PossibleExistingServePersonMatch {
  readonly residentId: string;
  readonly residentName: string;
  readonly reason: string;
  readonly isCrossCommunity: boolean;
  readonly candidateCommunityName: string | null;
}

function describeContactBasis(basis: ClientMatchBasis): string {
  switch (basis) {
    case "email":
      return "Matches an existing Serve person's email address.";
    case "phone":
      return "Matches an existing Serve person's phone number.";
    case "name_and_apartment":
      return "Matches an existing Serve person's name and apartment/unit.";
    case "name_and_community":
      return "Matches an existing Serve person's name within this community.";
    case "surname_and_community":
      return "Matches an existing Serve person's surname within this community.";
    case "manual_match":
      return "Previously confirmed as the same person.";
    case "none":
      return "Possible match found.";
  }
}

export interface FindPossibleExistingServePersonInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly dateOfBirth: string | null;
  readonly communityId: string;
  readonly communityName: string;
  readonly unitNumber: string | null;
}

export async function findPossibleExistingServePerson(
  input: FindPossibleExistingServePersonInput
): Promise<PossibleExistingServePersonMatch | null> {
  // ─── Tier 1: contact matcher (name + email/phone/community/apartment) ──
  const contactMatch = await findFreshCredibleResidentMatch({
    firstName: input.firstName,
    lastName: input.lastName,
    personalEmail: input.email,
    homePhone: input.phone,
    communityName: input.communityName,
  });
  if (contactMatch) {
    const matchedResident = await getResidentById(contactMatch.residentId);
    const isCrossCommunity = Boolean(matchedResident?.community_id && matchedResident.community_id !== input.communityId);
    return {
      residentId: contactMatch.residentId,
      residentName: contactMatch.residentName ?? "Unnamed Resident",
      reason: describeContactBasis(contactMatch.basis),
      isCrossCommunity,
      candidateCommunityName: isCrossCommunity ? (matchedResident?.community_name ?? null) : null,
    };
  }

  // ─── Tier 2: identity-signal engine (DOB, name-edit-distance/compound
  // variant, confirmed alias), in-community first, then cross-community.
  const [communityCandidates, crossCommunityCandidates, confirmedAliases] = await Promise.all([
    loadLiveResidentsForCommunity(input.communityId),
    loadLiveResidentsExcludingCommunity(input.communityId),
    loadConfirmedAliases(),
  ]);

  const person: NewClientCandidatePerson = {
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    phone: input.phone,
    unitNumber: input.unitNumber,
  };

  const inCommunity = scanForIdentitySignalMatches(person, communityCandidates, confirmedAliases, {
    communityId: input.communityId,
  });
  if (inCommunity.length === 1) {
    const match = inCommunity[0];
    return {
      residentId: match.residentId,
      residentName: match.residentName,
      reason: match.descriptions.join(" "),
      isCrossCommunity: false,
      candidateCommunityName: null,
    };
  }
  // Multiple in-community candidates: genuinely ambiguous — never guess
  // which one, but still surface that a review is warranted rather than
  // silently proceeding as if nothing were found.
  if (inCommunity.length > 1) {
    return {
      residentId: inCommunity[0].residentId,
      residentName: `${inCommunity.length} possible people, including ${inCommunity[0].residentName}`,
      reason: `${inCommunity.length} existing people share enough evidence to warrant review — cannot auto-resolve. Search directly to confirm.`,
      isCrossCommunity: false,
      candidateCommunityName: null,
    };
  }

  const crossCommunity = scanForIdentitySignalMatches(person, crossCommunityCandidates, confirmedAliases, {
    communityId: null,
  });
  if (crossCommunity.length === 1) {
    const match = crossCommunity[0];
    const matchedResident = await getResidentById(match.residentId);
    return {
      residentId: match.residentId,
      residentName: match.residentName,
      reason: match.descriptions.join(" "),
      isCrossCommunity: true,
      candidateCommunityName: matchedResident?.community_name ?? null,
    };
  }

  return null;
}
