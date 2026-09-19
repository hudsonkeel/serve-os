// Pure presentation logic for the Client Readiness board — extracted from
// components/clientReadiness/ClientReadinessBoard.tsx so the CTA/status/
// copy decisions are unit-testable without rendering React. No I/O, no
// framework imports. Reuses existing evidence/status semantics
// (AuditReadinessStatus + PersonEvidence.verification_status) rather than
// inventing a parallel workflow state — see evaluateRequirementSetStatus()
// in lib/compliance/requirementSetStatus.ts and
// lib/compliance/auditReadinessStatus.ts's classifier for where
// "missing_evidence"/"needs_review"/"compliant" and "unverified"/
// "rejected"/"verified" already come from.
//
// Office Staff Client Readiness UX v0.2 (Priority 2 production-acceptance
// slice, 2026-09-19).
import {
  CLIENT_READINESS_ATTESTATION_REQUIREMENT_CODES,
  CR_CARE_DOCUMENTATION_CURRENT,
  CR_CLIENT_PROFILE_ON_FILE,
  CR_MEDICATION_LIST_ON_FILE,
  EP_CLIENT_TRIAGE_CLASSIFIED,
} from "./constants.ts";
import type { AuditReadinessStatus } from "../compliance/auditReadinessStatus.ts";

// The resident's current physician/guardian state, for
// CR_CLIENT_PROFILE_ON_FILE's own direct-remediation form — the same
// canonical fields the resident page's Care Contacts card already reads,
// passed straight through rather than re-fetched.
export interface ClientReadinessCareContacts {
  physicianName: string;
  physicianPhone: string;
  guardianName: string;
  guardianPhone: string;
  guardianConfirmedNone: boolean;
}

// The minimal shape every function below needs — deliberately narrower
// than the full ClientReadinessBoardItem (which also carries display-only
// fields like requirementName/regulatoryAuthority these functions never
// read), so this stays testable with plain object literals.
export interface BoardItemForPresentation {
  requirementCode: string;
  status: AuditReadinessStatus;
  // The underlying person_evidence row's own verification_status
  // ("unverified" | "verified" | "rejected"), not the collapsed
  // AuditReadinessStatus bucket — both "awaiting first verification" and
  // "rejected, needs replacement" collapse to the SAME "needs_review"
  // status (see lib/compliance/auditReadinessStatus.ts's classifier), so
  // distinguishing them for display requires this finer-grained field.
  // Null when there's no evidence row at all (genuinely missing).
  verificationStatus: string | null;
}

export function isSatisfiedStatus(status: AuditReadinessStatus): boolean {
  return status === "compliant" || status === "satisfied_by_event" || status === "exception";
}

// Office Staff Client Readiness v0.1 — the requirement-tier split.
// Document-backed requirements (ordinary upload/supersede work) are
// gated by canManageResidentDocuments, which includes office_staff.
// Attestation/governed requirements (a direct human confirmation or a
// clinical classification — never a document upload) stay gated by
// canAccessResidentEvidence, unchanged, office_staff excluded.
export function canActOnRequirement(requirementCode: string, canManageDocuments: boolean, canManageAttestations: boolean): boolean {
  return CLIENT_READINESS_ATTESTATION_REQUIREMENT_CODES.has(requirementCode) ? canManageAttestations : canManageDocuments;
}

// Direct, requirement-specific CTAs — see REQUIREMENT_ACTION_LABELS in
// ClientReadinessBoard.tsx for the full per-requirement map; this module
// only owns the STATUS-driven branching layered on top of whichever label
// the caller resolved for the "missing" case.
export type DocumentCtaState = "missing" | "awaiting_verification" | "rejected";

// Reuses existing evidence/status semantics: a document-backed requirement
// sitting at "needs_review" is either genuinely awaiting its first
// verification (verificationStatus === "unverified") or was rejected and
// needs replacement (verificationStatus === "rejected") — both real,
// already-persisted PersonEvidence states, never a new parallel one.
export function resolveDocumentCtaState(item: BoardItemForPresentation): DocumentCtaState {
  if (item.status !== "needs_review") return "missing";
  return item.verificationStatus === "rejected" ? "rejected" : "awaiting_verification";
}

