// Pure nav destination data + role-visibility filtering — deliberately
// free of any UI-library import (lucide-react in particular). This
// codebase's test convention runs lib/ test files under plain Node
// (node --experimental-strip-types), which cannot load lucide-react's
// icon components (they assume a real React runtime); keeping this file
// icon-free is what makes it testable at all. lib/navigation/primaryNav.ts
// is the UI-facing layer — it imports this data and zips in icons for
// Sidebar.tsx/MobileNavDrawer.tsx; nothing here changes what either
// component renders.
import type { AuthRole } from "../auth/constants.ts";

export interface NavDestination {
  label: string;
  href: string;
  // Office Staff Visibility v0.1 — omitted (undefined) means "every
  // authenticated role," the behavior every item had before this field
  // existed. Where present, it's an explicit positive allow-list (never
  // a role !== "x" exclusion) hand-matched to the real server-side gate
  // enforced on that destination's page(s) — see lib/navigation/
  // permissions.ts and lib/compliance/permissions.ts's
  // canViewAuditReadiness. Nav visibility and route authorization are
  // two separate mechanisms; this field only controls the former. A
  // role missing from here still needs the matching page-level check,
  // or hiding the link accomplishes nothing.
  roles?: readonly AuthRole[];
}

export interface NavDestinationSection {
  heading: string;
  items: NavDestination[];
}

// Every role that existed before office_staff, which is excluded from
// Quality (QAPI), How We're Doing, Community Outlook, and Ask Serve.
// Matches lib/navigation/permissions.ts's GENERAL_STAFF_ROLES and
// lib/compliance/permissions.ts's canViewAuditReadiness exactly — kept as
// its own literal here (not imported) because this file is nav display
// data, not a permission predicate; the actual authorization for each of
// these routes lives in their own page-level check, not in this list.
//
// The People We Serve and Audit Readiness are deliberately NOT
// restricted by this list, for the same reason: each initially hid
// office_staff too, and each was revised once a legitimate,
// narrowly-scoped need was identified.
//   - The People We Serve: office_staff routinely fields calls/updates
//     about residents/clients and needs to capture that directly in
//     Serve OS — see lib/auth/permissions.ts's
//     canCaptureResidentAssessment and the existing
//     canEditResidentProfile/canAccessResidentEvidence/
//     canPerformReconciliationActions checks, none of which include
//     office_staff.
//   - Audit Readiness: office_staff needs to see the operational
//     consequence of the personnel documents they manage. Visiting
//     /audit-readiness as office_staff does NOT reach the full
//     Governance dashboard — app/audit-readiness/page.tsx branches to a
//     workforce-only scoped view before canViewAuditReadiness is even
//     checked, via lib/compliance/permissions.ts's
//     canViewPeopleReadiness. canViewAuditReadiness itself still
//     excludes office_staff, unchanged — see
//     components/compliance/PeopleReadinessView.tsx.
const PRE_OFFICE_STAFF_ROLES: readonly AuthRole[] = ["admin", "manager", "executive", "operations"];

export const NAV_SECTIONS_DATA: NavDestinationSection[] = [
  {
    heading: "Today",
    items: [{ label: "Today's Work", href: "/workspace" }],
  },
  {
    heading: "Serve",
    items: [
      { label: "The People We Serve", href: "/residents" },
      { label: "Workforce", href: "/workforce" },
    ],
  },
  // Governance is the organizational realm — the cross-domain systems that
  // define, evaluate, document, and demonstrate how Serve operates, as
  // distinct from Serve's operational people/domains above. Audit
  // Readiness is the first product to live here; the product itself keeps
  // its own name (Governance is the realm, not a rename). Quality (QAPI)
  // is the second (2026-08-25) — a distinct leadership view over the same
  // underlying readiness/compliance data ("what are we learning / what
  // needs attention" vs. Audit Readiness's "can we prove it right now"),
  // never a duplicate evaluator — see lib/qapi/dashboard.ts. Emergency
  // Preparedness is deliberately NOT a third top-level item here: it stays
  // a capability reached from within Audit Readiness (its dashboard's own
  // Start Audit Drill / View Past Audits actions), same as Audit Drills.
  {
    heading: "Governance",
    items: [
      // Desktop-only for v0.1 — MobileNavDrawer.tsx renders its own
      // narrow item list, not a mapping over every NAV_SECTIONS_DATA
      // entry, so adding these here does not put them in the
      // phone-width drawer. See the Audit Readiness Phase 1 report for
      // why this stays desktop-only.
      { label: "Audit Readiness", href: "/audit-readiness" },
      { label: "Quality (QAPI)", href: "/qapi", roles: PRE_OFFICE_STAFF_ROLES },
    ],
  },
  {
    heading: "Understand",
    items: [
      { label: "How We're Doing", href: "/dashboard", roles: PRE_OFFICE_STAFF_ROLES },
      { label: "Community Outlook", href: "/community-intelligence", roles: PRE_OFFICE_STAFF_ROLES },
    ],
  },
];

// Utility area — Ask Serve + Settings, deliberately outside the
// Today/Serve/Understand work hierarchy above.
export const NAV_UTILITY_DATA: NavDestination[] = [
  { label: "Ask Serve", href: "/ask-serve", roles: PRE_OFFICE_STAFF_ROLES },
  { label: "Settings", href: "/settings" },
];

// An item with no `roles` is visible to every authenticated role
// (unchanged default). A section left with zero visible items after
// filtering is dropped entirely, not rendered as an empty heading.
export function getVisibleNavSectionsData(role: AuthRole | null | undefined): NavDestinationSection[] {
  return NAV_SECTIONS_DATA.map((section) => ({
    heading: section.heading,
    items: section.items.filter((item) => !item.roles || (role != null && item.roles.includes(role))),
  })).filter((section) => section.items.length > 0);
}

export function getVisibleUtilityItemsData(role: AuthRole | null | undefined): NavDestination[] {
  return NAV_UTILITY_DATA.filter((item) => !item.roles || (role != null && item.roles.includes(role)));
}
