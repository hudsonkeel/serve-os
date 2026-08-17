import type { AuthRole } from "../auth/constants.ts";

// Follows this codebase's established convention exactly (see
// lib/workforce/permissions.ts): narrow, named canX(role) predicates over
// AuthRole, called from server actions/pages. RLS is enabled on every new
// Audit Readiness table but backed by zero policies — same as every other
// table in this schema — so these predicates, not RLS, are the real
// authorization layer. See the Phase 1 report for the explicit decision to
// record that absence as future security-hardening work rather than
// expand this migration into a broader authorization rewrite.

// Read-only dashboard/readiness visibility — broader than the
// evidence-sensitive actions below, since every operational role
// plausibly needs to see organizational audit readiness.
const AUDIT_READINESS_VIEW_ROLES: readonly AuthRole[] = ["admin", "manager", "executive", "operations"];

export function canViewAuditReadiness(role: string | null | undefined): boolean {
  return Boolean(role && (AUDIT_READINESS_VIEW_ROLES as readonly string[]).includes(role));
}

// Creating/resolving/dismissing a corrective action — consequential
// operational work, narrower than viewing. Mirrors
// canAccessWorkforceDocuments's admin+manager tier.
const CORRECTIVE_ACTION_MANAGE_ROLES: readonly AuthRole[] = ["admin", "manager"];

export function canManageCorrectiveActions(role: string | null | undefined): boolean {
  return Boolean(role && (CORRECTIVE_ACTION_MANAGE_ROLES as readonly string[]).includes(role));
}

// Starting, recording findings in, or completing an Audit Drill session —
// the record that becomes "what Serve believed on [date]." Same tier as
// corrective-action management, not narrower — an audit session is not a
// legal-identity-class edit the way requirement supersession is.
export function canRunAuditDrill(role: string | null | undefined): boolean {
  return Boolean(role && (CORRECTIVE_ACTION_MANAGE_ROLES as readonly string[]).includes(role));
}

// Superseding a requirement version changes what Serve OS treats as
// regulatory/compliance truth going forward — admin-only, mirroring
// canEditWorkforceLegalIdentity's admin-only precedent for the other
// "rewrites what the system asserts as fact" action class in this
// codebase.
export function canSupersedeRequirement(role: string | null | undefined): boolean {
  return role === "admin";
}
