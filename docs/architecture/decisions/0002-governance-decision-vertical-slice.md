# ADR 0002 — Governance Knowledge Engine Phase 1: Decision Vertical Slice

**Status:** Accepted (Phase 1 — one real, persisted, explainable decision workflow)
**Date:** 2026-07-18
**Branch:** `feature/governance-knowledge-engine`
**Builds on:** ADR 0001 (`0001-governance-knowledge-engine-phase-0.md`)

## Context

Phase 0 established that Governance builds on the existing type-only `lib/intelligence/core/` kernel rather than a parallel platform. The kernel had never been persisted. Phase 1's scope asked for one real, explainable, persisted decision workflow — "can this applicant/caregiver proceed toward assignment, based on background eligibility?" — proving the Phase 0 architecture in real application behavior.

Three corrections were made mid-implementation, each producing a decision recorded here.

## Decision 1 — Generic, kernel-wide persistence, not a Background-Eligibility-specific schema

The scope explicitly forbade creating governance-specific versions of Subject, HistoricalFact, Rule, RuleVersion, Signal, Evidence, Recommendation, or Explanation, and said to reuse the shared primitives "wherever practical." Since nothing had ever been persisted, the only way to honor that was to build one generic `intelligence_*` schema (`supabase/migrations/20260724000000_create_intelligence_kernel_persistence.sql`) that any future decision type reuses — not a `governance_*` or `background_eligibility_*` schema. Background Eligibility is the first tenant of this schema, not its owner.

**Minimized deliberately**, per an explicit correction to an earlier, over-built draft of this phase: only `intelligence_subjects`, `intelligence_historical_facts`, `intelligence_rules`, `intelligence_rule_versions`, `intelligence_signals`, `intelligence_evidence`, `intelligence_recommendations`, and `intelligence_explanations` are persisted. `Action`, `Outcome`, `RuleRun`, and `LearningObservation` remain real kernel primitives with no table yet — a single on-demand evaluation has no genuine need for batch-execution history (`RuleRun`) or human task tracking (`Action`/`Outcome`), and `LearningObservation` needs real `Outcome` data to observe patterns in before its shape can be validated. All four are named explicitly in the Phase 2 roadmap below rather than built speculatively.

Two persistence-only additions exist that are not part of the shared TypeScript types, documented so they are never mistaken for kernel changes:
- `intelligence_recommendations.supersedes_recommendation_id` — how "new evidence changes the result without erasing the prior one" is represented. A re-evaluation creates a new row; the prior row is never edited.
- `intelligence_rule_versions.policy_references` / `authority_references` (jsonb) — see Decision 2.

## Decision 2 — Policy/authority references live on RuleVersion, not a new knowledge registry

The scope asked for policy and authority citations to be explainable per decision, but explicitly warned: "Do not build a parallel governance-only knowledge registry that conflicts with ADR 0001 or the planned shared kernel ReferenceKnowledge architecture." ADR 0001 already established that `ReferenceKnowledge` is deliberately deferred to a future kernel-wide Phase E, gated on Relationship Intelligence's own requirements work — building a Background-Eligibility-specific version of it now would preempt that.

Resolution: policy and authority references are stored as `jsonb` columns on `intelligence_rule_versions`, not a separate table. A RuleVersion's documentation basis is fixed per version, not per decision — every decision produced by the same RuleVersion cites the same policy sections, so storing it once per version (rather than duplicating it onto every decision) is both more minimal and more correct. `lib/intelligence/domains/compliance/backgroundEligibility/decisionSpec.ts` only ever cites Serve's own governance documents by repo-relative path and section — no external legal or regulatory citation is asserted, since every governance document this rule implements flags its offense taxonomy and classification boundaries "Requires Legal Review" (`00-purpose-and-scope.md` §5).

