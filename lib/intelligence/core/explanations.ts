import type { RecordId } from "./shared.ts";

export interface ExplanationEvidenceRef {
  readonly evidenceId: RecordId;
}

// The half of an Explanation that is generated entirely from deterministic
// material — a Rule Version and the Evidence it produced. No LLM involvement
// is possible here even optionally; `whatHappened` is filled from a
// deterministic template (e.g. "{caregiver} started {resident}'s visit
// {minutes} minutes late"), not free narrative prose.
export interface ExplanationDeterministicCore {
  readonly ruleVersionId: RecordId;
  readonly evidenceRefs: readonly ExplanationEvidenceRef[];
  readonly whatHappened: string;
  readonly whyFlagged: string;
}

// The half of an Explanation that may be LLM-assisted. Kept structurally
// separate from ExplanationDeterministicCore — per the Phase A design
// requirement that "LLM-generated wording must remain distinguishable from
// deterministic evidence and reasoning" — rather than relying on a single
// flat boolean flag next to freely-mixed fields. `aiAssisted` still exists
// as an explicit, required marker.
export interface ExplanationNarrative {
  readonly summary: string;
  readonly recommendedConsideration: string;
  readonly aiAssisted: boolean;
}

// EXPLANATION — a frozen snapshot, created atomically with its
// Recommendation and never regenerated afterward, even if the underlying
// Facts or Reference Knowledge later change. See Constitution Article XI:
// "explanations preserve what a human actually saw at the time."
export interface Explanation {
  readonly id: RecordId;
  readonly recommendationId: RecordId;
  readonly deterministic: ExplanationDeterministicCore;
  readonly narrative: ExplanationNarrative;
  // Reserved for Phase E's Context Bundle snapshot (the assembled Reference
  // Knowledge + Context Notes used to draft `narrative`, frozen alongside
  // it for audit). Always null until Reference Knowledge/Context Note are
  // implemented — never populated speculatively in Phase A.
  readonly contextSnapshotMetadata: Readonly<Record<string, unknown>> | null;
  readonly generatedAt: string;
}
