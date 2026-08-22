// Shared types for the Resident Identity Resolution engine. See
// docs referenced from scripts/detectResidentIdentityCandidates.ts's
// module comment for the governing rules this engine implements.
//
// Phase 2 — evidence domain separation: identity ("is this the same
// human?"), household ("do these residents likely share a household?"),
// and source authority ("which record do we trust more?") are three
// independent questions, each with its own type family below. Nothing in
// this file lets a household signal be silently counted as identity
// evidence — see lib/residents/identity/confidenceBands.ts for where
// that separation is enforced structurally, not just by convention.

export interface LiveResidentForIdentity {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly middleName: string | null;
  readonly preferredName: string | null;
  readonly displayName: string | null;
  readonly fullName: string | null;
  readonly unitNumber: string | null;
  readonly building: string | null;
  readonly communityCode: string | null;
  // Canonical FK (Phase E/F completion, section 3) — the governed source
  // for community-aware identity/household reasoning, alongside the
  // legacy free-text communityCode above (kept for display/back-compat,
  // never the source of truth for a same-vs-different-community
  // decision).
  readonly communityId: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly dateOfBirth: string | null;
  readonly familyContactName: string | null;
  readonly familyContactPhone: string | null;
  readonly needsReview: string | null;
  readonly isActive: boolean;
  readonly sourceSystem: string | null;
  readonly createdAt: string;
}

export type EvidenceStrength = "strong" | "contextual" | "negative";

// ─── Identity evidence — "is this the same human?" ─────────────────────
// Never includes phone/apartment/address — those are household questions,
// not identity questions. See lib/residents/identity/identitySignals.ts.
export type IdentitySignalType =
  | "exact_full_name"
  | "first_name_edit_distance_one"
  | "last_name_edit_distance_one"
  | "compound_name_variant"
  | "same_dob"
  | "confirmed_alias_match"
  | "absent_while_similar_present"
  | "conflicting_dob"
  | "conflicting_legal_name"
  | "suppressed_pair";

export interface IdentityEvidenceSignal {
  readonly signalType: IdentitySignalType;
  readonly residentIdA: string;
  readonly residentIdB: string;
  readonly description: string;
  readonly strength: EvidenceStrength;
}

// Every known identity signal type — used by the `--migrate-phase1` CLI
// step to recognize Phase 1 candidates whose evidence contains NONE of
// these (i.e. household-only evidence such as the old undifferentiated
// "same_phone" signal) so they can be reclassified as household links
// instead of identity candidates.
export const IDENTITY_SIGNAL_TYPES: readonly IdentitySignalType[] = [
  "exact_full_name",
  "first_name_edit_distance_one",
  "last_name_edit_distance_one",
  "compound_name_variant",
  "same_dob",
  "confirmed_alias_match",
  "absent_while_similar_present",
  "conflicting_dob",
  "conflicting_legal_name",
  "suppressed_pair",
];

// ─── Household evidence — "do these residents share a household?" ──────
// Never contributes to identity confidence on its own. See
// lib/residents/identity/householdSignals.ts.
export type HouseholdSignalType = "same_apartment" | "same_phone" | "same_building_and_community" | "shared_family_contact";

export interface HouseholdEvidenceSignal {
  readonly signalType: HouseholdSignalType;
  readonly residentIdA: string;
  readonly residentIdB: string;
  readonly description: string;
}

export type ConfidenceBand = "high" | "probable" | "needs_investigation";

export interface CandidateDraft {
  readonly residentIds: readonly string[];
  readonly confidenceBand: ConfidenceBand;
  // The evidence the band was computed from — identity evidence only.
  readonly evidence: readonly IdentityEvidenceSignal[];
  // Corroborating context, shown separately, never counted toward the
  // band above. Empty when no household evidence exists for this pair.
  readonly householdContext: readonly HouseholdEvidenceSignal[];
  readonly matchingRuleVersion: string;
  // Phase E/F completion, section 3 — true when both residents have a
  // known, different communityId. The identity signals/confidence band
  // above are computed exactly the same way regardless of this flag
  // (matching name+DOB is never suppressed just because communities
  // differ — the system must remain capable of discovering a genuine
  // cross-community move). This is metadata for how a reviewer should
  // FRAME the candidate — a possible move/transfer, not an ordinary
  // same-site duplicate — never a different detection algorithm. False
  // when either resident's community is unknown (null): a confident
  // same/different call requires both.
  readonly crossCommunity: boolean;
}

// ─── Household links — a separate, non-identity concept ────────────────
export type HouseholdRelationshipHint = "likely_spouse" | "shared_household";

export interface HouseholdLinkDraft {
  readonly residentIds: readonly [string, string];
  readonly relationshipHint: HouseholdRelationshipHint;
  readonly evidence: readonly HouseholdEvidenceSignal[];
  readonly matchingRuleVersion: string;
}

// A pair already known not to be duplicates — hard-excludes candidate
// generation for this exact pair, regardless of how strong the signals
// look on a later run.
export interface SuppressedPair {
  readonly residentIdA: string;
  readonly residentIdB: string;
}

// A confirmed alias, consulted both by candidate detection (as a strong
// signal / auto-exclusion) and by the roster importer (before ever
// classifying a row as a new resident).
export interface ConfirmedAlias {
  readonly canonicalResidentId: string;
  readonly normalizedValue: string;
}
