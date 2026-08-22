// Community-context foundation — pure types and resolution logic only.
// Deliberately NOT wired into lib/auth/profiles.ts's live profile query
// yet: that query runs on every authenticated request, and
// user_profiles.community_id does not exist until
// supabase/migrations/20260824000000_add_user_profile_community_assignment.sql
// is applied. Wiring this in before then would break every login.
//
// This is context/filtering plumbing, not a security boundary. Real
// enforcement (query-level scoping in lib/data/*.ts, or RLS policies
// that would actually apply — today every server read/write uses
// SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS unconditionally) does
// not exist yet. See the migration's own header comment for the full
// investigation. Do not present any UI built on this module as
// restricting what data a user can see.
import type { AuthRole } from "./constants";

// Naming note (Phase D.5): "community" here still means the selected
// canonical partner/community context (a real communities row — Watermere
// or Frisco Lakes/Heritage Ranch-style Traditional Care partner
// developments alike). That stays semantically correct for both care
// models today. It will stop being sufficient once a future direct
// private-home Traditional Care client needs an operating/service-area
// context that is NOT a `communities` row (a geography/ZIP grouping, not
// a partner environment) — at that point "current operating context"
// broadens beyond what CommunityScope models, and that's a real future
// generalization, not a rename to make now. Care model itself
// (community_care / traditional_care) is not part of this scope at all —
// it classifies a community row, not the user's current selection.
export type CommunityScope =
  | { readonly mode: "all_communities" }
  | { readonly mode: "single_community"; readonly communityId: string }
  | { readonly mode: "non_community" }
  // A community-scoped role with no assignment on file — a real
  // configuration gap, never silently treated as "all communities".
  | { readonly mode: "unassigned" };

// Which roles may operate across every community by default, absent an
// explicit single-community assignment. A genuine product/business
// decision, not a technical one — scoped conservatively to "admin"
// only for now; whether "executive" (and, less likely, "manager")
// should also default to cross-community access is an open question
// for Serve leadership, not something to infer here.
const CROSS_COMMUNITY_ROLES: readonly AuthRole[] = ["admin"];

export function canSelectAllCommunities(role: AuthRole): boolean {
  return CROSS_COMMUNITY_ROLES.includes(role);
}

export function resolveDefaultCommunityScope(input: {
  readonly communityId: string | null;
  readonly role: AuthRole;
}): CommunityScope {
  if (input.communityId) {
    return { mode: "single_community", communityId: input.communityId };
  }
  if (canSelectAllCommunities(input.role)) {
    return { mode: "all_communities" };
  }
  return { mode: "unassigned" };
}

// ─── Current-community context (Phase D) ──────────────────────────────────
// Layers a server-visible "current context" cookie on top of the
// default/home scope above. Still not a security boundary — see this
// module's header comment; real enforcement is query-level scoping in a
// later phase. The value stored in the cookie is either a real
// communities.id or the sentinel below for "All Communities" (only ever
// honored for a role canSelectAllCommunities() allows).
export const ALL_COMMUNITIES_SELECTION = "all";

export function resolveCurrentCommunityScope(input: {
  // Raw cookie value, or null/undefined if the cookie is absent.
  readonly cookieCommunityId: string | null | undefined;
  readonly homeCommunityId: string | null;
  readonly role: AuthRole;
  // ids of communities that are currently selectable (active today) — a
  // cookie value outside this set is stale/inaccessible/tampered and must
  // never be honored.
  readonly activeCommunityIds: ReadonlySet<string>;
}): CommunityScope {
  const fallback = resolveDefaultCommunityScope({ communityId: input.homeCommunityId, role: input.role });

  if (!input.cookieCommunityId) {
    return fallback;
  }

  if (input.cookieCommunityId === ALL_COMMUNITIES_SELECTION) {
    // A role that no longer qualifies (e.g. changed since the cookie was
    // set) falls back through the normal chain — never silently kept as
    // all_communities, and never converted to unassigned as a special case.
    return canSelectAllCommunities(input.role) ? { mode: "all_communities" } : fallback;
  }

  if (input.activeCommunityIds.has(input.cookieCommunityId)) {
    return { mode: "single_community", communityId: input.cookieCommunityId };
  }

  // Invalid, inactive, or otherwise unrecognized — fail safe by falling
  // back through the normal resolution chain rather than inventing an
  // unauthorized scope.
  return fallback;
}

// Used by the server action that changes current community, before it is
// permitted to write the cookie at all — the selector UI itself must not
// be the only thing standing between a user and a community they can't
// select.
export function isValidCommunitySelection(input: {
  readonly requestedCommunityId: string;
  readonly role: AuthRole;
  readonly activeCommunityIds: ReadonlySet<string>;
}): boolean {
  if (input.requestedCommunityId === ALL_COMMUNITIES_SELECTION) {
    return canSelectAllCommunities(input.role);
  }
  return input.activeCommunityIds.has(input.requestedCommunityId);
}

// ─── Access model (Phase E/F) ──────────────────────────────────────────────
// The explicit answer to "which communities' data may this user's queries
// actually touch" — separate from CommunityScope, which is UI/workflow
// *context* (what's currently selected). isValidCommunitySelection() above
// gates what the selector can write to the cookie; this gates what a
// data-access function is allowed to return once a scope is resolved. Never
// let "the dropdown contained the community" stand in for this.
//
// Current Serve business reality, encoded deliberately, not inferred: Serve
// operates as one internal team overseeing multiple physical communities —
// not a franchise/tenant-per-community model. No current role (admin,
// manager, executive, operations) is restricted from any specific
// community's data; the trust distinction those roles already carry (see
// lib/auth/permissions.ts) is about *edit* capability, never about which
// community's residents a role may see. So every authenticated internal
// role is authorized for every active community today. If Serve later
// introduces real per-community staff siloing, this is the one function
// that changes — not an audit of every query call site.
export function isCommunityAccessAuthorized(input: {
  readonly role: AuthRole;
  readonly communityId: string;
  readonly activeCommunityIds: ReadonlySet<string>;
}): boolean {
  return input.activeCommunityIds.has(input.communityId);
}

// A scope resolved to something a data-access function's WHERE clause can
// use directly — the explicit shape section 4 of this phase's brief calls
// for, so a missing/undefined value can never be mistaken for "everything".
export type CommunityQueryFilter =
  | { readonly mode: "single"; readonly communityId: string }
  // An intentional cross-community aggregate read — only ever reachable
  // when the caller's scope was already all_communities (itself gated by
  // canSelectAllCommunities()), never a default.
  | { readonly mode: "all" }
  // No community-owned population should be returned — unassigned or
  // non_community context, or a scope that failed authorization. The
  // explicit "return nothing" case, never silently widened.
  | { readonly mode: "none" };

// The one place a resolved CommunityScope becomes a query filter. unassigned
// and non_community both map to "none" — a scope with nothing resolved
// never falls through to "all" by omission.
export function communityScopeToQueryFilter(
  scope: CommunityScope,
  input: { readonly role: AuthRole; readonly activeCommunityIds: ReadonlySet<string> }
): CommunityQueryFilter {
  switch (scope.mode) {
    case "all_communities":
      return canSelectAllCommunities(input.role) ? { mode: "all" } : { mode: "none" };
    case "single_community":
      return isCommunityAccessAuthorized({
        role: input.role,
        communityId: scope.communityId,
        activeCommunityIds: input.activeCommunityIds,
      })
        ? { mode: "single", communityId: scope.communityId }
        : { mode: "none" };
    case "unassigned":
    case "non_community":
      return { mode: "none" };
  }
}
