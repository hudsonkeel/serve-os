// Orchestrates candidate detection across a full resident snapshot: pure,
// no I/O, fully unit-testable. Pairs already known not to be duplicates
// (resident_identity_suppressions) are hard-excluded from IDENTITY
// candidate generation before any identity signal is even computed — a
// suppression is permanent, not merely a downgrade. Suppression says
// nothing about household evidence, though: a pair confirmed NOT to be
// the same person (e.g. a married couple who share a last name) is often
// exactly the kind of pair household detection exists to surface, so
// suppressed pairs are still evaluated for household evidence.
//
// Phase 2 evidence domain separation, enforced structurally: identity
// evidence and household evidence are computed independently for every
// pair. Zero identity evidence never produces an identity candidate,
// full stop, regardless of how much household evidence exists — instead,
// a household-link draft is produced when household evidence exists.
// Nonzero identity evidence produces an identity candidate, with any
// household evidence attached as `householdContext` — visibly separate
// from `evidence`, never merged into the list the band was computed from.
import { assignConfidenceBand } from "./confidenceBands.ts";
import { generateHouseholdSignals } from "./householdSignals.ts";
import { generateIdentitySignals } from "./identitySignals.ts";
import type { IdentitySignalContext } from "./identitySignals.ts";
import { normalizeNamePart } from "./normalization.ts";
import type { CandidateDraft, HouseholdLinkDraft, LiveResidentForIdentity, SuppressedPair } from "./types.ts";

export const MATCHING_RULE_VERSION = "2";

export function suppressionKey(residentIdA: string, residentIdB: string): string {
  return [residentIdA, residentIdB].sort().join("|");
}

export function buildSuppressionSet(pairs: readonly SuppressedPair[]): ReadonlySet<string> {
  return new Set(pairs.map((p) => suppressionKey(p.residentIdA, p.residentIdB)));
}

export interface DetectCandidatesInput {
  readonly residents: readonly LiveResidentForIdentity[];
  readonly context: IdentitySignalContext;
  readonly suppressedPairs: ReadonlySet<string>;
  // Pairs with a strong Resident Data Integrity explanation (see
  // lib/residents/dataIntegrity/precedence.ts) — excluded from BOTH
  // identity AND household evidence generation, unlike suppressedPairs
  // (identity-only). Optional/defaulted so every existing caller keeps
  // working unchanged.
  readonly integrityClaimedPairs?: ReadonlySet<string>;
}

export interface DetectCandidatesResult {
  readonly identityCandidates: readonly CandidateDraft[];
  readonly householdLinks: readonly HouseholdLinkDraft[];
}

export function detectIdentityCandidates(input: DetectCandidatesInput): DetectCandidatesResult {
  const identityCandidates: CandidateDraft[] = [];
  const householdLinks: HouseholdLinkDraft[] = [];
  const { residents, context, suppressedPairs, integrityClaimedPairs } = input;

  for (let i = 0; i < residents.length; i++) {
    for (let j = i + 1; j < residents.length; j++) {
      const a = residents[i];
      const b = residents[j];
      if (integrityClaimedPairs?.has(suppressionKey(a.id, b.id))) continue;
      const isSuppressed = suppressedPairs.has(suppressionKey(a.id, b.id));

      const householdEvidence = generateHouseholdSignals(a, b);
      const identityEvidence = isSuppressed ? [] : generateIdentitySignals(a, b, context);

      if (identityEvidence.length > 0) {
        const confidenceBand = assignConfidenceBand(identityEvidence, householdEvidence);
        if (confidenceBand) {
          identityCandidates.push({
            residentIds: [a.id, b.id],
            confidenceBand,
            evidence: identityEvidence,
            householdContext: householdEvidence,
            matchingRuleVersion: MATCHING_RULE_VERSION,
          });
        }
        continue;
      }

      if (householdEvidence.length > 0) {
        const lastA = normalizeNamePart(a.lastName);
        const lastB = normalizeNamePart(b.lastName);
        const sameLastName = lastA !== "" && lastA === lastB;
        householdLinks.push({
          residentIds: [a.id, b.id],
          relationshipHint: sameLastName ? "likely_spouse" : "shared_household",
          evidence: householdEvidence,
          matchingRuleVersion: MATCHING_RULE_VERSION,
        });
      }
    }
  }

  return { identityCandidates, householdLinks };
}
