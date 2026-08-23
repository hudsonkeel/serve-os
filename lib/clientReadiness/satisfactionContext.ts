// Client Readiness's closed, typed vocabulary for
// person_evidence.satisfaction_context — never free-form, mirroring
// Emergency Preparedness's exact discipline (see
// lib/emergencyPreparedness/satisfactionContext.ts). Every server action
// that writes Client Readiness evidence validates against this list before
// the insert; the deterministic composition only ever reads back values
// this same code wrote.
export const CLIENT_READINESS_SATISFACTION_CONTEXTS = [
  // CR_ASSESSMENT_CURRENT — written automatically when a Serve Assessment
  // session is approved (Serve-native governed evidence, not attestation).
  "assessment_approved",
  // CR_ISP_ON_FILE_AND_CURRENT — written when the approved Assessment/Care
  // Plan (session-based or the manually-uploaded document) also serves as
  // the operational ISP, composed via recordAssessmentIspEvidence() /
  // recordAssessmentIspEvidenceFromDocument() in evidence.ts. Never a
  // second upload — the same artifact satisfies both requirements.
  "isp_satisfied_by_assessment",
  // CR_CLIENT_PROFILE_ON_FILE — the guardian-none attestation.
  "guardian_confirmed_none",
  // CR_MEDICATION_LIST_ON_FILE — Verify From Source outcomes.
  "medication_list_verified_present",
  "medication_list_verified_not_applicable",
  // CR_CARE_DOCUMENTATION_CURRENT — Verify From Source over AxisCare.
  "care_documentation_verified",
  // EP_CLIENT_TRIAGE_CLASSIFIED — AxisCare-sourced, structured-import
  // evidence (never a live evaluator call). Leadership confirmed
  // (2026-08-17) AxisCare's Client Profile Triage Level field is the
  // same triage classification this requirement governs — see
  // recordAxisCareTriageEvidence() in evidence.ts.
  "triage_classification_axiscare_sourced",
  // EP_CLIENT_TRIAGE_CLASSIFIED — Serve-recorded structured classification
  // (a select, not a document upload) — see
  // syncCurrentTriageClassificationEvidence() in evidence.ts. Note that
  // this requirement's actual satisfaction is read directly from
  // resident_triage_classifications (see
  // evaluateTriageClassification() in clientReadinessReadiness.ts), not
  // from this evidence row's mere existence — the evidence row here is
  // for audit trail / evidence-summary display only.
  "triage_classification_serve_recorded",
] as const;

export type ClientReadinessSatisfactionContext = (typeof CLIENT_READINESS_SATISFACTION_CONTEXTS)[number];

export function isClientReadinessSatisfactionContext(
  value: string | null | undefined
): value is ClientReadinessSatisfactionContext {
  return (
    value !== null &&
    value !== undefined &&
    (CLIENT_READINESS_SATISFACTION_CONTEXTS as readonly string[]).includes(value)
  );
}
