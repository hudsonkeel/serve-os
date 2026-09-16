import type { AuthRole } from "../auth/constants.ts";

// User Roles & Permissions v0.1 split canAccessWorkforceDocuments into two
// tiers along the business line "ordinary personnel-document
// administration" vs. "compliance decision authority":
//
//   canManageWorkforceDocuments   — view caregiver documents, open them via
//     signed URL, upload, and replace/renew/edit-in-place while unverified.
//     None of this changes verification_status; a superseding record this
//     tier creates always lands back at 'unverified' and still needs a
//     separate verify/reject decision. admin, manager, office_staff.
//
//   canVerifyWorkforceEvidence    — verifying/rejecting evidence, human
//     attestation, and marking a settled (already verified/rejected)
//     record entered in error are compliance determinations, not document
//     housekeeping — see lib/workforce/evidenceLifecycle.ts's
//     canMarkEnteredInError() (only ever offered for a settled record).
//     admin, manager only — office_staff is deliberately excluded per the
//     v0.1 business requirement ("ordinary personnel-document
//     administration, not compliance decision authority").
//
// Reassigning evidence to a different caregiver (misfiling correction) and
// hard-deleting an accidental upload are kept on their own functions below
// rather than folded into either tier above: reassignment moves a record
// across subjects (a correction with its own integrity risk, not
// requested for office_staff in v0.1) and deletion was explicitly called
// out to stay at the pre-v0.1 level for now. Both currently resolve to the
// same admin+manager role set as canVerifyWorkforceEvidence, but are named
// for what they actually gate so they can diverge independently later.
const DOCUMENT_MANAGEMENT_ROLES: readonly AuthRole[] = ["admin", "manager", "office_staff"];
const COMPLIANCE_EVIDENCE_ROLES: readonly AuthRole[] = ["admin", "manager"];

export function canManageWorkforceDocuments(role: string | null | undefined): boolean {
  return Boolean(role && (DOCUMENT_MANAGEMENT_ROLES as readonly string[]).includes(role));
}

export function canVerifyWorkforceEvidence(role: string | null | undefined): boolean {
  return Boolean(role && (COMPLIANCE_EVIDENCE_ROLES as readonly string[]).includes(role));
}

// Resolving/owning a compliance corrective action is its own compliance
// judgment, not document handling — same role set as
// canVerifyWorkforceEvidence today, named separately so the two can
// diverge without a silent behavior change.
export function canManageWorkforceComplianceActions(role: string | null | undefined): boolean {
  return Boolean(role && (COMPLIANCE_EVIDENCE_ROLES as readonly string[]).includes(role));
}

// Moving an evidence/document record to a different caregiver — a
// misfiling correction, not ordinary upload/replace of that caregiver's
// own document. Not requested for office_staff in v0.1.
export function canReassignWorkforceEvidence(role: string | null | undefined): boolean {
  return Boolean(role && (COMPLIANCE_EVIDENCE_ROLES as readonly string[]).includes(role));
}

// Hard-deleting an accidental upload stays at the pre-v0.1 permission
// level on purpose — explicitly not extended to office_staff this slice;
// revisit later.
export function canDeleteWorkforceDocuments(role: string | null | undefined): boolean {
  return Boolean(role && (COMPLIANCE_EVIDENCE_ROLES as readonly string[]).includes(role));
}

// Bulk roster import touches every caregiver record organization-wide —
// kept at the pre-v0.1 permission level, not ordinary per-caregiver
// document work.
export function canBulkImportWorkforceRoster(role: string | null | undefined): boolean {
  return Boolean(role && (COMPLIANCE_EVIDENCE_ROLES as readonly string[]).includes(role));
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
// explicit "admin-only" requirement. Narrower than both
// canManageWorkforceDocuments and canVerifyWorkforceEvidence, neither of
// which covers identity corrections.
export function canCorrectWorkforceIdentityLinks(role: string | null | undefined): boolean {
  return role === "admin";
}

// Canonical Profile Editor — see the "Serve OS Canonical Profile Editor"
// scope, section 11 ("Permissions"). Two tiers, both excluding
// office_staff (identity/contact-field edits are not ordinary document
// work):
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
