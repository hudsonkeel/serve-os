// Recruiting Operational Understanding Engine — types. See
// docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md
// (Revision 2) for the full design this implements.
//
// Governing rule, structurally enforced throughout this module: a negative
// observed value may only ever affect a Desired State's status when its
// governing Requirement is `adopted` AND `blockingEffect === "blocking"`
// AND its negative-evidence class is `direct`. Anything else — an
// unadopted requirement, or `source_limited` evidence — can only ever
// produce a non-blocking Gap and leave the Desired State's status at
// `unknown` at worst.
import type {
  RecruitingLeadObservation,
  RecruitingLeadHumanConfirmation,
  RecruitingLeadVendorIdentity,
} from "../../supabase/types.ts";
import type { InferenceWithEvidence } from "../../data/recruitingLeadEvidence.ts";

export type NegativeEvidenceClass = "direct" | "source_limited";
export type RequirementClass = "organizational" | "regulatory" | "vendor" | "role_specific";
export type RequirementAdoptionStatus = "adopted" | "proposed" | "not_yet_adopted";
export type RequirementBlockingEffect = "blocking" | "informational";

export interface RequirementGovernance {
  readonly establishedBy: string;
  readonly requirementClass: RequirementClass;
  readonly effectiveFrom: string | null;
  readonly applicabilityConditions: string | null;
  readonly blockingEffect: RequirementBlockingEffect;
  readonly authoritativeEvidenceSource: string;
  readonly status: RequirementAdoptionStatus;
}

export type EvidenceKind = "observation" | "inference" | "human_confirmation" | "vendor_identity";

export interface EvidenceRequirement {
  readonly key: string;
  readonly kind: EvidenceKind;
  readonly scopeJustification: string;
  // Omitted = any directly-observed/present value of this kind satisfies.
  readonly satisfiedByValues?: readonly string[];
  readonly negativeEvidence?: {
    readonly values: readonly string[];
    readonly evidenceClass: NegativeEvidenceClass;
    readonly scopeNote: string;
    // Used instead of scopeNote when a "primary" (contributesToSatisfaction
    // !== false) requirement in the same Desired State is ALSO satisfied —
    // i.e. when this negative, source-limited signal and a positive signal
    // from another source coexist. Names the reconciliation question
    // explicitly, never asserting either source is wrong.
    readonly reconciliationNote?: string;
  };
  // `inference`-kind requirements with no satisfiedByValues/negativeEvidence
  // treat mere PRESENCE of the signal as the blocking condition itself
  // (e.g. an exception-like Rule E/F inference) — never a positive thing
  // to satisfy against.
  readonly blockOnPresence?: boolean;
  // false only for requirements that exist purely to surface a Gap and can
  // never themselves satisfy the Desired State (e.g. the Viventium
  // integration-status entry under Employment Record Confirmed).
  readonly contributesToSatisfaction?: boolean; // default true
  readonly governance: RequirementGovernance;
}

export type EvidenceCombinator = "all" | "any";

export interface DesiredStateDefinition {
  readonly key: string;
  readonly version: number;
  readonly title: string;
  readonly purpose: string;
  readonly requiredEvidence: readonly EvidenceRequirement[];
  readonly evidenceCombinator: EvidenceCombinator;
  readonly optionalSupportingEvidence: readonly string[];
  readonly gatedBy: readonly string[];
  readonly operationalOwner: string;
  readonly completionCriteria: string;
}

export type DesiredStateStatus = "satisfied" | "blocked" | "unknown" | "in_progress" | "not_applicable";

// The six gap kinds approved for this phase (Timeliness, Operational
// Exception, and Data Quality are deferred per the approved plan, unless
// implementation reveals an immediate need):
//   blocking                    — an adopted blocking requirement has
//                                 authoritative direct evidence it is unmet
//   evidence                    — needed evidence has not been collected
//                                 at all (formalizes what was previously a
//                                 bare unknownEvidence string)
//   human_decision_required     — an authorized person must decide; no
//                                 vendor observation can resolve this
//   integration                 — systems show inconsistent linkage/sync
//                                 evidence — never proof either is wrong
//   policy_dependent_consideration — a proposed/unadopted requirement
//                                 appears unmet but does not block
//   conflicting                 — two authoritative/material sources
//                                 disagree — requires human review
export type GapKind =
  | "blocking"
  | "evidence"
  | "human_decision_required"
  | "integration"
  | "policy_dependent_consideration"
  | "conflicting";

export interface OperationalGap {
  readonly kind: GapKind;
  readonly desiredStateKey: string;
  readonly requirementKey: string;
  readonly description: string;
  readonly observedValue: string | null;
  readonly missingEvidence: readonly string[];
}

export interface DesiredStateEvaluationResult {
  readonly desiredStateKey: string;
  readonly desiredStateVersion: number;
  readonly status: DesiredStateStatus;
  readonly gaps: readonly OperationalGap[];
  readonly unknownEvidence: readonly string[];
  readonly explanation: string;
  readonly supportingObservationIds: readonly string[];
}

export interface OperationalRecommendation {
  readonly desiredStateKey: string;
  readonly requirementKey: string;
  readonly requiredEvidence: string;
  readonly observedEvidence: string | null;
  readonly missingEvidence: readonly string[];
  readonly explanation: string;
  readonly recommendationText: string;
}

// Everything the pure evaluator/orchestrator consumes — no I/O, fully
// testable with plain fixture arrays.
export interface RecruitingEvidenceBundle {
  readonly observations: readonly RecruitingLeadObservation[];
  readonly inferences: readonly InferenceWithEvidence[];
  readonly humanConfirmations: readonly RecruitingLeadHumanConfirmation[];
  readonly vendorIdentities: readonly RecruitingLeadVendorIdentity[];
}
