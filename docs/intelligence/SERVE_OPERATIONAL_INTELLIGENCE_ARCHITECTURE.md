# Serve Operational Intelligence Architecture

**Document Type:** Platform Architecture — peer document to [`SERVE_INTELLIGENCE_CONSTITUTION.md`](./SERVE_INTELLIGENCE_CONSTITUTION.md) and [`SERVE_INTELLIGENCE_ENGINEERING_STANDARDS.md`](./SERVE_INTELLIGENCE_ENGINEERING_STANDARDS.md)
**Status:** Draft — Design Only, Nothing Built
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-20

*The Constitution defines why this platform exists. The Engineering Standards define how to build one reactive capability (a Rule that raises a Signal) on it. **This document defines the missing middle layer: how a multi-step, goal-directed operational workflow — a hiring process, a compliance case, an assessment, an onboarding — is structured so every future Serve Assistant plugs into one shared engine instead of building its own.** Where anything here conflicts with the Constitution, the Constitution wins.*

**Relationship to [`WORKFORCE_OPERATIONS_ASSISTANT.md`](../design/WORKFORCE_OPERATIONS_ASSISTANT.md):** that document's factual grounding (current-state system map, Module 1 mapping, collector realities, UI precedent) remains accurate and is reused directly below. Its ad hoc data-model vocabulary (its own §8–9) is superseded here by this document's universal primitives — Sections 25–32 below are the authoritative Hiring Workflow mapping going forward.

---

## 1. Purpose and Scope

The Serve Intelligence Platform, as specified in Phase A (`lib/intelligence/core/*`), gives every domain a shared way to answer four questions: what happened, what does it mean, what should we consider doing, and why. That is sufficient for a **reactive** capability — a Rule that notices a late visit and raises a Signal.

It is not, by itself, sufficient for a **goal-directed, multi-step operational workflow** — a hiring process, a compliance investigation, an assessment, an onboarding sequence — where the real question is not just "what happened" but **"where is this case relative to where it needs to end up, and what is the one next correct thing to do about it?"** Phase A never defined a notion of a case, a target state, a requirement, or a review gate, because nothing built on it yet needed one.

This document defines that missing layer — universally, for every future Serve Assistant, not specific to Workforce, Governance, Hiring, Assessments, Residents, Scheduling, or Billing — and then applies it concretely to the first real workflow: Workforce Operations Assistant → Hiring.

**In scope:** the universal loop, its primitives, their relationships to Phase A's existing primitives, the data/service/UI shape needed to run any workflow through it, and a complete, decisive mapping of that architecture onto Hiring.

**Out of scope:** any actual implementation (explicitly deferred by the tasking), any second reference workflow beyond Hiring, and — per constraint 9 — any generalized visual workflow designer, no-code platform, or speculative orchestration engine. This document defines a **library and a data shape**, not a product for building workflows without code.

---

## 2. Architectural Principles

Extending the Constitution's Articles I–XI and the Engineering Standards' Section 1, with the additions this layer specifically requires:

1. **State is derived, never asserted.** A Case's current state is always computed from Evidence, Requirements, and Rules — never hand-set by a UI form, except at the one legitimate terminal point: a human recording a final Outcome (e.g., a hiring decision), which is itself an evidenced, attributed act, not a free edit.
2. **Desired State is policy, not code.** What "done" looks like for a workflow is declarative, versioned data — the same discipline `RuleVersion.parameters` already applies to thresholds, extended to targets.
3. **A Case is the one unit of work.** Exactly one open Case exists per (Subject, Workflow) at a time. Everything else in this architecture — evidence, requirements, rules, exceptions, recommendations, review, actions — resolves against a Case, never floats free.
4. **Requirements are the bridge between policy and rules.** A Requirement says *what* must be true before a Case can advance; a Rule says *how* the platform determines whether it's true. Conflating the two collapses two independently useful audit questions ("was this required?" vs. "why do we think it's satisfied?") into one.
5. **Collectors are interchangeable and evidence-shaped only.** However evidence arrives — API, webhook, browser automation, CSV/report import, email, manual confirmation — it enters the platform as the exact same normalized shape. Nothing downstream may special-case a collector's mechanism.
6. **Review authority is configured, not hardcoded per workflow.** Which tier must approve what, under which conditions of consequence, ambiguity, reversibility, and policy, is declarative data attached to a Recommendation/Action/Exception type — not an `if` statement buried in one workflow's code.
7. **No workflow may write to a vendor system.** Exactly as the Constitution's Article VIII already states platform-wide: a Recommendation, Action, or Execution record may never itself mutate Apploi, Viventium, AxisCare, or any other vendor. A human does that, in that system, on purpose, and the platform records that it happened via new Evidence.
8. **Reuse before invention, every time.** Every primitive already defined in Phase A (Subject, HistoricalFact, Rule/RuleVersion/RuleRun, Signal/Evidence, Recommendation, Action/Outcome, Explanation) is reused as-is below. New primitives are introduced only where Phase A genuinely has no answer — see Section 5 for the explicit accounting of what's new and why.
9. **Explainability and auditability are non-negotiable at every step of the loop**, not only at the Rule/Signal boundary Phase A already covers. If a step in the loop can't say what evidence and what policy produced it, it isn't ready to ship, per the Engineering Standards' own oath.
10. **Determinism first; AI narrows to the same edges the Constitution already drew** (Article V, Engineering Standards Section 9) — nothing in this layer relaxes them. State derivation, requirement evaluation, rule evaluation, exception detection, and human-review routing are all deterministic. AI may summarize, explain, and draft, and nothing else.

---

## 3. Universal Operational Loop

The requested loop, with each step mapped to the primitive that carries it (full primitive definitions in Section 4; new-vs-existing accounting in Section 5).

| Loop Step | Primitive | New or Existing |
|---|---|---|
| Current State | **Case** (`currentState`) | New |
| Desired State | **DesiredState** | New |
| Evidence | **HistoricalFact** | Existing (Phase A) |
| Requirements | **Requirement** / **RequirementStatus** | New |
| Rules | **Rule** / **RuleVersion** / **RuleRun** | Existing (Phase A) |
| Exceptions | **Exception** — a structural convention over **Signal** | Existing primitive, new convention |
| Recommendations | **Recommendation** | Existing (Phase A) |
| Human Review | **ReviewGate** (policy) + **ReviewRecord** (instance) | New |
| Actions | **Action** | Existing (Phase A) |
| Execution | Not a stored primitive — see Section 14 | Process, not a new table |
| Outcomes | **Outcome** | Existing (Phase A) |
| New Evidence | **HistoricalFact**, produced by a **Collector** confirming execution occurred | Existing (Phase A), new collector abstraction |
| Updated State | **Case** (`currentState`) recomputed, **CaseStateTransition** appended | New |

The loop is genuinely a loop: a recorded Outcome and its confirming Evidence feed directly back into state derivation (Section 8), which re-evaluates Requirements and Rules, which may produce new Recommendations — the same engine runs on every pass, not a special "next step" handler per workflow.

