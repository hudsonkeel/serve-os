// Pure resident-matching logic — no I/O, fully unit-testable. See the
// exact matching rules in scripts/importResidentSourceNotes.ts's module
// comment; this file is the implementation those rules compile down to.
import { normalizeName, normalizeUnit, parseNameParts } from "./normalization.ts";
import type { LiveResident, MatchResult } from "./types.ts";

function residentFullName(r: LiveResident): string {
  const fromParts = [r.firstName, r.lastName].filter(Boolean).join(" ");
  return fromParts || r.displayName || r.fullName || "";
}

function nameMatchesResident(sourceName: string, resident: LiveResident): "full" | "partial" | "none" {
  const parsed = parseNameParts(sourceName);
  const residentFirst = normalizeName(resident.firstName ?? "");
  const residentLast = normalizeName(resident.lastName ?? "");

  if (!parsed.lastName || parsed.lastName !== residentLast) return "none";

  if (parsed.isInitialForm) {
    // "E. Goldberg" — last name must match exactly; first name only needs
    // to start with the given initial.
    return residentFirst.startsWith(parsed.firstToken) ? "full" : "partial";
  }

  return parsed.firstToken === residentFirst ? "full" : "partial";
}

export function matchResident(
  sourceName: string,
  sourceApartment: string | null | undefined,
  candidates: readonly LiveResident[]
): MatchResult {
  const normalizedUnit = normalizeUnit(sourceApartment);

  if (normalizedUnit) {
    const occupants = candidates.filter((c) => normalizeUnit(c.unitNumber) === normalizedUnit);

    if (occupants.length === 1) {
      const only = occupants[0];
      const nameMatch = nameMatchesResident(sourceName, only);
      if (nameMatch === "full") {
        return {
          sourceName,
          sourceApartment: normalizedUnit,
          status: "matched",
          residentId: only.id,
          residentName: residentFullName(only),
          residentUnit: only.unitNumber,
          confidence: "high",
          method: "apartment_and_name",
          reason: `Apartment ${normalizedUnit} has exactly one resident, and the name matches.`,
        };
      }
      if (nameMatch === "partial") {
        return {
          sourceName,
          sourceApartment: normalizedUnit,
          status: "matched",
          residentId: only.id,
          residentName: residentFullName(only),
          residentUnit: only.unitNumber,
          confidence: "medium",
          method: "apartment_and_partial_name",
          reason: `Apartment ${normalizedUnit} has exactly one resident; last name matches but first name is not an exact match — review recommended.`,
        };
      }
      return {
        sourceName,
        sourceApartment: normalizedUnit,
        status: "matched",
        residentId: only.id,
        residentName: residentFullName(only),
        residentUnit: only.unitNumber,
        confidence: "low",
        method: "apartment_single_occupant_only",
        reason: `Apartment ${normalizedUnit} has exactly one resident, but the source name does not match at all — verify before trusting this match.`,
      };
    }

    if (occupants.length > 1) {
      const fullMatches = occupants.filter((o) => nameMatchesResident(sourceName, o) === "full");
      if (fullMatches.length === 1) {
        const only = fullMatches[0];
        return {
          sourceName,
          sourceApartment: normalizedUnit,
          status: "matched",
          residentId: only.id,
          residentName: residentFullName(only),
          residentUnit: only.unitNumber,
          confidence: "high",
          method: "apartment_and_name",
          reason: `Apartment ${normalizedUnit} has multiple residents, but exactly one name match disambiguates.`,
        };
      }
      return {
        sourceName,
        sourceApartment: normalizedUnit,
        status: "ambiguous",
        residentId: null,
        residentName: null,
        residentUnit: null,
        confidence: "none",
        method: "no_match",
        reason: `Apartment ${normalizedUnit} has ${occupants.length} residents and the name does not uniquely disambiguate — per rule, apartment alone is never used when more than one resident may occupy it.`,
        ambiguousCandidateIds: occupants.map((o) => o.id),
      };
    }
    // occupants.length === 0 falls through to name-only matching below —
    // the apartment number transcribed may simply not be current.
  }

  // Name-only matching — only ever accepted when no apartment is available
  // (or the apartment given matched no live resident), per the approved rule.
  const nameMatches = candidates.filter((c) => nameMatchesResident(sourceName, c) === "full");

  if (nameMatches.length === 1) {
    const only = nameMatches[0];
    return {
      sourceName,
      sourceApartment: normalizedUnit,
      status: "matched",
      residentId: only.id,
      residentName: residentFullName(only),
      residentUnit: only.unitNumber,
      confidence: "medium",
      method: "unique_normalized_full_name",
      reason: normalizedUnit
        ? `No resident currently occupies apartment ${normalizedUnit}; matched instead on a unique normalized full-name match.`
        : "No apartment was available; matched on a unique normalized full-name match.",
    };
  }

  if (nameMatches.length > 1) {
    return {
      sourceName,
      sourceApartment: normalizedUnit,
      status: "ambiguous",
      residentId: null,
      residentName: null,
      residentUnit: null,
      confidence: "none",
      method: "no_match",
      reason: `${nameMatches.length} residents match this normalized name and no apartment disambiguates them.`,
      ambiguousCandidateIds: nameMatches.map((c) => c.id),
    };
  }

  return {
    sourceName,
    sourceApartment: normalizedUnit,
    status: "unmatched",
    residentId: null,
    residentName: null,
    residentUnit: null,
    confidence: "none",
    method: "no_match",
    reason: "No resident matched this name by apartment or by unique normalized full name.",
  };
}

// Special-cased for "Johnny and Lajuana" style whiteboard entries — two
// first names only, no apartment, no surname. Never accepted unless BOTH
// first names independently resolve to exactly one live resident.
export function matchFirstNamePair(
  firstNameA: string,
  firstNameB: string,
  candidates: readonly LiveResident[]
): { a: MatchResult; b: MatchResult } {
  function matchOne(firstName: string): MatchResult {
    const normalized = normalizeName(firstName);
    const matches = candidates.filter((c) => normalizeName(c.firstName ?? "") === normalized);

    if (matches.length === 1) {
      const only = matches[0];
      return {
        sourceName: firstName,
        sourceApartment: null,
        status: "matched",
        residentId: only.id,
        residentName: residentFullName(only),
        residentUnit: only.unitNumber,
        confidence: "medium",
        method: "first_name_pair",
        reason: "Exactly one resident matches this first name.",
      };
    }
    if (matches.length > 1) {
      return {
        sourceName: firstName,
        sourceApartment: null,
        status: "ambiguous",
        residentId: null,
        residentName: null,
        residentUnit: null,
        confidence: "none",
        method: "no_match",
        reason: `${matches.length} residents share the first name "${firstName}" — first names alone are never sufficient to match when more than one candidate exists.`,
        ambiguousCandidateIds: matches.map((c) => c.id),
      };
    }
    return {
      sourceName: firstName,
      sourceApartment: null,
      status: "unmatched",
      residentId: null,
      residentName: null,
      residentUnit: null,
      confidence: "none",
      method: "no_match",
      reason: `No resident found with first name "${firstName}".`,
    };
  }

  return { a: matchOne(firstNameA), b: matchOne(firstNameB) };
}
