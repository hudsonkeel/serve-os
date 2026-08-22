// Pure care-model logic — no I/O, safe to import from a Client Component
// (unlike lib/data/communities.ts, which pulls in the server Supabase
// client). Kept as its own small module for the same reason
// lib/auth/currentCommunity.ts is split from lib/auth/communityScope.ts:
// a Client Component transitively importing an I/O module is exactly the
// mistake Phase D's build caught once already.
import type { CareModel, Community } from "../supabase/types";

// Display labels for the two care models — one place, reused by the
// selector so a future third care model only ever needs one new entry.
export const CARE_MODEL_LABELS: Record<CareModel, string> = {
  community_care: "Community Care",
  traditional_care: "Traditional Care",
};

// Groups strictly by the stored care_model field; never touches `name`.
// Community Care is not Watermere, and Traditional Care is not identified
// by pattern-matching a display string — see this codebase's own
// migration comment (20260902210000_add_care_model_to_communities.sql)
// for why that distinction is enforced at the data layer, not here.
export function groupCommunitiesByCareModel(
  communities: readonly Community[]
): Record<CareModel, Community[]> {
  return {
    community_care: communities.filter((c) => c.care_model === "community_care"),
    traditional_care: communities.filter((c) => c.care_model === "traditional_care"),
  };
}