---

## 4. Canonical Primitive Definitions

A single naming collision must be resolved up front: **Phase A's `Evidence` type** (`lib/intelligence/core/signals.ts`) is a narrow structural link between a *Signal* and the specific Fact/Signal/Reference-Knowledge row that produced it. It is **not** the general concept of "evidence" this document's loop refers to. Throughout this document, **"Evidence" (capitalized, unqualified) means `HistoricalFact`** — the thing a collector produces. Phase A's `Evidence` interface is referred to explicitly as **"Signal Evidence"** wherever the distinction matters. This is a documentation clarification only; nothing about Phase A's type changes.

| Primitive | Definition | Status |
|---|---|---|
| **Subject** | The canonical thing a Case, Fact, Signal, Recommendation, or Action is about. Already defined in `lib/intelligence/core/subject.ts`. | Existing |
| **Case** | One instance of a Subject moving through one Workflow. Exactly one open Case per (Subject, Workflow). Carries the Subject reference, the Workflow identifier, the current derived `state`, and pointers to its active Requirements/Recommendations. | **New** |
| **Workflow (definition)** | The versioned, declarative description of a workflow's possible states, transitions, Requirements, Rules, and DesiredState — the "recipe" a Case is an instance of. Analogous to how `RuleVersion` is a versioned instance of a `Rule`. | **New** |
| **CaseStateTransition** | Append-only log entry: a Case moved from state A to state B, at time T, because of which Requirement/Rule/Outcome. | **New** |
| **HistoricalFact ("Evidence")** | Immutable, normalized, source-attributed fact — exactly `lib/intelligence/core/facts.ts`, unchanged. The universal Evidence unit. | Existing |
| **DesiredState** | Declarative target state(s) for a Workflow (and, optionally, an override per Case) — e.g., "reach `hired` with no unresolved Exception and Background Classification ≠ Automatic Disqualification." Versioned like `RuleVersion.parameters`. | **New** |
| **Requirement** | A named, evidenced (or explicitly waivable) prerequisite that gates a specific Case-state transition. Defined once per Workflow; evaluated per Case. | **New** |
| **RequirementStatus** | Per-Case instance of a Requirement's evaluation: `unmet` \| `met` \| `waived`, with the satisfying Evidence or the waiver's Action reference. | **New** |
| **Rule / RuleVersion / RuleRun** | Exactly `lib/intelligence/core/rules.ts`, unchanged. Evaluates Facts (and Signals, for aggregation) deterministically. | Existing |
| **Signal / Signal Evidence** | Exactly `lib/intelligence/core/signals.ts`, unchanged. | Existing |
| **Exception** | A Signal whose `signalType` is namespaced `<domain>.exception.<kind>` — see Section 11. Not a new stored primitive; a structural convention that always requires a ReviewRecord before the originating Case may advance past the point it was raised. | Existing primitive, new convention |
| **Recommendation** | Exactly `lib/intelligence/core/recommendations.ts`, unchanged. What the platform suggests doing next, produced deterministically by a Rule. | Existing |
| **ReviewGate** | Declarative policy: which review tier(s) are required before an Action created from a given Recommendation/Exception type may execute, as a function of consequence, ambiguity, reversibility, and policy (constraint 8). Versioned. | **New** |
| **ReviewRecord** | Instance of a human review decision: reviewer, tier, decision, rationale, factors considered, timestamp. Append-only, mirrors `Outcome`'s shape. | **New** |
| **Action / Outcome** | Exactly `lib/intelligence/core/actions.ts`, unchanged. Human-owned work item and its append-only result log. | Existing |
| **Execution** | Not a stored primitive. The real-world/vendor-system act a human performs when carrying out an Action — represented in the platform by the Action's Outcome being recorded *and* new confirming Evidence arriving via a Collector. See Section 14. | Process, not a primitive |
| **Explanation** | Exactly `lib/intelligence/core/explanations.ts`, unchanged. | Existing |
| **Collector** | An interchangeable adapter producing normalized Evidence (`HistoricalFact[]`) from one source mechanism. See Section 17. | **New abstraction, existing Fact output** |
| **CollectorRun** | Audit log of one collector execution: which collector, when, success/failure/partial, how many Evidence items produced, idempotency key. | **New** |

---

## 5. Relationship Between Existing Platform Primitives and New Operational Primitives

Per the Engineering Standards' Section 1 ("reuse shared primitives... a new domain contributes Rules and Fact mappings into the platform, it does not invent its own version of a primitive that already exists"), every new primitive above earns its place only because Phase A genuinely has no answer for it:

- Phase A models **discrete reactive observations** (a Fact happened → a Rule fires → a Signal exists → maybe a Recommendation). It has no concept of **an ongoing, multi-step unit of work with a target state** — that gap is `Case` + `DesiredState` + `Requirement` + `CaseStateTransition`.
- Phase A's `Recommendation` has no notion of **required approval tiers before the Action it spawns may execute** — that gap is `ReviewGate` + `ReviewRecord`. (Phase A's own design comment on `Recommendation` — "no field... that could execute a vendor-side write" — already anticipates that *something* must sit between Recommendation and real-world execution; this document names that something.)
- Phase A has no concept of **evidence collection as an abstracted, auditable, retryable act** distinct from the Fact it produces — that gap is `Collector` + `CollectorRun`.
- **Exception is deliberately not a new primitive** — it is `Signal`, reused, under a naming/routing convention. This is the one place this document could have invented something new and chose not to, exactly per Constitution Article X's instruction to bring a domain "back in" rather than accommodate a parallel structure.
- **Execution is deliberately not a new primitive** — `Action.status` transitioning plus a recorded `Outcome` plus new confirming `HistoricalFact` evidence already say everything "execution happened" needs to say. Adding a fourth table here would be exactly the kind of complexity Constitution Article X says "has to earn its place" and this one doesn't.

Everything else — Subject, HistoricalFact, Rule/RuleVersion/RuleRun, Signal, Recommendation, Action/Outcome, Explanation — is used completely unchanged.

---

## 6. Subject, Case, Workflow, and State Model

```
Subject (existing) ──1───< Case >───1── Workflow (versioned definition)
                              │
                              ├─ currentState: string
                              └─ CaseStateTransition[] (append-only)
```

- A **Workflow** is a named, versioned definition (`workflowSlug`, `version`, `effectiveFrom/To`) declaring: the set of valid states, the valid transitions between them, the Requirements that gate each transition, the Rules that evaluate those Requirements, and the DesiredState. This is the "recipe."
- A **Case** is one instance of a Subject going through one Workflow: `subjectRef`, `workflowSlug`, `workflowVersion`, `currentState`, `openedAt`, `closedAt`. Exactly one **open** Case per (Subject, Workflow) — a rehire, a re-screen, or a new application after withdrawal opens a **new** Case, never reopens or mutates a closed one, preserving history exactly the way Historical Facts are never edited.
- **Current state** lives only on the Case and is always the output of state derivation (Section 8) — a UI never writes it directly except through the one exception already named in Principle 1 (a terminal human-recorded Outcome).
- **CaseStateTransition** is the append-only history: every state change, when, why (which Requirement/Rule/Outcome triggered it), by what — mirroring this codebase's already-proven `relationship_stage_history` pattern.

