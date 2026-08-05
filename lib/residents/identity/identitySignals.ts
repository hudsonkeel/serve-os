// Identity evidence generation — answers exactly one question: "are
// these records describing the same human?" Deliberately contains
// NOTHING about phone numbers, apartments, addresses, or any other
// co-residency signal — those are household questions, answered
// separately by lib/residents/identity/householdSignals.ts, and must
// never be able to raise identity confidence on their own. See
// lib/residents/identity/confidenceBands.ts for where that separation is
// enforced structurally.
import { levenshteinDistance } from "./levenshtein.ts";
import {
  coreFirstNameToken,
  isStrictTokenSuperset,
  nameTokenSet,
  normalizeFullName,
  normalizeNamePart,
} from "./normalization.ts";
import type { ConfirmedAlias, IdentityEvidenceSignal, LiveResidentForIdentity } from "./types.ts";

export interface IdentitySignalContext {
  readonly confirmedAliases: readonly ConfirmedAlias[];
  // Residents currently recorded absent from the latest official roster
  // (open roster_absence_reviews) — used for the "one is absent, a
  // similarly-named one is newly present" identity-timing signal. Gated
  // on name similarity already having been established elsewhere in this
  // function — never a freestanding signal (see the note at its use
  // site below).
  readonly absentResidentIds: ReadonlySet<string>;
  readonly recentlyCreatedResidentIds: ReadonlySet<string>;
}

function aliasCanonicalFor(name: string, aliases: readonly ConfirmedAlias[]): string | null {
  const match = aliases.find((a) => a.normalizedValue === name);
  return match ? match.canonicalResidentId : null;
}

