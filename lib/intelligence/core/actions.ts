import type { CreationTimestamp, IntelligenceDomain, NamespacedIdentifier, RecordId } from "./shared.ts";
import type { SubjectReference } from "./subject.ts";
import type { SignalSeverity } from "./signals.ts";

// Reuses the vocabulary already established by lib/supabase/types.ts's
// WellnessFollowUpStatus ("open" | "in_progress" | "completed" |
// "dismissed" | "cancelled") — Action generalizes
// resident_wellness_follow_ups' existing shape rather than inventing a new
// one. Not imported, for the same reason noted in provenance.ts.
export type ActionStatus = "open" | "in_progress" | "completed" | "dismissed" | "cancelled";

// ACTION — human-owned operational work, created either from a
// Recommendation or entirely manually. `recommendationId: null` means
// manually created — mirrors resident_wellness_follow_ups'
// suggested_by: "manual" today.
//
// Actions are never created by an LLM and never created by the Rule
// Engine directly — only a human, whether acting on a Recommendation or
// starting from scratch. See Constitution Article II: "actions are
// human-owned."
export interface Action extends CreationTimestamp {
  readonly id: RecordId;
  readonly domain: IntelligenceDomain;
  readonly actionType: NamespacedIdentifier;
  readonly subject: SubjectReference;
  readonly title: string;
  readonly description: string | null;
  readonly dueAt: string | null;
  readonly assignedTo: string | null;
  readonly priority: SignalSeverity;
  readonly recommendationId: RecordId | null;
  readonly status: ActionStatus;
  // Human identity that created this Action — never an LLM identity. Null
  // is reserved for edge cases (e.g. a system-imported legacy record), not
  // for AI authorship.
  readonly createdBy: string | null;
}

export type OutcomeType = "accepted" | "completed" | "dismissed" | "deferred" | "expired";

// OUTCOME — what happened after an Action, as an append-only log entry.
// Never edited, never deleted, and — unlike Action's own `status` field
// (a fast-read, denormalized pointer) — this is the permanent audit trail
// a future Rule performance review reads from. See Constitution Article
// IX: "historical outcomes inform that judgment. They do not replace it."
export interface Outcome {
  readonly id: RecordId;
  readonly actionId: RecordId;
  readonly outcomeType: OutcomeType;
  readonly recordedAt: string;
  // Always attributable to a human — an Outcome records what a person
  // decided/did, never an automated or AI-originated conclusion.
  readonly recordedBy: string;
  readonly note: string | null;
}
