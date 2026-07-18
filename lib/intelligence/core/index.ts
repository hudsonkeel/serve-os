// Serve Intelligence Platform — shared core primitive types (Phase A).
//
// See docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md before adding to
// or consuming this module, and lib/intelligence/core/README.md for how
// these types relate to each other. Reference Knowledge and Context Note
// are intentionally NOT exported here — see README.md's "Deferred to
// Phase E" section.

export type {
  RecordId,
  SubjectType,
  IntelligenceDomain,
  KnownIntelligenceDomain,
  NamespacedIdentifier,
  OccurrenceTimestamps,
  CreationTimestamp,
  RunTimestamps,
  NonEmptyArray,
} from "./shared.ts";
export { KNOWN_INTELLIGENCE_DOMAINS } from "./shared.ts";

export type { ProvenanceConfidence, SourceProvenance } from "./provenance.ts";

export type { Subject, SubjectReference } from "./subject.ts";

export type { HistoricalFact } from "./facts.ts";

export type {
  SignalSeverity,
  SignalStatus,
  Signal,
  DeterministicRuleInput,
  EvidenceReference,
  Evidence,
} from "./signals.ts";

export type {
  RuleTriggerType,
  Rule,
  RuleVersion,
  RuleRunStatus,
  RuleRun,
} from "./rules.ts";

export type { RecommendationStatus, Recommendation } from "./recommendations.ts";

export type { ActionStatus, Action, OutcomeType, Outcome } from "./actions.ts";

export type {
  ExplanationEvidenceRef,
  ExplanationDeterministicCore,
  ExplanationNarrative,
  Explanation,
} from "./explanations.ts";

export type { LearningObservationStatus, LearningObservation } from "./learning.ts";
