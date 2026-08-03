// Attention-Driven Operations (Phase 1C) — Requirement Resolution
// Playbooks. Static, per-requirement-type operational content: what this
// determination is for, how to resolve it, and what "done" looks like.
// Combined at render time with the live, per-employee evaluation
// (lib/compliance/requirementSetStatus.ts's output) and the three-axis
// understanding (lib/workforce/operationalUnderstanding.ts) — this file
// never varies per employee, only per requirement code.
//
// deepLink is deliberately null for every entry in this phase — this
// codebase does not fabricate external URLs it hasn't been given, and no
// confirmed portal URL exists yet for AxisCare/Viventium/E-Verify/the
// Texas NAR-EMR portal from inside this repository. Populate real URLs
// once Serve confirms them; the field exists now so nothing has to change
// shape later.
import type { AuthoritativeSourceSystem, EvidenceVerificationMethod } from "../supabase/types.ts";

export interface RequirementPlaybook {
  requirementCode: string;
  authoritativeSource: string;
  operationalContext: string;
  resolutionInstructions: string;
  permittedResolutionOutcomes: string[];
  verificationRequirement: string;
  expectedCompletionEffect: string;
  estimatedCompletionMinutes: number;
  primaryResponsibleRole: string;
  deepLink: { label: string; url: string } | null;
  // Human Attestation & Evidence Assurance (Phase 1D) — the Verify From
  // Source form's default selections for this requirement. Still fully
  // editable by the attester (the authoritative source a person actually
  // checked may differ from the typical one), these are only pre-fills.
  defaultAuthoritativeSourceSystem: AuthoritativeSourceSystem;
  defaultVerificationMethod: EvidenceVerificationMethod;
}

