// Pure decision logic for how AxisCare sync is allowed to touch a
// workforce member's canonical profile fields — see the "Serve OS
// Canonical Profile Editor" scope, section 9 ("Sync behavior"), and
// supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql's
// sync_seed_or_correct_workforce_canonical_field() RPC, which re-validates
// the same two safe cases this function identifies (defense in depth).
//
// Deterministic rules, applied per field:
//   canonical value is null/blank        -> seed it from the source
//   canonical populated, not yet reviewed,
//     and the only difference is case    -> auto-correct capitalization
//   canonical populated and reviewed/locked,
//     or a material (non-capitalization) difference exists at all
//     (reviewed or not)                  -> flag a discrepancy, never
//                                           silently overwrite
//   values already match                 -> no change
export type CanonicalFieldSyncAction = "seed" | "auto_correct_capitalization" | "flag_discrepancy" | "no_change";

export function evaluateCanonicalFieldSyncAction(
  canonicalValue: string | null,
  isReviewed: boolean,
  sourceValue: string | null
): CanonicalFieldSyncAction {
  const normalizedSource = sourceValue?.trim() || null;
  if (!normalizedSource) return "no_change";

  const normalizedCanonical = canonicalValue?.trim() || null;
  if (!normalizedCanonical) return "seed";
  if (normalizedCanonical === normalizedSource) return "no_change";

  if (!isReviewed && normalizedCanonical.toLowerCase() === normalizedSource.toLowerCase()) {
    return "auto_correct_capitalization";
  }

  return "flag_discrepancy";
}

// A profile whose status is 'reviewed' or 'locked' means "source cannot
// overwrite it" per the scope's own rule — 'unreviewed'/'needs_review'
// both still allow the capitalization-only auto-correct case above.
export function isCanonicalProfileReviewed(status: string): boolean {
  return status === "reviewed" || status === "locked";
}
