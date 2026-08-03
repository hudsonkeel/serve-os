import type { AuthRole } from "../auth/constants.ts";

// "Only explicitly authorized admins and managers should view workforce
// documents" — the mission's own minimum-necessary-access requirement.
// Narrower than the general Hiring Workspace's future access model.
const DOCUMENT_ACCESS_ROLES: readonly AuthRole[] = ["admin", "manager"];

export function canAccessWorkforceDocuments(role: string | null | undefined): boolean {
  return Boolean(role && (DOCUMENT_ACCESS_ROLES as readonly string[]).includes(role));
}

// Sync touches every caregiver's record and creates identity-review
// candidates organization-wide — restricted to admin, not manager, per the
// plan's "admin-only Sync Now button."
export function canTriggerAxisCareSync(role: string | null | undefined): boolean {
  return role === "admin";
}

// Identity-decision correction actions (reopen, promote/demote, reassign a
// confirmed link to a different workforce member) can silently change
// which AxisCare record drives a caregiver's profile and compliance
// status — restricted to admin per the Vendor Identity Lineage mission's
// explicit "admin-only" requirement. Narrower than
// canAccessWorkforceDocuments (admin+manager), which governs ordinary
// document/evidence review, not identity corrections.
export function canCorrectWorkforceIdentityLinks(role: string | null | undefined): boolean {
  return role === "admin";
}

// Canonical Profile Editor — see the "Serve OS Canonical Profile Editor"
// scope, section 11 ("Permissions"). Two tiers, both narrower than
// canAccessWorkforceDocuments in different ways:
//   canEditWorkforceCanonicalProfile   — preferred name, display name,
//     contact fields, community-specific fields. Admin + manager.
//   canEditWorkforceLegalIdentity      — legal first/middle/last name,
//     review/lock/unlock. Admin only — a manager may only "request" a
//     legal-name correction, never apply one directly.
const CANONICAL_PROFILE_EDIT_ROLES: readonly AuthRole[] = ["admin", "manager"];

export function canEditWorkforceCanonicalProfile(role: string | null | undefined): boolean {
  return Boolean(role && (CANONICAL_PROFILE_EDIT_ROLES as readonly string[]).includes(role));
}

export function canEditWorkforceLegalIdentity(role: string | null | undefined): boolean {
  return role === "admin";
}

// Community memberships — both admin and manager may manage them per the
// scope's permission list ("manage community memberships" / "manage local
// membership status").
export function canManageWorkforceCommunityMemberships(role: string | null | undefined): boolean {
  return Boolean(role && (CANONICAL_PROFILE_EDIT_ROLES as readonly string[]).includes(role));
}
