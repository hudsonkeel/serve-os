# Serve Intelligence Platform — Core (Phase A)

Shared TypeScript types for the 12 Phase A primitives. **Read
[`docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md`](../../../docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md)
before adding to this folder.** This README explains structure; the
Constitution explains why the structure looks the way it does.

Types only — no persistence, no database schema, no Supabase, no rule
evaluation, no UI. This folder implements zero application behavior.

## File map

| File | Primitives |
|---|---|
| `shared.ts` | `RecordId`, `SubjectType`, `IntelligenceDomain`, `NamespacedIdentifier`, timestamp fragments |
| `provenance.ts` | `ProvenanceConfidence`, `SourceProvenance` |
| `subject.ts` | `Subject`, `SubjectReference` |
| `facts.ts` | `HistoricalFact` |
| `signals.ts` | `Signal`, `Evidence`, `DeterministicRuleInput` |
| `rules.ts` | `Rule`, `RuleVersion`, `RuleRun` |
| `recommendations.ts` | `Recommendation` |
| `actions.ts` | `Action`, `Outcome` |
| `explanations.ts` | `Explanation` |
| `learning.ts` | `LearningObservation` |
| `index.ts` | barrel export of everything above |

## Organizational Learning

`LearningObservation` (`learning.ts`) is the platform's Organizational
Learning primitive — added during the Governance Knowledge Engine's Phase 0
architecture work (see
`docs/architecture/decisions/0001-governance-knowledge-engine-phase-0.md`)
because it was the one of the scope's six named "frameworks" that had no
existing home here; the other five map onto primitives that already
existed. It is a shared kernel type, not domain-specific: any domain whose
Outcomes should durably inform future policy, workflow, automation,
training, or documentation — not just future Rule Runs — can produce one.
Its substantive fields are immutable once created; only `status`
transitions, and a superseding insight is always a new row, never a rewrite
— the same discipline `HistoricalFact.supersedesFactId` already establishes
for facts. See the type's own doc comment for the full immutability
boundary.

## Deferred to Phase E

`ReferenceKnowledge` and `ContextNote` are **not implemented here on
purpose** — they wait until Relationship Intelligence has done real
requirements work on the attribute-key vocabulary. `signals.ts`'s
`EvidenceReference` union already reserves a `"reference_knowledge"` kind
for when that lands, so the union's shape won't need to change later, only
gain a real target.

## The one absolute rule in this folder

**`DeterministicRuleInput` (in `signals.ts`) must never include anything
Context-Note-shaped.** Every other design choice here is negotiable on
review; this one isn't, per Constitution Article V. See
`__tests__/typeGuarantees.ts` for the compile-time proof.

## Reused, not imported

`ProvenanceConfidence`, `SignalSeverity`, and `ActionStatus` intentionally
duplicate the *literal values* already established by
`lib/scheduling/types.ts`'s `ProvenanceConfidence`,
`lib/supabase/types.ts`'s `WellnessNotePriority`, and
`lib/supabase/types.ts`'s `WellnessFollowUpStatus`, respectively — without
importing those types. Importing them would make this domain-agnostic
platform core depend on one domain's (Scheduling's or Wellness's) schema,
inverting the intended dependency direction: domains depend on the shared
core, never the reverse. See each file's module comment for the specific
reasoning.

## Testing

```bash
npm run test:intelligence   # runtime checks (node:assert)
npm run typecheck           # compile-time boundary proofs (tsc --noEmit)
```

`__tests__/boundaries.test.ts` is runnable, `node:assert`-based, following
this repository's existing `lib/scheduling/__tests__` convention.
`__tests__/typeGuarantees.ts` contains no runtime assertions at all — it
exists purely to be type-checked (via `tsc`/`next build`), using
`@ts-expect-error` to prove certain values are *rejected* by the type
system. Do not try to run it with `node`.
