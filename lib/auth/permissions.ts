import type { AuthRole } from "./constants";

// Resident profile data includes PII (date of birth, contact information,
// family contact details) — editing is deliberately narrower than "any
// authenticated user." Matches the same admin/manager(+executive)
// convention already used for Workforce document access. "operations" is
// intentionally excluded — it is the lowest-trust of the four roles and
// has no established precedent for editing resident PII.
const RESIDENT_PROFILE_EDIT_ROLES: readonly AuthRole[] = ["admin", "manager", "executive"];

export function canEditResidentProfile(role: AuthRole | null | undefined): boolean {
  return Boolean(role && RESIDENT_PROFILE_EDIT_ROLES.includes(role));
}

// Reconciliation actions (confirm/reject/defer an identity match,
// classify a vendor record's disposition) change durable canonical
// truth about a real person or vendor record — same governance boundary
// as resident profile edits, not "any authenticated user."
const RECONCILIATION_ACTION_ROLES: readonly AuthRole[] = ["admin", "manager", "executive"];

export function canPerformReconciliationActions(role: AuthRole | null | undefined): boolean {
  return Boolean(role && RECONCILIATION_ACTION_ROLES.includes(role));
}
