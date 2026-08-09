# Serve OS — Architecture Validation Report (Checkpoint 4)

**Date:** 2026-08-04
**Branch:** `integration/serve-os-operational-shell`
**HEAD:** `5ba5842672f5df257992195216621c2fc0595cd4`
**Scope:** Validate `SERVE_OS_CAPABILITY_CATALOG.md`, `SERVE_OS_CAPABILITY_DEPENDENCY_GRAPH.md`, `SERVE_OS_MIGRATION_DEPENDENCY_GRAPH.md`, and `sql/SERVE_OS_PENDING_MIGRATION_VALIDATION.sql` against the actual repository; execute all available non-destructive tests and builds; update Product Intelligence; produce a final evidence-based release recommendation.

**No product code, migration, database state, production branch, or sensitive asset was modified to produce this report.** All commands executed were read-only relative to the database (no query in this checkpoint touched a live database — no live Supabase connection was available or used) and non-mutating relative to the repository (`git status --short`, `git rev-parse`, `git log`, `git ls-files`, `git show <ref>:<path>` for read-only inspection, `npm run typecheck`/`lint`/`build`, and direct `node` execution of existing test files). The only files written this session are documentation: this report and an addition to `docs/product-intelligence/CAPTURE_INBOX.md`.

---

## Phase 1 — Cross-Artifact Integrity Validation

Ten checks were run against the three existing artifacts and the actual repository state.

| # | Check | Result |
|---|---|---|
| 1 | Every Capability Catalog entry appears in the Dependency Graph | Pass — all 17 IDs present in both. |
| 2 | Every graph node maps to a catalog entry or an explicit unresolved external node | Pass — the only non-catalog node is `ASK SERVE RUNTIME / BACKEND — Status: Unknown`, styled and labeled as required. |
| 3 | Every migration maps to a capability | Pass — all 10 pending migrations map to `CAP-REC-001`, `CAP-REL-SUG-001`, `CAP-RES-ID-001`, `CAP-ROSTER-001`, or `CAP-RES-DI-001`. Re-confirmed live: `git status --short supabase/migrations/` returns exactly these 10 files, matching the Migration Dependency Graph's table one-for-one. |
| 4 | Every schema dependency named in the Catalog appears in the Migration Graph | Pass, with one correction carried forward from Checkpoint 3: the `CAP-RES-DI-001` → `CAP-RES-ID-001` FK dependency and the `CAP-ROSTER-001` → `CAP-RES-DI-001` direct-import dependency are both present in the Migration Graph's dependency register. |
| 5 | Every hard dependency has concrete evidence (import, FK, or shared object) | Pass — re-verified live this checkpoint (see Phase 2 static checks below) rather than trusted from memory. |
| 6 | Release-coupling is distinguished from runtime dependency | Pass — the Capability Dependency Graph's View E uses distinct dotted vs. solid-double-line edges for this; `CAP-ASK-001`'s coupling to `CAP-PWS-001` via one shared file (`Sidebar.tsx`, already hand-split per Task B) is correctly modeled as release coupling, not a hard runtime dependency. |
| 7 | Conceptual-parallel edges are excluded from hard-dependency counts | Pass — the three evidence/inference/confirmation implementations remain in the dedicated dashed `EvidencePattern` subgraph, `classDef conceptual`, excluded from the Dependency Register's hard-dependency rows. |
| 8 | Release recommendations respect migration ordering | Pass, with the `CAP-RES-ID-001 → CAP-RES-DI-001 → CAP-ROSTER-001` ordering re-confirmed live this checkpoint (Phase 2). |
| 9 | `CAP-LOCAL-001` excluded from all release-unit totals | Pass — confirmed absent from every count and table in all three artifacts. |
| 10 | Governance conflicts stay outside runtime/migration counts | Pass — the constitution-supersession note remains a plain non-Mermaid block in the Migration Graph, not a graph node or edge. |

**Discrepancy found and corrected this checkpoint:** none of the above ten checks required a correction to the existing artifacts. One **addition gap** was found and is not a correction to existing content but a completeness gap: `scripts/importResidentSourceNotes/` (6 test files, 47 passing assertions, fully untracked) is a real, functioning module with no corresponding entry anywhere in the Capability Catalog. It was not part of the original 17-entry inventory. This is recorded as Product Intelligence entry #10 (see Phase 5) rather than silently added as an 18th capability, since its correct placement (own ID vs. folded into `CAP-RES-DI-001`) is not yet decided.

No other discrepancies were found. The three artifacts and the SQL file are internally consistent with each other and with the repository as it exists today.

