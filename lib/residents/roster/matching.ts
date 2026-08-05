// Pure resident-matching logic for the Watermere roster reconciliation
// engine — no I/O, fully unit-testable. Implements the matching hierarchy
// from the governing plan:
//   1. Exact normalized (last name, first name) match across ALL current
//      residents, regardless of apartment — if exactly one, high
//      confidence. Whether the apartment matches or differs is decided
//      by the caller (lib/residents/roster/reconcile.ts), since that
//      distinguishes an exact match from an apartment change.
//   2. If no exact name match, last-name-only match RESTRICTED to the
//      resident(s) currently occupying the row's own apartment — medium
//      confidence (a likely nickname/spelling variant), never blocking a
//      write outright but always flagged.
//   3. Otherwise unmatched — the caller decides new_resident vs. a
//      possible-apartment-reassignment review case.
// Never matches on apartment alone when more than one resident could
// occupy it, and never resolves a genuine tie automatically.
import { normalizeName, normalizeUnit } from "./normalization.ts";
import type { LiveResident, NormalizedPerson, PersonMatchResult } from "./types.ts";
import type { ConfirmedAlias } from "../identity/types.ts";

function residentDisplayName(r: LiveResident): string {
  const fromParts = [r.firstName, r.lastName].filter(Boolean).join(" ");
  return fromParts || r.displayName || r.fullName || "Unnamed Resident";
}

// A confirmed alias (from a Resident Identity Resolution merge or
// alias-only decision — see lib/residents/identity/) is consulted before
// a roster row is ever allowed to fall through to "unmatched" -> "new
// resident". This is what stops a resolved spelling variant (e.g.
// "Elliot Goldberg") from being recreated as a duplicate on the next
// roster import.
export function matchPerson(
  person: NormalizedPerson,
  candidates: readonly LiveResident[],
  confirmedAliases: readonly ConfirmedAlias[] = [],
): PersonMatchResult {
  const normalizedApartment = normalizeUnit(person.apartment);

  // ─── Tier 1: exact normalized (last name, first name) match ──────────
  const exactMatches = candidates.filter(
    (r) => normalizeName(r.lastName) === person.lastName && normalizeName(r.firstName) === person.firstName,
  );

  if (exactMatches.length === 1) {
    const resident = exactMatches[0];
    const residentUnit = normalizeUnit(resident.unitNumber);
    const apartmentMatches = residentUnit !== "" && residentUnit === normalizedApartment;
    return {
      person,
      status: "matched",
      residentId: resident.id,
      residentName: residentDisplayName(resident),
      residentUnit: resident.unitNumber,
      confidence: "high",
      method: apartmentMatches ? "unique_name_apartment_matches" : "unique_name_apartment_differs",
      reason: apartmentMatches
        ? `Exact name match; apartment ${normalizedApartment} already on file for this resident.`
        : `Exact name match; roster apartment ${normalizedApartment} differs from the resident's current apartment (${resident.unitNumber ?? "none on file"}).`,
    };
  }

  if (exactMatches.length > 1) {
    return {
      person,
      status: "ambiguous",
      residentId: null,
      residentName: null,
      residentUnit: null,
      confidence: "none",
      method: "no_match",
      reason: `${exactMatches.length} current residents share the normalized name "${person.displayLabel}" — cannot auto-resolve.`,
      ambiguousCandidateIds: exactMatches.map((r) => r.id),
    };
  }

  // ─── Tier 2: apartment + last-name-only (likely first-name variant) ──
  if (normalizedApartment) {
    const sameApartment = candidates.filter((r) => normalizeUnit(r.unitNumber) === normalizedApartment);
    const lastNameMatches = sameApartment.filter((r) => normalizeName(r.lastName) === person.lastName);

    if (lastNameMatches.length === 1) {
      const resident = lastNameMatches[0];
      return {
        person,
        status: "matched",
        residentId: resident.id,
        residentName: residentDisplayName(resident),
        residentUnit: resident.unitNumber,
        confidence: "medium",
        method: "unique_name_apartment_matches",
        reason: `Apartment ${normalizedApartment} has exactly one current resident with a matching last name; first name on the roster ("${person.firstName}") differs from the resident's on-file first name ("${resident.firstName ?? ""}") — review recommended.`,
      };
    }

    if (lastNameMatches.length > 1) {
      return {
        person,
        status: "ambiguous",
        residentId: null,
        residentName: null,
        residentUnit: null,
        confidence: "none",
        method: "no_match",
        reason: `Apartment ${normalizedApartment} has ${lastNameMatches.length} current residents sharing the last name "${person.lastName}" and no first name matched exactly — cannot auto-resolve.`,
        ambiguousCandidateIds: lastNameMatches.map((r) => r.id),
      };
    }
  }

  // ─── Tier 3: confirmed alias — before ever falling through to unmatched ─
  const normalizedFullName = [person.firstName, person.lastName].filter((p) => p.length > 0).join(" ");
  const alias = confirmedAliases.find((a) => a.normalizedValue === normalizedFullName);
  if (alias) {
    const resident = candidates.find((r) => r.id === alias.canonicalResidentId);
    if (resident) {
      return {
        person,
        status: "matched",
        residentId: resident.id,
        residentName: residentDisplayName(resident),
        residentUnit: resident.unitNumber,
        confidence: "high",
        method: "confirmed_alias_match",
        reason: `"${person.displayLabel}" is a confirmed alias of ${residentDisplayName(resident)}, recorded by a prior Resident Identity Resolution decision.`,
      };
    }
  }

  // ─── Unmatched ─────────────────────────────────────────────────────────
  return {
    person,
    status: "unmatched",
    residentId: null,
    residentName: null,
    residentUnit: null,
    confidence: "none",
    method: "no_match",
    reason: `No current resident matches "${person.displayLabel}" by name, and no current resident at apartment ${normalizedApartment || "(none given)"} shares the last name.`,
  };
}
