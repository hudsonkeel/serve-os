// The Recruiting lifecycle's Desired State definitions — vendor-agnostic,
// versioned, declarative. See
// docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md
// (Revision 2) for the full rationale behind every governance status
// below. Only two requirements in this entire file are `adopted`; every
// other requirement is deliberately `proposed`/`not_yet_adopted` because
// this project has not formally ratified more policy than that yet — this
// module must never manufacture governance that doesn't actually exist.
import type { DesiredStateDefinition } from "./types.ts";

export const LEAD_IDENTIFIED: DesiredStateDefinition = {
  key: "recruiting.desired_state.lead_identified",
  version: 1,
  title: "Lead Identified",
  purpose: "A real, specific person is being tracked by Serve, with a vendor identity Serve trusts.",
  evidenceCombinator: "any",
  requiredEvidence: [
    {
      key: "apploi",
      kind: "vendor_identity",
      scopeJustification: "A human-confirmed vendor identity link directly establishes this Serve lead corresponds to one specific Apploi candidate record.",
      satisfiedByValues: ["confirmed"],
      governance: {
        establishedBy: "Hud, project owner",
        requirementClass: "organizational",
        effectiveFrom: "2026-07-21",
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "recruiting_lead_vendor_identities (human-confirmed)",
        status: "adopted",
      },
    },
    {
      key: "apploi.candidate_name",
      kind: "observation",
      scopeJustification: "A directly observed candidate name, read from the dialog Hud has already identity-confirmed, corroborates identity even before a formal vendor-identity link exists.",
      governance: {
        establishedBy: "Hud, project owner",
        requirementClass: "organizational",
        effectiveFrom: "2026-07-21",
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "apploi.candidate_name (dialog-scoped, human-confirmed at collection time)",
        status: "adopted",
      },
    },
  ],
  optionalSupportingEvidence: [],
  gatedBy: [],
  operationalOwner: "Recruiting staff",
  completionCriteria: "A confirmed vendor identity link, or a corroborating candidate-name observation, exists.",
};

export const APPLICATION_RECEIVED: DesiredStateDefinition = {
  key: "recruiting.desired_state.application_received",
  version: 1,
  title: "Application Received",
  purpose: "Confirms an application-level relationship exists in the vendor system — nothing about completeness or quality.",
  evidenceCombinator: "all",
  requiredEvidence: [
    {
      key: "apploi.application_exists",
      kind: "observation",
      scopeJustification: "apploi.application_exists is a composite, gated observation confirming an application section exists, tied to the confirmed candidateID/applicationID and the observed position — it is the only observation authorized to speak to this requirement. Vendor identity, candidate name, position, resume status, and general candidate existence are explicitly NOT authorized evidence for this requirement.",
      satisfiedByValues: ["true"],
      governance: {
        establishedBy: "Hud, project owner",
        requirementClass: "organizational",
        effectiveFrom: "2026-07-21",
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "apploi.application_exists",
        status: "adopted",
      },
    },
  ],
  optionalSupportingEvidence: ["apploi.position", "apploi.applied_date"],
  gatedBy: [],
  operationalOwner: "Recruiting staff",
  completionCriteria: "apploi.application_exists is directly observed as true.",
};

export const CANDIDATE_EVALUATION_COMPLETE: DesiredStateDefinition = {
  key: "recruiting.desired_state.candidate_evaluation_complete",
  version: 1,
  title: "Candidate Evaluation Complete",
  purpose: "Confirms Serve has gathered what it needs to make a hiring decision. The evaluation mechanism itself (interview, work sample, reference check) is a governed requirement, not assumed by this stage.",
  evidenceCombinator: "all",
  requiredEvidence: [
    {
      key: "apploi.interview_completed_evidence",
      kind: "observation",
      scopeJustification: "Direct interview-completion evidence, if Apploi ever exposes it, would satisfy this requirement — never scheduling/activity evidence alone.",
      satisfiedByValues: ["true"],
      governance: {
        establishedBy: "not yet established",
        requirementClass: "role_specific",
        effectiveFrom: null,
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "apploi.interview_completed_evidence",
        status: "proposed",
      },
    },
    {
      key: "apploi.resume_availability",
      kind: "observation",
      scopeJustification: "apploi.resume_availability directly addresses only whether Apploi shows a resume on file — it does not address application submission or any other requirement.",
      // No positive value has ever been observed for this key (only the
      // absent case has ever been confirmed) — an explicit empty array,
      // never `undefined`, so an observed negative value is never
      // mistaken for "any found value satisfies."
      satisfiedByValues: [],
      negativeEvidence: {
        values: ["not_available"],
        evidenceClass: "direct",
        scopeNote: "Resume is not present in Apploi. Serve has not adopted a requirement establishing that a resume is mandatory for the current desired state.",
      },
      governance: {
        establishedBy: "not yet established",
        requirementClass: "organizational",
        effectiveFrom: null,
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "apploi.resume_availability",
        status: "proposed",
      },
    },
  ],
  optionalSupportingEvidence: ["recruiting.interview_activity_present", "recruiting.interview_scheduled_or_rescheduled"],
  gatedBy: [],
  operationalOwner: "Hiring manager / interviewer",
  completionCriteria: "At least one adopted evaluation-completion requirement is satisfied.",
};

