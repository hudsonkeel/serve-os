// Pure decision logic for the Evidence Management workflow — no I/O,
// mirrors (but does not replace) the database-level guarantees in
// supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql
// (assert_verified_evidence_immutable, reassign_unverified_evidence_subject,
// delete_unverified_evidence_and_document). Both the UI (which action menu
// to render) and the server actions (a friendly pre-check before the DB
// rejects an invalid transition) call these same functions, so the two
// layers can never disagree about what's allowed.
import type { PersonEvidence, PersonEvidenceLifecycleStatus } from "../supabase/types.ts";

export type EvidenceAction =
  | "edit_details"
  | "reassign"
  | "delete"
  | "replace"
  | "correct"
  | "mark_entered_in_error"
  | "upload_renewal"
  | "view_history";

// There is no scheduled job to flip lifecycle_status to 'expired' as
// calendar time passes (see lib/compliance/requirementSetStatus.ts's own
// note on this) — so "is this evidence effectively expired right now" is
// computed the same way here as it is for display purposes, and passed in
// by the caller rather than recomputed differently in two places.
export function isEffectivelyExpired(evidence: PersonEvidence): boolean {
  if (evidence.lifecycle_status === "expired") return true;
  if (evidence.lifecycle_status !== "active") return false;
  return evidence.expiration_date !== null && new Date(evidence.expiration_date).getTime() < Date.now();
}

// Unverified evidence/documents are freely editable in place — the only
// gate this function checks is the verification judgment itself, matching
// assert_verified_evidence_immutable()'s own condition exactly
// (verification_status in ('verified', 'rejected') is what freezes a row).
export function canEditInPlace(evidence: PersonEvidence): boolean {
  return evidence.verification_status === "unverified";
}

// A record created by a prior supersede/renewal already carries
// supersedes_evidence_id — reassigning just this row would break that
// chain's own same-subject guarantee (see
// reassign_unverified_evidence_subject()'s matching guard). Delete and
// recreate instead.
export function canReassign(evidence: PersonEvidence): boolean {
  return evidence.verification_status === "unverified" && evidence.supersedes_evidence_id === null;
}

// Mirrors delete_unverified_evidence_and_document()'s guards: never
// verified/rejected, and nothing has ever superseded it (which would
// itself prove it was relied upon as history).
export function canHardDelete(evidence: PersonEvidence, hasSuperseder: boolean): boolean {
  return evidence.verification_status === "unverified" && !hasSuperseder;
}

// A settled (verified or rejected) record may be superseded — via Replace
// document, Correct with new evidence, Supersede, or a renewal — only
// while it's still the *current* record for its requirement (lifecycle_status
// 'active', including one that has aged past its expiration_date but hasn't
// been explicitly marked so). An already-superseded or entered-in-error row
// is history, not an editable target.
export function canSupersede(evidence: PersonEvidence): boolean {
  return evidence.verification_status !== "unverified" && evidence.lifecycle_status === "active";
}

// Only offered for a settled record that's still current — matches the
// mission's own state->menu mapping (unverified evidence is deleted, not
// marked entered in error).
export function canMarkEnteredInError(evidence: PersonEvidence): boolean {
  return evidence.verification_status !== "unverified" && evidence.lifecycle_status === "active";
}

// The state-dependent actions menu for the *current* evidence row shown on
// a requirement card. Historical rows (superseded / entered_in_error) are
// never passed here — they render in a read-only history list instead (see
// components/workforce/RegistryEvidenceCard.tsx).
export function getAvailableEvidenceActions(evidence: PersonEvidence | null): EvidenceAction[] {
  if (!evidence) return [];

  if (evidence.verification_status === "unverified") {
    const actions: EvidenceAction[] = ["edit_details"];
    if (canReassign(evidence)) actions.push("reassign");
    actions.push("delete");
    return actions;
  }

  if (isEffectivelyExpired(evidence)) {
    return ["upload_renewal", "view_history"];
  }

  // Settled (verified/rejected) and still current.
  return ["replace", "correct", "mark_entered_in_error"];
}

// Which supersede-shaped action produced a new evidence row determines its
// audit event type — same underlying data operation (see
// lib/actions/workforce.ts's supersedeWorkforceEvidence()), different
// human-facing label in the timeline.
export type SupersedeActionKind = "replace" | "correct" | "supersede" | "renew";

export function resolveSupersedeEventType(kind: SupersedeActionKind): "evidence_replaced" | "evidence_renewed" {
  return kind === "renew" ? "evidence_renewed" : "evidence_replaced";
}

// The exact patch a lifecycle transition (supersede, mark entered in
// error, expire) writes to person_evidence — used by
// lib/data/personEvidence.ts's transitionLifecycleStatus() and exported
// here, pure, so it's directly testable that a lifecycle transition never
// includes verification_status, verified_by, or verified_at: preserving
// the original verification history is a property of *what this function
// returns*, not just a promise kept by the caller.
export interface LifecycleTransitionPatch {
  lifecycle_status: PersonEvidenceLifecycleStatus;
  lifecycle_status_reason: string;
  lifecycle_status_changed_by: string;
  lifecycle_status_changed_at: string;
}

export function buildLifecycleTransitionPatch(
  lifecycleStatus: PersonEvidenceLifecycleStatus,
  actor: string,
  reason: string,
  now: () => string = () => new Date().toISOString()
): LifecycleTransitionPatch {
  return {
    lifecycle_status: lifecycleStatus,
    lifecycle_status_reason: reason,
    lifecycle_status_changed_by: actor,
    lifecycle_status_changed_at: now(),
  };
}

// What a supersede/replace/correct/renew action is allowed to carry
// forward from the record it replaces: subject and requirement are always
// copied from the old evidence, never taken from caller-supplied input —
// this is what makes cross-subject and cross-requirement replacement
// structurally impossible from the action layer's own construction, before
// the DB trigger ever gets a chance to reject it.
export function buildSupersedingEvidenceIdentity(oldEvidence: PersonEvidence): {
  subjectType: PersonEvidence["subject_type"];
  subjectId: string;
  requirementId: string;
} {
  return {
    subjectType: oldEvidence.subject_type,
    subjectId: oldEvidence.subject_id,
    requirementId: oldEvidence.requirement_id,
  };
}
