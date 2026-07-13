import type { CreationTimestamp, IntelligenceDomain, NamespacedIdentifier, RecordId } from "./shared.ts";
import type { SubjectReference } from "./subject.ts";
import type { SignalSeverity } from "./signals.ts";

export type RecommendationStatus = "pending" | "actioned" | "dismissed" | "expired";

// RECOMMENDATION — what Serve suggests doing, generated from one or more
// Signals by the Rule Engine. Created only by the Rule Engine; a human (or
// an LLM) never creates one directly.
//
// There is deliberately no field or method anywhere on this interface that
// could execute a vendor-side write. That absence is the enforcement
// mechanism, not a policy note — see Constitution Article II ("no
// automated recommendation bypasses appropriate human review") and Article
// VIII ("recommendations must not silently mutate vendor systems"). If a
// future change ever adds something like `vendorAction` or `executeUrl` to
// this interface, that change contradicts the Constitution and should be
// stopped, not merged.
export interface Recommendation extends CreationTimestamp {
  readonly id: RecordId;
  readonly domain: IntelligenceDomain;
  // e.g. "relationship.send_birthday_card"
  readonly recommendationType: NamespacedIdentifier;
  readonly subject: SubjectReference;
  readonly title: string;
  readonly description: string;
  readonly suggestedPriority: SignalSeverity;
  // One or more Signals that produced this Recommendation — almost always
  // one, but a composite Recommendation may cite several.
  readonly signalIds: readonly RecordId[];
  // Exact provenance retained, same discipline as Signal.ruleVersionId.
  readonly ruleVersionId: RecordId;
  readonly status: RecommendationStatus;
}