---

## 7. Evidence and Provenance Model

Unchanged from Phase A's `HistoricalFact` (`lib/intelligence/core/facts.ts`) and the Engineering Standards' Section 3 — this document adds nothing new here, only confirms it as the universal Evidence unit for every workflow:

- `domain`, `factType` (`<domain>.<event, past/completed form>`), `subject`, `payload` (minimal, normalized, never a raw vendor blob), `provenance` (`sourceSystem`, `sourceRecordId`, `provenanceConfidence`), `occurredAt`/`recordedAt`, `supersedesFactId`.
- Every Evidence item a Collector produces (Section 17) must additionally carry which **CollectorRun** produced it, for retry/idempotency auditability (Section 19) — this is metadata about *how it arrived*, layered on top of the Fact's existing provenance about *where it came from*; it does not change the Fact shape itself.
- **Design rule, generalized from the Hiring design:** any workflow whose DesiredState includes a consequential, hard-to-reverse outcome (Section 18's reversibility axis) should declare which of its Evidence types may never carry `provenanceConfidence: "inferred"`. This is workflow-specific policy, not a platform-wide rule — Background Eligibility evidence is the reference example (Section 25).

---

## 8. State Derivation Model

Case state is a pure function of accumulated Evidence, RequirementStatus, and RuleRun results — recomputed, never incrementally patched by ad hoc code:

```
deriveState(case, allEvidence, requirementDefs, ruleVersions) → newState
```

- Runs whenever new Evidence arrives for a Case's Subject (event-triggered, matching Phase A's `RuleTriggerType`), and may also run on a periodic sweep (`state`-triggered) to catch time-based transitions (e.g., a Requirement going stale).
- Evaluates each Requirement gating the Case's next possible transition(s) against current Evidence (Section 9); if all Requirements for exactly one valid transition are met, and no unresolved Exception blocks it (Section 11), the Case moves.
- **Never silently skips a state.** If a workflow's Rules indicate the underlying reality has moved further than the Case's recorded history reflects (e.g., a report import reveals the applicant was already hired externally), that produces an Exception, not a silent jump — the audit trail must show every transition actually happened, not be inferred backward.
- Every derivation run is logged with the same discipline as a `RuleRun` — inputs considered, output produced, success/failure — because state derivation *is* Rule evaluation, run through the same engine, not a separate mechanism.

---

## 9. Desired-State and Requirement Model

