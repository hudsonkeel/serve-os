import type { AuthRole } from "../auth/constants.ts";

// Office Staff Visibility v0.1 — least-necessary navigation/route
// visibility for office_staff. Every predicate below is an explicit
// positive allow-list, never a role !== "x" exclusion, so a future sixth
// role must be deliberately added to a list rather than silently
// inheriting access (the exact gap that let office_staff fall through
// Settings' old `role !== "operations"` check — see
// canViewManagementSettings below).
//
// These are genuinely two different tiers, both expressed explicitly:
//
//   GENERAL_STAFF_ROLES     — every role that existed before office_staff
//     (admin, manager, executive, operations). The two destinations
//     below predate office_staff and were never restricted for any of
//     those four; office_staff v0.1 is the first role excluded from
//     them. Reused across unrelated-content pages (the executive
//     dashboard, Community Outlook) because they share the same role
//     boundary today, not because they are one capability — if that
//     boundary ever needs to diverge per page, split this constant
//     then, not preemptively now.
//
//   MANAGEMENT_TIER_ROLES   — admin, manager, executive only. Narrower
//     than GENERAL_STAFF_ROLES: excludes operations too. Used only for
//     Settings' management-tier sections (Users & Roles, Organization &
//     Communities, Workflow Configuration, Integrations, Governance &
//     Audit) — "My Account" is visible to every authenticated role and
//     is not gated by either constant.
const GENERAL_STAFF_ROLES: readonly AuthRole[] = ["admin", "manager", "executive", "operations"];
const MANAGEMENT_TIER_ROLES: readonly AuthRole[] = ["admin", "manager", "executive"];

// Ask Serve is read-only organizational knowledge (Serve P&P, Texas PAS
// regulations, controlled procedures with authority/status labeled) and
// grants no additional operational/governance authority — office_staff
// may look up what policy requires without gaining permission to verify
// compliance evidence, approve exceptions, or take any other currently
// prohibited action. This is the one case (anticipated in the
// GENERAL_STAFF_ROLES comment above) where a destination's role
// boundary diverges from the shared tier, so it gets its own constant
// rather than widening GENERAL_STAFF_ROLES — canViewOrganizationalDashboard
// and canViewCommunityOutlook remain unaffected and still exclude
// office_staff.
const ASK_SERVE_ROLES: readonly AuthRole[] = ["admin", "manager", "executive", "operations", "office_staff"];

// The People We Serve had a canViewPeopleWeServe predicate here
// initially, excluding office_staff the same way as the four functions
// below. That was revised: office_staff routinely fields calls/updates
// about residents/clients and needs to view and contribute to their
// records directly, so The People We Serve is visible to every role —
// see DECISION_LOG.md and lib/navigation/navData.ts. The narrower
// capabilities within that page (editing canonical identity, managing
// evidence/client readiness, reconciliation, initiating an assessment)
// remain excluded via their own existing predicates — see
// lib/auth/permissions.ts.

export function canViewOrganizationalDashboard(role: string | null | undefined): boolean {
  return Boolean(role && (GENERAL_STAFF_ROLES as readonly string[]).includes(role));
}

export function canViewCommunityOutlook(role: string | null | undefined): boolean {
  return Boolean(role && (GENERAL_STAFF_ROLES as readonly string[]).includes(role));
}

export function canViewAskServe(role: string | null | undefined): boolean {
  return Boolean(role && (ASK_SERVE_ROLES as readonly string[]).includes(role));
}

// Quality (QAPI) is deliberately NOT redefined here — it gates on
// lib/compliance/permissions.ts's canViewAuditReadiness
// (admin/manager/executive/operations), which already excludes
// office_staff today. Office Staff Visibility v0.1 reuses that existing
// predicate as-is for nav visibility rather than duplicating its role
// list here, so the two can never drift apart. Explicitly not widened —
// see DECISION_LOG / this slice's own report.
//
// Audit Readiness is NOT gated here either, but for a different reason
// as of Scoped Workforce Audit Readiness for office_staff: it's visible
// to every role, including office_staff — visiting it as office_staff
// renders a workforce-only scoped view rather than the full Governance
// dashboard (see app/audit-readiness/page.tsx and
// lib/compliance/permissions.ts's canViewPeopleReadiness).
// canViewAuditReadiness itself remains unwidened.

export function canViewManagementSettings(role: string | null | undefined): boolean {
  return Boolean(role && (MANAGEMENT_TIER_ROLES as readonly string[]).includes(role));
}