const PLAYBOOKS: Record<string, RequirementPlaybook> = {
  TX_NAR_SEARCH: {
    requirementCode: "TX_NAR_SEARCH",
    authoritativeSource: "Texas HHSC Nurse Aide Registry",
    operationalContext: "Texas requires a Nurse Aide Registry search before an unlicensed caregiver may work unsupervised in a client's home.",
    resolutionInstructions: "Run the search on the Texas HHSC Nurse Aide Registry site, save the result as a PDF, and upload it here.",
    permittedResolutionOutcomes: ["No record returned", "Listed, no findings", "Listed with findings", "Unable to determine"],
    verificationRequirement: "An admin or manager must review the uploaded result and verify it before it counts toward readiness.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified.",
    estimatedCompletionMinutes: 10,
    primaryResponsibleRole: "Operations",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "texas_nar",
    defaultVerificationMethod: "direct_source_review",
  },
  TX_EMR_SEARCH: {
    requirementCode: "TX_EMR_SEARCH",
    authoritativeSource: "Texas HHSC Employee Misconduct Registry",
    operationalContext: "Texas requires an Employee Misconduct Registry search before an unlicensed caregiver may work unsupervised in a client's home. A future transition to SEMARC may change how this search is performed without changing the underlying requirement.",
    resolutionInstructions: "Run the search on the current authoritative registry, save the result as a PDF, and upload it here.",
    permittedResolutionOutcomes: ["No record returned", "Listed, no findings", "Listed with findings", "Unable to determine"],
    verificationRequirement: "An admin or manager must review the uploaded result and verify it before it counts toward readiness.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified.",
    estimatedCompletionMinutes: 10,
    primaryResponsibleRole: "Operations",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "semarc",
    defaultVerificationMethod: "direct_source_review",
  },
  VIVENTIUM_DOCS_COMPLETE: {
    requirementCode: "VIVENTIUM_DOCS_COMPLETE",
    authoritativeSource: "Viventium",
    operationalContext: "Personnel records live in Viventium — this determination confirms every required document there is complete and signed, not that a copy also lives in Serve OS.",
    resolutionInstructions: "Confirm in Viventium that the employee's required document set is complete and signed, then upload confirmation (a screenshot or export is acceptable) here.",
    permittedResolutionOutcomes: ["Complete", "Incomplete"],
    verificationRequirement: "An admin or manager must verify the confirmation before it counts toward readiness.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified.",
    estimatedCompletionMinutes: 15,
    primaryResponsibleRole: "HR",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "viventium",
    defaultVerificationMethod: "direct_source_review",
  },
  I9_COMPLETION: {
    requirementCode: "I9_COMPLETION",
    authoritativeSource: "Form I-9 (federal)",
    operationalContext: "Federal law requires physical review of identity/work-authorization documents and a completed Form I-9 before an employee begins work.",
    resolutionInstructions: "Physically review the employee's identity documents, complete Form I-9, and upload confirmation of completion. Do not upload the underlying identity documents themselves — only confirmation that review occurred.",
    permittedResolutionOutcomes: ["Completed"],
    verificationRequirement: "An admin or manager must verify the confirmation before it counts toward readiness.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified.",
    estimatedCompletionMinutes: 15,
    primaryResponsibleRole: "HR",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "viventium",
    defaultVerificationMethod: "direct_source_review",
  },
  BACKGROUND_AUTHORIZATION_SIGNED: {
    requirementCode: "BACKGROUND_AUTHORIZATION_SIGNED",
    authoritativeSource: "Signed background-check authorization",
    operationalContext: "A signed authorization must be on file before a background investigation can be ordered.",
    resolutionInstructions: "Obtain the employee's signed authorization and upload it here.",
    permittedResolutionOutcomes: ["Signed"],
    verificationRequirement: "An admin or manager must verify the uploaded authorization before it counts toward readiness.",
    expectedCompletionEffect: "Unblocks ordering the background check itself.",
    estimatedCompletionMinutes: 5,
    primaryResponsibleRole: "HR",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "uploaded_document",
    defaultVerificationMethod: "document_review",
  },
  BACKGROUND_CHECK_RESULT: {
    requirementCode: "BACKGROUND_CHECK_RESULT",
    authoritativeSource: "Background investigation vendor",
    operationalContext: "The completed background investigation result determines whether the employment requirement is satisfied — see the Background Eligibility governance module for how a result is classified.",
    resolutionInstructions: "Once the vendor returns a result, upload it here for review.",
    permittedResolutionOutcomes: ["No record returned", "Listed, no findings", "Listed with findings", "Requires review"],
    verificationRequirement: "An admin or manager must review and verify the result before it counts toward readiness.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified; a finding may route to individualized or executive review under Background Eligibility governance.",
    estimatedCompletionMinutes: 15,
    primaryResponsibleRole: "HR",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "background_vendor",
    defaultVerificationMethod: "direct_source_review",
  },
  E_VERIFY_COMPLETION: {
    requirementCode: "E_VERIFY_COMPLETION",
    authoritativeSource: "E-Verify (DHS)",
    operationalContext: "E-Verify confirms an employee's work authorization against federal records, separate from Form I-9 itself.",
    resolutionInstructions: "Create the E-Verify case for this employee, confirm the result, and upload confirmation here.",
    permittedResolutionOutcomes: ["Employment authorized", "Tentative nonconfirmation", "Final nonconfirmation"],
    verificationRequirement: "An admin or manager must verify the confirmation before it counts toward readiness.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified.",
    estimatedCompletionMinutes: 10,
    primaryResponsibleRole: "HR",
    deepLink: null,
    // Per the product mission's own worked example: an E-Verify Human
    // Attestation reads authoritative_source_system=viventium,
    // verification_method=direct_source_review.
    defaultAuthoritativeSourceSystem: "viventium",
    defaultVerificationMethod: "direct_source_review",
  },
  REFERENCE_CHECKS: {
    requirementCode: "REFERENCE_CHECKS",
    authoritativeSource: "Employer-conducted reference calls",
    operationalContext: "Reference checks confirm prior work history and conduct before an employee begins unsupervised client work.",
    resolutionInstructions: "Complete the required reference calls, document the outcome, and upload the documentation here.",
    permittedResolutionOutcomes: ["Satisfactory", "Unsatisfactory", "Unable to reach"],
    verificationRequirement: "An admin or manager must verify the documented outcome before it counts toward readiness.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified.",
    estimatedCompletionMinutes: 20,
    primaryResponsibleRole: "Operations",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "other_authorized_source",
    defaultVerificationMethod: "direct_source_review",
  },
  SKILLS_SELF_ASSESSMENT: {
    requirementCode: "SKILLS_SELF_ASSESSMENT",
    authoritativeSource: "Serve's own skills self-assessment form",
    operationalContext: "A documented, reviewed self-assessment of caregiving skills before an employee begins unsupervised client work.",
    resolutionInstructions: "Have the employee complete the self-assessment, review it with them, and upload the completed, reviewed form here.",
    permittedResolutionOutcomes: ["Completed and reviewed"],
    verificationRequirement: "An admin or manager must verify the reviewed form before it counts toward readiness.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified.",
    estimatedCompletionMinutes: 20,
    primaryResponsibleRole: "Operations",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "uploaded_document",
    defaultVerificationMethod: "document_review",
  },
  HIPAA_HB300_TRAINING: {
    requirementCode: "HIPAA_HB300_TRAINING",
    authoritativeSource: "HIPAA / Texas HB 300 training program",
    operationalContext: "Employees who may access protected health information must complete privacy training and meet the required score.",
    resolutionInstructions: "Have the employee complete HIPAA/HB 300 training, then upload the completion certificate and record the score at verification.",
    permittedResolutionOutcomes: ["Passed", "Below required score"],
    verificationRequirement: "An admin or manager must verify the certificate and enter the recorded score — a score below the required threshold does not satisfy this requirement.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified at or above the required score.",
    estimatedCompletionMinutes: 45,
    primaryResponsibleRole: "Training/HR",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "other_authorized_source",
    defaultVerificationMethod: "document_review",
  },
  INFECTION_CONTROL_TRAINING: {
    requirementCode: "INFECTION_CONTROL_TRAINING",
    authoritativeSource: "Infection control training program",
    operationalContext: "Caregivers must complete infection control training and meet the required score before unsupervised client work.",
    resolutionInstructions: "Have the employee complete infection control training, then upload the completion certificate and record the score at verification.",
    permittedResolutionOutcomes: ["Passed", "Below required score"],
    verificationRequirement: "An admin or manager must verify the certificate and enter the recorded score — a score below the required threshold does not satisfy this requirement.",
    expectedCompletionEffect: "Moves this requirement to Audit Ready once verified at or above the required score.",
    estimatedCompletionMinutes: 30,
    primaryResponsibleRole: "Training/HR",
    deepLink: null,
    defaultAuthoritativeSourceSystem: "other_authorized_source",
    defaultVerificationMethod: "document_review",
  },
};

const DEFAULT_PLAYBOOK: Omit<RequirementPlaybook, "requirementCode"> = {
  authoritativeSource: "Not yet documented",
  operationalContext: "This requirement does not yet have a documented operational playbook.",
  resolutionInstructions: "Upload supporting evidence and have an admin or manager verify it.",
  permittedResolutionOutcomes: [],
  verificationRequirement: "An admin or manager must verify the uploaded evidence before it counts toward readiness.",
  expectedCompletionEffect: "Moves this requirement to Audit Ready once verified.",
  estimatedCompletionMinutes: 15,
  primaryResponsibleRole: "Operations",
  deepLink: null,
  defaultAuthoritativeSourceSystem: "other_authorized_source",
  defaultVerificationMethod: "direct_source_review",
};

export function getRequirementPlaybook(requirementCode: string): RequirementPlaybook {
  return PLAYBOOKS[requirementCode] ?? { requirementCode, ...DEFAULT_PLAYBOOK };
}
