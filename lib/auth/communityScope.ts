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
