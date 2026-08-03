// Human Attestation & Evidence Assurance (Phase 1D) — "An authorized
// person personally reviewing an authoritative source and recording that
// review inside Serve OS." This module owns exactly one decision the
// evaluator itself must never make: given a structured observed result,
// does THIS requirement consider that result acceptable (satisfies the
// requirement) or not (needs follow-up)? That decision determines whether
// the new evidence row is written as verified or rejected — the only two
// vocabulary words the unmodified evaluator
// (lib/compliance/requirementSetStatus.ts) ever reads.
import type { AttestationResult, AuthoritativeSourceSystem, EvidenceCollectionMethod, EvidenceVerificationMethod } from "../supabase/types.ts";

export const ATTESTATION_RESULT_LABELS: Record<AttestationResult, string> = {
  verified: "Verified",
  verified_with_observation: "Verified with Observation",
  completed_closed: "Completed / Closed",
  pending: "Pending",
  case_not_found: "Case Not Found",
  unable_to_verify: "Unable to Verify",
  contradictory: "Contradictory Evidence",
  requires_review: "Requires Human Review",
  not_found: "Not Found",
  unknown: "Unknown",
};

export const AUTHORITATIVE_SOURCE_LABELS: Record<AuthoritativeSourceSystem, string> = {
  viventium: "Viventium",
  axiscare: "AxisCare",
  texas_nar: "Texas Nurse Aide Registry",
  semarc: "SEMARC",
  background_vendor: "Background Vendor",
  uploaded_document: "Uploaded Document",
  other_authorized_source: "Other Authorized Source",
};

export const COLLECTION_METHOD_LABELS: Record<EvidenceCollectionMethod, string> = {
  human_attestation: "Human Attestation",
  api_sync: "API Sync",
  structured_import: "Structured Import",
  document_upload: "Document Upload",
  digital_compatriot_observation: "Digital Compatriot Observation",
};

export const VERIFICATION_METHOD_LABELS: Record<EvidenceVerificationMethod, string> = {
  direct_source_review: "Direct Source Review",
  document_review: "Document Review",
  imported_authoritative_status: "Imported Authoritative Status",
  automated_source_confirmation: "Automated Source Confirmation",
};

// The default acceptable-outcome set — deliberately generic, applies to
// every requirement unless a requirement-specific playbook overrides it
// (see getAcceptableAttestationResults() below). "completed_closed" is
// included because it's the clean E-Verify-style success outcome, NOT
// because completed/closed is assumed universally sufficient — a future
// requirement whose playbook needs a narrower or different acceptable set
// overrides this per requirement code, exactly as instructed.
const DEFAULT_ACCEPTABLE_ATTESTATION_RESULTS: ReadonlySet<AttestationResult> = new Set([
  "verified",
  "verified_with_observation",
  "completed_closed",
]);

// Every requirement in this phase uses the generic default — no
// requirement-specific override exists yet. The seam is real (a future
// requirement can register its own acceptable set here without touching
// the evaluator, the UI, or this function's callers), but nothing is
// speculatively built beyond what's needed today.
const REQUIREMENT_SPECIFIC_ACCEPTABLE_RESULTS: Partial<Record<string, ReadonlySet<AttestationResult>>> = {};

export function getAcceptableAttestationResults(requirementCode: string): ReadonlySet<AttestationResult> {
  return REQUIREMENT_SPECIFIC_ACCEPTABLE_RESULTS[requirementCode] ?? DEFAULT_ACCEPTABLE_ATTESTATION_RESULTS;
}

export function isAttestationResultAcceptable(requirementCode: string, result: AttestationResult): boolean {
  return getAcceptableAttestationResults(requirementCode).has(result);
}

// The only two vocabulary words the evaluator ever reads. An attestation
// IS the verification act — it never leaves evidence "unverified"; an
// acceptable observed result resolves the row to verified, everything else
// resolves it to rejected (which the unmodified evaluator already maps to
// requires_review). The specific attestation_result stays on the row
// either way, so a "Pending" attestation reads distinctly from a
// "Contradictory" one even though both take the same requires_review path
// today.
export function attestationVerificationOutcome(
  requirementCode: string,
  result: AttestationResult
): "verified" | "rejected" {
  return isAttestationResultAcceptable(requirementCode, result) ? "verified" : "rejected";
}

// E-Verify's own outcome set, per the mission's explicit requirement that
// the platform "support at least" these for E-Verify — a subset of the
// shared AttestationResult vocabulary (no new column needed), scoped down
// for the Verify From Source form when the requirement is E-Verify-shaped.
export const E_VERIFY_ATTESTATION_RESULTS: readonly AttestationResult[] = [
  "completed_closed",
  "pending",
  "case_not_found",
  "unable_to_verify",
  "contradictory",
  "requires_review",
];

export const GENERIC_ATTESTATION_RESULTS: readonly AttestationResult[] = [
  "verified",
  "verified_with_observation",
  "unable_to_verify",
  "contradictory",
  "requires_review",
  "not_found",
  "unknown",
];

// Which observed-result options the Verify From Source form should offer
// for a given requirement — E-Verify gets its own named set, everything
// else gets the generic set. A per-requirement lookup (not a single global
// list) so a future requirement with its own outcome vocabulary can be
// added here without changing the form component itself.
export function getAttestationResultOptions(requirementCode: string): readonly AttestationResult[] {
  return requirementCode === "E_VERIFY_COMPLETION" ? E_VERIFY_ATTESTATION_RESULTS : GENERIC_ATTESTATION_RESULTS;
}
