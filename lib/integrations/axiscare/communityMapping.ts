// AxisCare -> Serve canonical community mapping (AxisCare Community
// Mapping + Operational State phase). Pure, no I/O, fully unit-testable.
//
// Resolution order — explicit reviewed tables only, never substring
// guessing (no `class.includes("Firewheel")` anywhere in this file):
//   1. AxisCare's own structured community.id (numeric, most reliable —
//      confirmed live: 1 = Frisco, 2 = Firewheel);
//   2. AxisCare's community.name (exact string match);
//   3. AxisCare class codes (exact match against a small, reviewed set —
//      the only fallback for the ~42% of roster records where
//      community.id/name are both null, confirmed live via client #7,
//      "Linda Kaplan": community=null, classes includes "Watermere
//      Frisco").
// Anything that matches none of these resolves to "unresolved" — never
// defaulted to Frisco, never guessed. A future community (McKinney, a
// non-Watermere ISL partner) becomes resolvable the moment a real,
// reviewed AxisCare value is added to these tables — never inferred from
// a "WA" or "Watermere" prefix pattern.

import type { CommunityCode } from "./communityCodes.ts";

// Reviewed 2026-08-21 against the live 38-record AxisCare roster (one
// tenant, site 16282). Extend only when a real, observed AxisCare value
// is confirmed — never speculatively.
export const AXISCARE_COMMUNITY_ID_MAP: Readonly<Record<number, CommunityCode>> = {
  1: "watermere_frisco",
  2: "watermere_firewheel",
};

export const AXISCARE_COMMUNITY_NAME_MAP: Readonly<Record<string, CommunityCode>> = {
  "Watermere at Frisco": "watermere_frisco",
  "Watermere at Firewheel": "watermere_firewheel",
};

// Class codes that carry an EXPLICIT, unambiguous location signal —
// whether the class is otherwise a pure location label ("Watermere
// Frisco") or a mixed lifecycle/location label ("WAFirewheel Prospect").
// See lifecycleSignals.ts for the separate, independent extraction of
// the LIFECYCLE half of a mixed class — this table only ever answers
// "which community," never "what lifecycle state."
export const AXISCARE_LOCATION_CLASS_MAP: Readonly<Record<string, CommunityCode>> = {
  "Watermere Frisco": "watermere_frisco",
  "Watermere Firewheel": "watermere_firewheel",
  "WAFrisco Signed Agreement / No Visits": "watermere_frisco",
  "WAFirewheel Prospect": "watermere_firewheel",
};

export type CommunityResolutionSource = "community_id" | "community_name" | "class_code" | "unresolved";

export interface CommunityResolutionResult {
  readonly communityCode: CommunityCode | null;
  readonly source: CommunityResolutionSource;
}

export function resolveAxisCareCommunityCode(input: {
  readonly communityId: number | null;
  readonly communityName: string | null;
  readonly classCodes: readonly string[];
}): CommunityResolutionResult {
  if (input.communityId !== null && input.communityId in AXISCARE_COMMUNITY_ID_MAP) {
    return { communityCode: AXISCARE_COMMUNITY_ID_MAP[input.communityId], source: "community_id" };
  }

  if (input.communityName !== null && input.communityName in AXISCARE_COMMUNITY_NAME_MAP) {
    return { communityCode: AXISCARE_COMMUNITY_NAME_MAP[input.communityName], source: "community_name" };
  }

  for (const code of input.classCodes) {
    if (code in AXISCARE_LOCATION_CLASS_MAP) {
      return { communityCode: AXISCARE_LOCATION_CLASS_MAP[code], source: "class_code" };
    }
  }

  return { communityCode: null, source: "unresolved" };
}
