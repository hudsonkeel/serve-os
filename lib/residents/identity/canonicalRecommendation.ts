// Canonical-record recommendation — replaces the old
// linked-record-count-only logic in ResidentIdentityComparison.tsx.
// Recommends based on, in this STRICT priority order (a tier only breaks
// the tie when the previous tier is genuinely equal — never a weighted
// blend of the three):
//   1. Identity quality — which record's own data looks more complete/correct
//   2. Source authority — which record's source system is more trusted
//   3. History richness — which record has more linked activity (the
//      tie-breaker of last resort only, never the primary signal — history
//      must never outweigh demonstrably better identity information)
// Always returns a self-explaining checklist of reasons, never a bare tag.
import { sourceAuthorityLabel, sourceAuthorityRank } from "./sourceAuthority.ts";

export interface CanonicalRecommendationInput {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly unitNumber: string | null;
  // Retained on the input shape only so callers don't need two parallel
  // types — deliberately NEVER read by this module's own scoring below.
  // Final Canonical Truth Cleanup: needsReview (residents.needs_review,
  // or the synthetic "staging_match_review" value) is historical
  // CINCH/import-era staging metadata — verified to have zero current
  // operational meaning (nothing in this codebase writes it after
  // import; it lives beside source_file/source_status, other pure
  // import-provenance columns). It must never influence which current
  // canonical Serve person survives a duplicate consolidation, and the
  // reason text it used to produce ("No outstanding data-quality flag")
  // falsely implied the OTHER record had a real, current problem.
  readonly needsReview: string | null;
  readonly sourceSystem: string | null;
  readonly linkedRecordCount: number;
}

export interface CanonicalRecommendation {
  readonly canonicalResidentId: string;
  readonly reasons: readonly string[];
}

function hasCompleteName(r: CanonicalRecommendationInput): boolean {
  return Boolean(r.firstName?.trim()) && Boolean(r.lastName?.trim());
}

function identityQualityScore(r: CanonicalRecommendationInput): number {
  let score = 0;
  if (r.unitNumber?.trim()) score++;
  if (hasCompleteName(r)) score++;
  return score;
}

function buildReasons(winner: CanonicalRecommendationInput, loser: CanonicalRecommendationInput): string[] {
  const reasons: string[] = [];
  if (sourceAuthorityRank(winner.sourceSystem) > sourceAuthorityRank(loser.sourceSystem) && winner.sourceSystem) {
    reasons.push(`More trusted source (${sourceAuthorityLabel(winner.sourceSystem)})`);
  }
  if (winner.unitNumber?.trim() && !loser.unitNumber?.trim()) {
    reasons.push("Apartment populated");
  }
  if (hasCompleteName(winner) && !hasCompleteName(loser)) {
    reasons.push("Better normalized name (first and last name both present)");
  }
  if (winner.linkedRecordCount > loser.linkedRecordCount) {
    reasons.push(`More linked history (${winner.linkedRecordCount} vs. ${loser.linkedRecordCount} records)`);
  }
  return reasons;
}

export function recommendCanonicalResident(a: CanonicalRecommendationInput, b: CanonicalRecommendationInput): CanonicalRecommendation {
  const qualityA = identityQualityScore(a);
  const qualityB = identityQualityScore(b);

  let winner = a;
  let loser = b;

  if (qualityA !== qualityB) {
    [winner, loser] = qualityA > qualityB ? [a, b] : [b, a];
  } else {
    const rankA = sourceAuthorityRank(a.sourceSystem);
    const rankB = sourceAuthorityRank(b.sourceSystem);
    if (rankA !== rankB) {
      [winner, loser] = rankA > rankB ? [a, b] : [b, a];
    } else if (a.linkedRecordCount !== b.linkedRecordCount) {
      [winner, loser] = a.linkedRecordCount > b.linkedRecordCount ? [a, b] : [b, a];
    }
    // A genuine tie on every tier — default to `a` (stable, arbitrary).
  }

  const reasons = buildReasons(winner, loser);
  return {
    canonicalResidentId: winner.id,
    reasons: reasons.length > 0 ? reasons : ["Equivalent on identity quality, source authority, and history — defaulting to the first record"],
  };
}