export const HIRING_DECISION_CONFIRMED: DesiredStateDefinition = {
  key: "recruiting.desired_state.hiring_decision_confirmed",
  version: 1,
  title: "Hiring Decision Confirmed",
  purpose: "Confirms Serve itself made a go/no-go decision — never satisfiable by a vendor observation alone.",
  evidenceCombinator: "all",
  requiredEvidence: [
    {
      key: "hiring_decision",
      kind: "human_confirmation",
      scopeJustification: "Only an authorized human confirmation directly establishes that Serve made a hiring decision — no vendor observation is authorized evidence for this requirement.",
      governance: {
        establishedBy: "Hud, project owner",
        requirementClass: "organizational",
        effectiveFrom: "2026-07-21",
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "recruiting_lead_human_confirmations (confirmation_key = hiring_decision)",
        status: "adopted",
      },
    },
    {
      key: "recruiting.possible_pipeline_stage_inconsistency",
      kind: "inference",
      blockOnPresence: true,
      scopeJustification: "An unresolved stage-inconsistency inference must not be allowed to coexist with a hiring decision being recorded as confirmed.",
      governance: {
        establishedBy: "Hud, project owner (standing safety rule, established earlier this project)",
        requirementClass: "organizational",
        effectiveFrom: "2026-07-21",
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "recruiting_lead_inferences (recruiting.possible_pipeline_stage_inconsistency)",
        status: "adopted",
      },
    },
    {
      key: "recruiting.cross_system_stage_inconsistency",
      kind: "inference",
      blockOnPresence: true,
      scopeJustification: "Same rationale as above, for the cross-system variant.",
      governance: {
        establishedBy: "Hud, project owner (standing safety rule, established earlier this project)",
        requirementClass: "organizational",
        effectiveFrom: "2026-07-21",
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "recruiting_lead_inferences (recruiting.cross_system_stage_inconsistency)",
        status: "adopted",
      },
    },
  ],
  optionalSupportingEvidence: ["apploi.pipeline_stage", "apploi.viventium_integration_status"],
  gatedBy: [],
  operationalOwner: "Hiring manager / executive",
  completionCriteria: "A human-confirmed hiring decision exists, with no unresolved stage inconsistency.",
};

export const EMPLOYMENT_RECORD_CONFIRMED: DesiredStateDefinition = {
  key: "recruiting.desired_state.employment_record_confirmed",
  version: 1,
  title: "Employment Record Confirmed",
  purpose: "A real employee record exists in the payroll/HR system.",
  evidenceCombinator: "any",
  requiredEvidence: [
    {
      key: "viventium.employee_record_exists",
      kind: "observation",
      scopeJustification: "A directly observed, positive Viventium employee-record signal is the only vendor evidence authorized to confirm this requirement — no such positive observation has ever been collected for any lead yet.",
      satisfiedByValues: ["true"],
      governance: {
        establishedBy: "Hud, project owner",
        requirementClass: "organizational",
        effectiveFrom: "2026-07-21",
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "viventium.employee_record_exists",
        status: "adopted",
      },
    },
    {
      key: "employment_record_confirmed",
      kind: "human_confirmation",
      scopeJustification: "An authorized human confirmation from a governed source may also satisfy this requirement, independent of any vendor observation.",
      governance: {
        establishedBy: "Hud, project owner",
        requirementClass: "organizational",
        effectiveFrom: "2026-07-21",
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "recruiting_lead_human_confirmations (confirmation_key = employment_record_confirmed)",
        status: "adopted",
      },
    },
    {
      key: "apploi.viventium_integration_status",
      kind: "observation",
      scopeJustification: "apploi.viventium_integration_status addresses only Apploi's own view of integration linkage. It may address 'Apploi–Viventium integration linkage not evidenced,' but it may NOT directly address whether a Viventium employee record exists — that would generalize a source-limited observation beyond what it actually proves.",
      // Never satisfies this requirement positively under any observed
      // value — its only role is surfacing the Integration Gap below.
      satisfiedByValues: [],
      negativeEvidence: {
        values: ["no_integration_record_found"],
        evidenceClass: "source_limited",
        scopeNote: "Apploi reports no Viventium integration record for this application. This does not establish whether a Viventium employee record exists.",
        reconciliationNote:
          "Viventium contains an employee/new-hire record, while Apploi reports no linked Viventium integration record for this application. This is a reconciliation issue, not proof that either system is wrong.",
      },
      contributesToSatisfaction: false,
      governance: {
        establishedBy: "Hud, project owner",
        requirementClass: "organizational",
        effectiveFrom: "2026-07-21",
        applicabilityConditions: null,
        blockingEffect: "informational",
        authoritativeEvidenceSource: "apploi.viventium_integration_status",
        status: "adopted",
      },
    },
  ],
  optionalSupportingEvidence: ["viventium.onboarding_stage"],
  gatedBy: [],
  operationalOwner: "HR/payroll admin",
  completionCriteria: "A positive Viventium employee-record observation, or an authorized human confirmation, exists.",
};