---

## Phase 2 — Validation Commands Executed

### Repository safety

```
branch:              integration/serve-os-operational-shell
HEAD:                5ba5842672f5df257992195216621c2fc0595cd4
main:                6d859606f35624c2c5af0a6c63431bd62964a545
origin/main:         6d859606f35624c2c5af0a6c63431bd62964a545  (fetched fresh this checkpoint, matches)
recovery-snapshot/2026-08-05:  8d21d672f532608982ec74230ea6ae551f86cb47  (intact)
git status --short:  113 entries (34 modified, 79 untracked) — unchanged from the count recorded at the start of this checkpoint arc
```

All four reference points are intact and unchanged. No drift occurred during this checkpoint's work.

### Dependency installation state

`package.json` was read directly (not assumed). Findings, verified fresh this checkpoint:

- **`xlsx`** — absent from `package.json` (dependencies and devDependencies), absent from `package-lock.json`, absent from the project's own `node_modules`. `CAP-ROSTER-001`'s `lib/residents/roster/parseWorkbook.ts` imports it. It currently resolves at runtime **only** via a stray parent-directory install (`C:\Users\hudso\node_modules\xlsx`, outside the project), confirmed by an isolated single-file `tsc --noEmit` check that resolved the module from that path and flagged a real type error there (`no default export`) — an error that does not surface in the full-project `npm run typecheck` run at all. **This would fail to resolve on a clean CI/Netlify build.** This is a genuine, unresolved release blocker for `CAP-ROSTER-001`, not a false alarm — `parseWorkbook.test.ts` passing locally (confirmed 6/6 again this checkpoint) is not evidence it would pass on a clean machine.
- **`playwright` (bare)** — absent from `package.json` as a direct dependency; imported bare (`from "playwright"`) by 11 files under `lib/recruiting/extractors/` (`CAP-REC-001`). Verified this checkpoint: it resolves correctly and reproducibly because `@playwright/test` (the actual declared dependency, `^1.61.1`) itself depends on `playwright@1.61.1` and npm hoists it to the top level. This is **not fragile** the way `xlsx` is — it is a real, resolvable transitive dependency — but it is an **undeclared direct dependency**: if `@playwright/test`'s own dependency tree ever drops `playwright` as a direct dependency, or hoisting behavior changes, this breaks silently.
- **Every referenced npm script**: all scripts invoked in this checkpoint (`typecheck`, `lint`, `build`, `test:workforce`, `test:axiscare`) exist in `package.json` exactly as named. One **missing** script was found: `scripts/importResidentSourceNotes/__tests__/needsMerge.test.ts`'s header comment documents `npm run test:importResidentSourceNotes`, but no such script exists in `package.json`. No aggregate npm script exists for any of `CAP-ROSTER-001`, `CAP-RES-ID-001`, `CAP-RES-DI-001`, `CAP-REC-001`, `CAP-REL-SUG-001`, or `CAP-ASK-001` — every test file for these capabilities was discovered by filesystem glob and run directly via `node --experimental-strip-types --conditions=react-server <file>`, not through a registered script. This does not block testing (all files ran successfully by direct invocation) but is a real tooling gap: these capabilities have no CI-runnable aggregate command today.
- No packages were added or modified to produce any result in this report.

### Type checking

```
npm run typecheck   → exit 2, 74 error lines across 27 files
```

Every error traces to exactly one root cause: `lib/supabase/types.ts` (the generated Supabase types file) has not been regenerated to include the columns/functions/enums introduced by the 10 pending migrations. Concretely, `CAP-REC-001` code and tests reference `RecruitingLeadObservation`, `RecruitingLeadVendorIdentity`, `RecruitingLeadHumanConfirmation`, `InferenceStrength`, `ObservationVisibility`, `CollectorSourceSystem`, `CollectorMatchStatus`, and a `signal_key` field on `InferenceWithEvidence` that `types.ts` does not export; `CAP-REL-SUG-001` code references `RelationshipInteractionSuggestionType`/`Status` and a `structured_summary` field on `RelationshipTouch` that `types.ts` does not export. No error touches `CAP-ROSTER-001`, `CAP-RES-ID-001`, `CAP-RES-DI-001`, `CAP-WORK-001`, or `CAP-ASK-001` code. These are type-declaration gaps, not logic defects — the underlying runtime logic type-strips and executes correctly (see test results below), but the project will not pass a strict type-check or production build until `types.ts` is regenerated against a database that has the pending migrations applied.

### Lint

```
npm run lint   → exit 1, 1 error + 1 warning
```

