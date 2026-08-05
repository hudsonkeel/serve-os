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
