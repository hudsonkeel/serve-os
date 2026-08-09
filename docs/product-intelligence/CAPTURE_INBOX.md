# Capture Inbox

Unsorted, one line each. No priority order implied. See
[`README.md`](./README.md) — this is capture only, not triage.

- Hiring Pipeline next-action workflow
- Candidate-to-onboarding transition
- Candidate-not-hired / archive workflow
- Clearer Workforce return navigation from Hiring Pipeline
- Viventium API and E-Verify synchronization
- Intake-to-Serve-OS workflow
- Assessment-to-AxisCare prospect creation
- Search / favicon branding
- Organizational learning loop
- Digital compatriots
- External 55+ community relationship management
- Marketing intelligence
- Centered Care data collaboration
- PCP / NP / VBC / ISL collaboration
- Cross-community learning
- Full Product Intelligence operating system

---

## Architecture & Migration Findings — Checkpoint 4 (2026-08-04)

Structured entries captured during the Serve OS working-tree recovery and
release-readiness assessment (`docs/architecture/SERVE_OS_ARCHITECTURE_VALIDATION_REPORT.md`).
These are findings and open questions, not settled decisions — capture only,
per this document's own operating principle. Each blocks release only where
stated explicitly.

### 1. Three parallel evidence/inference/confirmation architectures — reconciliation not yet decided
- **Finding:** `lib/intelligence/core` (abstract, committed, never persisted), Workforce's Human Attestation (`CAP-WF-002`, shipped to production), and Recruiting's Operational Understanding engine (`CAP-REC-001`, uncommitted) independently implement a structurally parallel evidence/inference/confirmation pattern. None imports from either other.
- **Evidence:** Verified via import graph — zero cross-references among the three found across the full repository.
- **Decision status:** Unresolved. Do not presume consolidation onto `lib/intelligence/core` is the correct outcome — a shared philosophy is not a runtime dependency.
- **Impact:** No release blocker today; each implementation is independently functional. A future consolidation, if pursued, is a deliberate architecture project, not a side effect of any single capability's release.
- **Next action:** A dedicated architecture review to decide whether/how to converge, once at least two of the three have run in production long enough to know what the shared abstraction should actually look like.
- **Related capabilities:** `CAP-WF-002`, `CAP-REC-001`, and the (uncatalogued) `lib/intelligence/core` module.
- **Blocks release:** No.

### 2. Ask Serve's runtime/backend target is unresolved
- **Finding:** No migration, API route, or external SDK import was found anywhere in the repository that `AskServePanel`/`AskServeProvider` call into. `lib/askServe/featureFlag.ts` is a pure role-check with no network call. The panel renders static `KNOWLEDGE_PROFILE_COPY` content client-side.
- **Evidence:** Full import trace of `components/askServe/*` and `lib/askServe/*`; confirmed no `fetch`, no Supabase RPC call, no route handler exists behind the trigger.
- **Decision status:** Unresolved — modeled explicitly as an unresolved node in the dependency graph, not fabricated.
- **Impact:** `CAP-ASK-001` cannot be released as a functioning product feature until a real backend exists; it can ship today only as static/placeholder UI, or be excluded from a release entirely.
- **Next action:** Product/engineering decision on what Ask Serve's backend actually is before any release includes it as a working feature.
- **Related capabilities:** `CAP-ASK-001`.
- **Blocks release:** Yes — blocks `CAP-ASK-001` specifically; does not block any capability that does not depend on it (confirmed `CAP-WORK-001` has no dependency on `CAP-ASK-001` beyond one shared file).

### 3. Governance authority conflict between two constitutions
- **Finding:** `docs/THE_SERVE_OPERATING_CONSTITUTION.md` (uncommitted) potentially supersedes or absorbs `docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md` (modified, pre-existing). Which document holds authority is undecided.
- **Evidence:** Both files read in full; no cross-reference in either declares the other superseded.
- **Decision status:** Unresolved. Modeled as a governance-authority relationship, explicitly kept out of the software/runtime/migration dependency graphs.
- **Impact:** No runtime or release impact. Affects which document engineering should treat as authoritative going forward.
- **Next action:** A governance decision (not an engineering one) on which document is canonical, or how they merge.
- **Related capabilities:** `CAP-GOV-001`.
- **Blocks release:** No.

