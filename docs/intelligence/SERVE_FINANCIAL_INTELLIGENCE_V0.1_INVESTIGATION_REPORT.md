# Serve Financial Intelligence v0.1 — Repository Audit, Branch Review, and Architecture Investigation Report

**Status:** Investigation only. No Financial Intelligence code has been written.
**Prepared for:** Hud (and review with ChatGPT)
**Repository state at time of investigation:** `origin/main` @ `9824873`, investigation run from `feature/assessment-aws-transcription-pipeline` @ `4492bff`.

This report answers Phases 1–10 of the requested investigation. It does not implement anything. It does not resolve any business-policy question. Where evidence was incomplete, that is stated as "unknown," not inferred.

> **Correction (see `SERVE_FINANCIAL_INTELLIGENCE_V0.1_ARCHITECTURE_AND_API_DISCOVERY.md`):** a follow-up investigation re-examined the Active Client characterization below (§C item 1, §F.3, §E row 10) against the actual `clientLifecycle.ts`/`lifecycleSignals.ts`/correction-pipeline implementation and found it **already satisfies** the "AxisCare supplies lifecycle evidence, Serve owns lifecycle interpretation" principle — it is not a direct vendor-label passthrough. The characterization below is preserved as a record of what this report could determine at the time (from the earlier, narrower AxisCare-capability agent pass) but should be read alongside that correction, not relied on alone.

---

## A. Repository / Branch Health

### Current state

- `HEAD`: `4492bff` on `feature/assessment-aws-transcription-pipeline`
- `origin/main`: `9824873` ("Merge branch 'feature/todays-work-actionability'")
- Working tree on the primary checkout (`c:\Users\hudso\Development\Serve\serve-os`): **58 uncommitted paths** (many `M` files across `app/audit-readiness`, `components/reconciliation`, `components/relationships`, `components/residents`, `components/workforce`, plus untracked `.claude/`, `app/qapi/`, `components/qapi/`, the three new `docs/intelligence/*.md` files, `lib/qapi/`, and a new Supabase migration). This is pre-existing in-progress work, not something this investigation touched.
- 10 active git worktrees exist (see §2 below); all are separate checkouts of distinct feature branches.

### Branch table

