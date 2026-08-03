// Pure decision logic for Vendor Identity Lineage — no I/O, mirrors (but
// does not replace) the database-level guarantees in
// supabase/migrations/20260811000000_add_vendor_identity_lineage.sql
// (the primary-per-subject unique index, and the confirm/reopen/promote/
// set-role/reassign RPCs' own state checks). Both the UI (which actions to
// render) and lib/workforce/roster.ts (which link drives the displayed
// profile) call these same functions, so the two layers can never
// disagree — matches the precedent set by evidenceLifecycle.ts.
import type { LinkRole, PersonVendorIdentityLink } from "../supabase/types.ts";

// The confirmed links for one subject+source, in link_role terms. Multiple
// confirmed links per subject+source are expected and normal (a duplicate
// AxisCare record, a retired one) — nothing here restricts that; only the
// *primary* role is unique.
export function selectConfirmedLinksForSource(
  links: PersonVendorIdentityLink[],
  sourceSystem: string
): PersonVendorIdentityLink[] {
  return links.filter((l) => l.source_system === sourceSystem && l.status === "confirmed");
}

// The one link (if any) whose link_role is 'primary' — this is what drives
// a workforce member's displayed profile fields and derived lifecycle
// status. Duplicate/retired/historical links are deliberately excluded, so
// they can never overwrite current profile presentation and never count
// toward roster/compliance denominators that are keyed off the primary
// link (see lib/workforce/roster.ts, lib/workforce/registrySummary.ts).
export function selectPrimaryLink(
  links: PersonVendorIdentityLink[],
  sourceSystem: string
): PersonVendorIdentityLink | null {
  return selectConfirmedLinksForSource(links, sourceSystem).find((l) => l.link_role === "primary") ?? null;
}

// Mirrors promote_person_vendor_identity_link_to_primary()'s own guards:
// only a confirmed, non-primary link can be promoted.
export function canPromoteToPrimary(link: PersonVendorIdentityLink): boolean {
  return link.status === "confirmed" && link.link_role !== "primary";
}

// Mirrors set_person_vendor_identity_link_role()'s guards: only a confirmed
// link, and never to 'primary' — promotion has an atomic sibling-demotion
// side effect this path does not.
export function canSetRole(link: PersonVendorIdentityLink, newRole: Exclude<LinkRole, "primary">): boolean {
  if (link.status !== "confirmed") return false;
  return newRole === "duplicate" || newRole === "retired" || newRole === "historical";
}

// Mirrors reopen_person_vendor_identity_link()'s guard: only a rejected or
// deferred decision can be reopened.
export function canReopen(link: PersonVendorIdentityLink): boolean {
  return link.status === "rejected" || link.status === "deferred";
}

// Mirrors reassign_confirmed_vendor_identity_link_subject()'s guard: only a
// confirmed link can be corrected to a different workforce member.
export function canReassignConfirmedSubject(link: PersonVendorIdentityLink): boolean {
  return link.status === "confirmed";
}

export type IdentityLinkAction = "promote_to_primary" | "set_role" | "reassign_subject" | "reopen";

// The state-dependent actions menu for one confirmed/rejected/deferred
// link on the Source Identities section / resolved review queue.
export function getAvailableIdentityLinkActions(link: PersonVendorIdentityLink): IdentityLinkAction[] {
  const actions: IdentityLinkAction[] = [];
  if (canReopen(link)) {
    actions.push("reopen");
    return actions;
  }
  if (link.status === "confirmed") {
    if (canPromoteToPrimary(link)) actions.push("promote_to_primary");
    actions.push("set_role", "reassign_subject");
  }
  return actions;
}