### 4. Resident identity chain must ship as one ordered unit
- **Finding:** `CAP-RES-ID-001 → CAP-RES-DI-001 → CAP-ROSTER-001` is a strict dependency order, not three independently releasable capabilities. `resident_data_integrity_issues` has a hard FK on `resident_identity_candidates`; `CAP-ROSTER-001`'s `scripts/importWatermereRoster.ts` directly imports `createIntegrityIssues`, `computeFingerprint`, `detectMalformedPhone`, `validatePhoneForStorage` from `CAP-RES-DI-001`.
- **Evidence:** FK read directly from `20260807000000_create_resident_data_integrity.sql`; import list confirmed in `scripts/importWatermereRoster.ts`.
- **Decision status:** Confirmed finding, reverses the earlier wave-grouping assumption that paired Roster+DataIntegrity while treating Identity separately.
- **Impact:** These three capabilities must be planned, migrated, and released together, in this order.
- **Next action:** Treat as one release unit (Release 5 in the proposed sequence) in all future planning.
- **Related capabilities:** `CAP-RES-ID-001`, `CAP-RES-DI-001`, `CAP-ROSTER-001`.
- **Blocks release:** Yes — blocks releasing any one of the three in isolation from the other two.

### 5. `convert_external_prospect_to_new_resident` requires coordinated deployment
- **Finding:** This function is live in production (14-arg signature, `20260719000000`). The pending `20260807000000` migration drops it and recreates it with a required 15th parameter (`p_phone_raw`, no default). Both the old committed caller and the new working-tree caller use Supabase's named-parameter RPC convention. Neither caller can call the other version's signature — Postgres named-parameter resolution fails outright in both directions when a required parameter is missing or unrecognized.
- **Evidence:** Full function bodies read for both versions; both `lib/data/externalClients.ts` call sites (committed vs. working-tree) diffed directly.
- **Decision status:** Confirmed — see the dedicated compatibility analysis in `SERVE_OS_ARCHITECTURE_VALIDATION_REPORT.md` (Phase 3) for the full bidirectional-incompatibility classification and required release protection.
- **Impact:** A migration-only or code-only deploy (in either order) breaks every External Client → Resident conversion attempt during the gap between the two.
- **Next action:** Apply the migration and deploy the corresponding application code in the same coordinated release window; do not split them.
- **Related capabilities:** `CAP-RES-DI-001`, `CAP-ROSTER-001` (shares the same corrective-migration file).
- **Blocks release:** Yes — blocks releasing `20260807000000` or its application code independently of the other.

### 6. All ten pending migrations require live-schema validation before any schema-bearing release
- **Finding:** Ten migrations exist only in the working tree (`20260726000000` through `20260807000000`). Their actual live-database application state (fully applied / partially applied / not applied) is unknown from the repository alone.
- **Evidence:** `docs/architecture/sql/SERVE_OS_PENDING_MIGRATION_VALIDATION.sql` — read-only validation queries, not yet executed against the live database in this checkpoint.
- **Decision status:** Unresolved pending live query execution — explicitly not assumed either way.
- **Impact:** Any schema-bearing release (`CAP-REC-001`, `CAP-REL-SUG-001`, the resident identity chain) must confirm actual live state first, especially the two highest-stakes checks (§3b/§5b — live signatures of `apply_roster_new_resident` and `convert_external_prospect_to_new_resident`).
- **Next action:** Run `docs/architecture/sql/SERVE_OS_PENDING_MIGRATION_VALIDATION.sql` against the live Supabase project before applying any of the ten pending migrations.
- **Related capabilities:** `CAP-REC-001`, `CAP-REL-SUG-001`, `CAP-RES-ID-001`, `CAP-RES-DI-001`, `CAP-ROSTER-001`.
- **Blocks release:** Yes — blocks all five listed capabilities until run.