export const EMPLOYMENT_REQUIREMENTS_COMPLETE: DesiredStateDefinition = {
  key: "recruiting.desired_state.employment_requirements_complete",
  version: 1,
  title: "Employment Requirements Complete",
  purpose: "I-9, W-4, and direct deposit are all complete.",
  evidenceCombinator: "all",
  requiredEvidence: [
    {
      key: "viventium.i9_status",
      kind: "observation",
      scopeJustification: "viventium.i9_status directly addresses I-9 completion only. Viventium is the authoritative source for its own I-9 field — this is direct, not source-limited, evidence.",
      satisfiedByValues: ["completed"],
      // Real, observed value ("not_verified") — per the standing instruction
      // not to assume I-9 blocks scheduling unless explicitly adopted:
      // this stays a Policy-Dependent Consideration, never a Blocking Gap,
      // because governance.status below remains "proposed."
      negativeEvidence: {
        values: ["not_verified"],
        evidenceClass: "direct",
        scopeNote: "Viventium directly shows I-9 verification as Not Verified. Serve has not adopted a requirement making I-9 verification blocking for this desired state.",
      },
      governance: {
        establishedBy: "Federal law (I-9 employment eligibility verification)",
        requirementClass: "regulatory",
        effectiveFrom: null,
        applicabilityConditions: "All U.S. employees",
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "viventium.i9_status",
        status: "proposed",
      },
    },
    {
      key: "viventium.w4_status",
      kind: "observation",
      scopeJustification: "viventium.w4_status directly addresses W-4 completion only.",
      satisfiedByValues: ["completed"],
      governance: {
        establishedBy: "not yet established",
        requirementClass: "organizational",
        effectiveFrom: null,
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "viventium.w4_status",
        status: "proposed",
      },
    },
    {
      key: "viventium.direct_deposit_status",
      kind: "observation",
      scopeJustification: "viventium.direct_deposit_status directly addresses direct-deposit setup only.",
      satisfiedByValues: ["completed"],
      governance: {
        establishedBy: "not yet established",
        requirementClass: "organizational",
        effectiveFrom: null,
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "viventium.direct_deposit_status",
        status: "proposed",
      },
    },
  ],
  optionalSupportingEvidence: [],
  gatedBy: ["recruiting.desired_state.employment_record_confirmed"],
  operationalOwner: "HR/payroll admin",
  completionCriteria: "I-9, W-4, and direct deposit are all directly observed complete.",
};

export const SCHEDULING_READY: DesiredStateDefinition = {
  key: "recruiting.desired_state.scheduling_ready",
  version: 1,
  title: "Scheduling Ready",
  purpose: "The new hire can be scheduled for shifts/visits.",
  evidenceCombinator: "any",
  requiredEvidence: [
    {
      key: "scheduling.caregiver_record_exists",
      kind: "observation",
      scopeJustification: "No scheduling-system collector exists yet — this requirement has no authoritative evidence source today.",
      satisfiedByValues: ["true"],
      governance: {
        establishedBy: "not yet established",
        requirementClass: "organizational",
        effectiveFrom: null,
        applicabilityConditions: null,
        blockingEffect: "blocking",
        authoritativeEvidenceSource: "not yet defined — no scheduling collector exists",
        status: "not_yet_adopted",
      },
    },
  ],
  optionalSupportingEvidence: [],
  gatedBy: ["recruiting.desired_state.employment_requirements_complete"],
  operationalOwner: "Scheduling coordinator",
  completionCriteria: "To be defined once a scheduling-system collector exists.",
};

// Evaluation order matters: gatedBy references must be evaluated after
// their prerequisite, which this ordering already satisfies (linear chain).
export const RECRUITING_DESIRED_STATES: readonly DesiredStateDefinition[] = [
  LEAD_IDENTIFIED,
  APPLICATION_RECEIVED,
  CANDIDATE_EVALUATION_COMPLETE,
  HIRING_DECISION_CONFIRMED,
  EMPLOYMENT_RECORD_CONFIRMED,
  EMPLOYMENT_REQUIREMENTS_COMPLETE,
  SCHEDULING_READY,
];