| Branch | Local/Remote | HEAD SHA | Ahead of main | Behind main | Unique commits (content) | Apparent purpose | Status | Recommendation |
|---|---|---|---:|---:|---|---|---|---|
| `main` | Both | `9824873` | 0 | 0 | — | Trunk | Current | KEEP ACTIVE |
| `feature/assessment-aws-transcription-pipeline` | Both | `4492bff` | 8 | 12 | Native AWS transcription pipeline for assessments; dispatcher/worker handoff fixes | Active, current checkout | Active | KEEP ACTIVE |
| `feature/audit-readiness-v0.1` | Both (worktree) | `6500be6` | 1 | 17 | Single "snapshot: preserve uncommitted..." commit; worktree also carries 1 further uncommitted file | Recovery snapshot of in-progress Client Readiness / AxisCare UX work | Active but snapshot-shaped, not normal commit history | VERIFY BEFORE MERGE — confirm whether this is live work-in-progress or a stale backup; the commit message itself signals a cross-worktree recovery, not planned feature work |
| `feature/multi-community-foundation` | Both (worktree) | `ca59af8` | **0** | 12 | none unique — tip is an ancestor of `origin/main` | Multi-community foundation work | **Fully merged**, worktree still checked out with 1 uncommitted file | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION (worktree can be removed once the 1 uncommitted file is reviewed) |
| `feature/qapi-governance-connective-slice` | Both (worktree) | `ccf519f` | 0 | 5 | none unique | QAPI governance connective work | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `feature/qapi-incidents-infections` | Both (worktree) | `7e9434a` | 0 | 9 | none unique | QAPI Incidents & Infections registers | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `feature/qapi-v0.1` | Both (worktree) | `167ceab` | 0 | 11 | none unique | QAPI leadership quality view | Fully merged (via PR #6) | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `feature/relationship-correction-semantics` | Both (worktree) | `033d7a9` | 0 | 3 | none unique | Relationship discrepancy resolution fix | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `feature/system-affordance-pass` | Both (worktree) | `0b93398` | 0 | 7 | none unique | Restore system-wide action affordances | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `feature/todays-work-actionability` | Both (worktree) | `adf4a5a` | 0 | 1 | none unique | Today's Work actionability fix | Fully merged (is main's last merge) | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `feature/bedrock-claude-provider-abstraction` | Both | `6aed480` | 1 | 19 | 1 commit: "snapshot: preserve uncommitted assessment/AWS transcription pipeline work" | Appears to be a **backup snapshot of the same in-progress work as the current branch**, not a distinct Bedrock/Claude-provider feature despite its name | Unclear — name doesn't match commit content | STALE — INVESTIGATE (branch name suggests a provider-abstraction feature; its one commit is actually an assessment-pipeline snapshot — likely a mis-named or accidental backup point) |
| `feature/governance-knowledge-engine` | Both | `f773846` | 4 | 82 | 4 real commits — Governance Knowledge Engine Phase 0 (architectural foundation) + Phase 1 (first Decision Intelligence vertical slice) + 2 doc corrections | Real, substantive feature work; no active worktree | Completed but unmerged, and now 82 commits stale relative to main | VERIFY BEFORE MERGE — determine whether this was superseded by QAPI/governance work that did land in main, or whether it's still wanted |
| `archive/serve-os-working-tree-2026-08-09` | Both | `0077f15` | 2 | 74 | 2 "snapshot" commits (working-tree preservation before repo consolidation) | Deliberate archive, name says so | Archived by design | DO NOT TOUCH |
| `recovery-snapshot/2026-08-05` | Both | `8d21d67` | 1 | 74 | 1 "snapshot: complete working tree before capability assessment (108 uncommitted changes)" | Deliberate recovery point | Archived by design | DO NOT TOUCH |
| `origin/feature/care-inquiries-os` | Remote only | `e1db3f2` | 3 | 123 | 3 real commits — prospect/website-inquiry terminology and source-recognition work | Real feature work, no local branch or worktree, 123 commits stale | STALE — INVESTIGATE (relevant to the Prospect ontology-terminology conflict noted in §C below; worth checking before assuming it's abandoned) |
| `origin/hotfix/external-client-resident-conversion` | Remote only | `bc0bc40` | 1 | 73 | 1 commit — fix passing `p_phone_raw` to a conversion RPC | Real, narrow fix, no local branch, 73 commits stale | STALE — INVESTIGATE (small enough to quickly check whether the underlying bug still exists in main) |
| `origin/fix/post-release-stabilization` | Remote only | `d45e2e7` | 1 | 42 | 1 commit, but **patch-content-identical** to something already in `origin/main` (confirmed via `git cherry`) | Recruiting/workforce reconciliation fix | Merged by content under a different SHA | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `origin/feature/axiscare-read-only-schedule` | Remote only | `740be25` | 0 | 86 | none unique | Contact-ready operational readiness work | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `origin/feature/professional-referral-admin-display` | Remote only | `8d67c86` | 0 | 121 | none unique | — | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `origin/fix/hiring-pipeline-reconciliation` | Remote only | `c1d2966` | 0 | 38 | none unique | — | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `origin/integration/serve-os-operational-shell` | Remote only | `5ba5842` | 0 | 74 | none unique | Navigation shell decision | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `origin/docs/workforce-operations-assistant-design` | Remote only | `d3d0360` | 0 | 80 | none unique | Workforce employee-record audit design | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |
| `origin/release/local-parity-serve-os` | Remote only | `fac51fe` | 0 | 68 | none unique | Recruiting operational understanding release | Fully merged | SUPERSEDED — SAFE TO ARCHIVE AFTER CONFIRMATION |

"Fully merged" above means: the branch tip is a confirmed git ancestor of `origin/main` (verified via `git merge-base --is-ancestor`), i.e. every commit on that branch is already present in main's history. This is stronger evidence than `ahead=0` alone.

### 2. Worktree audit

| Worktree path | Branch | HEAD | Uncommitted changes | Notes |
|---|---|---|---:|---|
| `C:/Users/hudso/Development/Serve/serve-os` | `feature/assessment-aws-transcription-pipeline` | `4492bff` | 58 files | Primary/current checkout, active |
| `C:/Users/hudso/Development/Serve/serve-os-audit-readiness` | `feature/audit-readiness-v0.1` | `6500be6` | 1 file | See branch note above |
| `C:/Users/hudso/Development/Serve/serve-os-governance-connective` | `feature/qapi-governance-connective-slice` | `ccf519f` | 0 | Branch fully merged — worktree not needed |
| `C:/Users/hudso/Development/Serve/serve-os-multi-community` | `feature/multi-community-foundation` | `ca59af8` | 1 file | Branch fully merged — review the 1 uncommitted file before removing |
| `C:/Users/hudso/Development/Serve/serve-os-relationship-correction` | `feature/relationship-correction-semantics` | `033d7a9` | 0 | Branch fully merged — worktree not needed |
| `C:/Users/hudso/Development/Serve/serve-os-todays-work-actionability` | `feature/todays-work-actionability` | `adf4a5a` | 0 | Branch fully merged — worktree not needed |
| `C:/wt-affordance-pass` | `feature/system-affordance-pass` | `0b93398` | 0 | Branch fully merged — worktree not needed |
| `C:/wt-main-merge` | `main` | `9824873` | 0 | Tracks main directly |
| `C:/wt-qapi` | `feature/qapi-v0.1` | `167ceab` | 0 | Branch fully merged — worktree not needed |
| `C:/wt-qapi-quality` | `feature/qapi-incidents-infections` | `7e9434a` | 0 | Branch fully merged — worktree not needed |
| `C:/wt-financial-intelligence-v0.1` **(new, this investigation)** | `feature/financial-intelligence-v0.1` | `9824873` | 0 | Created per Phase 2, see below |

No worktree was removed, merged, reset, or rebased. No branch was deleted.

### Phase 2 result — isolated Financial Intelligence worktree

Created as requested:

- Base: `origin/main` @ `9824873`
- New branch: `feature/financial-intelligence-v0.1` @ `9824873` (identical SHA — 0 ahead / 0 behind confirmed)
- Worktree path: `C:/wt-financial-intelligence-v0.1`
- Working tree: clean (0 uncommitted files)
- No implementation commits made.

---

## B. Current Intelligence Architecture

**Bottom line: `lib/intelligence/core/` is a types-only specification layer with zero persistence, zero rule engine, and zero real consumers. No domain in the codebase — old or new — actually builds on it end-to-end.**

### What's implemented vs. specified

| Layer | Status |
|---|---|
| Shared primitive types (`Subject`, `HistoricalFact`, `Rule`/`RuleVersion`/`RuleRun`, `Signal`, `Evidence`, `Recommendation`, `Action`, `Outcome`, `Explanation`) | **Implemented as TypeScript types only**, in `lib/intelligence/core/` (`shared.ts`, `provenance.ts`, `subject.ts`, `facts.ts`, `signals.ts`, `rules.ts`, `recommendations.ts`, `actions.ts`, `explanations.ts`). The folder's own `README.md` states: *"Types only — no persistence, no database schema, no Supabase, no rule evaluation, no UI. This folder implements zero application behavior."* |
| Persistence (a `HistoricalFact`/`Signal`/`Recommendation` table) | **Not built.** No matching table exists anywhere in `supabase/migrations/*.sql` (96 files checked). |
| Rule engine / runner | **Not built.** Documented internally as "Phase C — not started." |
| AI/deterministic boundary enforcement | **Implemented and tested** — the one part of this platform with real teeth. `ExplanationDeterministicCore` structurally excludes any AI-touchable field; `lib/intelligence/core/__tests__/typeGuarantees.ts` proves this at compile time via `@ts-expect-error`, and `boundaries.test.ts` (10/10 passing) scans for raw-vendor-type leakage into the core layer. |
| Reference Knowledge / Context | Explicitly deferred — "Phase E, no table exists yet" per Engineering Standards. |
| Cross-domain aggregation (e.g., Community Intelligence rolling up Signals from other domains) | **Specification-only.** `app/community-intelligence/page.tsx` renders a hardcoded array of "insight categories," each explicitly labeled `"illustrative"` or `"not_connected"` in its own source, with an in-code comment: *"Metrics below are illustrative until each intelligence engine is connected to real data."* |

### What every real "intelligence" feature in production actually does instead

Every domain that ships today reinvented its own Fact/Signal-shaped schema, independent of `lib/intelligence/core`:

- **Recruiting** (`lib/recruiting/`) — most mature: its own `recruiting_lead_rules`/`recruiting_lead_rule_versions`/`recruiting_lead_inferences`/`recruiting_lead_inference_evidence` tables and a real orchestrator (`evaluateRecruitingLeadRules.ts`) running six rule modules. Feeds Today's Work.
- **Relationship Intelligence** (`lib/relationships/`) — own `relationship_insights`/`relationship_commitments`/`relationship_open_loops` tables; `suggestionEngine.ts` is deterministic by design but its own comments note it isn't wired to any shared kernel.
- **Assessment Intelligence** (`lib/assessmentIntelligence/`) — the newest domain (migration dated 2026-09-01, i.e. *after* the Constitution was adopted 2026-07-13) and still built its own parallel `RawExtractedFact`/`NormalizedDraftFact` concept with a different shape than `HistoricalFact`. This is the clearest concrete instance of the drift the Constitution itself warns against (Article X: *"A domain that finds itself designing its own version of a Fact table... has drifted outside this Constitution and should be brought back in, not accommodated"*).
- **Workforce Intelligence** (`lib/workforce/`) — own `requirement_sets`/`person_requirements`/`person_evidence` tables; a bespoke `AttentionState` enum that is conceptually Signal-like but not built on `SignalSeverity`.
- **Audit Readiness / QAPI** (`lib/compliance/`, `lib/qapi/`) — bespoke aggregation/rollup layers over Workforce + Emergency Preparedness data, architecturally similar in spirit to what Community/Executive Intelligence are supposed to do, but not built on Signal/Evidence primitives.
- **Scheduling Intelligence** — only Phase 1 (read-only AxisCare visibility) is real; the deterministic exception layer (late/no-clock-in, missed-visit inference) that the Constitution's "Scheduling Intelligence" concept describes is explicitly not built (`CURRENT_STATUS.md`: "no rule code, no migrations, no UI exist yet").
- **Today's Work** (`lib/data/todaysWork.ts`, `components/workspace/TodaysWorkView.tsx`) — the one real cross-domain aggregation surface in production — pulls directly from five separate domain-specific tables (wellness follow-ups, relationship actions, recruiting leads, pipeline stages, failed assessment sessions), **not** from `lib/intelligence/core`'s `Recommendation`/`Action` types. Its own header calls itself "an aggregation layer, never a system of record."

### What Financial Intelligence should reuse — and the honest caveat

The *pattern* worth reusing is the Recruiting domain's approach: its own governed rule/evidence tables, a real deterministic rule runner, and a mapping function into Today's Work — because it's the only domain that has actually shipped something resembling the Constitution's intent end-to-end. The shared `lib/intelligence/core` types are well-designed and worth adopting as the target shape (particularly the `ExplanationDeterministicCore`/`ExplanationNarrative` split, which is genuinely load-bearing), but **there is no working precedent of any domain actually persisting to and running against those shared types.** A Financial Intelligence domain that "extends the existing platform" would be the first to actually close that loop — it inherits well-specified types, not a proven integration path.

---

## C. New-Document Reconciliation

All five governing docs exist under `docs/intelligence/`. Three of them — `SERVE_EXECUTIVE_INTELLIGENCE_DOMAIN_CHARTER.md`, `SERVE_BUSINESS_ONTOLOGY.md`, `SERVE_FINANCIAL_METRIC_REGISTRY.md` — are **currently untracked/uncommitted** in git (confirmed via `git status`), each self-labeled "Version 0.1 / Status: Foundational Design." That matters procedurally: this investigation is evaluating draft documents being written concurrently with the investigation itself, not an established, committed target architecture.

No outright factual contradictions were found between the five documents — they're largely internally consistent (the Revenue − Direct Labor = Direct Service Contribution chain and its Community/enterprise extensions are worded near-identically across Ontology, Charter, and Registry). The discrepancies below are boundary/definition ambiguities:

1. **"Active Client" is treated as already-defined by a document that never actually defines it.**
   - *Docs say:* Registry §13 marks `operations.active_clients` status as "**Defined**; implementation should reuse existing canonical lifecycle logic." But Business Ontology never establishes an authoritative active/inactive/former lifecycle rule — it only mentions "active clients" in passing.
   - *Implementation does:* The closest real thing, `computed_lifecycle` in `axiscare_client_operational_state`, is derived directly from AxisCare's vendor status/class codes (`clientLifecycle.ts`), with a human-override table layered on top.
   - *Substantive or naming?* **Substantive.** Ontology §6 explicitly says "Client status must be determined by Serve-owned lifecycle semantics rather than inferred from a vendor label alone" — the current implementation does the opposite of what the Ontology it's supposed to obey requires.
   - *Recommendation (original):* Do not treat Registry §13's "Defined" status as settled. Flag to Hud.
   - *Hud must decide (original):* Yes — whether vendor-derived `computed_lifecycle` is acceptable as the v0.1 Active Client definition, or whether a Serve-owned rule set must first be built. See Decision Queue item F.3.
   - **Superseded:** a deeper read of `classifyAxisCareClientLifecycle()`, the `AXISCARE_LIFECYCLE_CLASS_MAP` lookup table, `hasStartDate()`, and the two independent human-correction paths (`axiscare_client_dispositions`, `resident_serve_relationship_corrections`) found this is a genuine multi-input, Serve-owned deterministic interpretation layer — not a vendor-label passthrough — with tested edge-case handling (e.g. "Active No Visits" correctly mapped to `inactive_client` rather than discharged). Registry §13's "Defined" status is confirmed correct. No decision is required here; see the Architecture and API Discovery report.

2. **Revenue-basis narrowing.** Business Ontology deliberately keeps five revenue views distinct (Delivered/Billable/Invoiced/Recognized/Collected) and says they "must not be used interchangeably." The Financial Metric Registry's `financial.service_revenue` then collapses to only the Invoiced basis for v0.1, preserving the distinction only as a footnote-level "Known Limitation" rather than a separately named metric. Not a contradiction — the Registry is explicit that it's a v0.1 narrowing — but worth Hud's awareness since it's the exact kind of "same metric, same meaning" collapsing the Registry's own §2.3 principle warns against if it later gets re-labeled loosely.

3. **"Care Hour" (Scheduled/Delivered/Billable/Paid) is a Registry-only vocabulary extension.** It doesn't appear anywhere in the Business Ontology's core concept list. Not a conflict, but the Ontology's own §44 requires new business concepts to "map cleanly to this ontology or deliberately extend it" — this extension wasn't made deliberately at the Ontology layer, only introduced downstream in the Registry.

4. **Overlapping "who owns formulas" boundary.** Both the Ontology (§1, §48) and the Registry state the Ontology does not define metric formulas — yet the Ontology itself presents the exact same subtraction formulas the Registry then claims as its own domain. The stated division of labor between the two documents doesn't hold cleanly in practice. Low-stakes, but worth tightening if these docs get revised.

5. **Naming proximity risk, self-acknowledged.** Registry §16 `financial.community_direct_service_contribution` and the Ontology's `Community Contribution` are materially different figures (the former omits Payroll Burden and Community-Direct Operating Cost) but have near-identical names. The Registry already flags this itself ("this is not yet Community Contribution as defined in the Business Ontology") — not a conflict, but a labeling risk to keep policing as more metrics are added.

None of these block starting the investigation phases that follow. All are worth a short Hud read-through before any metric ships as "Defined."

---

## D. AxisCare Economic Capability

### Summary

The current AxisCare integration (`lib/integrations/axiscare/`, 20+ files) covers **client identity/reconciliation, caregiver roster sync, today's visit/schedule read, applicants, ADLs, call logs, tagging, organizations.** It has **no invoice, billing, or payroll module, by explicit, documented design decision** — not an oversight, not merely "unvalidated."

- `lib/integrations/axiscare/types.ts:49-52`, on `AxisCareRawVisit`: *"Charge/billing fields are deliberately not modeled — not needed for schedule visibility, and modeling them would invite scope creep toward billing data this integration has no reason to touch."*
- `docs/architecture/AXISCARE_SERVE_CANONICAL_FACT_SOURCE_MATRIX.md:64` independently confirms: "Billing/charge fields — Not modeled by this integration at all — Explicit long-standing policy."
- The AxisCare Customer API OpenAPI spec present in this repo (`docs/integrations/axiscare/AxisCare-Customer-API-OpenAPI.yaml`) exposes only: `/api/clients`, `/api/caregivers`, `/api/contacts`, `/api/visits`, `/api/schedules`, `/api/applicants`, `/api/adls`, `/api/call-logs`, `/api/organizations`, `/api/classes/*`, `/api/taggingCategories`, `/api/referral/other`, `/api/tokens/expiring`. **No `/invoices`, `/payroll`, `/billing`, or `/payable` endpoint exists anywhere in this spec.** Scattered `billableRateMode`/`chargeRate` fields exist on the visit create/update payload, and a `payrollId` field appears twice in the schema, unexplored.

This is repo evidence about the *Customer API* as documented here — it is not proof AxisCare has no billing/payroll API at all. AxisCare is known in the industry to expose separate Billing/Finance API surfaces in some contracts; **this repo does not contain that documentation**, so its absence here cannot be read as "AxisCare cannot do this." That distinction matters and is called out explicitly in §F and §NEEDS MORE DISCOVERY below.

### Field-by-field classification

**Visit / service**

| Field | Status |
|---|---|
| Visit identifier, client, caregiver | ALREADY INGESTED (live read via `getTodaysVisitsBounded()`, not persisted historically) |
| Community/location | ALREADY INGESTED for the client roster; not yet wired to any financial object (none exists) |
| Service date, scheduled duration (`scheduledStartDate/EndDate`) | ALREADY INGESTED (ephemeral) |
| Actual/clocked duration (`startDate/endDate`, `clockIn/clockOut`) | ALREADY INGESTED (ephemeral) — this is the closest thing to "delivered duration" today |
| EVV duration, approved duration, billable duration, payable duration | NOT FOUND in the current type model or OpenAPI spec |
| Service type | ALREADY INGESTED (ephemeral) |
| Completed/cancelled status | ALREADY INGESTED (`ServeVisitStatus`, ephemeral) |

**Revenue / billing** — every field below: **NOT FOUND** in this repo's integration code, and **NOT FOUND** in this repo's copy of the AxisCare OpenAPI spec (invoice set, invoice, invoice item, visit linkage to an invoice, payer, billing date, units, rate, amount, surcharge, adjustment, credit, void, invoice status). API availability beyond this repo's spec: **UNKNOWN — requires live AxisCare API validation.**

**Caregiver payroll** — every field below: **NOT FOUND** in this repo (payroll batch, payroll item, caregiver linkage to payroll, visit linkage, payable duration, pay rate, regular pay, overtime, differentials, mileage, reimbursements, adjustments, calculated payable amount). API availability: **UNKNOWN — requires live AxisCare API validation.**

### Deepest authoritative grain currently available

- **Visit → Billable Activity → Invoice / Revenue:** the chain is broken at the first link. Visit exists (ephemerally); Billable Activity does not exist anywhere in Serve OS. **No grain deeper than "Visit exists today" is currently available for the revenue side.**
- **Visit → Payable Activity → Caregiver Payroll / Direct Labor:** same break. Visit exists (ephemerally); Payable Activity does not exist. **No grain deeper than "Visit exists today" is currently available for the labor side.**

### Viventium

`"viventium"` appears only as an enum literal (`AuthoritativeSourceSystem`, used for workforce-compliance evidence sourcing) — never as a payroll integration. The only Viventium-touching code in the repo is `scripts/collectors/viventiumEmployeeCollector.ts`, a browser-CDP DOM scraper for the recruiting pipeline (checking whether an employee record exists), which **explicitly excludes banking/tax/payroll data by design.** No Viventium API client exists. No payroll ingestion exists.

---

## E. Metric Feasibility

Gap-type key: **BD** = business-definition gap (the meaning itself is still open), **SD** = source-data gap (the data may not exist in the source system, or its existence is unconfirmed), **IG** = integration gap (the data exists in the source but Serve OS doesn't ingest it), **IM** = implementation gap (pure engineering work remains, given the above are resolved).

| # | Metric | Definition clear? | Required inputs | Available now? | Source | Missing | Implementable now? | Confidence | Gap type(s) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Service Revenue | Partially — basis choice (invoice vs. service date) and adjustment/credit/void treatment open | Invoice/invoice-item data | **No** | Would be AxisCare billing API (not present in this repo's spec) | Entire invoice ingestion; confirmation invoices are API-reachable at all | No | Low | SD + IG (+ BD on date basis) |
| 2 | Direct Caregiver Labor | Partially — compensation-component scope open | Payroll/payable data | **No** | Would be AxisCare payroll API or Viventium (neither integrated) | Entire payroll ingestion pipeline | No | Low | SD + IG (+ BD on scope) |
| 3 | Direct Service Contribution | Formula itself clear | Metrics 1 and 2 | No | — | Both inputs | No | Low | Inherits SD + IG from 1, 2 |
| 4 | Direct Labor % of Revenue | Formula and guardrail clear | Metrics 1 and 2 | No | — | Both inputs | No | Low | Inherits SD + IG |
| 5 | Revenue per Visit | Formula clear; Visit-population alignment rule clear | Metric 1 + historical Visit records | No | — | Revenue; also Visit is not persisted historically today (only "today" is readable) | No | Low | SD + IG (revenue) + IM (Visit history) |
| 6 | Direct Labor per Visit | Same as above | Metric 2 + historical Visit records | No | — | Labor; Visit history | No | Low | SD + IG + IM |
| 7 | Revenue per Delivered Care Hour | Formula clear; duration basis open (Registry §41) | Metric 1 + Delivered Care Hours | No | — | Revenue; authoritative duration basis undecided; Visit history | No | Low | SD + IG + BD + IM |
| 8 | Direct Labor per Delivered Care Hour | Same | Metric 2 + Delivered Care Hours | No | — | Labor; duration basis; Visit history | No | Low | SD + IG + BD + IM |
| 9 | Direct Contribution per Delivered Care Hour | Same | Metrics 3 and Delivered Care Hours | No | — | Everything above | No | Low | SD + IG + BD + IM |
| 10 | Active Clients | Registry marks "Defined," but per §C.1 above the Ontology never actually settles this, and the current implementation (`computed_lifecycle`) is vendor-derived, which the Ontology says it shouldn't be | Serve-owned client lifecycle rule | **Partially** — data exists (`axiscare_client_operational_state.computed_lifecycle`, joined to `residents`) but its authoritativeness is contested | AxisCare status/class → Serve computed field | A Hud decision on whether vendor-derived lifecycle is acceptable as canonical, or whether Serve-owned rules must be built first | Partially — data exists; policy question open | Medium | BD (primarily) |
| 11 | Service Revenue per Active Client | Formula clear; denominator policy explicitly "Leadership Definition Required" | Metric 1 + Active Client denominator | No | — | Revenue (blocked); denominator policy (open) | No | Low | SD + IG + BD |
| 12 | Visits per Active Client | Formula clear; denominator policy open | Historical Visit counts + Active Client | Partially — Visit exists only as a live "today" read, not historical | AxisCare visits API (already integrated for today-only reads) | Historical Visit persistence; denominator policy | Not yet, but closer than most — needs Visit history, not new source access | Medium (once Visit history exists) | IM + IG (no new source needed) + BD (denominator) |
| 13 | Community Direct Service Contribution | Formula clear | Community-attributed Revenue + Labor | No | — | Both underlying metrics; Community attribution to financial records is moot since no financial records exist | No | Low | SD + IG |
| 14 | Scheduled vs Delivered Care Hours | Formula and guardrail clear | Scheduled and actual Visit duration | **Partially** — both fields already exist in the live AxisCare read (`scheduledStart/End`, `actualStart/End` from `clockIn/clockOut`) but are not persisted historically | AxisCare visits API (already integrated) | Historical Visit persistence only — **no new source integration required** | Not yet, but the **smallest lift of all 15 metrics** | Medium-High (once Visit history exists) | IM only |
| 15 | Billable Labor vs Paid Labor | Formula and guardrail clear | Billable Care Hours + Paid Care Hours | No | — | Both — neither Billable Activity nor Payroll data exists anywhere | No | Low | SD + IG |

**Reading this table plainly:** 12 of the 15 registered metrics (everything touching Service Revenue or Direct Caregiver Labor, i.e. #1–9, #11, #13, #15) are blocked by a hard source-data/integration gap that this repository cannot resolve on its own — AxisCare's documented Customer API surface here has no invoice or payroll endpoints, and Viventium has no payroll integration at all. Only **#14 (Scheduled vs Delivered Care Hours)** and, to a lesser extent, **#12 (Visits per Active Client)** are implementable using data Serve OS can already reach, pending Visit history persistence (an engineering task, not a new integration). **#10 (Active Clients)** has data but an open, and per §C.1 substantive, definitional question.

---

## F. Open Decisions for Hud

| # | Decision | Why it matters | Options (evidence-supported) | Recommendation | Consequence per option | Blocks v0.1? |
|---|---|---|---|---|---|---|
| F.1 | **Service Revenue basis** — invoice date vs. service date; treatment of adjustments/credits/voids/surcharges | Determines what `financial.service_revenue` means, and this is currently entirely blocked upstream (§E) regardless | Cannot be meaningfully chosen without first confirming invoice data is reachable at all | No recommendation — premature until §NEEDS MORE DISCOVERY item 1 is resolved | — | **Blocks v0.1**, but is currently moot pending source-data confirmation |
| F.2 | **Revenue time basis generally** | Whether service-date attribution (Registry's stated preference) is even achievable depends on whether invoice line items carry a service date | Same as above | No recommendation | — | Blocks, moot pending discovery |
| F.3 | **Active Client period denominator, and whether vendor-derived `computed_lifecycle` is an acceptable Serve-owned Active Client definition** | This is the one metric with real data today; the Ontology conflict in §C.1 means the current implementation may not satisfy the Ontology's own stated requirement | (a) accept `computed_lifecycle` as-is for v0.1 with the vendor-dependency documented as a known limitation; (b) require a Serve-owned lifecycle rule before this metric ships as "Defined" | (a) is pragmatic for a v0.1 proof-of-architecture slice, provided the limitation is written down, not silently accepted as "canonical" | (a): fast, but risks quietly baking a vendor-label dependency into a "Defined" metric contrary to Ontology §6. (b): correct but adds real scope before any slice can ship | Can be **deferred** if (a) is chosen explicitly and documented; **blocks** if Hud wants strict Ontology compliance from the start |
| F.4 | **Delivered Care Hour definition** — which AxisCare duration field is authoritative (clocked/EVV/approved/billable/paid) | Directly determines metrics #7–9, and shapes #14 | Only "clocked duration" (`clockIn`/`clockOut`) is confirmed to exist in this repo's integration today; EVV/approved/billable/paid duration are not found | For #14 specifically (Scheduled vs Delivered), clocked duration is likely sufficient as a v0.1 "Delivered" proxy — but this is Hud's call, not an engineering default | Using clocked duration as-is: fast, but may not match what AxisCare itself considers "approved"/EVV-validated duration | Blocks #7–9; **does not have to block #14** if Hud accepts clocked duration as the v0.1 proxy |
| F.5 | **Direct Caregiver Labor scope** (which compensation components count) | Entirely blocked upstream — no payroll data exists at all | N/A until payroll/payable data is confirmed reachable | No recommendation | — | Blocks, moot pending discovery |
| F.6 | **Community attribution methodology for financial activity** | Ontology requires attribution to follow the underlying service activity, not just a caregiver's home community | Community attribution is solid for Clients/Residents today (`community_id` FK); no financial records exist yet to attribute | Defer until financial records exist to attribute in the first place | — | Does not block a non-financial v0.1 slice (e.g. #14, #12); blocks #13 |
| F.7 | **Treatment of invoice adjustments/credits/voids/surcharges** | Same as F.1 | Cannot be chosen without confirmed invoice data | No recommendation | — | Blocks, moot pending discovery |
| F.8 | **Treatment of payroll adjustments/overtime/reimbursements** | Same as F.5 | Cannot be chosen without confirmed payroll data | No recommendation | — | Blocks, moot pending discovery |
| F.9 | **Billable vs Paid Labor interpretation** (which differences are expected vs. anomalous) | This is explicitly a "Definition Refinement Required" item in the Registry itself, and is doubly blocked since neither Billable nor Paid hours exist yet | N/A until both source gaps close | No recommendation | — | Blocks, moot pending discovery |

Several of these (F.1, F.2, F.5, F.7, F.8, F.9) cannot actually be decided yet — the honest state is "there is nothing to decide until §NEEDS MORE DISCOVERY resolves whether AxisCare/Viventium can supply this data at all." Only F.3, F.4, and F.6 are decidable today with the evidence in hand.

---

## G. Proposed v0.1 Architecture

Given §B (no domain has ever actually built on `lib/intelligence/core` end-to-end) and §E (12 of 15 metrics are blocked at the source-data layer), the architecture proposal below is scoped to **what can honestly be proven now**, not the full financial spine.

### Reuse

- **Reuse the `lib/intelligence/core` types as the target shape** for Facts, Signals, Evidence, and the deterministic/narrative Explanation split — they're well-designed and match the Constitution.
- **Reuse the Recruiting domain's pattern** (`lib/recruiting/`) as the closest working precedent for a domain-owned rule table + evidence table + deterministic runner + Today's Work mapping function, since it is the only domain that has actually shipped something resembling the Constitution's intended shape end-to-end.
- **Reuse `lib/scheduling/` and `lib/integrations/axiscare/`** for Visit reads — do not build a second AxisCare client.

### New Facts (minimum, only what's genuinely needed for what's actually buildable)

| Fact type | Source | Dedup key | Payload (minimum) | Why not an existing Fact |
|---|---|---|---|---|
| `scheduling.visit_completed` (or equivalent historical Visit record) | AxisCare visits API, already integrated | `(axiscare_visit_id)` | client, caregiver, community, service date, scheduled start/end, actual start/end (clock in/out), status | No existing table persists Visit history — today's `ServeScheduleVisit` is a request-time-only projection. This is the one genuinely new persistence requirement this investigation surfaces, and it is a **Scheduling** fact, not a Financial one — Financial Intelligence would consume it, not own it. |

No new Financial-domain Fact is proposed at this time, because there is no financial source data to originate one from. Proposing a `financial.invoice_line_item_recorded`-shaped Fact today would mean inventing a payload against data nobody has confirmed exists — exactly what the Registry's §2.5 ("Unknown Is Preferable to Invented") forbids.

### Metrics

Prefer **deterministic query-time calculation** over persisted metric snapshots for v0.1 — there's no historical-trend requirement yet (no Plan/Forecast/Target data exists either), and query-time calculation keeps provenance trivially traceable back to the underlying Visit Facts without a separate reconciliation step. Revisit persisted snapshots only if/when trend-over-time or point-in-time-as-of-a-past-date requirements appear (none are in the v0.1 completion standard, §45–46 of the Registry).

### Rules / Signals

Recommend **zero new Rules for this first slice.** A Rule/Signal is for something requiring a threshold and a judgment ("58% direct labor ratio — is that concerning?"); Scheduled vs. Delivered Care Hours and Visits per Active Client are metrics, not yet Signals, and the Registry itself (§33) says a metric becoming available doesn't authorize a Rule. Any future threshold (e.g., "Delivery Rate below X% is a Signal") requires `HUD APPROVAL REQUIRED` before it ships, per the Registry's own gate.

### Executive aggregation

Do not stand up a formal `executive` domain yet. Community Intelligence's own aggregation infrastructure doesn't exist beyond hardcoded UI (§B) — there is nothing real for an Executive domain to aggregate from today, in Financial or any other domain. Less architecture is correct here per the Charter's own preference.

### Namespace check

`financial` as a namespace does not conflict with anything found in the repo (`lib/financial/` does not exist; no other domain uses that slug).

---

## H. Proposed v0.1 Vertical Slice

**The vertical slice requested — Service Revenue − Direct Caregiver Labor = Direct Service Contribution — cannot be built today from data this repository can reach.** Both sides of that equation are blocked by a confirmed source-data/integration gap (§D, §E), not merely an unresolved definition. Proposing an implementation of it now would require inventing invoice and payroll data, which the Registry's own governing principles explicitly forbid ("Unknown Is Preferable to Invented").

**What can honestly be proven now, using only data this repository can already reach:**

A v0.1 slice built around **Scheduled vs. Delivered Care Hours** (Registry metric #14), optionally paired with **Visits per Active Client** (#12), because:
- both use only Visit and (for #12) Active Client data, which already exists in some form;
- neither requires AxisCare billing or payroll access, which is the actual blocker for everything else;
- it proves the same architectural pattern the financial spine would need later (source retrieval → normalized Fact → deterministic calculation → Evidence linkage → drill-down → Community rollup where attribution is reliable) without inventing financial semantics;
- it directly exercises the one genuinely missing piece of infrastructure this investigation found (persisted Visit history), which the real financial spine will need regardless of how the AxisCare billing/payroll question resolves.

This slice would demonstrate:
- authoritative source retrieval (AxisCare visits, already integrated);
- a new, deterministic `scheduling.visit_completed`-shaped Fact, persisted for the first time;
- deterministic calculation of Delivery Rate / Visits-per-Active-Client;
- Evidence linkage back to the originating Visit records;
- drill-down to individual Visits;
- Community rollup (Community attribution is reliable for Clients/Residents today);
- reuse of `lib/intelligence/core` types as the target shape, and the Recruiting domain's pattern as precedent.

**What should explicitly NOT be included:** Service Revenue, Direct Caregiver Labor, Direct Service Contribution, Direct Labor %, or any per-Visit/per-hour metric that requires Revenue or Labor (#1–9, #11, #13, #15) — none of these can be built without first resolving the AxisCare billing/payroll question in §NEEDS MORE DISCOVERY. Building a "Direct Service Contribution" calculation today would necessarily use placeholder or estimated data, which is precisely the "approximated silently" outcome the Registry (§2.5) and the Constitution prohibit.

If Hud wants forward progress on the actual financial spine specifically, the correct parallel-track first step is not code — it's the AxisCare/Viventium capability re-investigation in §NEEDS MORE DISCOVERY, which is an access/discovery task, not an implementation task.

---

## I. Risks

| Risk | Mitigation |
|---|---|
| Duplicate financial semantics (a dashboard or AI narrative recalculates its own version of Revenue/Contribution) | Enforce that all financial figures route through one calculation module; no other file computes `service_revenue`-shaped math. Not yet at risk today since nothing computes these figures at all. |
| Duplicate intelligence architecture (Financial Intelligence reinvents its own Fact/Signal tables, repeating the drift documented in §B) | Explicitly reuse `lib/intelligence/core` types for anything Financial Intelligence does produce; if scope requires deviating, document why in the PR, don't drift silently. |
| Wrong financial grain | N/A yet — no financial grain exists to get wrong. Applies once invoice/payroll data is confirmed. |
| Mismatched time bases (invoice date vs. service date vs. payroll date) | Registry Part VIII already governs this; do not implement any ratio metric until the time basis for both numerator and denominator is explicitly documented per-metric. |
| Mismatched numerator/denominator populations | Registry §26 already governs this; the same population-alignment check the Registry describes should be a literal code-review checklist item for any new ratio metric. |
| Incorrect Community attribution | Low risk for Clients/Residents (solid `community_id` FK); high risk once/if financial records are added, since no attribution pattern for financial data exists yet — must be designed deliberately, not defaulted to "caregiver's home community." |
| Invoice/payroll timing mismatch | Not yet applicable — moot until both sources exist. |
| Invoice-level totals without Visit-level attribution | This is the most likely failure mode if AxisCare's billing API (once found) turns out to expose only invoice header totals, not line items linked to Visits — would silently produce Revenue that cannot reconcile to specific care delivery. Mitigate by treating "Visit-level attribution confirmed" as a hard go/no-go gate before shipping `financial.service_revenue`, not an optional enhancement. |
| Payroll totals without Visit-level attribution | Same risk, mirrored for the labor side. Same mitigation. |
| Treating AxisCare-calculated payroll as executed payroll | The Registry and Ontology both already flag this distinction explicitly (AxisCare operational calc vs. Viventium executed truth); carry that distinction into any UI/label the moment payroll data exists — never label an AxisCare-derived number "payroll" without qualification. |
| Confusing invoiced Revenue with collected cash | Registry §4 already states this as a known limitation; keep it visible in the UI/API response shape (e.g. a field/label that says "Invoiced," never bare "Revenue"), not just in documentation. |
| Confusing Direct Service Contribution with profit | Registry §6 and Ontology already state this; same mitigation — label discipline in the UI, not just prose. |
| Silently substituting scheduled duration for delivered duration | Directly relevant to the proposed v0.1 slice — name the field `deliveredCareHours` (sourced from `clockIn`/`clockOut`) distinctly from `scheduledCareHours`, and do not let any consumer default one to the other on missing data. |
| Incorrect treatment of cancelled/adjusted Visits | The proposed Visit Fact should carry Visit status (`ServeVisitStatus`) so any consumer can explicitly filter, rather than the Fact silently including or excluding cancelled Visits. |
| AI entering deterministic financial logic | Already structurally mitigated by the `ExplanationDeterministicCore`/`ExplanationNarrative` split, which is real and tested (§B) — use it for any explanation this domain produces, don't build a parallel one. |
| Unnecessary platform primitives | This report's own G section already recommends against any new primitive beyond one Scheduling Fact; hold that line in implementation. |
| Inability to reconstruct historical calculations after source data changes | Query-time calculation (recommended in §G) is only safe as long as no historical trend claim is made. If a later phase needs "what was Revenue as of last quarter," that requires either point-in-time Fact snapshots or a documented supersession pattern (`supersedesFactId`, already in the `HistoricalFact` type) — decide before, not after, that need arises. |

---

## J. Implementation Plan

Scoped to the v0.1 boundary proposed in §H — Scheduled vs. Delivered Care Hours (+ optionally Visits per Active Client) — not the full financial spine, which is blocked pending discovery.

| Step | Objective | Primary files/modules | Prerequisite | Expected output | Validation | Complexity |
|---|---|---|---|---|---|---|
| 1 | Confirm AxisCare billing/payroll API scope (live, outside this repo) — see §NEEDS MORE DISCOVERY | N/A — access/discovery, not code | AxisCare API credentials/docs beyond this repo's spec | A written yes/no/partial answer on invoice and payroll API availability, with Visit-linkage confirmed or denied | Manual API exploration against a real AxisCare sandbox/account | MEDIUM |
| 2 | Persist historical Visit Facts | New: a `scheduling.visit_completed`-shaped Fact table/writer; reuse `lib/integrations/axiscare/visits.ts` for reads | None | Visits durably stored, keyed by AxisCare visit id | Unit test on dedup-by-visit-id; reconciliation count check against a live AxisCare pull for a known date range | MEDIUM |
| 3 | Implement Scheduled vs. Delivered Care Hours calculation | New: `lib/intelligence/domains/financial/` or `lib/scheduling/` metrics module (naming TBD once step 1 clarifies whether this stays a Scheduling concern or becomes the first Financial Intelligence module) | Step 2 | Deterministic `scheduledCareHours`, `deliveredCareHours`, `deliveryVarianceHours`, `deliveryRate` per Client/Caregiver/Community/period, with the zero-denominator guardrail | Unit tests against known Visit fixtures; manual reconciliation against AxisCare's own reporting for a sample period | SMALL |
| 4 | Implement Visits per Active Client (optional, same slice) | Same module | Step 2, plus F.3 decision on Active Client denominator | Deterministic ratio per Community/period | Unit tests; population-alignment check per Registry §26 | SMALL |
| 5 | Drill-down surface | New minimal UI/API route exposing the calculation with links back to underlying Visit records | Steps 3–4 | A queryable view where each number can be clicked/traced to its source Visits | Manual verification that every displayed number resolves to real Visit rows | SMALL |
| 6 | Evidence linkage | Wire the calculation's output to `lib/intelligence/core`'s `Evidence`/`Explanation` types (deterministic core only, no AI narrative yet) | Steps 2–5 | Each metric value carries a real `Evidence` reference to its constituent Visit Facts | Type-check against `ExplanationDeterministicCore`; spot-check Evidence references resolve | SMALL |
| 7 | Re-run this feasibility table for metrics #1–9, #11, #13, #15 once step 1 resolves | Update `docs/intelligence/SERVE_FINANCIAL_METRIC_REGISTRY.md` status fields and this report | Step 1 | An honest, re-evaluated feasibility table — likely unblocking some, all, or none of the Revenue/Labor metrics | N/A — documentation step | SMALL |

Step 1 gates everything about the actual financial spine (Revenue, Labor, Contribution, and everything derived from them). Steps 2–6 do not depend on it and can proceed in parallel if Hud wants visible progress while step 1 is pursued.

---

## READY TO BUILD

- **Visit history persistence** (Registry metric #14's prerequisite) — the AxisCare visits API is already integrated and read-only access is already proven in production (`lib/integrations/axiscare/visits.ts`, `lib/scheduling/todaysSchedule.ts`); only the "persist it historically" piece is missing, which is a known, bounded engineering task.
- **Scheduled vs. Delivered Care Hours** (metric #14) — both required duration fields already exist in the live AxisCare read; formula and zero-denominator guardrail are already clearly specified in the Registry; no new source integration is required.
- **The `ExplanationDeterministicCore`/`ExplanationNarrative` AI boundary** — genuinely implemented and compile-time-tested; safe to build on immediately for any Explanation this or future domains produce.
- **Community attribution for Clients/Residents** — a real `community_id` FK exists and is reasonably reliable; usable for a Community rollup on any metric whose inputs are Client-attributable (e.g. #14, #12).
- **The `financial` namespace** — confirmed free of naming conflicts, ready to use whenever real Financial Intelligence code is written.
- **This investigation's own worktree** (`feature/financial-intelligence-v0.1` @ `C:/wt-financial-intelligence-v0.1`) — clean, isolated, based on current `origin/main`, ready to receive the slice from §J once Hud approves it.

## NEEDS HUD DECISION

- **F.3 — Whether vendor-derived `computed_lifecycle` is an acceptable v0.1 Active Client definition**, given the Ontology's own stated preference for Serve-owned lifecycle semantics (§C.1). This is decidable today.
- **F.4 — Whether AxisCare's clocked duration (`clockIn`/`clockOut`) is an acceptable v0.1 proxy for "Delivered Care Hours"** for metric #14 specifically, pending eventual EVV/approved-duration validation. This is decidable today.
- **F.6 — Community attribution methodology for financial activity** (follow service location vs. caregiver home community) — decidable in principle now, though it has no live consumer until financial data exists.
- **Whether to proceed with the §H slice (Scheduled vs. Delivered Care Hours) as v0.1's actual first deliverable**, given it does not prove the Revenue−Labor=Contribution relationship the original brief asked for — this is a scope decision, not an engineering one.
- **F.1, F.2, F.5, F.7, F.8, F.9** are formally open decisions per the Registry, but as noted in §F, none of them can be meaningfully decided yet — they're blocked behind the discovery item below, not ready for a policy call today.

## NEEDS MORE DISCOVERY

1. **Live AxisCare API validation for invoices and payroll**, outside this repository — this repo's copy of the AxisCare Customer API OpenAPI spec has no billing/payroll endpoints, but AxisCare is known to sometimes expose separate Billing/Finance API surfaces under different contract tiers; this repo cannot confirm or deny that. Needed: direct access to AxisCare's full API documentation (all products/tiers Serve is contracted for) or a conversation with AxisCare's API team. This is the single highest-leverage open item — it determines whether 12 of the 15 registered metrics are buildable at all.
2. **Whether AxisCare invoice/payroll data, if it exists, retains Visit-level linkage** — without this, Revenue and Labor could only ever be computed at invoice/payroll-batch grain, not reconciled to specific care delivery, which would materially weaken the "Visit as the bridge" architecture the Ontology and Charter both describe. Needed: same live API access as item 1, specifically checking for a visit-id foreign key on invoice line items and payroll items.
3. **Viventium API access** — whether Viventium exposes an API at all for executed payroll (separate from the existing recruiting-focused browser scraper, which deliberately avoids payroll data). Needed: Viventium account/API documentation access, likely from whoever manages that vendor relationship.
4. **Historical depth available from AxisCare for Visits** — once Visit history persistence is built (§J step 2), how far back can it be backfilled from AxisCare itself, versus only accumulating forward from the persistence date. Needed: a live AxisCare API check for historical visit query support (date-range parameters, pagination limits).
5. **Whether AxisCare exposes EVV/approved/billable/paid duration as distinct fields** beyond the clocked `clockIn`/`clockOut` this repo already reads — relevant to F.4 and to metrics #7–9 if the billing/payroll question in item 1 resolves favorably. Needed: same live API check.
6. **Whether `feature/governance-knowledge-engine` and the remote-only `feature/care-inquiries-os` / `hotfix/external-client-resident-conversion` branches are still wanted** (§A) — this is a project-management question for Hud, not a technical unknown, but it's unresolved from the repository alone.

---

*This report makes no business-policy decisions and initiates no Financial Intelligence implementation. The only repository changes made during this investigation were: a `git fetch` (no branch changes), reading files, and the creation of the isolated `feature/financial-intelligence-v0.1` worktree/branch requested in Phase 2, which contains zero commits beyond `origin/main`.*