### 7. Package/tooling gaps, resolved per-capability rather than as detached cleanup
- **Finding (a):** `xlsx` is used by `CAP-ROSTER-001`'s `lib/residents/roster/parseWorkbook.ts` but is absent from `package.json`, `package-lock.json`, and the project's own `node_modules`. It currently resolves only via a stray parent-directory install (`C:\Users\hudso\node_modules\xlsx`) — this would fail to resolve on a clean CI/Netlify build.
- **Finding (b):** `CAP-REC-001`'s Apploi/Viventium extractors import bare `"playwright"`, which is undeclared in `package.json` — it currently resolves only because `@playwright/test` (the declared dependency) itself depends on `playwright` and npm hoists it. Reproducible today, but an implicit transitive dependency, not a declared one.
- **Finding (c):** `scripts/importResidentSourceNotes/__tests__/needsMerge.test.ts` documents `npm run test:importResidentSourceNotes` in its header comment, but no such script exists in `package.json`.
- **Decision status:** Confirmed gaps, not yet fixed (fixing is implementation, out of scope for this checkpoint).
- **Impact:** (a) is a real release blocker for `CAP-ROSTER-001` — it will not build/run correctly on a clean machine. (b) is low-severity but should be made explicit. (c) is a documentation/tooling-hygiene gap.
- **Next action:** Add `xlsx` as a direct dependency before releasing `CAP-ROSTER-001`; add `playwright` as an explicit direct dependency before releasing `CAP-REC-001`; either add the missing script or correct the comment for the resident-source-notes tests.
- **Related capabilities:** `CAP-ROSTER-001`, `CAP-REC-001`, `CAP-TOOL-001`.
- **Blocks release:** Yes for (a) specifically; no for (b) and (c), though both should be fixed alongside their capability's release.

### 8. Relationship Suggestions → Today's Work is future work, not current integration
- **Finding:** No code wires `CAP-REL-SUG-001` (`relationship_interaction_suggestions`) into `CAP-WORK-001` (Today's Work). `lib/data/todaysWork.ts` imports only `relationships/attention.ts`, `relationships/constants.ts`, its own `wellnessFollowUps.ts`, and the existing `recruitingLeads.ts` list.
- **Evidence:** Full import list of `lib/data/todaysWork.ts` read directly; confirmed no import of any `CAP-REL-SUG-001` module.
- **Decision status:** Confirmed absence of integration — corrects an earlier narrative assumption that these were already connected.
- **Impact:** `CAP-WORK-001` can release fully independently of `CAP-REL-SUG-001`'s schema/migration status.
- **Next action:** If/when Relationship Suggestions should surface inside Today's Work, that is new, separately scoped product work — not assumed or scheduled here.
- **Related capabilities:** `CAP-WORK-001`, `CAP-REL-SUG-001`.
- **Blocks release:** No.

### 9. Resident identity outcomes → People We Serve is future work, not current integration
- **Finding:** No code wires `CAP-RES-ID-001` (identity resolution outcomes) into `CAP-PWS-001` (People We Serve realm navigation). `PeopleWeServeTabs.tsx` links only to the three pre-existing, already-committed routes (`/residents`, `/relationships`, `/external-clients`).
- **Evidence:** `components/peopleWeServe/PeopleWeServeTabs.tsx` read in full; its `VIEWS` array contains exactly those three static routes.
- **Decision status:** Confirmed absence of integration — corrects the same earlier narrative assumption as item 8.
- **Impact:** `CAP-PWS-001` can release independently of the resident identity chain's schema/migration status.
- **Next action:** Surfacing identity-resolution outcomes inside People We Serve is future product work, to be scoped separately.
- **Related capabilities:** `CAP-PWS-001`, `CAP-RES-ID-001`.
- **Blocks release:** No.

### 10. Undocumented capability-adjacent module discovered: resident source-notes import/merge
- **Finding:** `scripts/importResidentSourceNotes/` (6 test files, 47 passing assertions) is a fully-formed, untracked module for merging externally-sourced resident notes into Current Needs (append-only dedup). It does not appear anywhere in `SERVE_OS_CAPABILITY_CATALOG.md`'s 17 entries.
- **Evidence:** Discovered via full test-file inventory during Checkpoint 4 validation; confirmed untracked via `git status`.
- **Decision status:** Unresolved — needs either its own capability entry or explicit folding into `CAP-RES-DI-001`/`CAP-ROSTER-001` as a sub-component. Not decided here.
- **Impact:** The Capability Catalog is incomplete without it; no release-blocking impact until it is wired into a UI or server action (none found yet).
- **Next action:** Catalog this module explicitly in the next Capability Catalog revision.
- **Related capabilities:** Likely `CAP-RES-DI-001` or a new ID — undecided.
- **Blocks release:** No.
