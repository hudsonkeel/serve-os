import type { IntelligenceDomain, RecordId, RunTimestamps } from "./shared.ts";

// How a Rule Version is triggered — determines what kind of input it
// legitimately needs, and answers Design Question 3/4 from the layered
// architecture reconciliation:
//   - "event"  — fires when a new matching Historical Fact appears
//   - "state"  — periodically evaluates current Fact/Reference-Knowledge
//                state (e.g. "no PCP on file")
//   - "time"   — calendar/schedule-driven (e.g. birthdays); reads a stable
//                attribute (Reference Knowledge, once implemented, or a
//                Historical Fact timestamp) and compares to the calendar —
//                never fabricates a Historical Fact for a purely computed
//                condition.
export type RuleTriggerType = "event" | "state" | "time";

// RULE — the deterministic logic's stable identity. A Rule is a name and a
// purpose; it has no logic or parameters of its own. See Constitution
// Article IV: "rules are transparent and versioned. A rule's logic is
// never a mystery, and never anonymous."
export interface Rule {
  readonly id: RecordId;
  readonly domain: IntelligenceDomain;
  // Stable, human-readable identifier, e.g. "visit_started_late". Rarely,
  // if ever, changes once a Rule exists.
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

// RULE VERSION — a specific, versioned instance of a Rule's parameters and
// logic. Immutable once effective: a threshold change is a NEW Rule
// Version, never an edit to an existing one. Every Signal and
// Recommendation records the exact ruleVersionId that produced it, so
// changing a Rule Version's successor never rewrites the meaning of
// historical results.
export interface RuleVersion {
  readonly id: RecordId;
  readonly ruleId: RecordId;
  readonly version: number;
  readonly triggerType: RuleTriggerType;
  // Tunable thresholds/config, e.g. { lateThresholdMinutes: 15 } — the one
  // part of a Rule Version's definition that's data, not code.
  readonly parameters: Readonly<Record<string, unknown>>;
  // At Phase A/V1, rule logic lives in versioned code, not a rules DSL —
  // this is a pointer to it, e.g.
  // "lib/intelligence/domains/scheduling/rules/visitStartedLate.ts@1".
  readonly logicReference: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly changelogNote: string | null;
}

export type RuleRunStatus = "success" | "failed" | "partial";

// RULE RUN — execution history. Immutable log entry, created only by the
// scheduler/trigger that invoked the Rule Engine, never by a Rule itself.
export interface RuleRun extends RunTimestamps {
  readonly id: RecordId;
  readonly ruleVersionId: RecordId;
  readonly status: RuleRunStatus;
  readonly factsEvaluatedCount: number;
  readonly signalsProducedCount: number;
  readonly errorMessage: string | null;
}
