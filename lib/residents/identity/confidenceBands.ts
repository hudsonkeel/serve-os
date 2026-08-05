// Confidence-band assignment — a small, readable rule table, never a
// weighted numeric score.
//
// Phase 2 evidence domain separation, enforced structurally rather than
// just by convention: `identityEvidence` is the ONLY input that can ever
// produce a band. Household evidence is accepted as a second, optional
// argument that may only upgrade an already-nonzero identity read (one
// strong identity signal + household corroboration -> "high") — it can
// never manufacture a band on its own. If `identityEvidence` is empty this
// returns null no matter what `householdEvidence` contains: there is no
// code path here that turns household-only evidence into an identity band.
import type { ConfidenceBand, HouseholdEvidenceSignal, IdentityEvidenceSignal } from "./types.ts";

export function assignConfidenceBand(
  identityEvidence: readonly IdentityEvidenceSignal[],
  householdEvidence: readonly HouseholdEvidenceSignal[] = [],
): ConfidenceBand | null {
  if (identityEvidence.length === 0) return null;

  const strongCount = identityEvidence.filter((e) => e.strength === "strong").length;
  const hasConflict = identityEvidence.some((e) => e.strength === "negative");

  // A real conflict (e.g. conflicting DOB, conflicting legal name) always
  // downgrades to "needs investigation" regardless of how much strong
  // evidence also exists — never let corroborating signals silently
  // overrule a contradiction.
  if (hasConflict) return "needs_investigation";

  // Multiple strong, corroborating identity signals and no conflict.
  if (strongCount >= 2) return "high";

  // A single strong identity signal, corroborated by household context
  // (same apartment/phone/family contact) — real name similarity that
  // also shares a household is a stronger read than the name similarity
  // alone, but the household evidence never counts toward `strongCount`
  // itself.
  if (strongCount === 1 && householdEvidence.length > 0) return "high";

  // Exactly one strong signal with no household corroboration — e.g.
  // just an exact name match.
  if (strongCount === 1) return "probable";

  // Only contextual identity evidence (e.g. absent_while_similar_present
  // alone, with no strong signal) — real, but not yet corroborated enough
  // to call "probable."
  return "needs_investigation";
}
