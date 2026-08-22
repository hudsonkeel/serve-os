// Add New Client phase — pure Tier 2 duplicate-check logic (DOB, name-
// edit-distance/compound-name-variant, confirmed alias, household
// corroboration). No I/O — takes already-loaded candidates, exactly the
// same pure/I/O split Community Roster Import's
// communityRosterReconciliation.ts established, so this composition is
// unit-testable without a database.
//
// Reuses the SAME deterministic identity/household engine roster
// reconciliation uses (identitySignals.ts + householdSignals.ts +
// confidenceBands.ts) — no new scoring logic. Tier 1 (name + email/phone/
// community/apartment, via findFreshCredibleResidentMatch) lives in the
// I/O wrapper (lib/data/addClientDuplicateCheck.ts) since it does its own
// queries; this file is reached only when Tier 1 finds nothing.
import { generateIdentitySignals } from "../identity/identitySignals.ts";
import type { IdentitySignalContext } from "../identity/identitySignals.ts";
import { generateHouseholdSignals } from "../identity/householdSignals.ts";
import { assignConfidenceBand } from "../identity/confidenceBands.ts";
import type { ConfidenceBand, ConfirmedAlias, LiveResidentForIdentity } from "../identity/types.ts";
import type { LiveResident } from "../roster/types.ts";

export interface NewClientCandidatePerson {
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string | null;
  readonly phone: string | null;
  readonly unitNumber: string | null;
}

export interface IdentitySignalMatch {
  readonly residentId: string;
  readonly residentName: string;
  readonly band: ConfidenceBand;
  readonly descriptions: readonly string[];
}

function personAsLiveResidentForIdentity(input: NewClientCandidatePerson, communityId: string | null): LiveResidentForIdentity {
  return {
    id: "__new_client__",
    firstName: input.firstName,
    lastName: input.lastName,
    middleName: null,
    preferredName: null,
    displayName: null,
    fullName: null,
    unitNumber: input.unitNumber,
    building: null,
    communityCode: null,
    communityId,
    phone: input.phone,
    email: null,
    dateOfBirth: input.dateOfBirth,
    familyContactName: null,
    familyContactPhone: null,
    needsReview: null,
    isActive: true,
    sourceSystem: "serve_manual",
    createdAt: "",
  };
}

function candidateAsLiveResidentForIdentity(r: LiveResident, communityId: string | null): LiveResidentForIdentity {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    middleName: r.middleName,
    preferredName: r.preferredName,
    displayName: r.displayName,
    fullName: r.fullName,
    unitNumber: r.unitNumber,
    building: r.building,
    communityCode: r.communityCode,
    communityId,
    phone: r.phone ?? null,
    email: null,
    dateOfBirth: r.dateOfBirth ?? null,
    familyContactName: null,
    familyContactPhone: null,
    needsReview: null,
    isActive: r.isActive,
    sourceSystem: null,
    createdAt: "",
  };
}

export function residentDisplayName(r: LiveResident): string {
  return [r.firstName, r.lastName].filter(Boolean).join(" ") || r.displayName || r.fullName || "Unnamed Resident";
}

// Scans one pool of candidates for identity-signal matches reaching at
// least "probable". Household corroboration (same_phone, same_apartment)
// is ALWAYS generated and passed into assignConfidenceBand, exactly like
// communityRosterReconciliation.ts's own findCanonicalCandidates — it can
// only upgrade an already-nonzero identity signal, never manufacture one
// (confidenceBands.ts's own structural guarantee, re-exercised here, not
// re-implemented). For a cross-community scan (communityId: null), the
// household engine's OWN same-community gate already suppresses
// same_apartment/same_building_and_community on its own (a confident
// "same apartment" claim needs both communities known and equal — see
// householdSignals.ts) — same_phone has no such gate, since a phone
// number isn't community-relative, so it correctly still corroborates a
// possible cross-community move. No separate on/off flag is needed or
// used here; the engine's own structural rules do the right thing.
export function scanForIdentitySignalMatches(
  person: NewClientCandidatePerson,
  candidates: readonly LiveResident[],
  confirmedAliases: readonly ConfirmedAlias[],
  options: { readonly communityId: string | null }
): IdentitySignalMatch[] {
  const personAsResident = personAsLiveResidentForIdentity(person, options.communityId);
  const context: IdentitySignalContext = {
    confirmedAliases,
    absentResidentIds: new Set(),
    recentlyCreatedResidentIds: new Set(),
  };

  const found: IdentitySignalMatch[] = [];
  for (const candidate of candidates) {
    const candidateAsResident = candidateAsLiveResidentForIdentity(candidate, options.communityId);
    const identitySignals = generateIdentitySignals(personAsResident, candidateAsResident, context);
    const householdSignals = generateHouseholdSignals(personAsResident, candidateAsResident);
    const band = assignConfidenceBand(identitySignals, householdSignals);
    if (band === "high" || band === "probable") {
      found.push({
        residentId: candidate.id,
        residentName: residentDisplayName(candidate),
        band,
        descriptions: [...identitySignals.map((s) => s.description), ...householdSignals.map((s) => s.description)],
      });
    }
  }
  return found;
}