- **DesiredState** is declarative, versioned policy data attached to a Workflow definition: the terminal state(s) considered "successful," and any hard constraints that must hold at any point along the way (e.g., "never transition to `hired` while an unresolved Automatic Disqualification Exception exists"). It is data a policy owner edits, not logic an engineer hardcodes — the same discipline the Engineering Standards already require for Rule thresholds ("Thresholds live in `RuleVersion.parameters`, never hardcoded in logic"), extended to targets.
- **Requirement** definitions belong to a Workflow: `requirementKey`, `gatesTransition` (from-state → to-state), `satisfiedByFactTypes` (one or more `factType`s whose presence satisfies it), `waivable` (boolean — some Requirements, like Module 1's screening precondition, must never be waivable; see Section 25).
- **RequirementStatus** is per-Case: `status` (`unmet` \| `met` \| `waived`), `satisfiedByFactId` (which Evidence satisfied it) or `waivedByActionId` + `waiverReason` (every waiver is itself an audited Action, never a silent flag flip).
- The Requirement/Rule split (Principle 4) means a compliance reviewer can ask "was a background check required here?" (Requirement question) independently of "why does the system think one was completed?" (Rule/Evidence question) — collapsing them would make both questions harder to audit, not easier.

---

## 10. Rule Evaluation Model

Unchanged from Phase A (`lib/intelligence/core/rules.ts`) and the Engineering Standards' Section 2 — reused directly for two categories of rule this layer needs:

1. **Requirement-satisfaction rules** — deterministic checks of "does the accumulated Evidence for this Case satisfy Requirement X?" Usually trivial (Evidence of a given `factType` exists) but sometimes not (Section 25's Background Eligibility evaluation sequence is a genuine multi-step deterministic Rule, not a lookup).
2. **State-transition rules** — deterministic checks of "given these RequirementStatuses, which transition, if any, applies?"

Both follow the Engineering Standards' Rule Engineering Standard template (Purpose, Trigger Type, Inputs, Thresholds, Deterministic Logic, Evidence Produced, Exceptions, Lifecycle, Audit Requirements) without modification — this document does not introduce a second rule-authoring format.

---

## 11. Exception Model

An **Exception** is a `Signal` (Phase A, unchanged type) whose `signalType` follows the reserved namespace convention `<domain>.exception.<kind>`, produced when a Rule cannot deterministically resolve a Case forward. Per constraint 7, the framework distinguishes exactly four situations, and an Exception exists for the last two:

| Situation | Represented As |
|---|---|
| Deterministic conclusion | Ordinary Rule output — a RequirementStatus or state transition, no Exception |
| Inferred conclusion | Evidence with `provenanceConfidence: "inferred"` feeding an otherwise-deterministic Rule — flagged via provenance, not an Exception, unless the workflow's policy (Section 7) forbids inference for that Requirement, in which case it *becomes* an Exception |
| Missing or conflicting evidence | `<domain>.exception.evidence_missing` / `<domain>.exception.evidence_conflict` |
| Situations that exceed encoded policy | `<domain>.exception.policy_gap` — e.g. Module 1's "novel or ambiguous offense," where "no silent fallback" is the explicit governing rule ([`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md) §2) |

**Structural rule:** an Exception always requires a `ReviewRecord` before the Case may advance past the transition it blocked. Unlike an ordinary Signal, an Exception is never allowed to resolve itself merely because a later Rule run no longer detects the condition — a human must record the resolution, because the underlying situation was, by definition, one the deterministic layer couldn't handle alone.

---

## 12. Recommendation Model

Unchanged from Phase A (`lib/intelligence/core/recommendations.ts`) and the Engineering Standards' Section 6 — reused directly. The one workflow-layer addition: a Recommendation produced within a Case (as opposed to a standalone domain Signal like "visit started late") always carries the Case reference alongside its Subject reference, so "what should happen next for this Case" is answerable without re-deriving it from the Subject's entire Signal history.

**"Recommends the next valid action"** (the universal loop's own phrase) is satisfied by a single rule of composition: a Recommendation is only produced for the transition(s) a Case's current RequirementStatus set actually makes reachable — never a menu of hypothetically-someday-relevant actions. This mirrors the Engineering Standards' recommendation-fatigue guidance ("every Recommendation must earn its place") applied to workflow state specifically.

---

## 13. Human-Review Model

The direct answer to constraint 8 ("Human review requirements must be configurable by workflow, consequence, ambiguity, reversibility, and policy"):

- **ReviewGate** is declarative, versioned policy (same pattern as `RuleVersion.parameters`): for a given Recommendation type, Action type, or Exception kind, which review tier(s) are required, evaluated against four axes:

| Axis | Example |
|---|---|
| **Consequence** | Does executing this Action affect employment, compliance status, or client safety? |
| **Ambiguity** | Did a deterministic Rule reach this conclusion cleanly, or did it require an Exception first? |
| **Reversibility** | Can this Action's real-world effect be undone (a note) or not (a hiring decision, a vendor write)? |
| **Policy** | Does a governance module (e.g. Module 1) itself mandate a specific tier, independent of the other three axes? |

- A workflow with no configured ReviewGate for a given type requires **no** review beyond ordinary Action ownership (Constitution Article II's baseline — every Recommendation is advisory, every Action is human-owned, regardless of whether a formal gate exists).
- **ReviewRecord** is the instance: `reviewerId`, `tier`, `decision`, `rationale`, `factorsConsidered` (structured, workflow-defined — e.g. Module 1's six review factors), `decidedAt`. Append-only, never edited, mirroring `Outcome`.
- **Tiers are workflow-defined, not platform-hardcoded.** Hiring's tiers (Individualized Review, Executive Review — Section 31) come directly from Module 1; a future Client Care workflow would define its own tiers entirely independently. The platform only guarantees that *some* declared tier's approval is recorded before a gated Action executes — it does not assume every workflow shares the same tier names.

---

## 14. Action and Execution Model

- **Action** — unchanged from Phase A. Human-owned, created from a Recommendation or manually, carries `dueAt`/`assignedTo`/`priority` derived from the originating Signal's severity per the Engineering Standards' Section 7.
- **Execution is not a separate stored primitive.** It is the point at which a human actually performs the real-world act an Action describes — which, by Constitution Article VIII, happens *in the vendor system itself*, never through this platform. The platform represents "execution happened" through the combination of:
  1. The Action's `status` transitioning to `completed`.
  2. An **Outcome** being recorded (`outcomeType: "completed"`, `recordedBy`, `note`).
  3. **New confirming Evidence** arriving — via any Collector, including a manual-confirmation Collector if no automated one exists yet — proving the vendor-side act actually happened (e.g., `recruiting.offer_letter_signed`).
- If (3) never arrives, the Action's completion is recorded but the Case's derived state does not advance past whatever Requirement that Evidence would have satisfied — this is a deliberate, honest gap the framework surfaces rather than papers over with an assumption that marking an Action "completed" implies the real-world effect definitely occurred.

---

## 15. Outcome and Feedback-Loop Model

Unchanged from Phase A (`lib/intelligence/core/actions.ts`'s `Outcome`) and the Engineering Standards' Section 8. The workflow-layer addition is only in what closes the loop (constraint: "New Evidence → Updated State"):

```
Action executed (human, in the vendor system)
   → Outcome recorded (platform)
   → Collector confirms via new HistoricalFact (platform)
   → State Derivation re-runs (Section 8)
   → CaseStateTransition appended
   → Requirement/Rule re-evaluation may produce the NEXT Recommendation
```

Aggregate Outcome analysis (e.g., "how often does this Workflow's Recommendation type get dismissed") remains, exactly per the Engineering Standards' Section 8, a legitimate input to a **human's** periodic decision to revise a RuleVersion or a ReviewGate — never an automatic input that changes behavior at runtime.

---

## 16. Audit and Explainability Model

Every primitive in this document — existing and new — is retained, append-only, and reconstructable, extending Constitution Article XI and the Hiring design's own audit section to the universal layer:

- **CaseStateTransition**, **RequirementStatus** history, **CollectorRun**, **ReviewRecord**, and **Outcome** are all append-only. None is ever deleted or edited; a correction is a new, dated entry referencing what it corrects — the same discipline already proven concretely in this codebase by Relationship Intelligence Phase 1's deliberate `NO ACTION` foreign keys protecting provenance chains from silent loss on delete. That exact pattern (no `on delete cascade`/`set null` from an evidentiary child back to the record it evidences) should be reused for every new table this document proposes.
- Every Recommendation traces to the Rule/RuleVersion that produced it and the Evidence/RequirementStatus it evaluated (constraint 6) — no new mechanism needed; this is Phase A's existing `Signal.ruleVersionId` and `Evidence` linkage, simply consumed at the Case layer rather than reinvented.
- Every Exception, ReviewRecord, and Action/Outcome pair is reconstructable months later: what triggered it, what evidence supported it, what policy (ReviewGate/DesiredState version) governed it, and what a human decided — the Engineering Standards' oath, unchanged, applied one layer up.

---

## 17. Collector Abstraction Model

The direct answer to constraint 4:

```
interface Collector {
  readonly sourceSystem: string;         // "apploi" | "viventium" | "sapphire_background_screening" | "manual" | ...
  readonly mechanism: CollectorMechanism; // "api" | "webhook" | "browser_automation" | "csv_import" | "email" | "manual_confirmation"
  collect(subjectRef, sinceCursor?): Promise<CollectorResult>;
}

interface CollectorResult {
  readonly facts: readonly HistoricalFact[];  // already normalized — never a raw vendor payload
  readonly runMetadata: CollectorRunMetadata; // for CollectorRun logging (Section 19)
}
```

- **Every mechanism produces the identical output shape.** Whether evidence arrived via a live API call, a webhook push, a supervised browser-automation session, a CSV report import, a parsed email, or a staff member's manual confirmation, downstream code (state derivation, Rule evaluation, UI) sees only `HistoricalFact[]` and never knows or cares which mechanism produced it — matching this codebase's proven `lib/integrations/axiscare/*` pattern, generalized platform-wide.
- **Read-only by construction.** A Collector's interface has no write method, no vendor-mutation capability — mirroring `Recommendation`'s own deliberate absence of an execute field (Section 5). If a future change ever adds one, that change contradicts Constitution Article VIII and should be stopped, not merged.
- **Mechanism-specific risk is tracked, not hidden.** Browser-automation collectors carry vendor Terms-of-Service and credential-handling risk the other mechanisms don't; this is recorded on the Collector's own metadata (a `riskProfile` or equivalent), not discovered later by an engineer reading vendor ToS for the first time mid-incident.
- **Idempotency is a collector responsibility, not a downstream one** — see Section 19.

---

## 18. Confidence and Uncertainty Model

Directly extends Phase A's `ProvenanceConfidence` (`"confirmed" | "inferred" | "unknown"`, `lib/intelligence/core/provenance.ts`) rather than inventing a parallel scale, per constraint 7's four-way distinction:

| Constraint 7 Category | Represented As |
|---|---|
| Deterministic conclusion | RequirementStatus/state transition derived from `provenanceConfidence: "confirmed"` Evidence through an unambiguous Rule |
| Inferred conclusion | Derived from `provenanceConfidence: "inferred"` Evidence, or a Rule whose logic itself involves a heuristic — must be visibly marked as such anywhere it's surfaced, never presented with the same confidence as a deterministic conclusion |
| Missing or conflicting evidence | `<domain>.exception.evidence_missing` / `evidence_conflict` (Section 11) |
| Situations that exceed encoded policy | `<domain>.exception.policy_gap` (Section 11) |

`provenanceConfidence: "unknown"` is reserved for evidence whose reliability genuinely cannot yet be assessed (e.g., an unverified email-parsed claim before a human confirms it) — it must never be silently treated as `"confirmed"` by a Rule, and a workflow may declare (per Section 7's design rule) that certain Requirements can never be satisfied by `"unknown"`-confidence Evidence at all.

---

## 19. Idempotency, Retries, and Failure Recovery

- **CollectorRun** records every execution attempt: `collectorId`, `startedAt`, `completedAt`, `status` (`success` \| `failed` \| `partial`), `factsProduced`, `idempotencyKey`, `errorMessage` — directly mirroring `RuleRun`'s existing shape (Phase A), applied to collection instead of evaluation.
- **Deduplication identity is defined per Fact type before any collector is written**, per the Engineering Standards' Section 3 — usually `(factType, sourceSystem, sourceRecordId)`. A retried or re-run collector must never produce a duplicate Fact; this is the same discipline this codebase already proved out for `log_relationship_interaction`'s idempotency-key design (`ON CONFLICT ... DO NOTHING`, composite-scoped) — directly reusable as the implementation pattern for collector-produced Evidence.
- **Partial failure is a first-class CollectorRun status**, not an exception thrown and swallowed — a collector that retrieves 8 of 10 expected records must say so, not silently report success.
- **Retry policy is collector-specific**, not platform-mandated: an API collector may retry automatically with backoff; a browser-automation collector should not auto-retry against a vendor's rate limits or fraud detection without explicit design; a manual-confirmation "collector" has no retry concept at all, only re-entry by a human.
- **State derivation is naturally idempotent** — re-running it against the same accumulated Evidence always produces the same Case state, since it's a pure function (Section 8). A failed derivation run is simply re-run; it never partially applies.

---

## 20. Security and Authorization Boundaries

- **Minimum-necessary access**, per Constitution Article XI, applied concretely: Requirement/Rule/Case data is generally visible to a workflow's operating staff; Exception and ReviewRecord data tied to sensitive domains (Background Eligibility findings, Section 25) is scoped narrower than the general workflow audience, exactly as the Hiring design's §12 already specified.
- **Every write to a Case, RequirementStatus, Action, Outcome, or ReviewRecord is attributed to a real, authenticated human** (`createdBy`/`recordedBy`/`reviewerId`, never null except for genuinely legacy-imported records) — no primitive in this layer accepts an anonymous or AI-attributed write, matching Phase A's existing `Action`/`Outcome` design intent exactly.
- **Review-tier authorization is enforced structurally**, not by UI convention alone — a ReviewRecord's `tier` must be checked against the acting user's actual granted tier before the record is accepted, server-side, the same way every RPC in this codebase already validates its actor rather than trusting client-supplied role claims.
- **Collector credentials** (API keys, browser-automation session credentials) are handled outside this document's scope but must never be embedded in Evidence payloads or CollectorRun logs — only the *fact that* a collector ran, never *how* it authenticated, is ever persisted.
- **Vendor write-access is structurally absent**, restated one more time because it is this architecture's single most important negative guarantee (Section 17): nothing in this layer, at any point, holds vendor write credentials or a vendor write path.

---

## 21. Universal Data Model

Illustrative table shapes only — no migration has been designed or reviewed. Every table below is additive, append-only where noted, and follows this codebase's established conventions (`created_by`/`created_at`, `NO ACTION` provenance-protecting foreign keys, `test_marker` hygiene).

| Table | Purpose | Append-Only |
|---|---|---|
| `workflows` | Workflow definitions (versioned) | Yes (new version = new row) |
| `cases` | One row per open/closed Case; `subject_type`, `subject_id`, `workflow_slug`, `workflow_version`, `current_state` | No (current_state updates; history lives in the transitions table) |
| `case_state_transitions` | Append-only Case state history | Yes |
| `hiring_facts` *(domain-scoped instance of the universal facts table)* | `HistoricalFact` persistence, domain-scoped per Section 8 of the Hiring design | Yes |
| `desired_states` | DesiredState policy, versioned per workflow | Yes (new version = new row) |
| `requirements` | Requirement definitions per workflow | Mostly static reference data |
| `requirement_status` | Per-Case Requirement evaluation | Updates in place; satisfying/waiving event itself is evidenced elsewhere |
| `rules` / `rule_versions` / `rule_runs` | Exactly Phase A's shapes, persisted | `rule_runs` append-only |
| `signals` / `signal_evidence` | Exactly Phase A's shapes, persisted; Exceptions are rows here with the reserved `signalType` namespace | Yes |
| `recommendations` | Exactly Phase A's shape, persisted | No (status updates); provenance preserved via `rule_version_id` |
| `review_gates` | ReviewGate policy, versioned | Yes (new version = new row) |
| `review_records` | ReviewRecord instances | Yes |
| `actions` / `outcomes` | Exactly Phase A's shapes, persisted | `outcomes` append-only |
| `explanations` | Exactly Phase A's shape, persisted | Yes (frozen at creation, never regenerated) |
| `collector_runs` | CollectorRun audit log | Yes |

**A structural note carried over unchanged from the Hiring design:** the platform-wide shared persistence layer for Fact/Signal/Rule/Recommendation/Action/Outcome does not exist yet for *any* domain. Every domain-scoped table above (`hiring_facts`, etc.) is deliberately shaped identically to its eventual shared-platform counterpart so it can migrate by rename, not redesign, once that shared layer exists (Section 35, Phase 5).

---

## 22. Universal Service/Module Boundaries

```
lib/intelligence/core/                 (existing, unchanged — Phase A primitives)
lib/intelligence/operational/          (this document's new universal layer)
  ├─ case.ts                            Case, CaseStateTransition types
  ├─ workflow.ts                        Workflow definition type
  ├─ desiredState.ts                    DesiredState type
  ├─ requirement.ts                     Requirement, RequirementStatus types
  ├─ reviewGate.ts                      ReviewGate, ReviewRecord types
  ├─ collector.ts                       Collector interface, CollectorRun type
  ├─ stateDerivation.ts                 deriveState() — the one engine every workflow calls
  └─ __tests__/
lib/intelligence/domains/<domain>/     (existing convention, per Engineering Standards §10)
  ├─ workflows/<workflowSlug>.ts        This domain's Workflow definition(s)
  ├─ rules/<ruleSlug>.ts                This domain's Rules
  └─ collectors/<collectorId>.ts        This domain's Collectors
```

- `lib/intelligence/operational/` is domain-agnostic, exactly like `core/` — it depends on `core/`, never the reverse, and no domain package may depend on another domain package (Constitution Article X, restated structurally).
- **`stateDerivation.ts`'s `deriveState()` is the one engine every workflow calls.** A domain never writes its own state-machine-walking code; it only supplies Workflow/Requirement/Rule definitions as data for the shared engine to evaluate. This is the concrete, code-level enforcement of Principle 8 and constraint 1.
- A new domain (Assessments, Client Care, Billing) adds a folder under `lib/intelligence/domains/`, never a new folder under `lib/intelligence/operational/`.

---

## 23. Universal UI Patterns

Reusing this codebase's proven `RelationshipsWorkspace` / `/relationships/[id]` / `ActionBoard` shape, generalized:

- **Case Workspace** (list view) — filterable by state, by pending-Requirement, by pending-Exception, by pending-review. One reusable list component, parameterized by Workflow, not rebuilt per domain.
- **Case Detail page** — canonical state header; Requirements checklist (met/unmet/waived, always evidence-backed or waived-with-reason, never blank); Evidence timeline (read-only, source-attributed); domain-specific decision cards (e.g., a Background Classification card) rendered as **read-only, computed** displays — never hand-editable, exactly the precedent already set by `RelationshipBriefSection`; Recommended Next Action card; Review section (visible only when a ReviewGate applies, scoped to the acting user's tier); Action log.
- **Review Queues** — one queue per configured review tier, not one generic queue — because tiers carry genuinely different authority (Section 13), not just different labels.
- **No direct-edit surface exists anywhere for a derived field** (state, classification, requirement status) outside its governed Action/Outcome flow — every change happens through a recorded Action, never a plain form field, matching this codebase's now-established `resolve_relationship_*` RPC precedent over raw `UPDATE`s.

---

## 24. Explicit Non-Goals

Restating constraint 9 and extending it:

- **No generalized visual workflow designer.** Workflow definitions are versioned code/data reviewed like any other Rule proposal, not assembled by drag-and-drop.
- **No no-code platform.** A new workflow is built by an engineer writing a Workflow definition, Requirements, Rules, and Collectors against this architecture — the architecture makes that fast and consistent; it does not remove the need for an engineer.
- **No speculative orchestration engine.** No generic "trigger anything from anything" event bus is introduced. State derivation is triggered specifically by new Evidence for a Case's Subject, or a periodic sweep — nothing more exotic.
- **No autonomous rule modification**, restated from Constitution Article IX — this layer's DesiredState and ReviewGate versioning make policy *changeable by a human*, never *self-modifying*.
- **No second reasoning engine.** `deriveState()` calls into the same Rule-evaluation machinery Phase A already defines; this document does not stand up a competing rules engine alongside it.

---

## 25. Mapping to the Existing Background Eligibility Module

Restated from the Hiring design (§7) in this document's now-formal vocabulary, unchanged in substance — **Module 1 remains untouched, Draft, and authoritative within that status.**

| Universal Primitive | Background Eligibility Instance |
|---|---|
| Requirement (non-waivable) | `screening_report_received` — gates any classification attempt at all, per [`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §2's own precondition |
| Rule | The deterministic evaluation sequence itself — [`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md) §4's pseudocode, implemented verbatim as this Rule's Deterministic Logic |
| Exception (`policy_gap`) | An unmapped/ambiguous offense — "no silent fallback," §2 |
| Recommendation | `recruiting.conduct_individualized_review` / `recruiting.escalate_to_executive_review`, produced only when the Rule's output is Reviewable / Presumptive Disqualification respectively |
| ReviewGate | Reviewable → Individualized Review tier; Presumptive Disqualification → Executive Review tier; Automatic Disqualification → **no ReviewGate exists, and none may be added** without amending Module 1 itself |
| ReviewRecord | The Individualized Review's six documented factors ([`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §4) / the Executive Review's written override rationale (§5), recorded structurally |
| DesiredState constraint | "Never reach Hiring Outcome = Hired while classification = Automatic Disqualification" is a hard DesiredState constraint (Section 9), not a Requirement, since it can never be waived |
| Confidence rule (Section 7) | Background Evidence must never carry `provenanceConfidence: "inferred"` |

**What this workflow does NOT do:** compute the classification differently than Module 1 specifies, let a Case's workflow state stand in for the classification, let the classification stand in for role eligibility or hiring outcome (Module 1 §3.6–3.8, unchanged), or add any review/override path Module 1 doesn't itself define.

---

## 26. Full Hiring Workflow State Machine

Unchanged from the Hiring design's §2.1, restated as the Workflow definition this architecture expects:

```
intake_received
   → applied_in_apploi
   → screening_requested
   → screening_in_progress
   → screening_report_received                 [Requirement: screening_report_received — non-waivable]
   → background_classification_recorded          [Rule: Module 1 evaluation sequence]
        ├─ Eligible                → role_eligibility_pending
        ├─ Reviewable              → individualized_review_pending → role_eligibility_pending
        ├─ Presumptive DQ          → executive_review_pending → role_eligibility_pending (if upheld: terminal)
        └─ Automatic DQ            → terminal (Hiring Outcome = Declined)
   → role_eligibility_determined                 [manual — no automated Rule exists yet, §14 of the prior design]
   → offer_pending
   → offer_extended
   → onboarding_in_viventium
   → hiring_outcome_recorded (Hired | Declined | Withdrawn | Rescinded)
```

`withdrawn`/`declined` reachable from any non-terminal state, exactly as before.

---

## 27. Hiring Evidence Taxonomy

Unchanged from the Hiring design's §3, now explicitly typed as `HistoricalFact` instances of the universal Evidence unit:

| Category | `factType` examples | `sourceSystem` |
|---|---|---|
| Application | `recruiting.application_submitted`, `recruiting.application_stage_changed`, `recruiting.interview_scheduled`, `recruiting.interview_completed`, `recruiting.offer_extended`, `recruiting.offer_accepted`, `recruiting.application_withdrawn` | `apploi` |
| Self-serve intake | `recruiting.website_inquiry_received` | `serve_os` (already exists today) |
| Screening | `recruiting.background_check_ordered`, `recruiting.background_report_received`, `recruiting.background_finding_recorded` | `sapphire_background_screening` |
| Onboarding | `recruiting.i9_completed`, `recruiting.offer_letter_signed`, `recruiting.employee_record_created`, `recruiting.start_date_confirmed` | `viventium` |
| Manual | `recruiting.interview_notes_recorded`, `recruiting.reference_check_recorded`, `recruiting.manual_override_justification_recorded`, `recruiting.offense_mapping_resolved` (Exception resolution) | `manual` |

---

## 28. Hiring Requirements and Rule Map

Unchanged from the Hiring design's §4, now formally typed as Requirement/RequirementStatus and Rule instances of this document's universal model:

| Requirement | Gates | Satisfied By | Waivable |
|---|---|---|---|
| Application on file | `intake_received → applied_in_apploi` | `recruiting.application_submitted` | Yes |
| Background check ordered | `applied_in_apploi → screening_in_progress` | `recruiting.background_check_ordered` | Yes (rare) |
| Background investigation complete | `screening_in_progress → screening_report_received` | `recruiting.background_report_received` | **No — Module 1's own precondition** |
| Background classification recorded | `screening_report_received → background_classification_recorded` | Module 1 Rule output | No |
| Review resolved (if applicable) | `*_review_pending → role_eligibility_pending` | A ReviewRecord | No |
| Role eligibility determined | `role_eligibility_pending → offer_pending` | Manual Action (no Rule exists yet) | No |
| Offer signed | `offer_extended → onboarding_in_viventium` | `recruiting.offer_letter_signed` | No |
| Onboarding complete | `onboarding_in_viventium → hiring_outcome_recorded` | `recruiting.i9_completed`, `recruiting.employee_record_created` | No |

---

## 29. Hiring Exception Taxonomy

Unchanged from the Hiring design's §5, now typed explicitly as `<recruiting>.exception.<kind>` Signals per Section 11:

| Exception | `signalType` | Constraint-7 Category |
|---|---|---|
| Missing/delayed background report | `recruiting.exception.evidence_missing` | Missing evidence |
| Unmapped/ambiguous offense | `recruiting.exception.policy_gap` | Exceeds encoded policy |
| Duplicate applicant across systems | `recruiting.exception.evidence_conflict` | Conflicting evidence |
| Cross-system data conflict (e.g., name mismatch) | `recruiting.exception.evidence_conflict` | Conflicting evidence |
| Collector failure | Not a Signal — a `collector_runs.status = "failed"` row (Section 19); distinct from an applicant-side exception on purpose | — |
| Stale requirement (validity window undefined) | Not yet modeled — §14 of the prior design, unresolved | — |

---

## 30. Hiring Recommendation and Action Catalog

Unchanged from the Hiring design's §6:

| `actionType` | Typical Trigger |
|---|---|
| `recruiting.request_background_check` | Application requirement met |
| `recruiting.record_background_classification` | Background report received |
| `recruiting.conduct_individualized_review` | Classification = Reviewable |
| `recruiting.escalate_to_executive_review` | Classification = Presumptive Disqualification |
| `recruiting.determine_role_eligibility` | Review resolved (or classification = Eligible) |
| `recruiting.extend_offer` | Role eligibility determined |
| `recruiting.confirm_onboarding` | Offer accepted |
| `recruiting.record_hiring_outcome` | Onboarding complete, or a terminal exception reached |
| `recruiting.waive_requirement` | A staff member documents why a requirement doesn't apply |
| `recruiting.resolve_offense_mapping` | **New** — resolves a `policy_gap` Exception by recording a human-confirmed offense-taxonomy mapping |

---

## 31. Hiring Human-Review Boundaries

Unchanged from the Hiring design's §11, now expressed as ReviewGate configuration:

| ReviewGate | Applies To | Tier | Consequence / Reversibility |
|---|---|---|---|
| Individualized Review | Classification = Reviewable | HR/recruiting staff | Moderate consequence, reversible via documented re-review |
| Executive Review | Classification = Presumptive Disqualification | Executive only | High consequence, override must be written and rare |
| *(none — structurally absent)* | Classification = Automatic Disqualification | — | No gate may exist; Module 1 §4 |
| *(none configured yet)* | Role eligibility determination | Human judgment, unconfigured pending a future module | High consequence, currently un-automatable (§14 of the prior design) |
| *(none configured yet — baseline Action ownership only)* | Hiring Outcome | Always a human, always attributed | Highest consequence, always irreversible without a new Case |

---

## 32. Hiring Phase 1 UI

Unchanged from the Hiring design's §9, now expressed as instances of this document's §23 universal patterns: Case Workspace (parameterized by the Hiring Workflow), Case Detail page (`/hiring/[id]`), two Review Queues (Individualized, Executive) rather than a generic one.

---

## 33. Minimum Reusable Engine Required for Hiring Phase 1

The smallest set of universal-layer pieces that must exist, generally, before Hiring Phase 1 (the full workspace, not the Wright Flyer — see Section 36 for the narrower demo cut):

1. `Case` + `CaseStateTransition` types and persistence.
2. `Requirement` + `RequirementStatus` types and persistence.
3. `deriveState()` — even a first version handling only linear, non-branching transitions.
4. `HistoricalFact` persistence, domain-scoped (`hiring_facts`), shaped for later migration into a shared table.
5. The Module 1 evaluation-sequence Rule, implemented once, directly from [`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md) §4's pseudocode.
6. `Signal`/Exception persistence, scoped to the reserved `.exception.` namespace.
7. `Recommendation`/`Action`/`Outcome` persistence — these can be near-verbatim ports of the existing `relationship_actions`-family SQL pattern.
8. `ReviewGate` (hardcoded configuration is acceptable for Phase 1 — no admin UI required) + `ReviewRecord` persistence.
9. Two Collectors: a manual-entry Collector (covers Apploi, Viventium, and background-screening evidence identically, since none of the three have API access today) and one `CollectorRun` log.
10. The Case Detail page and two Review Queues (§32) — the list Workspace can follow after, since a single Case is fully demonstrable without it.

Everything else in this document (multi-workflow generality, other domains' Workflow definitions, a Collector admin UI, ReviewGate configuration UI) is explicitly deferred past Hiring Phase 1.

---

## 34. What Should Remain Domain-Specific Rather Than Generalized

Per constraint 9's spirit — not everything belongs in the universal layer:

- **Workflow definitions themselves** (the actual state list, Requirements, Rules) — always domain-specific data, never generalized into shared logic.
- **The Module 1 evaluation sequence** — belongs entirely to the `recruiting` domain's Rule set; the universal layer only knows "a Rule ran and produced a RequirementStatus," never anything about offense taxonomies.
- **UI copy, field labels, and domain-specific card layouts** (e.g., the Background Classification card) — domain-specific presentation over the universal Case Detail shell.
- **ReviewGate tier names and their real-world authority** — "Executive Review" means something specific to Hiring; a future Client Care workflow's tiers are its own.
- **Collector implementations** — the *interface* is universal; an Apploi-specific manual-entry form, or a future Apploi API client, is entirely domain-specific code.
- **Notification content and routing** — reuses the existing, already-generalized Serve OS notification system (per Constitution Article X: "where infrastructure already exists... it gets reused, not rebuilt") rather than this document defining a parallel one.

---

## 35. Phased Implementation Plan

| Phase | Scope |
|---|---|
| **0** | Nothing built. Module 1 remains Draft; Hiring Playbook remains informal (unchanged from the prior design's §13/§14). |
| **1a — Wright Flyer** | See Section 36. The narrowest possible slice proving the full loop end-to-end, one Case, mostly hardcoded configuration. |
| **1b — Hiring Phase 1** | The full minimum engine (Section 33) generalized enough for real applicant volume: Case Workspace, configurable-enough ReviewGate, all Collectors as manual/report-import. |
| **2** | The actual Background Eligibility Engine is built for real (once Module 1 is legally adopted) and replaces Phase 1b's placeholder manual-classification recording with genuine automated evaluation — the Rule interface designed in Phase 1a/1b does not need to change, only its implementation. |
| **3** | API/webhook Collectors for Apploi and Viventium, replacing manual entry as vendor access permits — additive, per Section 17's interchangeability guarantee. |
| **4** | Role Eligibility module (once chartered) supplies the Rule that today is a manual Action (Section 31). |
| **5** | Second domain (e.g., an Assessments or Client Care workflow) is built against `lib/intelligence/operational/`, proving genericity — and Hiring's domain-scoped tables migrate into the shared cross-domain persistence layer at that point, not before. |

---

## 36. Demonstrable "Wright Flyer" Scope — Decisive Recommendation

**Build exactly this, and nothing more, for the first demonstration.**

**One fictional Applicant, one Case, one Hiring Workflow instance, run start-to-finish through every step of the loop, on a single Case Detail page. No Workspace list view. No second Case. No configuration UI for anything.**

### 36.1 The scenario, chosen deliberately

A single test Applicant whose background investigation contains **one clearly-mapped offense and one ambiguous, unmapped offense** — chosen specifically because it is the single narrowest path that still forces every required element to fire naturally, in one coherent story, rather than needing two separate demo cases:

1. **Candidate** — one `Case` opened (`intake_received`), Subject = a clearly-marked, test-flagged fictional Applicant.
2. **Evidence from multiple simulated collectors** — three manual-entry Collectors, run in sequence, each producing real `HistoricalFact` rows: (a) an "Apploi" collector recording `recruiting.application_submitted`; (b) a "background screening" collector recording `recruiting.background_report_received` with two per-offense findings, one cleanly mapped (e.g. simple possession → Reviewable category) and one deliberately ambiguous (an offense description that doesn't cleanly match the taxonomy); (c) a "Viventium" collector, held in reserve, not yet run (demonstrating the loop hasn't reached onboarding yet — an honest, incomplete state, not a fabricated one).
3. **Derived current state** — the Case advances automatically through `applied_in_apploi → screening_in_progress → screening_report_received` purely from Requirement satisfaction, visibly, on the page.
4. **Satisfied and missing requirements** — the Requirements checklist shows `application_on_file: met`, `background_check_ordered: met`, `background_investigation_complete: met`, and `offer_signed`/`onboarding_complete` still `unmet` — a real, not staged, missing-requirements display.
5. **An exception where relevant** — the ambiguous offense produces exactly one `recruiting.exception.policy_gap` Exception, per Module 1's explicit "no silent fallback" rule, **blocking** classification until resolved. This is the demo's single most important beat: the system visibly refuses to guess.
6. **Human review or approval step (first of two)** — a human resolves the Exception via `recruiting.resolve_offense_mapping` (a real Action + Outcome + new confirming Evidence), mapping the ambiguous offense to its correct taxonomy category. This alone already demonstrates Action, Execution, Outcome, and New Evidence closing the loop once.
7. **An applicable governance result** — with both offenses now mapped, the Module 1 evaluation-sequence Rule runs for real, against the real (fictional) findings, and produces **Reviewable** — chosen deliberately over Eligible (too little to show) or Automatic Disqualification (terminates the story too early to demonstrate review) or Presumptive Disqualification (correct but a heavier build for a first demo, since it implies executive-tier UI). Reviewable is the single classification that forces the richest remaining path: an Individualized Review.
8. **The policy and evidence basis for the recommendation** — the resulting `recruiting.conduct_individualized_review` Recommendation displays its Explanation: the exact offense, the exact matched criterion, the exact `ruleVersionId` — reusing `Explanation`'s existing deterministic/narrative split unmodified.
9. **Human review or approval step (second of two)** — a reviewer completes the Individualized Review (Module 1 §4's six factors, entered as structured fields), producing a `ReviewRecord` with a decision.
10. **Recorded execution** — the Case advances to `role_eligibility_pending`; a manual `recruiting.determine_role_eligibility` Action is completed (Phase 1's honest, non-automated stand-in — Section 31), advancing the Case to `offer_pending`.
11. **Resulting outcome and updated state** — the demo ends here, deliberately, **not** at Hired. Stopping at `offer_pending` is itself the honest demonstration: it proves the loop works and closes correctly without needing to fabricate an offer-extension or onboarding step that has no real Collector behind it yet in this scope.

### 36.2 Why this exact scope, and not more

- It touches every element the tasking's Wright Flyer checklist names, in one linear narrative — no parallel scenarios needed, which keeps the build genuinely small.
- It exercises **both** halves of constraint 7's hardest distinction (a clean deterministic path *and* a policy-gap Exception) without needing a second Case.
- It stops before Viventium onboarding and before a final Hiring Outcome — both would require either fabricating Evidence with no real collector behind it, or building a third Collector this scope doesn't need to prove the architecture works.
- It uses only the minimum engine named in Section 33 — nothing here requires a Workspace list, a ReviewGate admin UI, an API Collector, or a second Workflow.
- Test data hygiene: the Applicant, all Evidence, and all Actions must be created under this codebase's existing `test_marker` convention and fully removable afterward — this demo is not exempt from that discipline merely because it's a "Wright Flyer."

---

## 37. Open Questions and Policy Dependencies

Carried forward from the Hiring design's §14, restated at the universal-architecture level plus what's new here:

- **Module 1 remains Draft — Pending Legal & Executive Review.** Nothing built against it, including the Wright Flyer, should be represented as binding compliance software.
- **Reconsideration/appeal, retention duration, registry matching, Role Eligibility combination logic, and the P&P-vs-Module-1 disqualification conflict** — all unresolved exactly as the prior design flagged them; nothing in this document resolves any of them.
- **Vendor Terms of Service for browser-automation Collectors** — not reviewed; Phase 1a/1b deliberately avoid needing this by using manual-entry Collectors only.
- **The shared cross-domain persistence layer's existence and timing** (Section 21's structural note, Section 35 Phase 5) — whether Hiring should be the domain that forces it into existence is a decision outside this document's authority.
- **New, specific to this document:** who owns approval of a **Workflow definition** and a **ReviewGate** as policy artifacts — the Engineering Standards define this discipline for Rules (Section 2, "Hud-approved or still proposed") but this document introduces two new policy-shaped primitives (DesiredState, ReviewGate) that need the same explicit ownership named before Phase 1b, not assumed.
- **New, specific to this document:** whether `Exception`'s reserved `.exception.` namespace convention should be formalized into the type system itself (e.g., a branded `ExceptionSignal` type) or remain a naming convention enforced by review — a real implementation-time decision, deliberately left open here since it doesn't affect the architecture, only its enforcement mechanism.

---

*This document does not change Module 1's status, does not modify any file under `docs/governance/`, and does not authorize implementation. It is a decisive architecture and a decisive Wright Flyer recommendation — not a build.*
