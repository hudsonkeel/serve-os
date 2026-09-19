// Idempotency and already-resolved filtering (Slice C.3, 2026-09-19). Pure logic extracted out
// of lib/actions/importantPeople.ts so the decisions that make repeated automatic-projection runs
// safe — every page load re-runs the same projection (Slice C.3 refinement, 2026-09-19) — and
// keep a canonicalized proposal from reappearing as "unresolved" are directly unit tested, not
// just exercised through a live server action.
//
// The key idea throughout: every contact_roles/contact_field_provenance row this slice writes
// carries source_reference = the exact assessment_approved_facts.id it came from. That id is
// stable and unique per approved fact, so "has this specific piece of assessment knowledge
// already been canonicalized" is answerable by a simple set-membership check — no separate
// "pending proposal" table or extra state is needed.

import type { ImportantPersonRoleProposal, ProposedImportantPerson } from "./importantPeopleProposals.ts";

/**
 * Of the roles a materialization run was asked to create, returns only the ones NOT already
 * recorded (by source_reference) — the rest are silently skipped as already-done rather than
 * re-inserted. This is what makes a page reload, a concurrent viewer, or a retried request after a
 * partial failure all converge on the same end state instead of creating duplicate role rows.
 */
export function computeMissingRoleInserts(
  requestedRoles: readonly ImportantPersonRoleProposal[],
  existingSourceReferences: ReadonlySet<string>
): ImportantPersonRoleProposal[] {
  return requestedRoles.filter((role) => !existingSourceReferences.has(role.sourceApprovedFactId));
}

/**
 * A proposal is fully resolved once EVERY role it would contribute already has a matching
 * contact_roles row (by source_reference) — i.e. some prior materialization run already
 * canonicalized every fact this proposal is built from. A partially-resolved proposal (some roles
 * recorded, some not) is NOT considered resolved: it should still be materialized so it can be
 * completed, but that run will only insert the still-missing roles (see
 * computeMissingRoleInserts) rather than starting over.
 */
export function isProposalFullyResolved(
  proposal: ProposedImportantPerson,
  existingSourceReferences: ReadonlySet<string>
): boolean {
  return proposal.roles.every((role) => existingSourceReferences.has(role.sourceApprovedFactId));
}

/**
 * Splits proposals into those still needing materialization vs. those already fully
 * canonicalized — the latter must never be re-materialized or shown as needing attention once
 * they're resolved (Slice C.3 requirement L). Resolved proposals are returned too (by
 * proposalKey) so a caller can cross-check against "Current Important People" if useful, but the
 * canonical display source for that section is always the live contacts/contact_roles data, never
 * a re-run of this filter.
 */
export function partitionProposalsByResolution(
  proposals: readonly ProposedImportantPerson[],
  existingSourceReferences: ReadonlySet<string>
): { unresolved: ProposedImportantPerson[]; resolved: ProposedImportantPerson[] } {
  const unresolved: ProposedImportantPerson[] = [];
  const resolved: ProposedImportantPerson[] = [];
  for (const proposal of proposals) {
    if (isProposalFullyResolved(proposal, existingSourceReferences)) {
      resolved.push(proposal);
    } else {
      unresolved.push(proposal);
    }
  }
  return { unresolved, resolved };
}