`intelligence_evidence.reference_knowledge_id` exists in the schema (per `EvidenceReference`'s three-kind union) but is never populated in Phase 1 — Evidence only ever uses the `historical_fact` kind. When kernel-wide `ReferenceKnowledge` eventually lands, Governance becomes one more consumer of it, not a second parallel index.

## Decision 3 — Governance YAML stays the runtime source of truth, made deployment-safe

`08-future-software-specification.md` §2 requires the classification engine to be "a direct implementation of `classification-rules.yml` and `offense-taxonomy.yml` — not a reinterpretation... Where the two diverge, the YAML wins and the code is wrong." The classifier (`lib/intelligence/domains/compliance/backgroundEligibility/offenseTaxonomy.ts`, `classificationRules.ts`) parses these files at runtime via `js-yaml` (new dependency) rather than hand-transcribing them — no second copy of the taxonomy exists anywhere, so drift is structurally impossible.

This was corrected mid-implementation: a plain `fs.readFileSync` against `docs/` is not safe to assume post-deploy. Next.js's Output File Tracing (`@vercel/nft`) only bundles files it can statically detect via `import`/`require`/`fs` analysis, and this app deploys to Netlify via `@netlify/plugin-nextjs`, itself built on that same tracing — a dynamic `fs` read like this one is exactly the case that can silently 404 in a deployed function while working fine in local dev. Fixed via `outputFileTracingIncludes` in `next.config.ts`:

```ts
outputFileTracingIncludes: {
  "/*": ["docs/governance/workforce/background-eligibility/*.yml"],
},
```

Verified concretely, not just configured: after `npm run build`, `.next/server/app/governance/page.js.nft.json` and `.next/server/app/governance/[id]/page.js.nft.json` were grepped directly and confirmed to list `offense-taxonomy.yml` and `classification-rules.yml`. The loader also fails loudly and specifically — a missing file, malformed YAML syntax, or an unrecognized classification value each throw a distinct, clear error (tested in `lib/intelligence/domains/compliance/backgroundEligibility/__tests__/offenseTaxonomy.test.ts` and `classificationRules.test.ts`) rather than silently producing an empty or wrong taxonomy.

## Decision 4 — Layering: a plain shared service, not logic embedded in the Server Action

Corrected mid-implementation: the Server Action layer (`lib/actions/decisionEngine.ts`) must not contain unique decision logic unavailable to the seed and live-verification scripts, and those scripts must never need to fake an authenticated browser/Server Action request context.

```
Pure domain classifier   lib/intelligence/domains/compliance/backgroundEligibility/
        ↓
Shared decision service  lib/intelligence/decisionEngine/evaluate.ts — plain async function,
                          NOT "use server". All real decision logic lives here.
        ↓
Persistence/data layer   lib/data/decisionEngine.ts — recordDecision(input) via one atomic RPC.
        ↓
Server Action             lib/actions/decisionEngine.ts ("use server") — auth check, then
                          calls the shared service. No decision logic of its own.
```

`getCurrentAuthorizedUser()` depends on `next/headers`' `cookies()`, which throws outside a real HTTP request. Because `evaluateDecision()` and `reevaluateWithNewEvidence()` are plain functions with no such dependency, `scripts/seed-governance-demo-data.ts` and the (temporary, now-deleted) live-verification script called them directly — no HTTP, no cookies, no faked context. This required switching `lib/data/decisionEngine.ts`'s and `lib/intelligence/decisionEngine/evaluate.ts`'s internal imports from the `@/` path alias (which only Next's bundler resolves) to plain relative imports with explicit `.ts` extensions (which plain Node's `--experimental-strip-types` execution requires) — matching the convention already established by `lib/scheduling/todaysSchedule.ts` and its own callers in `scripts/`. Two latent extension/type-only-import issues in `lib/notifications/index.ts` and `rules.ts` were fixed as part of this (harmless under Next's bundler either way, but required for direct Node execution).

## Decision 5 — Evidence is manual/fictional/imported, never asserted as live vendor data

Corrected mid-implementation: we have not confirmed that Viventium, Apploi, or the background-screening provider exposes what Background Eligibility needs through any accessible API. `lib/intelligence/domains/compliance/backgroundEligibility/sourceCapability.ts` adds a small contract — `SourceCapabilityStatus` (`confirmed`/`unverified`/`unavailable`/`manual`/`file_import`) and `EvidenceRetrievalMetadata` (retrieval method, freshness, authoritativeness, external identifiers) — carried inside `HistoricalFact.payload` for every finding this decision type records. Every capability every adapter declares in Phase 1 is `"unverified"`; no adapter makes a live call; Phase 1 only ever produces `retrievalMethod: "fixture_demonstration"` or `"manual_verification"`, never `"live_api"`. The Governance Workspace always shows retrieval method and freshness per evidence item, and nothing in the UI or documentation implies continuous or live monitoring. See `docs/integrations/VIVENTIUM_APPLOI_PLACEHOLDER_BOUNDARIES.md`.

## Assumptions and open questions

- Whether `LearningObservation.status` transitions need a persisted audit trail is unresolved (carried from ADR 0001) and remains unresolved — no `Outcome` or `Action` persistence exists yet to observe.
- The finer-grained governance-module-to-domain-slug mapping (Client Care Governance, Emergency Management, etc.) remains deferred, per ADR 0001.
- Whether `intelligence_recommendations.supersedes_recommendation_id` is the right long-term lineage mechanism, versus a more general kernel-level "decision version" concept, should be revisited once a second decision type exercises it.

## Recommended Phase 2 roadmap

1. Confirm with Viventium, Apploi, and the screening provider which capabilities from `sourceCapability.ts`'s declarations are actually `confirmed` — see the full discovery question list in `docs/architecture/governance-phase-1-implementation.md`.
2. Persist `Action`/`Outcome` once there is a real human-task workflow around a Recommendation to track.
3. Persist `RuleRun` once evaluation moves beyond one-off, on-demand calls to a scheduled or batch trigger.
4. Revisit `LearningObservation` once real `Outcome` data exists to observe patterns across.
5. Register a second decision type in `lib/intelligence/decisionEngine/registry.ts` to prove the generic service layer is genuinely reusable, not just theoretically so.
6. Legal review of the offense taxonomy and classification boundaries (per every governance document's own "Requires Legal Review" flags) before `authority_references` can be populated with any real external citation.
