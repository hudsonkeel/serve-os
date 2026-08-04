// Detection precedence, step 2: a pair with a strong same_import_duplicate
// explanation is excluded from BOTH identity and household candidate
// generation entirely — stronger than an ordinary identity suppression
// (resident_identity_suppressions), which only hard-excludes identity and
// still allows household evaluation. See
// lib/residents/identity/candidateDetection.ts's `integrityClaimedPairs`
// parameter, which this set feeds directly.
import { suppressionKey } from "../identity/candidateDetection.ts";

export { suppressionKey };

export function buildIntegrityClaimedPairs(pairs: readonly (readonly [string, string])[]): ReadonlySet<string> {
  return new Set(pairs.map(([a, b]) => suppressionKey(a, b)));
}
