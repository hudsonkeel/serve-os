# ADR 0001 — Governance Knowledge Engine, Phase 0: Foundation & Architecture

**Status:** Accepted (Phase 0 — architecture only, no persistence, no UI, no rule execution)
**Date:** 2026-07-18
**Branch:** `feature/governance-knowledge-engine`

This is the first document in `docs/architecture/decisions/` — no prior ADR
convention existed in this repository before this one. Numbering is
sequential from here.

## Context

`ARCHITECTURE.md` names "Governance Module Implementation" as the next
phase after the completed Enterprise Architecture Foundation. The
Governance Knowledge Engine Phase 0 scope asked for foundational
architecture across six named areas — Governance Workspace, Knowledge
Engine, Decision Engine, Evidence Framework, Recommendation Framework,
Organizational Learning Framework — plus this ADR, and was explicit that
the objective is architectural correctness, not feature completeness:
"whenever architectural uncertainty exists, stop and document
recommendations before implementing irreversible decisions."

Reviewing the scope against the codebase surfaced exactly that kind of
uncertainty: `lib/intelligence/core/` already exists. It is a complete,
type-only (Phase A) implementation of the shared Knowledge → Reasoning →
Recommendation platform mandated by
`docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md` — Article VI
("every domain builds on one shared architecture") and Article X ("a
domain that finds itself designing its own version of a Fact table, a
Signal table, or a Recommendation lifecycle has drifted outside this
Constitution — no duplicate rule engines"). The scope's six frameworks,
read against that kernel, are not six things to design from scratch.

## Decision

**Governance is a domain built on the existing Intelligence Kernel, not a
sixth parallel platform.** Concretely:

1. As a Phase 0 working default, Governance content registers under the
   kernel's existing `"compliance"` domain slug
   (`lib/intelligence/core/shared.ts`'s `KNOWN_INTELLIGENCE_DOMAINS`)
   rather than a new `"governance"` slug — because Background Eligibility,
   the one governance module built out today, is at its core a compliance
   determination (Texas HCSSA §558.245). This is not a permanent
   classification of Governance Intelligence as a whole: it is scoped to
   what exists today, and should be revisited as further governance
   modules (Client Care Governance, Emergency Management, and others named
   in `docs/architecture/serve-governance-crosswalk.md`) are actually
   built — see the "Domain-slug decision, with a caveat" section below.
2. Governance-specific code lives under a new `lib/intelligence/domains/`
   tree (previously empty), following the `logicReference` path convention
   the kernel's own tests already anticipated
   (`lib/intelligence/domains/scheduling/rules/...` appears as an example
   in `lib/intelligence/core/__tests__/boundaries.test.ts` before this
   ADR — this ADR is the first to actually populate that tree, for
   `compliance` rather than `scheduling`).
3. The one genuine gap in the kernel — Organizational Learning — is filled
   as a new shared kernel primitive, `LearningObservation`
   (`lib/intelligence/core/learning.ts`), not a Governance-only type. Every
   domain that produces Outcomes can produce one.
4. Background Eligibility (`docs/governance/workforce/background-eligibility/`),
   the one governance module that is content-complete today, is used as a
   fictional-data pilot proving the mapping compiles against real content
   (`lib/intelligence/domains/compliance/__tests__/backgroundEligibility.test.ts`),
   the same convention `lib/intelligence/core/__tests__/boundaries.test.ts`
   already uses for the kernel itself.

## The six-framework mapping

| Scope's framework | Resolution |
|---|---|
| **Decision Engine** | Already exists: `Rule` → `RuleVersion` → `RuleRun` → `Signal` (`rules.ts`, `signals.ts`). Background Eligibility's four-classification algorithm becomes a `RuleVersion` with a `logicReference`, exactly like any other domain's rule. |
| **Evidence Framework** | Already exists: `Evidence` / `EvidenceReference` (`signals.ts`), a three-kind discriminated union (`historical_fact`, `reference_knowledge`, `signal`). Governance evidence is `HistoricalFact`s (e.g. `compliance.background_finding_reported`) referenced via the `historical_fact` kind. |
| **Recommendation Framework** | Already exists: `Recommendation` → `Action` → `Outcome` → `Explanation` (`recommendations.ts`, `actions.ts`, `explanations.ts`), including the deterministic/narrative split and the non-execution boundary (Constitution Article II/VIII). Governance recommendations are `recommendationType` values like `compliance.route_to_executive_review`. |
| **Knowledge Engine** | **Deferred, not built in Phase 0** — see "What Phase 0 deliberately does not build" below. |
| **Organizational Learning Framework** | The one real gap. Filled by the new shared `LearningObservation` primitive (`lib/intelligence/core/learning.ts`). |
| **Governance Workspace** | A presentation layer — genuinely new, but out of scope for architecture-only Phase 0. Recommended for Phase 1 (see Roadmap). |

## What Phase 0 deliberately does not build: the Knowledge Engine

`lib/intelligence/core/README.md` already states, before this ADR, that
`ReferenceKnowledge` is "not implemented here on purpose — it waits until
Relationship Intelligence has done real requirements work on the
attribute-key vocabulary," and `signals.ts`'s `EvidenceReference` union
already reserves a `"reference_knowledge"` kind for when that lands,
specifically so the union's shape won't need to change later.

Governance's own "Knowledge Engine" need — an index connecting a Rule or a
Recommendation back to the specific governance-document section that
justifies it — is the same primitive, for a different domain. Building a
Governance-specific version of it now, ahead of that already-planned Phase
E work, would be exactly the kind of domain-specific duplication Article X
warns against, and would risk a shape that conflicts with whatever
Relationship Intelligence's requirements work eventually produces.

**Recommendation:** when Reference Knowledge is implemented (Phase E, kernel-wide), Governance
becomes one more consumer of that one primitive — populated with entries
for `docs/governance/workforce/background-eligibility/`'s ontology,
classifications, and offense taxonomy — not a second, parallel knowledge
index. Until then, Governance's evidence chain uses `HistoricalFact` and
`historical_fact`-kind `EvidenceReference`s only, exactly as demonstrated in
`backgroundEligibility.test.ts`, and the governance documents themselves
remain the canonical, un-duplicated source of policy text — read directly,
never copied into a database, consistent with
`docs/architecture/serve-os-scope-philosophy.md`'s systems-of-record
philosophy applied one layer up (to internal documentation, not just
external vendors).

## Domain-slug decision, with a caveat

`docs/compliance/regulatory-registry/policy-coverage-matrix.md` organizes
governance content by regulation-driven module (Workforce Governance,
Client Care Governance, Emergency Management, Quality & Performance,
Information Governance, Compliance generally) — a finer grain than the
Intelligence Kernel's domain list. This is a real observation, but not a
Phase 0 decision point: those finer-grained modules can each be mapped to
`"compliance"` or to a new domain slug individually, when each is actually
built — the same way `"compliance"` and `"recruiting"` were each added to
`KNOWN_INTELLIGENCE_DOMAINS` once, not speculatively in advance. Background
Eligibility (a Workforce Governance module) maps to `"compliance"` because
it is, at its core, a compliance determination (Texas HCSSA §558.245);
future modules should be evaluated the same way rather than assumed to
also be `"compliance"`.

## Integration with existing intelligence work

This ADR does not touch, extend, or depend on any other domain's
in-progress work (Scheduling, Relationships, Intake). It reuses only the
shared kernel (`lib/intelligence/core/`), which every domain is expected to
depend on per Article VI. No existing file outside `lib/intelligence/core/`
and the new `lib/intelligence/domains/` tree was modified for this ADR's
implementation, aside from this document and one additive cross-reference
in `docs/architecture/serve-knowledge-architecture.md`.

## Assumptions and open questions

- **Organizational Learning is a genuine extension, not a pure mapping** —
  unlike the other four resolved frameworks, `LearningObservation` is new
  kernel surface area. Its shape (immutable substantive fields, mutable
  `status`, mandatory non-empty `outcomeIds`, `confidence` reusing
  `ProvenanceConfidence`) should be revisited once real Outcome data exists
  across more than one domain — Phase 0 only proves it compiles against a
  fictional Background Eligibility scenario.
- **Governance Workspace is entirely unscoped** — no UI, no read model, no
  filtering-by-domain query exists yet. Phase 1 territory.
- **The finer-grained module-to-domain mapping is deferred**, per the
  caveat above — not a Phase 0 decision.
- **Whether `LearningObservation.status` transitions need a persisted
  audit trail of their own (a lightweight status-change log) is an open
  question for whenever this primitive gets a real persistence layer** —
  Phase 0 documents the requirement (see `learning.ts`'s doc comment) but
  does not design the mechanism, since no primitive in this kernel has
  persistence yet.

## Recommended Phase 1 roadmap

1. Implement `RuleVersion.logicReference` for Background Eligibility's
   four-classification algorithm as a real (non-fictional) rule —
   `06-offense-taxonomy.md` / `offense-taxonomy.yml` become the actual
   input, not fictional data.
2. Stand up minimal persistence (Supabase schema) for `Subject`,
   `HistoricalFact`, `Signal`, `Recommendation`, `Action`, `Outcome`, scoped
   to the `"compliance"` domain only — not a general-purpose Intelligence
   Kernel schema for every domain at once.
3. Build the read-only Governance Workspace view against that persistence.
4. Revisit `LearningObservation` once Phase 1 produces real Outcomes to
   observe patterns across.