// canManageDocuments/canManageAttestations narrow the CTA itself — a
// viewer who can't act on this specific requirement (e.g. office_staff
// looking at Triage Classification) sees "View Requirement →", never a
// verb implying they can resolve it. Matches resolveStatusCardCta's own
// not_applicable convention.
export function resolveClientReadinessCta(
  item: BoardItemForPresentation,
  careContacts: ClientReadinessCareContacts,
  canManageDocuments: boolean,
  canManageAttestations: boolean,
  requirementActionLabel: string | undefined,
  resolveDefaultCta: (status: AuditReadinessStatus) => string
): string {
  if (isSatisfiedStatus(item.status)) return "View Evidence →";
  if (item.status === "not_applicable") return "View Requirement →";
  if (!canActOnRequirement(item.requirementCode, canManageDocuments, canManageAttestations)) return "View Requirement →";

  if (item.requirementCode === CR_CLIENT_PROFILE_ON_FILE) {
    const missingPhysician = !careContacts.physicianName || !careContacts.physicianPhone;
    const guardianUnresolved = !(careContacts.guardianName && careContacts.guardianPhone) && !careContacts.guardianConfirmedNone;
    if (missingPhysician) return "Add Physician →";
    if (guardianUnresolved) return "Resolve Guardian →";
    return "Review & Resolve →";
  }

  // Document-tier requirements only — attestation-tier requirements never
  // reach "needs_review" in practice (they self-verify whenever recorded
  // at all), so this branch is a no-op for them.
  if (!CLIENT_READINESS_ATTESTATION_REQUIREMENT_CODES.has(item.requirementCode)) {
    const ctaState = resolveDocumentCtaState(item);
    if (ctaState === "rejected") return "Action Needed →";
    if (ctaState === "awaiting_verification") return "Awaiting Verification";
  }

  return requirementActionLabel ? `${requirementActionLabel} →` : resolveDefaultCta(item.status);
}

// ─── Awaiting Verification / Rejected panel copy ─────────────────────────
// Rendered inside the requirement panel, above whichever upload/replace
// form the requirement's own branch supplies — never a substitute for it.
export interface DocumentStatusBanner {
  tone: "awaiting_verification" | "rejected";
  heading: string;
  body: string;
}

export function resolveDocumentStatusBanner(item: BoardItemForPresentation): DocumentStatusBanner | null {
  const ctaState = resolveDocumentCtaState(item);
  if (ctaState === "missing") return null;
  if (ctaState === "rejected") {
    return {
      tone: "rejected",
      heading: "Action Needed — Documentation Rejected",
      body: "An authorized reviewer rejected this documentation. See the reviewer's note below, then upload a replacement.",
    };
  }
  return {
    tone: "awaiting_verification",
    heading: "Awaiting Verification",
    body: "Documentation uploaded. Authorized review required.",
  };
}

// The upload form's own trigger-button label — reuses the SAME upload
// component/action for the initial upload and every later replacement
// (never a parallel write path); only the label changes to avoid implying
// the first upload never happened.
export function resolveDocumentActionLabel(baseLabel: string, item: BoardItemForPresentation): string {
  const ctaState = resolveDocumentCtaState(item);
  if (ctaState === "missing") return baseLabel;
  if (ctaState === "rejected") return "Upload Replacement Documentation";
  return "Replace Documentation";
}

// ─── Attestation-tier next-step copy ──────────────────────────────────────
// Office Staff retains visibility into these requirements but has no
// governed action to take — see CLIENT_READINESS_ATTESTATION_REQUIREMENT_CODES.
// Deliberately capability-oriented ("authorized staff"), never a hard-coded
// role name (admin/manager/executive) — Priority 3 will separately
// investigate a qualification/capability model distinct from AuthRole, and
// this copy must not pre-empt that by naming a technical role as the
// business owner.
export const ATTESTATION_NEXT_STEP_COPY: Readonly<Record<string, string>> = {
  [CR_CLIENT_PROFILE_ON_FILE]: "Client profile information requires review or completion by authorized staff.",
  [EP_CLIENT_TRIAGE_CLASSIFIED]: "Authorized staff must record the client's emergency triage classification.",
  [CR_MEDICATION_LIST_ON_FILE]: "Authorized staff must confirm the current medication list from the designated source.",
  [CR_CARE_DOCUMENTATION_CURRENT]: "Authorized staff must confirm current care/service documentation in AxisCare.",
};

// Null for any code not in the map (e.g. a document-tier requirement,
// which never reaches this path since canActOnRequirement is already true
// for office_staff there) — never a guessed fallback string.
export function resolveAttestationGuidance(requirementCode: string): string | null {
  return ATTESTATION_NEXT_STEP_COPY[requirementCode] ?? null;
}
