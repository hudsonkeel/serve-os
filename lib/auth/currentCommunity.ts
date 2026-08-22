// Current-community context (Phase D) — the I/O boundary around the pure
// resolution logic in communityScope.ts. Reads the cookie, loads active
// communities, and resolves a CommunityScope + a ready-to-render list of
// selectable options. Kept separate from communityScope.ts so that file
// stays pure/synchronous and unit-testable without cookies()/Supabase.
//
// server-only guards against exactly the mistake this file's own history
// hit once already: a Client Component importing ALL_COMMUNITIES_SELECTION
// from here (instead of from the pure communityScope.ts) transitively
// pulled next/headers into the client bundle. Re-import from
// communityScope.ts for anything a Client Component needs.
import "server-only";
import { cookies } from "next/headers";
import type { AuthRole } from "./constants";
import { CURRENT_COMMUNITY_COOKIE } from "./constants";
import {
  resolveCurrentCommunityScope,
  communityScopeToQueryFilter,
  type CommunityScope,
  type CommunityQueryFilter,
} from "./communityScope";
import { listCommunities } from "../data/communities";
import type { Community } from "../supabase/types";

export interface CurrentCommunityContext {
  readonly scope: CommunityScope;
  readonly communities: Community[];
  // Human-readable label for whatever is currently selected — "All
  // Communities", a specific community's name, or an explicit "Not
  // assigned" for the unassigned/non_community cases, so the switcher
  // never has to re-derive this itself.
  readonly currentLabel: string;
}

function labelForScope(scope: CommunityScope, communities: Community[]): string {
  switch (scope.mode) {
    case "all_communities":
      return "All Communities";
    case "single_community": {
      const match = communities.find((c) => c.id === scope.communityId);
      return match?.name ?? "Unknown Community";
    }
    case "unassigned":
      return "Not assigned";
    case "non_community":
      return "Not assigned";
  }
}

export async function resolveCurrentCommunity(profile: {
  readonly community_id: string | null;
  readonly role: AuthRole;
} | null): Promise<CurrentCommunityContext | null> {
  if (!profile) {
    return null;
  }

  const [cookieStore, communities] = await Promise.all([cookies(), listCommunities()]);
  const cookieValue = cookieStore.get(CURRENT_COMMUNITY_COOKIE)?.value ?? null;
  const activeCommunityIds = new Set(communities.map((c) => c.id));

  const scope = resolveCurrentCommunityScope({
    cookieCommunityId: cookieValue,
    homeCommunityId: profile.community_id,
    role: profile.role,
    activeCommunityIds,
  });

  return {
    scope,
    communities,
    currentLabel: labelForScope(scope, communities),
  };
}

// The one call most community-owned data-access call sites actually need:
// resolved scope, already turned into an explicit query filter (never an
// optional communityId that could be mistaken for "everything" if omitted).
// A null profile (defensive — proxy.ts already gates unauthenticated
// requests) resolves to "none", the same fail-safe every other branch here
// uses.
export async function resolveCurrentCommunityQueryFilter(
  profile: { readonly community_id: string | null; readonly role: AuthRole } | null
): Promise<CommunityQueryFilter> {
  if (!profile) {
    return { mode: "none" };
  }

  const context = await resolveCurrentCommunity(profile);
  if (!context) {
    return { mode: "none" };
  }

  const activeCommunityIds = new Set(context.communities.map((c) => c.id));
  return communityScopeToQueryFilter(context.scope, { role: profile.role, activeCommunityIds });
}
