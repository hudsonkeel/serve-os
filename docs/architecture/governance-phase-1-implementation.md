# Governance Knowledge Engine — Phase 1 Implementation

Branch: `feature/governance-knowledge-engine`. Builds on Phase 0 (ADR 0001) and is itself
recorded in ADR 0002 (`docs/architecture/decisions/0002-governance-decision-vertical-slice.md`)
— read that first for *why* each decision below was made; this document is *what* was built and
*where*.

## What this phase proves

One real, persisted, explainable decision: **"can this applicant/caregiver proceed toward
assignment, based on background eligibility?"** — end to end, from a recorded finding through a
deterministic classification to an explainable, non-executable recommendation, visible in a
simple read-only workspace. Success criteria (unchanged from the approved plan): one real
operational decision, one explainable outcome, one evidence chain, one recommendation, one
reusable architectural pattern.

## Architecture

```
Pure domain classifier        lib/intelligence/domains/compliance/backgroundEligibility/
        ↓
Shared decision service       lib/intelligence/decisionEngine/evaluate.ts
        ↓
Persistence/data layer        lib/data/decisionEngine.ts
        ↓
Server Action                 lib/actions/decisionEngine.ts  ("use server", auth only)
        ↓
Governance Workspace          app/governance/, app/governance/[id]/
```

Background Eligibility is the first entry in `lib/intelligence/decisionEngine/registry.ts` — a
one-line map from `decisionType` to a handler function. Everything above the classifier line is
domain-agnostic; a second decision type (Phase 2) adds a second registry entry and reuses
everything else.

## Table ↔ kernel-primitive mapping

Migration: `supabase/migrations/20260724000000_create_intelligence_kernel_persistence.sql`.

| Table | Kernel primitive (`lib/intelligence/core/`) |
|---|---|
| `intelligence_subjects` | `Subject` |
| `intelligence_historical_facts` | `HistoricalFact` |
| `intelligence_rules` / `intelligence_rule_versions` | `Rule` / `RuleVersion` |
| `intelligence_signals` | `Signal` |
| `intelligence_evidence` | `Evidence` / `EvidenceReference` |
| `intelligence_recommendations` | `Recommendation` |
| `intelligence_explanations` | `Explanation` |

`Action`, `Outcome`, `RuleRun`, and `LearningObservation` are **not persisted** — see ADR 0002
Decision 1 for why, and the Phase 2 roadmap below for when.

Two columns exist that are not part of the shared TypeScript kernel types (persistence-layer
extensions, not kernel changes): `intelligence_recommendations.supersedes_recommendation_id`
and `intelligence_rule_versions.policy_references`/`authority_references`.

## Decision evaluation flow

1. Something (Server Action or script) calls `evaluateDecision("background_eligibility", input)`.
2. The registry dispatches to `buildBackgroundEligibilityDecisionSpec()`
   (`lib/intelligence/domains/compliance/backgroundEligibility/decisionSpec.ts`), which:
   - normalizes raw offense text against the real `offense-taxonomy.yml` (`normalizeOffense.ts`);
   - runs the deterministic evaluation sequence from the real `classification-rules.yml`
     (`classificationEngine.ts`) — Automatic → Presumptive → Reviewable → Eligible, stopping at
     the first match;
   - maps the classification (plus any documented review outcome) to one of five operational
     outcomes (`operationalOutcome.ts`): `eligible_to_proceed`, `executive_review_required`,
     `cannot_proceed`, `insufficient_evidence`, `decision_pending`;
   - reduces all of the above to one `DecisionRecordSpec` — the generic shape every decision
     type must produce.
3. `evaluate.ts` resolves the `RuleVersion` (`intelligence_ensure_rule_version` RPC — upserts by
   slug+version, immutable once created) and calls `recordDecision()`, which atomically inserts
   Subject (upsert), one `HistoricalFact`, one `Signal`, one `Evidence` row linking them, one
   `Recommendation`, and its `Explanation` — via the `record_decision` RPC, idempotent by
   default (`intelligence_find_settled_recommendation`), matching
   `process_website_intake_submission`'s established pattern exactly (including its
   `FOUND`-is-not-set gotcha).
4. If the operational outcome is `executive_review_required`, `compliance.executive_review_required`
   fires (best-effort, non-blocking) to `SERVE_NOTIFY_LEADERSHIP`.
5. New evidence for the same subject re-evaluates via `reevaluateWithNewEvidence()`, which looks
   up the prior settled recommendation and creates a **new** row with
   `supersedes_recommendation_id` set — the prior row is never edited.

## Governance Workspace

`/governance` — plain table, one native outcome filter, no tabs. `/governance/[id]` — Outcome,
Explanation (deterministic vs. narrative visually separated), Evidence Considered (with
retrieval method and freshness — see below), Recommendation (labeled non-executable), Missing or
Unresolved Evidence, Policy References, Authority References, and a one-link-back note when the
decision supersedes a prior one. No new auth code: `/governance` simply isn't in `proxy.ts`'s
`PUBLIC_PATHS`, inheriting the existing `AUTH_ROLES` gate automatically.

Deliberately simple, per an explicit correction mid-implementation: the objective is proving the
Decision Engine, not building the final Governance application. No Actions/Outcomes UI (not
persisted this phase), no multi-dimension filter bar, no evaluation-history timeline component.

## Evidence retrieval and freshness

Per `docs/integrations/VIVENTIUM_APPLOI_PLACEHOLDER_BOUNDARIES.md`, every finding carries
`EvidenceRetrievalMetadata` — retrieval method (Live API / File Import / Manual Verification /
Fixture / Demonstration), a `verifiedAt` freshness timestamp, and whether it's authoritative.
Phase 1 only ever produces `"fixture_demonstration"`. The Workspace always shows this — nothing
in the UI implies continuous or live monitoring.

## Governance YAML as the deployment-safe source of truth

The classifier reads `docs/governance/workforce/background-eligibility/offense-taxonomy.yml` and
`classification-rules.yml` at runtime (`js-yaml`) — no hand-transcribed copy exists anywhere.
Made deployment-safe via `outputFileTracingIncludes` in `next.config.ts`; verified by grepping
`.next/server/app/governance/**/*.nft.json` after a real `npm run build` and confirming both
files are actually listed. See ADR 0002 Decision 3 for the full reasoning.

## Known limitations

- No live vendor integration of any kind — see the placeholder-boundaries doc.
- `Action`/`Outcome`/`RuleRun`/`LearningObservation` have no persistence yet.
- Only one decision type exists; the registry's genuine reusability is asserted by design, not
  yet proven by a second real decision type.
- No applicant-facing appeal/reconsideration process is implemented — the governance module
  itself flags this "Requires Legal Review" (`05-review-workflow.md` §7) and this phase doesn't
  attempt to resolve it.
- `authority_references` is empty for every decision — no external legal/regulatory citation has
  cleared legal review yet.
- Offense normalization is exact-match-only (case-insensitive) against the taxonomy's
  representative offense list — no fuzzy matching or ML/LLM assistance, per the scope's explicit
  non-goal. An offense phrased differently than the taxonomy's representative text will
  correctly escalate as unrecognized rather than silently misclassify, but this means real-world
  intake will likely need either taxonomy expansion or a human normalization step more often
  than a fuzzy matcher would.

## Phase 2 recommendations

See ADR 0002's Phase 2 roadmap (vendor discovery questions, Action/Outcome/RuleRun/
LearningObservation persistence, a second decision type, legal review) — not duplicated here to
avoid the two documents drifting out of sync.
