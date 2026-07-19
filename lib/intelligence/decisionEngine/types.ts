// Generic Decision Intelligence service — domain-agnostic. Nothing here
// knows what a background check is. A registered decision type's whole job
// is to reduce its own input to this one shape; everything downstream
// (rule-version resolution, persistence, notification) is shared.

export interface DecisionRuleVersionSpec {
  readonly domain: string;
  readonly ruleSlug: string;
  readonly ruleTitle: string;
  readonly ruleDescription: string;
  readonly version: number;
  readonly triggerType: "event" | "state" | "time";
  readonly parameters: Record<string, unknown>;
  readonly logicReference: string;
  readonly policyReferences: readonly unknown[];
  readonly authorityReferences: readonly unknown[];
}

export interface DecisionNotificationSpec {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

export interface DecisionRecordSpec {
  readonly ruleVersion: DecisionRuleVersionSpec;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectCanonicalTable: string | null;
  readonly subjectCanonicalId: string | null;
  readonly factType: string;
  readonly factOccurredAt: string;
  readonly factPayload: Record<string, unknown>;
  readonly factProvenanceSourceSystem: string;
  readonly factProvenanceSourceRecordId: string | null;
  readonly factProvenanceConfidence: "confirmed" | "inferred" | "unknown";
  readonly signalType: string;
  readonly signalSeverity: "routine" | "monitor" | "important" | "urgent";
  readonly recommendationType: string;
  readonly recommendationTitle: string;
  readonly recommendationDescription: string;
  readonly recommendationPriority: "routine" | "monitor" | "important" | "urgent";
  readonly explanationWhatHappened: string;
  readonly explanationWhyFlagged: string;
  readonly explanationSummary: string;
  readonly explanationRecommendedConsideration: string;
  readonly notification: DecisionNotificationSpec | null;
}

export type DecisionTypeHandler<TInput> = (input: TInput) => DecisionRecordSpec;
