// Contact role vocabulary (Slice C.2, 2026-09-19).
//
// contact_roles.role_type is plain text in the database, deliberately with NO CHECK
// enum (see that table's migration comment) — a new role type is a new value written by
// application code, never a schema migration. This list is the currently-known,
// documented set (from the Slice C.1 investigation's role-model survey); it is
// intentionally NOT enforced by the database, only exported here for anything that
// wants a canonical, typed starting vocabulary (e.g. a future UI dropdown). Passing a
// role_type not in this list is not an error — it's simply a role this list hasn't
// caught up to yet.
export const CONTACT_ROLE_TYPES = [
  "primary_contact",
  "emergency_contact",
  "decision_maker",
  "medical_poa",
  "financial_poa",
  "guardian",
  "responsible_party",
  "document_recipient",
  "signer",
  "billing_contact",
] as const;

export type KnownContactRoleType = (typeof CONTACT_ROLE_TYPES)[number];

// contact_roles.status IS a closed, CHECK-enforced set in the database (unlike
// role_type) — these three states are a structural distinction this schema exists to
// make, not an open vocabulary:
//   claimed  — reported/asserted (e.g. "the assessment says Susan is Medical POA"),
//              not proven. Role EXISTENCE is never equivalent to verified authority.
//   verified — backed by real evidence (contact_roles.evidence_id points at a
//              person_evidence row — see that column's own comment for why it's
//              unpopulated in this slice).
//   revoked  — the assignment ended or was superseded; kept for history, never deleted.
export const CONTACT_ROLE_STATUSES = ["claimed", "verified", "revoked"] as const;

export type ContactRoleStatus = (typeof CONTACT_ROLE_STATUSES)[number];

/** Whether a role's authority is actually evidenced, as opposed to merely claimed or
 * revoked. Exists so "is this role verified" is asked the same way everywhere, rather
 * than every caller re-deriving `status === "verified"` for itself. */
export function isRoleAuthorityVerified(status: ContactRoleStatus): boolean {
  return status === "verified";
}

export interface ContactRoleAssignment {
  readonly contactId: string;
  readonly residentId: string;
  readonly roleType: string;
  readonly status: ContactRoleStatus;
  /** YYYY-MM-DD, same plain-calendar-date discipline as the rest of this codebase's
   * business-date columns (see lib/utils/date.ts's own section on why a bare date is
   * never parsed as a UTC instant). */
  readonly effectiveStart: string;
  readonly effectiveEnd: string | null;
}

/** Structural validation only — mirrors exactly what contact_roles' own CHECK
 * constraints enforce (role_type non-blank, status in the closed set, effective_end on
 * or after effective_start when both present). Deliberately does NOT check or limit how
 * many role assignments exist for a given contact/resident/role_type combination — one
 * contact legitimately holds many roles for the same resident, and one role
 * legitimately has many contacts for the same resident (co-POAs, more than one
 * emergency contact) — see contact_roles' own migration comment for why no uniqueness
 * constraint exists for either. */
export function isValidContactRoleAssignment(assignment: ContactRoleAssignment): boolean {
  if (assignment.roleType.trim().length === 0) return false;
  if (!(CONTACT_ROLE_STATUSES as readonly string[]).includes(assignment.status)) return false;
  if (assignment.effectiveEnd !== null && assignment.effectiveEnd < assignment.effectiveStart) return false;
  return true;
}
