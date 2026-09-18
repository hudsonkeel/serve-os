// Permanent "these two contacts are confirmed NOT the same person" semantics
// (Slice C.2, 2026-09-19) — the pure, order-independent half of
// contact_identity_suppressions. Directly mirrors resident_identity_suppressions'
// purpose: once a pair is suppressed, it must never be proposed as a match again,
// regardless of what future evidence classifyContactMatch() might otherwise surface.
//
// classifyContactMatch() (identityMatch.ts) is deliberately pure/I-O-free and does not
// consult suppression itself — suppression is a persisted fact (contact_identity_
// suppressions), and checking it is an orchestration/data-layer concern for whichever
// future caller (Slice C.3+) decides whether to create a contact_identity_candidates
// row from a classification result. That caller MUST check isContactPairSuppressed()
// (or the equivalent database query) before creating a candidate row from any tier
// other than name_only_no_merge/no_match, which never produce one regardless.

export interface ContactIdentityPairKey {
  readonly contactIdA: string;
  readonly contactIdB: string;
}

/** Order-independent pairing key — matches the database's own
 * `contact_id_a < contact_id_b` ordered-pair convention, so a lookup never needs to try
 * both orderings. */
function orderedPairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

/** Whether the given pair of contact ids has been permanently suppressed, regardless of
 * which order the two ids are passed in. */
export function isContactPairSuppressed(
  suppressedPairs: readonly ContactIdentityPairKey[],
  contactIdA: string,
  contactIdB: string
): boolean {
  const target = orderedPairKey(contactIdA, contactIdB);
  return suppressedPairs.some((pair) => orderedPairKey(pair.contactIdA, pair.contactIdB) === target);
}
