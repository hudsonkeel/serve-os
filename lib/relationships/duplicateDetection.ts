import type { RelationshipStatus, RelationshipType } from "@/lib/supabase/types";

// Pure duplicate-detection rule for Resident Prospect creation (Part 13 of
// the prospect-consolidation scope). One active (non-closed) Resident
// Prospect Relationship per resident is the default expectation — not a
// hard database constraint, since a legitimate second engagement (e.g. a
// reactivation after a closed-lost outcome) must remain possible. This
// function is the single source of truth both the resident-detail
// "Start Relationship" entry point and the Relationships module's "Add
// Resident Prospect" flow call before creating anything, so a duplicate is
// never created silently — see docs/design/RELATIONSHIPS.md.

export interface DuplicateCandidateRelationship {
  id: string;
  relationshipType: RelationshipType;
  residentId: string | null;
  status: RelationshipStatus;
  updatedAt: string;
}

// Closed is the only terminal status for this purpose — a Relationship
// that's "won" or "closed_lost" (both map to status: "closed" — see
// change_relationship_stage() in 20260717000000_create_relationships_core.sql)
// never blocks a new one; "on_hold" is deliberately still treated as
// active/blocking, since a paused-but-not-abandoned opportunity is exactly
// the case a duplicate would confuse.
function isNonTerminal(status: RelationshipStatus): boolean {
  return status !== "closed";
}

// Returns the existing active Resident Prospect Relationship for this
// resident, if any — the one the UI should offer to reuse/open instead of
// silently creating a second one. When more than one non-terminal
// candidate exists (shouldn't normally happen, but the rule doesn't
// enforce a hard uniqueness constraint), the most recently updated one is
// returned, matching how getRelationshipsByResident() already orders its
// results (updated_at desc) — deterministic without needing extra
// sorting here.
export function findActiveResidentProspect<T extends DuplicateCandidateRelationship>(
  relationships: readonly T[],
  residentId: string
): T | null {
  const candidates = relationships.filter(
    (r) =>
      r.relationshipType === "resident_prospect" &&
      r.residentId === residentId &&
      isNonTerminal(r.status)
  );

  if (candidates.length === 0) return null;

  return [...candidates].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];
}

// True only when the caller is about to create a genuine second active
// Resident Prospect Relationship without having gone through the
// find-and-confirm flow above — used as a final guard right before create,
// not as the primary UX (the primary UX is findActiveResidentProspect()
// surfacing "Open Relationship" instead of ever attempting a create call).
export function hasActiveResidentProspect<T extends DuplicateCandidateRelationship>(
  relationships: readonly T[],
  residentId: string
): boolean {
  return findActiveResidentProspect(relationships, residentId) !== null;
}