- `components/auth/ResetPasswordForm.tsx:139` — `react-hooks/set-state-in-effect` error.
- `components/intake/steps/RecruitingPanel.tsx:508` — unused-variable warning.

Both are pre-existing, unrelated to any capability under assessment in this checkpoint, and identical to every prior session's baseline.

### Build

```
npm run build   → exit 1
```

Compiles successfully (`✓ Compiled successfully in 3.1s`), then fails at the TypeScript check stage with the same root cause as `typecheck`: `./app/recruiting/[id]/page.tsx:124:28 — Property 'signal_key' does not exist on type 'InferenceWithEvidence'`. **A successful build is not achievable today without either regenerating `types.ts` against the pending-migration schema or reverting the working-tree `CAP-REC-001`/`CAP-REL-SUG-001` type usages.** A future successful build must not be interpreted as proof that the pending migrations exist in production — the build only checks TypeScript against `types.ts`, never against a live database.

### Capability test suites

All commands below were re-executed fresh during this checkpoint (not carried over from prior-session memory). Every file was run via `node --experimental-strip-types --conditions=react-server <file>`.

| Capability | Command | Files | Assertions Passed | Failed | Skipped/Blocked | Notes |
|---|---|---|---|---|---|---|
| CAP-WORK-001 (Today's Work) | direct, 5 files in `lib/workspace/__tests__/` | 5 | 39/39 | 0 | 0 | Clean — no caveats. |
| CAP-ASK-001 (Ask Serve) | direct, 4 files in `lib/askServe/__tests__/` | 4 | 24/24 | 0 | 0 | Clean at the unit level; runtime/backend target remains unresolved (Phase 2 static checks below), which is a design gap, not a test failure. |
| CAP-RES-ID-001 (Resident Identity) | direct, 8 files in `lib/residents/identity/__tests__/` | 8 | 67/67 | 0 | 0 | Clean. |
| CAP-RES-DI-001 (Resident Data Integrity) | direct, 5 files in `lib/residents/dataIntegrity/__tests__/` | 5 | 32/32 | 0 | 0 | Clean. |
| CAP-ROSTER-001 (Roster Reconciliation) | direct, 6 files in `lib/residents/roster/__tests__/` | 6 | 43/43 | 0 | 0 | `parseWorkbook.test.ts` passes (6/6) but only via the fragile stray `xlsx` install — see dependency section above; not reproducible on a clean machine. |
| CAP-REL-SUG-001 (Relationship Interaction Suggestions) | direct, `suggestionEngine.test.ts` + `brief.test.ts` | 2 | 25/25 | 0 | 0 | `brief.test.ts` passes at runtime despite a real, disclosed `structured_summary` type-declaration gap (type-stripping executes the JS without type-checking it). |
| CAP-REC-001 (Recruiting Operational Understanding) | direct, 20 files across `lib/recruiting/**` + `lib/collectors/` | 20 | 171/171 | 0 | 0 | `evaluateDesiredState.test.ts` and others pass at runtime despite the disclosed `signal_key`/type-import gaps, same type-stripping caveat as above. |
| (uncatalogued) Resident Source Notes | direct, 6 files in `scripts/importResidentSourceNotes/__tests__/` | 6 | 47/47 | 0 | 0 | Not yet in the Capability Catalog — see Phase 1 and Product Intelligence entry #10. |
| CAP-WF-001 / CAP-WF-002 (production baseline) | `npm run test:workforce` | 18 | 203/203 | 0 | 0 | Registered script; already-shipped production capability, re-confirmed unaffected by the uncommitted working tree. |
| CAP-AXIS-DISC-001 (AxisCare sanitization) | `npm run test:axiscare` | 1 | 46/46 | 0 | 0 | Registered script; re-confirmed passing. |

**Total: 75 test files, 697 assertions, 100% passing, 0 failures.** No capability's test suite reports "tests exist" without also reporting a pass/fail outcome — every number above is an executed result, not an inventory count.

### Static route and import checks

- **RecruitingInbox link validity:** `components/recruiting/RecruitingInbox.tsx:77` links to `` `/recruiting/${lead.id}` ``. Confirmed target exists: `app/recruiting/[id]/page.tsx` (untracked, same-release as `RecruitingInbox.tsx`).
- **PeopleWeServeTabs route validity:** `components/peopleWeServe/PeopleWeServeTabs.tsx` links to exactly three routes — `/residents`, `/relationships`, `/external-clients` — all pre-existing, already-committed production routes. No link to any resident-identity or data-integrity route exists (confirms Product Intelligence entry #9 — no current UI integration).
- **AskServe trigger imports:** `AskServeTrigger.tsx` → `AskServeProvider.tsx` → `AskServePanel.tsx`. Full import chain traced; confirmed zero `fetch`, zero Supabase RPC call, zero API route reference anywhere in this component tree. `AskServePanel.tsx` renders `KNOWLEDGE_PROFILE_COPY`, a static import, not a network response.
- **Today's Work adapter resolution:** `lib/data/todaysWork.ts` imports only `relationships/attention.ts`, `relationships/constants.ts`, `workspace/workItem.ts`, its own `wellnessFollowUps.ts`, and `recruitingLeads.ts`. Zero imports from `CAP-RES-ID-001`, `CAP-RES-DI-001`, `CAP-ROSTER-001`, `CAP-REL-SUG-001`, or `CAP-REC-001`'s schema-bearing modules. Confirms `CAP-WORK-001`'s independence.
- **Resident stack import order:** `app/resident-data-integrity/page.tsx` imports `getIntegrityIssues`/`getIssueMemberResidentIds` from `lib/data/residentDataIntegrity` (`CAP-RES-DI-001`) **and** `getResidentsForComparison` from `lib/data/residentIdentity` (`CAP-RES-ID-001`) in the same file — confirms the dependency order is honored at the UI/data layer, not just the schema layer.
- **No sensitive-asset imports:** searched all `.ts`/`.tsx` files for references to `docs/workforce/Caregiver EMR`, `docs/workforce/Caregiver NAR`, or `data/*roster*` paths. The only match is a comment in `scripts/importWatermereRoster.ts` documenting CLI usage syntax (`--file="data/imports/..."`), not an actual import or hardcoded path. No source module imports a local sensitive asset.

### Documentation checks

- Mermaid fence/subgraph balance re-spot-checked in both graph documents — balanced.
- Migration filenames in `SERVE_OS_MIGRATION_DEPENDENCY_GRAPH.md` verified character-for-character against `git status --short supabase/migrations/` — exact match, all 10.
- `docs/architecture/sql/SERVE_OS_PENDING_MIGRATION_VALIDATION.sql` re-read in full this checkpoint: every statement is a `select` against `information_schema`, `pg_catalog`, or `pg_proc`. Zero `insert`/`update`/`delete`/`create`/`alter`/`drop` statements anywhere in the file. Confirmed read-only.
- Capability IDs used consistently across the Catalog, both graphs, and the SQL file's comments.

---

## Phase 3 — `convert_external_prospect_to_new_resident` Compatibility Analysis

This is the highest-priority engineering finding in this assessment.

| Field | Value |
|---|---|
| Current committed (production) caller | `lib/data/externalClients.ts` on `main` — calls with 14 named parameters, no `p_phone_raw`. |
| Working-tree (uncommitted) caller | `lib/data/externalClients.ts` on disk — calls with 15 named parameters, including `p_phone_raw: input.phoneRaw`. |
| Production (live-since-`20260719000000`) function signature | 14 parameters, no `p_phone_raw`. |
| Pending (`20260807000000`) function signature | 15 parameters — `p_phone_raw` inserted, **no default value**. |
| Parameter differences | Exactly one added required parameter, `p_phone_raw text`, no default. |
| Return-type differences | None found — return shape is unchanged between versions. |
| Behavior differences | The new version additionally stores/derives from `p_phone_raw`; all other logic is preserved. |
| Do default arguments preserve compatibility? | **No.** Neither version's `p_phone_raw` (new) nor any other new parameter carries a `default` clause. |

**Call resolution behavior (Postgres named-parameter RPC convention, as used by Supabase's `.rpc()`):**

- **Old caller (14 args) against new function (15 args, no default):** FAILS. Postgres cannot resolve a named-parameter call that omits a required parameter with no default — `function convert_external_prospect_to_new_resident(...) does not exist`.
- **New caller (15 args, includes `p_phone_raw`) against old function (14 args, no such parameter):** FAILS. Postgres cannot resolve a named-parameter call that supplies an unrecognized parameter name — `function convert_external_prospect_to_new_resident(...) does not exist`.
- **Additional finding:** the migration does not merely add a signature — it explicitly `DROP FUNCTION IF EXISTS ...(14-arg identity)` before creating the 15-arg version. This means there is no intermediate state where both signatures coexist. The old signature ceases to exist the instant the migration runs, regardless of whether new application code has deployed yet.

**Classification: Breaking and unsafe without transition.**

This is bidirectional and absolute — there is no caller/function pairing among the four combinations (old caller × old function, old caller × new function, new caller × old function, new caller × new function) that succeeds except the two matched pairs (old×old, new×new). There is no partial-compatibility window: because the migration drops the old signature outright, even a brief "migration applied, code not yet deployed" state breaks 100% of conversion attempts, and equally, "code deployed, migration not yet applied" breaks 100% of conversion attempts. Both deployment orderings have a hard failure window; there is no safe ordering with today's function definition.

**Required release protection recommendation: Deploy the migration and the corresponding application code in the same controlled release, with no live traffic accepted in the gap between the two steps.**

Given this project's own established discipline (Supabase migrations are applied manually, separately from Netlify's automatic code deploy on push to `main` — they are not atomically coupled by the platform), "same controlled release" requires deliberate human coordination: apply the migration and merge/deploy the code back-to-back, treating the gap as a short, deliberate maintenance window rather than assuming platform atomicity. Given External Client → Resident conversion is a low-frequency, human-initiated action (not a high-throughput path), a short coordinated window is a reasonable and proportionate mitigation.

A more robust alternative, **not implemented in this checkpoint**, would be to give `p_phone_raw` a default value (e.g., falling back to `p_phone`) so the new function accepts calls from the old caller gracefully — this would convert the incompatibility from bidirectional-breaking to backward-compatible, at the cost of the new function needing an internal `coalesce`. This is a design option to consider before this migration ships, not a decision made here.

---

## Phase 4 — Partial Migration State Analysis

For each named chain, states are ordered from "nothing applied" to "fully applied."

### Recruiting (`CAP-REC-001` — `20260726000000` / `20260728000000` / `20260730000000`)

| State | Compiles? | Runs? | Data corruption risk? | Should feature stay hidden? | Remediation |
|---|---|---|---|---|---|
| Nothing applied | No (app expects the tables) | No | None (nothing to corrupt) | Yes | Additive — apply all three in order. |
| Only `20260726` applied (foundation tables only) | No (missing `20260728`'s columns) | Partial — inserts to base columns succeed, extended-field writes fail | Low — failed writes reject, don't silently corrupt | Yes | Additive — apply `20260728`, then `20260730`. |
| `20260726`+`20260728` applied, `20260730` not | Mostly (desired-state-evaluation code fails) | Partial | Low | Yes | Additive — apply `20260730`. |
| All three applied | Yes (pending `types.ts` regeneration) | Yes | None | Ready for validation once `types.ts` regenerated | N/A |

### Resident identity (`CAP-RES-ID-001` — `20260805` / `20260806` / `20260806010000` / `20260806020000`)

| State | Compiles? | Runs? | Data corruption risk? | Should feature stay hidden? | Remediation |
|---|---|---|---|---|---|
| Nothing applied | No | No | None | Yes | Additive, in filename order. |
| Only `20260805` (core candidate tables) | Mostly | Partial — household-link features fail | Low | Yes | Additive — apply `20260806`. |
| `20260805`+`20260806`, patches not applied | Yes for base flows | Yes for base flows; `household_context` writes silently no-op or fail depending on call site | **Medium** — a caller assuming `household_context` is persisted but the column doesn't exist yet risks silent data loss depending on how the insert is constructed | Yes, until patches confirmed | Additive — apply `20260806010000` then `20260806020000`. |
| All four applied | Yes | Yes | None | Ready for validation | N/A |

### Resident intelligence chain, combined (`CAP-RES-ID-001` → `CAP-RES-DI-001` → `CAP-ROSTER-001`)

| State | Compiles? | Runs? | Data corruption risk? | Should feature stay hidden? | Remediation |
|---|---|---|---|---|---|
| RES-ID incomplete, RES-DI/ROSTER applied anyway | No — FK target missing | No — FK violation on insert | High if attempted against a live DB (constraint would simply reject inserts, so no *silent* corruption, but a hard outage of the feature) | Yes | Coordinated — RES-ID must complete first, no exception. |
| RES-ID complete, RES-DI applied, `20260807`'s `convert_external_prospect_to_new_resident` correction not yet coordinated with app code | Depends which app code is live | See Phase 3 — hard failure in both mismatched directions | **High** — every conversion attempt fails during the gap | Yes | Coordinated deployment per Phase 3. |
| RES-ID + RES-DI complete and coordinated, ROSTER not yet applied | Yes for RES-ID/RES-DI features | Yes | None for those features; ROSTER feature simply absent | ROSTER stays hidden until its own migration lands | Additive for ROSTER once the first two are stable. |
| All three complete and coordinated | Yes | Yes | None | Ready for validation | N/A |

### Relationship suggestions (`CAP-REL-SUG-001` — `20260803000000`)

| State | Compiles? | Runs? | Data corruption risk? | Should feature stay hidden? | Remediation |
|---|---|---|---|---|---|
| Not applied | No (pending `types.ts` regardless) | No | None | Yes | Additive, single migration. |
| Applied | Yes (pending `types.ts` regeneration) | Yes | None — `relationship_touches` write is a per-row `UPDATE` inside `approve_interaction_suggestion()`, triggered only by explicit future human action, not a migration-time bulk backfill (re-confirmed: this is a single, isolated migration with no dependency on any other pending migration) | Ready for validation once `types.ts` regenerated | N/A |

---

## Phase 5 — Product Intelligence Updates

**Canonical location determined:** `docs/product-intelligence/CAPTURE_INBOX.md`, committed on `main` (via commit `6d859606f35624c2c5af0a6c63431bd62964a545`), is the correct home for these entries — not `DECISION_LOG.md`, which is reserved for settled decisions with a recorded reason and result, and not a new document. `DECISION_LOG.md` remains the actively-referenced, real decision record (13 entries, 7+ cross-references confirmed in Checkpoint 2) and was not touched. Since `docs/product-intelligence/` does not exist in this branch's working tree (it exists only on `main`), it was restored into the working tree from `main` via `git show` (uncommitted, matching this session's established pattern of leaving new/updated documentation uncommitted for review) and extended with a new, clearly delineated "Architecture & Migration Findings — Checkpoint 4" section, preserving all pre-existing content unchanged.

Ten structured entries were added (nine required plus one additional completeness finding), each with finding, evidence, decision status, impact, next action, related capability IDs, and an explicit blocks-release flag. Full text is in `docs/product-intelligence/CAPTURE_INBOX.md`. Summary:

1. Three parallel evidence/inference/confirmation architectures — reconciliation not presumed. **Blocks release: No.**
2. Ask Serve runtime/backend target unresolved. **Blocks release: Yes, for `CAP-ASK-001` only.**
3. Governance authority conflict between the two constitutions. **Blocks release: No.**
4. Resident identity chain must ship as one ordered unit. **Blocks release: Yes, for releasing any of the three in isolation.**
5. `convert_external_prospect_to_new_resident` requires coordinated deployment. **Blocks release: Yes, for splitting the migration from its application code.**
6. All ten pending migrations require live-schema validation first. **Blocks release: Yes, for the five schema-bearing capabilities, until run.**
7. Package/tooling gaps, resolved per-capability. **Blocks release: Yes for `xlsx`/`CAP-ROSTER-001`; no for the other two sub-findings.**
8. Relationship Suggestions → Today's Work is future work, not current integration. **Blocks release: No.**
9. Resident identity outcomes → People We Serve is future work, not current integration. **Blocks release: No.**
10. Undocumented capability-adjacent module (`scripts/importResidentSourceNotes/`) discovered. **Blocks release: No.**

No unresolved issue was marked as a decision.

---

## Phase 6 — Final Release-Readiness Matrix and Sequence

### Release-readiness matrix

| Release Unit | Capabilities | Product Readiness | Test Status | Schema Status | Runtime Status | Primary Risk | Release Decision |
|---|---|---|---|---|---|---|---|
| Today's Work | `CAP-WORK-001` | Complete, no known gaps | 39/39 pass | None required — reads only already-production tables | No unresolved runtime dependency | Shared-file coupling with Ask Serve (`Sidebar.tsx`), already hand-split | **Ready for isolated commit** |
| Relationship Suggestions | `CAP-REL-SUG-001` | Complete | 25/25 pass | 1 migration, unvalidated against live DB | None unresolved | Live-schema state unknown (Finding 6) | **Blocked by live schema validation** |
| People We Serve Realm | `CAP-PWS-001` | Complete (navigation shell) | Covered indirectly via `residents`/`relationships`/`externalClients` suites, all passing | None — links only to pre-existing routes | None | Shared-file coupling with Ask Serve, already hand-split | **Ready for isolated commit** |
| Contextual Ask Serve | `CAP-ASK-001` | Static/placeholder UI only | 24/24 pass (unit level) | None | **Unresolved — no backend found** | No real backend exists (Finding 2) | **Blocked by runtime verification** |
| Resident Intelligence Chain | `CAP-RES-ID-001` → `CAP-RES-DI-001` → `CAP-ROSTER-001` | Complete as a set | 67+32+43 = 142/142 pass | 7 migrations, unvalidated; includes the breaking `convert_external_prospect_to_new_resident` change | None unresolved besides the migration coordination itself | `xlsx` unresolvable on clean build; live-schema state unknown; coordinated-deploy requirement for `convert_external_prospect_to_new_resident` | **Blocked by live schema validation** (and, additionally, by compatibility design for the specific function) |
| Recruiting Operational Understanding | `CAP-REC-001` | Complete | 171/171 pass | 3 migrations, unvalidated | None unresolved | `types.ts` regeneration required for a clean build; `playwright` should become an explicit dependency; live-schema state unknown | **Blocked by live schema validation** |
| AxisCare Discovery Extensions | `CAP-AXIS-DISC-001` | Tooling, not a release unit | 46/46 pass | None | None | None | **Documentation/tooling only** |
| Serve Operating Governance | `CAP-GOV-001` | Specification only | N/A | N/A | N/A | Authority conflict with `SERVE_INTELLIGENCE_CONSTITUTION.md` unresolved | **Governance decision required** |
| Serve OS Architecture Documentation | `CAP-ARCH-001` | Specification only | N/A | N/A | N/A | None blocking | **Documentation/tooling only** |
| Product Intelligence and Decision Capture | `CAP-PI-001` | Partial implementation | N/A | N/A | N/A | None blocking | **Documentation/tooling only** |
| Development Tooling Gaps | `CAP-TOOL-001` | N/A | N/A | N/A | N/A | Rides with consuming capability | **Documentation/tooling only** |
| Sensitive Local Assets | `CAP-LOCAL-001` | N/A | N/A | N/A | N/A | Must never be committed | **Local-only, never release** |

"Ready to ship" was not used anywhere in this matrix — no release unit has both a fully passing test suite **and** every required schema/runtime dependency confirmed live. The two units marked "Ready for isolated commit" (`CAP-WORK-001`, `CAP-PWS-001`) have zero schema dependency at all, so live-schema validation does not apply to them — that is a materially stronger position than "tests passed," which is why they alone earn that label.

### Final release-sequence analysis

The user's proposed Release 0–6 structure plus non-product commits is **confirmed with one explicit revision**, derived from this checkpoint's evidence:

- **Release 0 — Safety/recovery infrastructure.** Confirmed as proposed. No dependency on anything else.
- **Release 1 — Today's Work (`CAP-WORK-001`), excluding Ask Serve hunks unless resolved.** Confirmed as proposed. Zero schema dependency, 39/39 tests pass, fully isolated per Phase 2's static import trace.
- **Release 2 — Relationship Suggestions (`CAP-REL-SUG-001`), migration validation first, no claimed Today's Work integration.** Confirmed as proposed — Finding 8 explicitly reconfirms no such integration exists in code.
- **Release 3 — People We Serve Realm (`CAP-PWS-001`), Ask Serve hunks separated.** Confirmed as proposed.
- **Release 4 — Contextual Ask Serve, only after runtime/backend verified.** Confirmed as proposed — Finding 2 is exactly this gate, still open.
- **Release 5 — Resident Intelligence Chain, as one coordinated program.** Confirmed as proposed, with the ordering evidence in this report reinforcing rather than revising it: `CAP-RES-ID-001 → CAP-RES-DI-001 → CAP-ROSTER-001`, blocked until migrations are validated, the `apply_roster_new_resident` phone_raw correction is understood, `convert_external_prospect_to_new_resident` compatibility is resolved per Phase 3, and tests pass (they do, 142/142 — this is the one criterion already satisfied).
- **Release 6 — Recruiting Operational Understanding (`CAP-REC-001`).** Confirmed as proposed, detail+list route together, 3-migration chain validated, tests pass (171/171 — satisfied), browser walkthrough still required (not performed in this checkpoint — no dev server exercised).
- **Non-product commits.** Confirmed as proposed, with one addition: the `.gitignore` protective entries (`/docs/workforce/Caregiver EMR/`, `/docs/workforce/Caregiver NAR/`, `/data/`) remain a zero-risk, isolated commit ready independently of everything else, still pending the user's approval to commit as previously flagged.

**Explicit revision:** none of the ordering itself changes. The one addition is that **Finding 10** (the uncatalogued `importResidentSourceNotes` module) should be resolved — catalogued and assigned to a release unit — before Release 5 ships, since it appears to be resident-domain data-preparation tooling that may belong in the same coordinated program.

---

## Final Report Summary

**Files created:**
- `docs/architecture/SERVE_OS_ARCHITECTURE_VALIDATION_REPORT.md` (this document)

**Files updated:**
- `docs/product-intelligence/CAPTURE_INBOX.md` (restored from `main` into the working tree, extended with 10 structured findings; `README.md` also restored unchanged for context)

**Files re-validated, unchanged:** `SERVE_OS_CAPABILITY_CATALOG.md`, `SERVE_OS_CAPABILITY_DEPENDENCY_GRAPH.md`, `SERVE_OS_MIGRATION_DEPENDENCY_GRAPH.md`, `sql/SERVE_OS_PENDING_MIGRATION_VALIDATION.sql` — all four passed Phase 1's ten integrity checks with no corrections required.

**Validation commands executed:** `git status --short`, `git rev-parse` (branch/main/origin/main/recovery-snapshot), `git fetch origin main`, `git log --oneline`, `git ls-files`, `git show <ref>:<path>` (read-only), `npm run typecheck`, `npm run lint`, `npm run build`, and direct `node --experimental-strip-types --conditions=react-server` execution of 75 test files plus the two registered baseline scripts (`test:workforce`, `test:axiscare`). No live database connection was made; the SQL validation file was reviewed but not executed against production.

**Build/type/lint results:** typecheck fails (74 errors, single root cause — `types.ts` regeneration pending); lint fails (1 pre-existing, unrelated error + 1 warning); build fails at the type-check stage (same root cause as typecheck).

**Test results by capability:** 75 files, 697 assertions, 100% passing, 0 failures, across all 10 capability groups plus the 2 production baseline scripts. Full table in Phase 2.

**Corrected catalog/graph findings:** none required correction. One completeness gap found (uncatalogued `importResidentSourceNotes` module) and recorded as a Product Intelligence entry, not silently folded into the catalog.

**Final hard-dependency and release-coupling counts:** unchanged from Checkpoint 3 — re-confirmed, not recomputed, since no new hard dependency or coupling edge was discovered this checkpoint.

**Migration risk totals:** unchanged and re-confirmed — M1=5, M2=2, M3=1, M4=2, 10 total pending, all untracked, exact filename match against the live working tree.

**`convert_external_prospect_to_new_resident` compatibility conclusion:** Breaking and unsafe without transition, bidirectionally, with no safe deployment ordering under the migration's current `DROP FUNCTION` design. Required protection: deploy migration and application code together in one coordinated release window.

**Product Intelligence entries added:** 10, in `docs/product-intelligence/CAPTURE_INBOX.md`.

**Final release-readiness matrix:** in Phase 6.

**Final recommended release sequence:** the user's proposed Release 0–6 structure, confirmed with one addition (catalog and place `importResidentSourceNotes` before Release 5).

**Confirmation:** no product code, migration, database state, production branch, or sensitive asset was modified in the course of this checkpoint. All work product is documentation, written to the working tree, uncommitted.

---

## Recommended Next Engineering Scope

**`CAP-WORK-001` (Today's Work Continuity) is the recommended next implementation scope.**

Justified against the six required criteria:

- **Dependency count:** Zero hard schema or runtime dependencies of any kind — confirmed twice, in Checkpoint 3 and again independently in this checkpoint's Phase 2 static import trace of `lib/data/todaysWork.ts`. Its only coupling is a release-coupling (not hard) relationship with `CAP-ASK-001` via one already-hand-split shared file.
- **Schema risk:** None. `CAP-WORK-001` requires zero pending migrations — it reads exclusively from tables and modules already live in production.
- **Test status:** 39/39 assertions passing, with zero caveats of any kind — the only capability in this entire assessment with a fully clean result and no flagged fragility, unlike `CAP-ROSTER-001` (fragile `xlsx` resolution), `CAP-REL-SUG-001`/`CAP-REC-001` (type-declaration gaps papered over by type-stripping), or `CAP-ASK-001` (unresolved backend).
- **User value:** Delivers a working, navigable "what should I do today" surface — the anchor of the approved navigation model's TODAY realm.
- **Isolation from unresolved runtime dependencies:** Complete. It has no dependency on the unresolved Ask Serve backend, no dependency on any of the ten unvalidated pending migrations, and no dependency on the unresolved governance question.
- **Rollback simplicity:** Trivial — a single, self-contained capability with no schema change to roll back and no coordinated multi-capability sequencing to unwind.

`CAP-REL-SUG-001` was the next-strongest candidate — also clean-testing (25/25) and low product risk — but it carries a real migration-validation gate (Finding 6) that `CAP-WORK-001` does not have at all. Since `CAP-WORK-001` requires no schema validation step whatsoever, it is strictly safer to begin immediately, and is the confirmed (not merely accepted) answer to the hinted comparison between the two.
