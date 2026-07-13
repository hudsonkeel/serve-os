// Compile-time-only boundary proofs for lib/intelligence/core. This file
// has NO runtime assertions and is never executed directly — it exists
// purely to be type-checked by `tsc`/`next build` (see package.json's
// "typecheck" script). Every `@ts-expect-error` below proves a value the
// Constitution forbids is REJECTED by the type system; if a proof stops
// needing its `@ts-expect-error` — because the boundary silently eroded —
// TypeScript fails the build with "Unused '@ts-expect-error' directive."
// That failure IS the test.
//
// Do not add test()/run() here — this file is deliberately not part of
// the node:assert convention used elsewhere in this repository. See
// __tests__/boundaries.test.ts for runtime checks, and README.md for how
// the two files divide labor.
import type {
  HistoricalFact,
  Signal,
  DeterministicRuleInput,
  EvidenceReference,
  RuleTriggerType,
} from "../index.ts";

// ─── The one absolute rule: Context-shaped data must never satisfy ──────
// ─── DeterministicRuleInput (Constitution Article V).                  ───

// A Context-Note-shaped value — freeform note text, no factType, no
// ruleVersionId, nothing evidentiary about it — must never satisfy
// DeterministicRuleInput. Reference Knowledge doesn't exist yet either
// (Phase E), so today DeterministicRuleInput = HistoricalFact | Signal
// only; this proves a third, Context-shaped kind is rejected.
// Written on a single line, deliberately: TypeScript's excess-property
// check for object literals reports the diagnostic at the specific
// offending property, not the assignment's start line — @ts-expect-error
// only suppresses errors reported on the line directly beneath it, so a
// multi-line literal here would leave the real error unsuppressed while
// also failing on "Unused '@ts-expect-error' directive."
// @ts-expect-error — a Context-Note-shaped object is not a valid DeterministicRuleInput
const contextShapedValue: DeterministicRuleInput = { subjectId: "fict-resident-1", note: "Richard's daughter visits every Sunday.", tags: ["family"] };

// ─── Evidence's discriminated union admits exactly three kinds ─────────

// Single line for the same reason as contextShapedValue above.
// @ts-expect-error — "context_note" is not an approved EvidenceReference kind
const invalidEvidenceReference: EvidenceReference = { kind: "context_note", contextNoteId: "fict-context-note-1" };

// ─── Narrow, explicit unions reject arbitrary strings ───────────────────

// @ts-expect-error — "poll" is not an approved RuleTriggerType
const invalidTriggerType: RuleTriggerType = "poll";

// ─── Immutable primitives expose genuinely readonly fields ──────────────

// HistoricalFact's identity is structurally immutable — a readonly-field
// assignment must fail to compile, not merely be discouraged by
// convention (Constitution Article III: "historical events... are not
// deleted and not silently rewritten").
function assertHistoricalFactIdIsReadonly(fact: HistoricalFact): void {
  // @ts-expect-error — HistoricalFact.id is readonly and must never be reassigned
  fact.id = "attempted-mutation";
}

// A Historical Fact's payload must never be edited in place either — a
// correction is a new Fact with supersedesFactId, never a payload mutation.
function assertHistoricalFactPayloadIsReadonly(fact: HistoricalFact): void {
  // @ts-expect-error — HistoricalFact.payload is readonly and must never be reassigned
  fact.payload = { corrected: true };
}

// Signal.status changes over its lifecycle in the real system (active ->
// resolved/expired), but that transition is modeled by producing a new
// Signal value in the Phase C engine — never by mutating an existing
// object in place. The type itself should not offer a mutation path.
function assertSignalStatusIsReadonly(signal: Signal): void {
  // @ts-expect-error — Signal.status is readonly and must never be reassigned in place
  signal.status = "resolved";
}

// Referenced so nothing above reads as an unused local to a linter — these
// values and functions exist solely to be type-checked, never actually
// invoked or read at runtime.
export const TYPE_BOUNDARY_PROOFS = {
  contextShapedValue,
  invalidEvidenceReference,
  invalidTriggerType,
  assertHistoricalFactIdIsReadonly,
  assertHistoricalFactPayloadIsReadonly,
  assertSignalStatusIsReadonly,
};
