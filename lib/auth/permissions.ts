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

// Resident documents/evidence (Audit Readiness Phase 2) — same PHI-
// sensitivity tier as editing the resident profile itself, since a
// document is frequently more sensitive than the profile fields around
// it. Deliberately not reusing canEditResidentProfile directly (a future
// reason to diverge the two tiers shouldn't be blocked by them being
// literally the same function), but identical today by design.
const RESIDENT_EVIDENCE_ROLES: readonly AuthRole[] = ["admin", "manager", "executive"];

export function canAccessResidentEvidence(role: AuthRole | null | undefined): boolean {
  return Boolean(role && RESIDENT_EVIDENCE_ROLES.includes(role));
}

// Office Staff Client Readiness v0.1 — splits the resident evidence tier
// above along the exact same "ordinary document work" vs. "compliance
// decision authority" line already established for Workforce
// (lib/workforce/permissions.ts's canManageWorkforceDocuments vs.
// canVerifyWorkforceEvidence). canAccessResidentEvidence above is
// UNCHANGED and keeps gating everything that stays admin/manager/
// executive-only: "Verify From Source" attestations (medication list,
// care documentation, guardian-none), triage classification, and any
// other compliance determination — office_staff is not added to it.
//
//   canManageResidentDocuments — view/open/upload/supersede an ordinary
//     client document (Assessment, ISP, Service Agreement, Billing,
//     Supervisory Visit, Significant Events, Discharge Summary). Adds
//     office_staff. An office_staff upload creates UNVERIFIED evidence
//     (Awaiting Verification) — see lib/clientReadiness/evidence.ts;
//     this predicate governs who may attempt the upload/view, not
//     whether the result is immediately verified.
//
//   canVerifyResidentEvidence — verify or reject evidence that's
//     reached Awaiting Verification. Same admin/manager/executive tier
//     as canAccessResidentEvidence today, kept as its own named
//     predicate (not an alias) so the two can diverge later without a
//     call-site rename — mirrors canVerifyWorkforceEvidence's own
//     precedent exactly. office_staff excluded.
const RESIDENT_DOCUMENT_MANAGEMENT_ROLES: readonly AuthRole[] = ["admin", "manager", "executive", "office_staff"];

export function canManageResidentDocuments(role: AuthRole | null | undefined): boolean {
  return Boolean(role && RESIDENT_DOCUMENT_MANAGEMENT_ROLES.includes(role));
}

export function canVerifyResidentEvidence(role: AuthRole | null | undefined): boolean {
  return Boolean(role && RESIDENT_EVIDENCE_ROLES.includes(role));
}

// Office Staff Visibility v0.1 (resident-access revision) — starting a
// live audio-capture Assessment session is care-plan territory, not
// ordinary resident-note/operational-update administration. Unlike the
// three roles-narrower predicates above (which exclude operations too),
// this one only excludes office_staff: startAssessmentCapture had no
// role check at all before this predicate existed, so every other role
// — including operations — already had this capability and keeps it
// unchanged.
const RESIDENT_ASSESSMENT_CAPTURE_ROLES: readonly AuthRole[] = ["admin", "manager", "executive", "operations"];

export function canCaptureResidentAssessment(role: AuthRole | null | undefined): boolean {
  return Boolean(role && RESIDENT_ASSESSMENT_CAPTURE_ROLES.includes(role));
}