export function generateIdentitySignals(
  a: LiveResidentForIdentity,
  b: LiveResidentForIdentity,
  context: IdentitySignalContext,
): IdentityEvidenceSignal[] {
  const signals: IdentityEvidenceSignal[] = [];

  const fullNameA = normalizeFullName(a.firstName, a.lastName);
  const fullNameB = normalizeFullName(b.firstName, b.lastName);
  const firstA = normalizeNamePart(a.firstName);
  const firstB = normalizeNamePart(b.firstName);
  const lastA = normalizeNamePart(a.lastName);
  const lastB = normalizeNamePart(b.lastName);

  let nameSimilarity = false;

  if (fullNameA && fullNameB && fullNameA === fullNameB) {
    signals.push({
      signalType: "exact_full_name",
      residentIdA: a.id,
      residentIdB: b.id,
      description: `Both records normalize to the exact same full name ("${fullNameA}").`,
      strength: "strong",
    });
    nameSimilarity = true;
  }

  if (!nameSimilarity && firstA && firstB && firstA !== firstB && lastA && lastA === lastB) {
    const distance = levenshteinDistance(firstA, firstB);
    if (distance === 1) {
      signals.push({
        signalType: "first_name_edit_distance_one",
        residentIdA: a.id,
        residentIdB: b.id,
        description: `Identical last name ("${a.lastName}"); first names differ by one character ("${a.firstName}" vs. "${b.firstName}").`,
        strength: "strong",
      });
      nameSimilarity = true;
    }
  }

  if (!nameSimilarity && lastA && lastB && lastA !== lastB && firstA && firstA === firstB) {
    const distance = levenshteinDistance(lastA, lastB);
    if (distance === 1) {
      signals.push({
        signalType: "last_name_edit_distance_one",
        residentIdA: a.id,
        residentIdB: b.id,
        description: `Identical first name ("${a.firstName}"); last names differ by one character ("${a.lastName}" vs. "${b.lastName}").`,
        strength: "strong",
      });
      nameSimilarity = true;
    }
  }

  // ─── Compound / middle-name variant ──────────────────────────────────
  // Recognizes "Marilyn Born" vs. "Marilyn Holstein Born" as the same
  // core identity — a middle name embedded in the first-name field (a
  // common cross-source formatting difference) rather than a different
  // person. Never a fuzzy partial match: the shorter name's tokens must
  // be a strict subset of the longer name's, not merely overlapping.
  if (!nameSimilarity) {
    const coreFirstA = coreFirstNameToken(a.firstName);
    const coreFirstB = coreFirstNameToken(b.firstName);
    const lastTokensA = nameTokenSet(a.lastName);
    const lastTokensB = nameTokenSet(b.lastName);
    const lastNamesCompatible =
      (lastA !== "" && lastA === lastB) || isStrictTokenSuperset(lastTokensA, lastTokensB) || isStrictTokenSuperset(lastTokensB, lastTokensA);

    if (lastNamesCompatible && coreFirstA && coreFirstA === coreFirstB) {
      const firstTokensA = nameTokenSet(a.firstName);
      const firstTokensB = nameTokenSet(b.firstName);
      const firstNameIsVariant = isStrictTokenSuperset(firstTokensA, firstTokensB) || isStrictTokenSuperset(firstTokensB, firstTokensA);
      const lastNameIsVariant = lastA !== lastB && (isStrictTokenSuperset(lastTokensA, lastTokensB) || isStrictTokenSuperset(lastTokensB, lastTokensA));

      if (firstNameIsVariant || lastNameIsVariant) {
        signals.push({
          signalType: "compound_name_variant",
          residentIdA: a.id,
          residentIdB: b.id,
          description: `Core name matches ("${coreFirstA}"); one record's name includes an extra middle or compound name component not present on the other ("${a.firstName} ${a.lastName}" vs. "${b.firstName} ${b.lastName}").`,
          strength: "strong",
        });
        nameSimilarity = true;
      }
    }
  }

  if (a.dateOfBirth && b.dateOfBirth) {
    if (a.dateOfBirth === b.dateOfBirth) {
      signals.push({
        signalType: "same_dob",
        residentIdA: a.id,
        residentIdB: b.id,
        description: `Both records share the same date of birth.`,
        strength: "strong",
      });

      // A DOB match with NO name resemblance at all is exactly the
      // "conflicting legal name" case — real corroborating evidence
      // (DOB) alongside a fact that doesn't obviously fit (unrelated
      // names) should read as uncertain, not as a confident match.
      if (!nameSimilarity) {
        signals.push({
          signalType: "conflicting_legal_name",
          residentIdA: a.id,
          residentIdB: b.id,
          description: `Same date of birth on file, but the legal names ("${a.firstName} ${a.lastName}" vs. "${b.firstName} ${b.lastName}") don't resemble each other closely enough to explain why — treat as uncertain rather than assuming a match.`,
          strength: "negative",
        });
      }
    } else {
      signals.push({
        signalType: "conflicting_dob",
        residentIdA: a.id,
        residentIdB: b.id,
        description: `Records have different dates of birth on file (${a.dateOfBirth} vs. ${b.dateOfBirth}) — treat as evidence against a match unless corroborated elsewhere.`,
        strength: "negative",
      });
    }
  }

  // Only meaningful alongside actual name similarity — its own
  // description says "a SIMILARLY-NAMED record." Without this gate it
  // would fire for every absent resident against every other resident
  // created within the lookback window, which in practice (a recent bulk
  // import plus a recent roster run) can be nearly the whole community.
  const aAbsent = context.absentResidentIds.has(a.id);
  const bAbsent = context.absentResidentIds.has(b.id);
  const aNew = context.recentlyCreatedResidentIds.has(a.id);
  const bNew = context.recentlyCreatedResidentIds.has(b.id);
  if (nameSimilarity && ((aAbsent && bNew) || (bAbsent && aNew))) {
    signals.push({
      signalType: "absent_while_similar_present",
      residentIdA: a.id,
      residentIdB: b.id,
      description: `One record is currently absent from the latest official roster while a similarly-named record was newly created from that same roster.`,
      strength: "contextual",
    });
  }

  const aliasCanonicalForA = aliasCanonicalFor(fullNameA, context.confirmedAliases);
  const aliasCanonicalForB = aliasCanonicalFor(fullNameB, context.confirmedAliases);
  if (aliasCanonicalForA === b.id || aliasCanonicalForB === a.id) {
    signals.push({
      signalType: "confirmed_alias_match",
      residentIdA: a.id,
      residentIdB: b.id,
      description: `A confirmed alias already links one of these names to the other resident.`,
      strength: "strong",
    });
  }

  return signals;
}
