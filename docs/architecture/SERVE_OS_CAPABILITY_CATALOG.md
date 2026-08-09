# Serve OS Capability Catalog

**Status:** Canonical inventory. Generated from direct repository inspection
(imports, routes, migrations, tests, scripts) against the working tree at
`integration/serve-os-operational-shell` @ `5ba5842672f5df257992195216621c2fc0595cd4`,
with production baseline `main` @ `6d859606f35624c2c5af0a6c63431bd62964a545`.

**How to read this document:** Every capability has one canonical ID and
name, used identically in this catalog, the Capability Dependency Graph,
and the Migration Dependency Graph. Where I could not find direct evidence
for a field, it is marked `Unknown — verification required` rather than
inferred. This document describes what exists today — implemented,
partially implemented, or specified — not a proposed redesign.

**Governing note on parallel architectures:** Three capabilities in this
catalog independently implement structurally similar "evidence / inference
/ human confirmation" patterns: `lib/intelligence/core/` (the abstract,
committed, never-persisted canonical design), `CAP-WF-002` (Workforce Human
Attestation, shipped), and `CAP-REC-001` (Recruiting Operational
Understanding, uncommitted). These are recorded as **conceptually
parallel, not yet reconciled** — this catalog does not assume or recommend
consolidation onto any one of them. That is a product decision, not a
documentation one.

---

## Summary Table

| ID | Capability | Class | Maturity | Production Status | Primary Route / Entry Point | Database Dependency | Release Unit |
|---|---|---|---|---|---|---|---|
| CAP-NAV-001 | Serve OS Navigation Shell | Platform Foundation | Production | Live | `components/Sidebar.tsx` | none | shipped |
| CAP-WF-001 | Workforce Employee Record Audit & Attention-Driven Operations | Operational Product | Production | Live | `/workforce` | `workforce_members`, `person_*`, `workforce_compliance_actions` | shipped |
| CAP-WF-002 | Human Attestation & Evidence Assurance | Operational Product | Production | Live | `/workforce/[id]` (Verify From Source) | `person_evidence` (extended) | shipped |
| CAP-PI-001 | Product Intelligence and Decision Capture | Governance or Architecture Documentation | Partial Implementation | Live (partially) | `DECISION_LOG.md` / `docs/product-intelligence/` | none | shipped (partial) |
| CAP-PWS-001 | People We Serve Realm Navigation | Platform Foundation | Implemented, Validation Required | Not deployed | `/residents`, `/relationships*`, `/external-clients` | none | Wave 1 (candidate) |
| CAP-WORK-001 | Today's Work Continuity | Platform Foundation | Implemented, Validation Required | Not deployed | `/workspace` | `resident_wellness_follow_ups` (existing) | Wave 2 (candidate) |
| CAP-ASK-001 | Contextual Ask Serve | Operational Product | Partial Implementation | Not deployed | layout-level (`AskServeProvider`) + per-page triggers | Unknown — verification required | Wave 1 (candidate) |
| CAP-REC-001 | Recruiting Operational Understanding & Hiring Pipeline Detail | Operational Product | Implemented, Validation Required | Not deployed | `/recruiting/[id]` | `recruiting_lead_collector_runs`, `recruiting_lead_observations`, `recruiting_lead_desired_state_evaluations` (+evidence) | Wave 5 (candidate) |
| CAP-RES-ID-001 | Resident Identity Resolution | Platform Foundation | Implemented, Validation Required | Not deployed | `/resident-identities` | `resident_identity_candidates` (+4 tables) | Wave 4 (candidate) |
| CAP-RES-DI-001 | Resident Data Integrity | Operational Product | Implemented, Validation Required | Not deployed | `/resident-data-integrity` | `resident_data_integrity_issues` (+2 tables) | Wave 3 (candidate) |
| CAP-ROSTER-001 | Roster Reconciliation | Operational Product | Implemented, Validation Required | Not deployed | none (script-driven: `importWatermereRoster.ts`) | `roster_import_runs` (+3 tables) | Wave 3 (candidate) |
| CAP-REL-SUG-001 | Relationship Interaction Suggestions | Operational Product | Implemented, Validation Required | Not deployed | `/relationships/[id]` (embedded panel) | `relationship_interaction_suggestions` | Wave 2 (candidate) |
| CAP-AXIS-DISC-001 | AxisCare Discovery Extensions | Integration or Discovery Tooling | Discovery Only | Not deployed | `npm run axiscare:discover` (script only) | none | not a release unit (tooling) |
| CAP-GOV-001 | Serve Operating Governance | Governance or Architecture Documentation | Specification Only | Partially live | `docs/THE_SERVE_OPERATING_CONSTITUTION.md` | none | not a release unit (docs) |
| CAP-ARCH-001 | Serve OS Architecture Documentation | Governance or Architecture Documentation | Specification Only | Partially live | `docs/architecture/*`, `docs/intelligence/*` | none | not a release unit (docs) |
| CAP-LOCAL-001 | Sensitive Local Assets | Sensitive Local Asset | Local Only | N/A | N/A (gitignored) | none | **excluded from all release units** |
| CAP-TOOL-001 | Development Tooling Gaps | Development Tooling | Partial Implementation | Live (partially) | `package.json` | none | rides with whichever capability's scripts it restores |

17 canonical entries. `CAP-LOCAL-001` is a data-classification record, not a software capability — it is never counted in release-wave capability totals.

---

## CAP-NAV-001 — Serve OS Navigation Shell

### Identity
- **Canonical name:** Serve OS Navigation Shell
- **Short description:** The primary left sidebar and its section/label model — Today, Serve, Understand, Coming Soon, plus a bottom utility area.
- **Primary class:** Platform Foundation
- **Maturity:** Production
- **Product owner:** Unknown — verification required (no owner documented in-repo)
- **Operational users:** All authenticated Serve OS users

### Product surface
- **Routes:** none of its own — renders on every authenticated page via `PageContainer`
- **Navigation entry points:** N/A (it is the navigation)
- **Major components:** `components/Sidebar.tsx`, `components/PageContainer.tsx`
- **Primary workflows:** route highlighting (`isActive`), section grouping, sign-out/user display
- **Visible localhost behavior:** Today's Work / The People We Serve / Workforce / How We're Doing / Community Outlook / Communications (dimmed) / Ask Serve / Settings
- **Visible production behavior:** identical — this *is* the current production shell as of `6d85960`
- **Difference between localhost and production:** none (working tree's Sidebar.tsx is currently dirty with an *unrelated, uncommitted* redesign — see `CAP-PWS-001` — but the committed, production version is what's live)

### Implementation
- **Source directories/files:** `components/Sidebar.tsx`, `components/PageContainer.tsx`
- **Server actions:** none
- **Data-access modules:** none
- **Shared libraries:** `lib/auth/display.ts` (`CurrentUserDisplay`)
- **Scripts:** none
- **Feature flags:** none
- **Required env vars:** none
- **External services:** none
- **Tests:** none found
- **Test commands:** N/A

### Data and schema
None. No tables, RPCs, or migrations.

### Dependencies
- **Hard runtime dependencies:** `lib/auth/session.ts` (`getCurrentAuthorizedUser`) for the user display block
- **Schema dependencies:** none
- **Navigation dependencies:** every top-level route it links to must exist (`/workspace`, `/residents`, `/workforce`, `/`, `/community-intelligence`, `/ask-serve`, `/settings`) — all confirmed present on `main`
- **Shared-code dependencies:** none
- **Operational dependencies:** none
- **Optional/future dependencies:** `components/workforce/WorkforceSubNav.tsx` pattern (reusable sub-nav) — not a dependency of this capability, but this capability established the visual language it reuses

### Readiness
- **Complete:** yes, as shipped
- **Incomplete:** N/A
- **Blocking conditions:** none
- **Validation required:** none
- **Known defects:** none
- **Product decisions needed:** none
- **Migration risk:** none
- **Rollback considerations:** trivial (single-file revert)
- **Recommended release wave:** shipped

### Evidence
- `git show main:components/Sidebar.tsx` — confirmed live content
- `DECISION_LOG.md`'s navigation-shell entry (appended `5ba5842`)

---

## CAP-WF-001 — Workforce Employee Record Audit & Attention-Driven Operations

### Identity
- **Canonical name:** Workforce Employee Record Audit & Attention-Driven Operations
- **Short description:** The Texas HCSSA-audit-ready workforce compliance product — attention states, requirement resolution playbooks, lifecycle-aware roster, dashboard.
- **Primary class:** Operational Product
- **Maturity:** Production
- **Operational users:** Operations/HR staff (Elizabeth persona from prior design work), auditors

### Product surface
- **Routes:** `/workforce`, `/workforce/[id]`, `/workforce/identity-review`, `/workforce/import`
- **Navigation entry points:** `CAP-NAV-001`'s Sidebar "Workforce" item; `components/workforce/WorkforceSubNav.tsx` (Overview/Hiring Pipeline/Onboarding/Active/Inactive/Terminated/Identity Review)
- **Major components:** `WorkforceRosterTable`, `WorkforceAttentionDashboard`, `RequirementResolutionCard`, `EmployeeSummaryPanel`, `EmployeeRecordAuditSection`
- **Primary workflows:** roster review, requirement drill-down, evidence upload/verify, compliance-action resolution
- **Visible localhost/production behavior:** identical — production feature

### Implementation
- **Source directories:** `app/workforce/`, `components/workforce/` (23 files), `lib/workforce/` (26 files), `lib/actions/workforce.ts`, `lib/compliance/`
- **Server actions:** `lib/actions/workforce.ts` (uploadWorkforceDocument, verifyWorkforceEvidence, rejectWorkforceEvidence, supersedeWorkforceEvidence, resolveWorkforceComplianceActionAction, triggerAxisCareCaregiverSync, etc.)
- **Data-access modules:** `lib/data/{personDocuments,personEvidence,personRequirements,personVendorIdentityLinks,workforceActivity,workforceCommunityMemberships,workforceComplianceActions,workforceMembers,workforceProfileChanges,workforceProfileDiscrepancies,communities}.ts`
- **Shared libraries:** `lib/compliance/requirementSetStatus.ts` (the platform-level, domain-agnostic evaluator)
- **Scripts:** `scripts/workforce-sync-caregivers.ts` (`npm run workforce:sync-caregivers`)
- **Feature flags:** `AXISCARE_WORKFORCE_ENABLED` (server-only, default disabled)
- **Required env vars:** `AXISCARE_API_TOKEN`, `AXISCARE_SITE_NUMBER`, `AXISCARE_API_VERSION`, `AXISCARE_API_BASE_URL`, `AXISCARE_WORKFORCE_ENABLED`
- **External services:** AxisCare (caregiver sync, read-only)
- **Tests:** `lib/workforce/__tests__/` (16 files), `lib/compliance/__tests__/requirementSetStatus.test.ts` — `npm run test:workforce` (219 assertions, last confirmed passing pre-merge)
- **Test commands:** `npm run test:workforce`

### Data and schema
- **Tables:** `workforce_members`, `person_vendor_identity_links`, `person_requirements`, `requirement_sets`, `requirement_set_members`, `person_documents`, `person_evidence`, `workforce_activity`, `workforce_axiscare_sync_runs`, `communities`, `workforce_community_memberships`, `workforce_profile_changes`, `workforce_profile_discrepancies`, `workforce_compliance_actions`
- **RPCs:** confirm/reject/defer identity link functions, evidence lifecycle transitions, compliance-action sync/resolve functions — see individual migrations
- **Migrations (all committed, on `main`):** `20260802000000` through `20260815000000` (9 migrations) — see `CAP-WF-002` for the 10th
- **Generated type status:** `lib/supabase/types.ts` current and committed

### Dependencies
- **Hard runtime dependencies:** `lib/compliance/requirementSetStatus.ts`, `lib/auth/session.ts`
- **Schema dependencies:** all 9 migrations above must be applied — **confirmed applied** (already-shipped production feature; `main` builds and this feature has been live since before this thread's later tasks)
- **Navigation dependencies:** `CAP-NAV-001`
- **Shared-code dependencies:** `lib/integrations/axiscare/caregivers.ts`, `config.ts`
- **Operational dependencies:** AxisCare credential configuration
- **Optional/future dependencies:** none

### Readiness
Complete and live. No open items.

### Evidence
`main` route build output; `DECISION_LOG.md`; prior session's isolated-worktree verification (219/219 workforce tests, clean build) before merge.

---

## CAP-WF-002 — Human Attestation & Evidence Assurance

### Identity
- **Canonical name:** Human Attestation & Evidence Assurance
- **Short description:** "Verify From Source" — an authorized person records a personally-reviewed authoritative-source check as full-provenance evidence, with a deterministic Evidence Assurance vocabulary layered on the unmodified evaluator.
- **Primary class:** Operational Product
- **Secondary tag:** Platform Foundation (evidence/provenance pattern — see governing note at top of document)
- **Maturity:** Production

### Product surface
- **Routes:** `/workforce/[id]` (embedded, not a separate route)
- **Major components:** `HumanAttestationDialog`, `RequirementResolutionCard` (extended)
- **Primary workflows:** select authoritative source → verification method → observed result → record; evidence resolves to verified/rejected immediately

### Implementation
- **Source:** `components/workforce/HumanAttestationDialog.tsx`, `lib/workforce/{humanAttestation,evidenceAssurance}.ts`, extensions to `lib/actions/workforce.ts` and `lib/data/personEvidence.ts`
- **Tests:** `lib/workforce/__tests__/{humanAttestation,evidenceAssurance}.test.ts`
- **Test commands:** `npm run test:workforce` (included)

### Data and schema
- **Columns added to `person_evidence`:** `authoritative_source_system`, `collection_method`, `verification_method`, `attestation_result`, `external_reference`
- **Constraint changes:** loosened `person_evidence_verification_fields_check` (additive — permits but doesn't require verifier fields on rejected rows)
- **Migration:** `20260817000000_add_human_attestation.sql` — **confirmed applied** (shipped, production)

### Dependencies
- **Hard runtime dependencies:** `CAP-WF-001`'s evaluator (`lib/compliance/requirementSetStatus.ts`) — explicitly unmodified by this capability
- **Schema dependencies:** `20260817000000` — confirmed applied
- **Conceptual (non-runtime) parallels:** `lib/intelligence/core/`'s Evidence/Signal types, `CAP-REC-001`'s observation/inference vocabulary — **no import relationship exists in either direction**; recorded as parallel philosophy only, per governing note

### Readiness
Complete and live.

### Evidence
`supabase/migrations/20260817000000_add_human_attestation.sql` on `main`; prior session's test run (humanAttestation.test.ts, evidenceAssurance.test.ts both passing).

---

## CAP-PI-001 — Product Intelligence and Decision Capture

### Identity
- **Canonical name:** Product Intelligence and Decision Capture
- **Short description:** Two-tier capability: an actively-used, production decision log, plus a newly-created, unimplemented placeholder for a future broader "Product Intelligence" system.
- **Primary class:** Governance or Architecture Documentation
- **Maturity:** **Partial Implementation** — verified, not assumed (see below)

### Maturity verification
This entry required explicit re-verification per your correction. Evidence:
- `DECISION_LOG.md`: 277 lines, 13 recorded decisions dated from 2026-06-28 through this thread's own navigation-shell decision (`5ba5842`), referenced from `ARCHITECTURE.md`, `README.md`, `CURRENT_STATUS.md`, `VISION.md`, `SERVE_BUILD_CONTEXT.md`, `MILESTONES.md`, `CHANGELOG.md`, and `components/Sidebar.tsx`'s own comments — a genuinely **live, in-use, Production** convention, not aspirational.
- `docs/product-intelligence/{README.md,CAPTURE_INBOX.md}`: committed on `main` (`6d85960`), 21-line inbox, no engine, no schema, no automation, explicitly self-described as "nothing built" — **Specification Only**.

**Conclusion:** the capability is correctly labeled Partial Implementation overall — the practice (decision capture) is real and Production; the system (a unified Product Intelligence operating system spanning ideas/problems/decisions/releases) does not exist yet.

### Product surface
- **Entry points:** `DECISION_LOG.md` (append-only, manual), `docs/product-intelligence/CAPTURE_INBOX.md` (manual, unsorted)
- **Visible behavior:** no UI — both are plain markdown files edited directly

### Implementation
No code. Documentation-only. No tests apply.

### Data and schema
None.

### Dependencies
- **Hard runtime dependencies:** none
- **Conceptual parallels:** none claimed

### Readiness
- **Complete:** the decision-log practice
- **Incomplete:** the "canonical product memory" system described in `docs/product-intelligence/README.md`'s own stated vision
- **Product decisions needed:** whether/when to build the actual Product Intelligence system, and whether it absorbs `DECISION_LOG.md` or stays separate

### Evidence
`git log main -- DECISION_LOG.md`, `git show main:docs/product-intelligence/README.md`, grep for `DECISION_LOG.md` references above.

---

## CAP-PWS-001 — People We Serve Realm Navigation

### Identity
- **Canonical name:** People We Serve Realm Navigation
- **Short description:** A shared tab bar consolidating Residents, Relationships, and External Clients into one navigable realm.
- **Primary class:** Platform Foundation (per your correction — this is the internal navigation structure `CAP-NAV-001`'s "The People We Serve" sidebar item currently points at without, since production today just links to `/residents` with no cross-realm tabs)
- **Secondary tag:** Operational Product
- **Maturity:** Implemented, Validation Required

### Product surface
- **Routes:** renders atop `/residents`, `/relationships`, `/relationships/actions`, `/relationships/intake`, `/relationships/whiteboard`, `/external-clients`
- **Major components:** `components/peopleWeServe/PeopleWeServeTabs.tsx`
- **Visible localhost behavior:** tab bar + 2-level breadcrumb titles (e.g., "The People We Serve · Residents")
- **Visible production behavior:** none of this exists in production — `/residents` etc. render standalone today
- **Difference:** entirely additive, not yet live anywhere

### Implementation
- **Files:** `components/peopleWeServe/PeopleWeServeTabs.tsx` (new) + hunks inside `app/residents/page.tsx`, `app/relationships/{page,actions/page,intake/page,whiteboard/page,[id]/page}.tsx`, `app/external-clients/page.tsx`
- **Tests:** none found

### Data and schema
None.

### Dependencies
- **Hard runtime dependencies:** none beyond existing routes
- **Navigation dependencies:** `CAP-NAV-001` (the sidebar item this realm's tabs sit beneath)
- **Shared-code/release-coupling dependency:** **every one of its 6 files also carries an unrelated `CAP-ASK-001` hunk in the same diff** — cannot commit independently without a hand-split (already proven technique, used once on `Sidebar.tsx`/`app/recruiting/page.tsx`)

### Readiness
- **Complete:** the tab component and its wiring
- **Blocking conditions:** the CAP-ASK-001 file-sharing issue above
- **Validation required:** no automated tests exist; needs a manual click-through
- **Recommended release wave:** Wave 1 (paired with CAP-ASK-001 by necessity, not by design)

### Evidence
`git diff app/residents/page.tsx` (prior session, full diff read) confirming both PeopleWeServeTabs and AskServeTrigger present in the same file.

---

## CAP-WORK-001 — Today's Work Continuity

### Identity
- **Canonical name:** Today's Work Continuity
- **Short description:** An actionable, cross-domain work queue on `/workspace` replacing a static links page.
- **Primary class:** Platform Foundation (per your correction)
- **Secondary tag:** Operational Product
- **Maturity:** Implemented, Validation Required

### Product surface
- **Routes:** `/workspace`
- **Major components:** `TodaysWorkView`, `WorkItemRow`, `BackToTodaysWorkLink`
- **Visible localhost behavior:** live work-item list (wellness follow-ups confirmed as one source; others per `lib/workspace/sections.ts` — not individually re-verified this pass)
- **Visible production behavior:** static tile/links page (current `main`)

### Implementation
- **Files:** `components/workspace/{TodaysWorkView,WorkItemRow,BackToTodaysWorkLink}.tsx`, `lib/data/todaysWork.ts`, `lib/workspace/{mapping,originMarker,ownership,ranking,sections,workItem}.ts`, `lib/data/wellnessFollowUps.ts` diff, `app/workspace/page.tsx` diff
- **Tests:** `lib/workspace/__tests__/` — 5 files (mapping, originMarker, ownership, ranking, sections)
- **Test command:** direct — `node --experimental-strip-types --conditions=react-server lib/workspace/__tests__/<file>.test.ts` per file (npm script not currently registered — see `CAP-TOOL-001`)

### Data and schema
None new — reads existing `resident_wellness_follow_ups`, `residents`; likely also reads `recruiting_leads` per `sections.ts`'s naming (**Unknown — verification required**, not confirmed by direct read this pass).

### Dependencies
- **Hard runtime dependencies:** `resident_wellness_follow_ups` table (existing, production)
- **Shared-code/release-coupling dependency:** `app/workspace/page.tsx`'s diff also carries a `CAP-ASK-001` hunk — same hand-split requirement as `CAP-PWS-001`

### Readiness
- **Validation required:** the ranking/ownership logic's correctness was not independently re-verified this pass, only its existence and test presence
- **Recommended release wave:** Wave 2

### Evidence
`git diff --stat app/workspace/page.tsx` (68 insertions/27 deletions, prior session); `lib/data/wellnessFollowUps.ts`'s own code comment: "This is the one genuinely new bulk query Today's Work needed."

---

## CAP-ASK-001 — Contextual Ask Serve

### Identity
- **Canonical name:** Contextual Ask Serve
- **Short description:** Layout-level provider plus per-page, role- and route-aware trigger, replacing a single static `/ask-serve` page.
- **Primary class:** Operational Product
- **Secondary tag:** Shared Infrastructure (layout-level provider wraps the entire app)
- **Maturity:** Partial Implementation

### Product surface
- **Routes:** none of its own; `AskServeProvider` wraps `app/layout.tsx`; triggers embedded in `app/{page,workspace/page,residents/page,recruiting/page,community-intelligence/page,external-clients/page}.tsx` and all 5 `relationships/*` route files
- **Major components:** `AskServePanel`, `AskServeProvider`, `AskServeTrigger`

### Implementation
- **Files:** `components/askServe/{AskServePanel,AskServeProvider,AskServeTrigger}.tsx`, `lib/askServe/{areaContexts,buildContext,featureFlag,knowledgeProfiles,state,types}.ts`, `app/layout.tsx` diff, `lib/auth/display.ts` diff (`role` field, needed only by this capability)
- **Tests:** `lib/askServe/__tests__/` — 4 files (buildContext, featureFlag, knowledgeProfiles, state)
- **Feature flag:** `isContextualAskServeEnabled(role)` — gating logic exists in `lib/askServe/featureFlag.ts`; the actual flag source (env var? role table? hardcoded?) was **not independently re-verified this pass** — Unknown — verification required

### Data and schema
**Unknown — verification required.** No migration found in the working tree for this capability. Either it's read-only against data owned by other capabilities, or it depends on something not present. This is the single largest unresolved question in the catalog.

### Dependencies
- **Hard runtime dependencies:** Unknown — verification required (see above)
- **Release-coupling dependency:** shares files with `CAP-PWS-001` and, separately, is embedded inside `CAP-WORK-001`'s `app/workspace/page.tsx` and `CAP-REC-001`'s `app/recruiting/page.tsx`
- **Conceptual parallel:** none claimed to `lib/intelligence/core` or `CAP-REC-001`'s evidence engine — this is a chat/assist surface, not an evidence system

### Readiness
- **Blocking condition:** the undocumented backend/AI service dependency must be confirmed real and configured before this ships
- **Product decision needed:** what AskServePanel actually calls
- **Recommended release wave:** Wave 1 (forced pairing with CAP-PWS-001), **contingent on the backend-dependency question being resolved first**

### Evidence
`git diff app/residents/page.tsx`, `app/recruiting/page.tsx`, `app/community-intelligence/page.tsx`, `app/page.tsx`, `app/workspace/page.tsx` (all read in full, prior session) — every one imports `AskServeTrigger`, `isContextualAskServeEnabled`, `buildAskServeContext`, and a per-page `*_CONTEXT` constant from `lib/askServe/areaContexts.ts`.

---

## CAP-REC-001 — Recruiting Operational Understanding & Hiring Pipeline Detail

### Identity
- **Canonical name:** Recruiting Operational Understanding & Hiring Pipeline Detail
- **Short description:** A candidate detail page showing deterministic evidence, rule-based inferences, human confirmations, an operational brief, and vendor identity — the operational layer beneath the already-shipped `/recruiting` list.
- **Primary class:** Operational Product
- **Secondary tag:** Platform Foundation (evidence/inference pattern — see governing note; **conceptually parallel to, not dependent on, `CAP-WF-002` or `lib/intelligence/core`**)
- **Maturity:** Implemented, Validation Required

### Product surface
- **Routes:** `/recruiting/[id]`
- **Navigation entry points:** `CAP-NAV-001`'s Workforce → Hiring Pipeline → (candidate row click, not yet wired at the list level beyond `RecruitingInbox.tsx`'s new link)
- **Major components:** `CollectorRunHistory`, `HiringSynthesisCard`, `HumanConfirmationsPanel`, `InferredSignalsPanel`, `OperationalBriefCard`, `OperationalUnderstandingCard`, `VendorEvidencePanel`, `VendorIdentityPanel`

### Implementation
- **Source directories:** `app/recruiting/[id]/`, `components/recruiting/{CollectorRunHistory,HiringSynthesisCard,HumanConfirmationsPanel,InferredSignalsPanel,OperationalBriefCard,OperationalUnderstandingCard,VendorEvidencePanel,VendorIdentityPanel}.tsx`, `lib/recruiting/` (entire tree — rules, extractors/apploi, extractors/viventium, operationalUnderstanding/), `lib/collectors/`
- **Data-access modules:** `lib/data/{recruitingLeadCollector,recruitingLeadEvidence,recruitingLeadOperationalUnderstanding,recruitingLeadSchemaCheck}.ts`, `lib/data/recruitingLeads.ts` diff (`getRecruitingLeadById`, `getRecruitingLeadByApprovedEmail`)
- **Shared-code dependency (existing):** `components/recruiting/RecruitingInbox.tsx` diff adds the detail link
- **Scripts:** `scripts/collectors/{apploiDomReconnaissance,apploiCandidateDialogCollector,recruitingLeadFlight,viventiumDomReconnaissance,viventiumEmployeeCollector}.ts`
- **Tests:** ~19 files — `lib/recruiting/__tests__/` (2), `lib/recruiting/extractors/apploi/__tests__/` (6), `lib/recruiting/extractors/viventium/__tests__/` (3), `lib/recruiting/operationalUnderstanding/__tests__/` (7), `lib/recruiting/rules/__tests__/rules.test.ts`, `lib/collectors/__tests__/contractBoundaries.test.ts` — the most-tested uncommitted capability found
- **Test commands:** not currently registered (see `CAP-TOOL-001`); direct invocation per file

### Data and schema
- **Tables:** `recruiting_lead_collector_runs`, `recruiting_lead_observations` (+9 columns added in a follow-up migration), `recruiting_lead_desired_state_evaluations`, `recruiting_lead_desired_state_evaluation_evidence`
- **Migrations:** `20260726000000`, `20260728000000` (alters `20260726`'s table), `20260730000000` — chained, must apply in order
- **Live-application status:** Unknown — verification required (see Migration Dependency Graph)

### Dependencies
- **Hard runtime dependencies:** the 3 migrations above; `RecruitingInbox.tsx`'s new link to `/recruiting/[id]` will 404 if this capability isn't committed alongside it (hard route dependency, not optional)
- **Schema dependencies:** all 3 migrations, in order
- **Shared-code dependencies:** existing `recruiting_leads` table (read-only, already production)
- **Conceptual (non-runtime) parallel:** `CAP-WF-002`'s evidence/attestation model, and `lib/intelligence/core`'s Signal/Rule/Recommendation types — **no import relationship in either direction**, recorded as parallel philosophy only

### Readiness
- **Complete:** extraction, rules, operational-understanding synthesis logic, all with real test coverage
- **Blocking condition:** migration live-status unknown
- **Validation required:** a real browser walkthrough (not performed — no browser access this environment)
- **Recommended release wave:** Wave 5

### Evidence
File inventory (prior session); `RecruitingInbox.tsx` diff read in full; migration filenames and schema surface (this session, §7 of prior report).

---

## CAP-RES-ID-001 — Resident Identity Resolution

### Identity
- **Canonical name:** Resident Identity Resolution
- **Short description:** Detect and resolve duplicate resident records via aliases, household links, and merge/defer/suppress decisions.
- **Primary class:** Platform Foundation
- **Maturity:** Implemented, Validation Required

### Product surface
- **Routes:** `/resident-identities`, `/resident-identities/[candidateId]`
- **Major components:** `ResidentIdentityComparison`, `ResidentIdentityQueue`

### Implementation
- **Files:** `app/resident-identities/`, `components/residentIdentity/{ResidentIdentityComparison,ResidentIdentityQueue}.tsx`, `lib/residents/identity/` (9 files), `lib/actions/residentIdentity.ts`, `lib/data/residentIdentity.ts`, `scripts/detectResidentIdentityCandidates.ts`
- **Tests:** `lib/residents/identity/__tests__/` — 8 files, one per module

### Data and schema
- **Tables:** `resident_identity_candidates`, `resident_identity_candidate_members`, `resident_identity_aliases`, `resident_merge_events`, `resident_identity_redirects`, `resident_identity_suppressions`, `resident_household_links`
- **Migrations:** `20260805000000` (base), `20260806000000` (household detection, depends on `20260805`), `20260806010000` (patches `resident_identity_candidates`, redefines `create_resident_identity_candidates`), `20260806020000` (new RPC only) — **4-migration chain, the two latest are patches on the base, indicating active iteration when work stopped**

### Dependencies
- **Hard runtime dependencies:** all 4 migrations, strictly ordered
- **Release-coupling:** **`CAP-RES-DI-001` depends on this capability's `resident_identity_candidates` table (foreign key + a function that mimics its insert shape) — see the Capability Dependency Graph §E/Dependency Register. This capability must apply before `CAP-RES-DI-001`, reversing this entry's original wave placement below.**

### Readiness
- **Validation required:** confirm which of the 4 migrations, if any, are live; confirm the two patch migrations are corrections, not divergent branches
- **Recommended release wave:** **Revised — first in the combined RES-ID → RES-DI → ROSTER sequence, not a standalone Wave 4.** See `SERVE_OS_CAPABILITY_DEPENDENCY_GRAPH.md` §E.

### Evidence
Migration filenames and `ALTER`/`CREATE OR REPLACE` grep (this session).

---

## CAP-RES-DI-001 — Resident Data Integrity

### Identity
- **Canonical name:** Resident Data Integrity
- **Short description:** Detect malformed names/phones and same-import duplicates on resident records; human review/correction queue.
- **Primary class:** Operational Product
- **Secondary tag:** Platform Foundation
- **Maturity:** Implemented, Validation Required

### Product surface
- **Routes:** `/resident-data-integrity`, `/resident-data-integrity/[issueId]`
- **Major components:** `ResidentDataIntegrityDetail`, `ResidentDataIntegrityQueue`

### Implementation
- **Files:** `app/resident-data-integrity/`, `components/residentDataIntegrity/{ResidentDataIntegrityDetail,ResidentDataIntegrityQueue}.tsx`, `lib/residents/dataIntegrity/` (7 files), `lib/actions/residentDataIntegrity.ts`, `lib/data/residentDataIntegrity.ts`, `scripts/detectResidentDataIntegrityIssues.ts`, **plus** `lib/actions/externalClients.ts` diff (integration point at prospect→resident conversion)
- **Tests:** `lib/residents/dataIntegrity/__tests__/` — 5 files

### Data and schema
- **Tables:** `resident_data_integrity_issues`, `resident_data_integrity_issue_members`, `resident_data_integrity_suppressions`
- **Functions:** `create_resident_data_integrity_issues`, `mark_...investigating`, `dismiss_...not_an_issue`, `resolve_...merged`, `correct_...malformed_field`, `return_...to_identity_review`, **and — critically — this migration also redefines `apply_roster_new_resident` (shared with `CAP-ROSTER-001`) and adds `convert_external_prospect_to_new_resident`**
- **Migration:** `20260807000000_create_resident_data_integrity.sql`

### Dependencies
- **Hard runtime dependencies:** the migration above; **`resident_identity_candidates` (`CAP-RES-ID-001`) via a foreign key on `resident_data_integrity_issues.linked_identity_candidate_id` and via `return_resident_data_integrity_issue_to_identity_review()`'s insert shape — verified this session by direct read of `20260807000000` lines 34-37 and 390-455.**
- **Release-coupling (hard):** **`apply_roster_new_resident` is redefined here — verified this session (full diff of both definitions) to be a deliberate, correct bugfix (adds a distinct `p_phone_raw` parameter; the original silently wrote the normalized phone into `phone_raw` too). Not a conflict — a correction that must ship with or after `CAP-ROSTER-001`'s original.**
- **Release-coupling (hard, elevated severity):** **this migration also drops and replaces `convert_external_prospect_to_new_resident`, which is *already live in production* (`supabase/migrations/20260719000000`, committed on `main`). The replacement adds a required parameter. The already-uncommitted `lib/data/externalClients.ts` diff updates the one call site to match. If this migration is ever applied without that code change deployed simultaneously, the live External Client → Resident conversion feature breaks outright.** See `SERVE_OS_CAPABILITY_DEPENDENCY_GRAPH.md` §E for full evidence.

### Readiness
- **Blocking condition:** must apply after `CAP-RES-ID-001`; must deploy atomically with `lib/actions/externalClients.ts`/`lib/data/externalClients.ts`
- **Recommended release wave:** **Revised — final step in the combined RES-ID → RES-DI → ROSTER sequence.**

### Evidence
`grep create_or_replace function` output (this session) showing `apply_roster_new_resident` in `20260807000000`; same function name confirmed in `20260804000000` (below).

---

## CAP-ROSTER-001 — Roster Reconciliation

### Identity
- **Canonical name:** Roster Reconciliation
- **Short description:** Reconcile a community's official roster spreadsheet against Serve OS resident records — new arrivals, apartment changes, absences.
- **Primary class:** Operational Product
- **Maturity:** Implemented, Validation Required

### Product surface
- **Routes:** none — script-driven (`npm run import:watermere-roster`, not currently registered — see `CAP-TOOL-001`)
- **Major components:** none (no dedicated UI found — review surfaces, if any, were not located this pass)

### Implementation
- **Files:** `lib/residents/roster/` (6 files), `lib/data/residentRoster.ts`, `scripts/importWatermereRoster.ts`, `scripts/importResidentSourceNotes.ts` + `scripts/importResidentSourceNotes/` (6 modules)
- **Tests:** `lib/residents/roster/__tests__/` (5 files) + `scripts/importResidentSourceNotes/__tests__/` (6 files) — 11 total

### Data and schema
- **Tables:** `roster_import_runs`, `roster_source_rows`, `resident_apartment_history`, `roster_absence_reviews`
- **Functions:** `apply_roster_apartment_change`, **`apply_roster_new_resident`** (also defined in `CAP-RES-DI-001`), `record_roster_absence`, `resolve_roster_absence`
- **Migration:** `20260804000000_create_roster_reconciliation.sql`
- **Input fixture:** `data/imports/watermere-official-roster-2026-07-22.xlsx` — this is `CAP-LOCAL-001`, not part of this capability's release unit

### Dependencies
- **Hard runtime dependencies:** the migration above; **`CAP-RES-DI-001` directly — `scripts/importWatermereRoster.ts` imports `createIntegrityIssues`, `computeFingerprint`, `detectMalformedPhone`, `validatePhoneForStorage` from it (verified this session, lines 42-45). This is a genuine import dependency, not just a shared-function naming collision.**
- **Release-coupling (hard):** see `CAP-RES-DI-001` — its correction of `apply_roster_new_resident` fixes a real bug in this capability's own function; shipping this capability's `20260804` alone leaves every roster-imported resident's `phone_raw` column silently wrong.

### Readiness
- **Blocking condition:** requires `CAP-RES-DI-001` to be present (import dependency) and its corrective migration to follow
- **Recommended release wave:** **Revised — final step in the combined RES-ID → RES-DI → ROSTER sequence, all three released as one unit.**

### Evidence
Same as `CAP-RES-DI-001`.

---

## CAP-REL-SUG-001 — Relationship Interaction Suggestions

### Identity
- **Canonical name:** Relationship Interaction Suggestions
- **Short description:** Deterministically-generated candidate follow-up actions (summary, commitment, open loop, next action, etc.) from a logged interaction, for human approve/edit/dismiss.
- **Primary class:** Operational Product
- **Maturity:** Implemented, Validation Required

### Product surface
- **Routes:** embedded in `/relationships/[id]`
- **Major components:** `RelationshipInteractionSuggestionsReview.tsx`, `RelationshipInteractionsSection.tsx` (diff)

### Implementation
- **Files:** `components/relationships/RelationshipInteractionSuggestionsReview.tsx`, `lib/relationships/{suggestionEngine,needsKeywords}.ts`, `lib/actions/relationships.ts` diff, `lib/data/relationships.ts` diff, `lib/relationships/constants.ts` diff, `lib/relationships/__tests__/brief.test.ts` diff
- **Tests:** `lib/relationships/__tests__/suggestionEngine.test.ts` (new)

### Data and schema
- **Tables:** `relationship_interaction_suggestions`
- **Column added to existing table:** `relationship_touches.structured_summary`
- **Functions:** `generate_interaction_suggestions`, `approve_interaction_suggestion`, `dismiss_interaction_suggestion`
- **Migration:** `20260803000000_create_relationship_interaction_suggestions.sql`

### Dependencies
- **Hard runtime dependencies:** the migration above
- **Schema dependencies:** `relationship_touches` (existing, production) — additive column only
- **Release-coupling:** none found with other capabilities

### Readiness
Single, self-contained migration, real test coverage, one clean integration point. Lowest-risk of the four schema-bearing working-tree capabilities.
- **Recommended release wave:** Wave 2

### Evidence
Migration content (this session); code comment: "Deterministically-generated (never AI-fabricated)... Nothing here is authoritative until approved."

---

## CAP-AXIS-DISC-001 — AxisCare Discovery Extensions

### Identity
- **Canonical name:** AxisCare Discovery Extensions
- **Short description:** Extends the read-only AxisCare discovery script to 5 more endpoints (Applicants, Organizations, ADLs, Tagging Categories, Expiring Tokens) for future integration planning.
- **Primary class:** Integration or Discovery Tooling
- **Maturity:** Discovery Only

### Product surface
None — feeds only `npm run axiscare:discover`, a research script. Not user-facing.

### Implementation
- **Files:** `lib/integrations/axiscare/{adls,applicants,expiringTokens,organizations,taggingCategories}.ts` (new), `discovery.ts`/`types.ts`/`__tests__/sanitization.test.ts` diffs
- **Tests:** covered within the modified `sanitization.test.ts` (shared file)

### Data and schema
None.

### Dependencies
- **Hard runtime dependencies:** existing AxisCare credentials (`AXISCARE_API_TOKEN` etc., already production via `CAP-WF-001`)
- **Release-coupling:** none

### Readiness
Not a shippable product feature — it's tooling for whoever continues AxisCare integration work. **Not a release-wave candidate.**

### Evidence
File diffs (prior session, read in full).

---

## CAP-GOV-001 — Serve Operating Governance

### Identity
- **Canonical name:** Serve Operating Governance
- **Short description:** Values-level governing documents — the organizational constitution and its relationship to the intelligence-specific constitution already committed.
- **Primary class:** Governance or Architecture Documentation
- **Maturity:** Specification Only

### Product surface
None — documentation only.

### Implementation
- **Files:** `docs/THE_SERVE_OPERATING_CONSTITUTION.md` (new, untracked), `docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md` (diff: −174/+2 lines)

### Dependencies
- **Conceptual relationship, not a runtime one:** the large deletion in `SERVE_INTELLIGENCE_CONSTITUTION.md` strongly suggests content migrated into the new file — **not confirmed this pass**, marked Unknown — verification required

### Readiness
- **Product decision needed:** which document is canonical before either commits — committing both without reconciling risks two documents each claiming to be "the constitution."
- **Not a release-wave candidate** (documentation, no code risk, but the reconciliation question should resolve first)

### Evidence
`git diff --stat` (prior session): `SERVE_INTELLIGENCE_CONSTITUTION.md | 176 +---- 2 insertions(+), 174 deletions(-)`.

---

## CAP-ARCH-001 — Serve OS Architecture Documentation

### Identity
- **Canonical name:** Serve OS Architecture Documentation
- **Short description:** Technical/design documentation supporting the working-tree capabilities above, plus standalone architecture notes not yet tied to shipped code.
- **Primary class:** Governance or Architecture Documentation
- **Maturity:** Specification Only

### Product surface
None — documentation only.

### Implementation
- **Files:** `docs/architecture/{APPLOI_DOM_MAP,APPLOI_EVIDENCE_RECONNAISSANCE_PLAN,APPLOI_OBSERVATION_CATALOG,ASK_SERVE_ARCHITECTURE,RECRUITING_LEAD_FLIGHT_PLAN,SERVE_CANONICAL_DATA_FLOW,TODAYS_WORK_CONTINUITY,TODAYS_WORK_OPERATIONAL_HOME,VENDOR_COLLECTOR_AUTHENTICATION}.md`, `docs/architecture/SERVE_OS_NAVIGATION_MODEL.md` (diff — stale, describes neither production nor any working-tree capability's actual shape), `docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md` (diff), `docs/design/WORKFORCE_OPERATIONS_ASSISTANT.md`, `docs/intelligence/{RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE,SERVE_HUMAN_LIFECYCLE_ONTOLOGY,SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE}.md`, `docs/pricing/`

### Dependencies
Each document maps to the capability it documents (e.g., `RECRUITING_LEAD_FLIGHT_PLAN.md` → `CAP-REC-001`, `TODAYS_WORK_*` → `CAP-WORK-001`, `ASK_SERVE_ARCHITECTURE.md` → `CAP-ASK-001`) — these are documentation artifacts of those capabilities, not independent capabilities themselves, but are cataloged here as a bundle since none is individually release-relevant.

### Readiness
`SERVE_OS_NAVIGATION_MODEL.md`'s diff specifically should **not** be committed as-is — it documents a rejected navigation design (see `CAP-NAV-001`'s `DECISION_LOG.md` entry). **Not a release-wave candidate.**

### Evidence
File inventory; prior session's diff review of `SERVE_OS_NAVIGATION_MODEL.md`.

---

## CAP-LOCAL-001 — Sensitive Local Assets

### Identity
- **Canonical name:** Sensitive Local Assets
- **Short description:** Real, named individuals' background-check documents and a real resident roster spreadsheet, accumulated locally during development.
- **Primary class:** Sensitive Local Asset
- **Maturity:** Local Only

### This is not a software capability
It is a data-classification record. **It must never appear in a release unit, and is explicitly excluded from every release-wave count in this catalog and the dependency graphs.**

### Contents
- `docs/workforce/Caregiver EMR/` — 17 PDFs, real named caregivers' Employee Misconduct Registry results
- `docs/workforce/Caregiver NAR/` — 17 PDFs, real named caregivers' Nurse Aide Registry results
- `data/imports/watermere-official-roster-2026-07-22.xlsx` (+ Excel lock file) — real resident roster

### Action already taken
Added to `.gitignore` in the prior assessment session (protective only — files untouched on disk, just no longer eligible for accidental `git add`). **This `.gitignore` change itself remains uncommitted**, pending your approval, per that session's report.

### Evidence
`find data docs/workforce -type f` (prior session, filenames only — contents not opened).

---

## CAP-TOOL-001 — Development Tooling Gaps

### Identity
- **Canonical name:** Development Tooling Gaps
- **Short description:** npm scripts and two dependencies (`xlsx`, `playwright`) present in the pre-existing working tree but absent from `main`'s committed `package.json` since an earlier session's file-split.
- **Primary class:** Development Tooling
- **Maturity:** Partial Implementation

### Contents
- **Dependency:** `xlsx` (required by `CAP-ROSTER-001`'s `parseWorkbook.ts`)
- **DevDependency:** `playwright` (consumer not confirmed — `@playwright/test` is already committed/production; bare `playwright` package's consumer is Unknown — verification required)
- **Missing npm scripts (≈15):** one per test suite/script across `CAP-WORK-001`, `CAP-ASK-001`, `CAP-REC-001`, `CAP-RES-ID-001`, `CAP-RES-DI-001`, `CAP-ROSTER-001`, `CAP-AXIS-DISC-001`

### Readiness
Safe to restore only alongside the capability each script serves — restoring scripts with no consuming capability committed adds dead entries. **Not an independent release unit** — rides with whichever capability's scripts it restores.

### Evidence
`package.json` diff comparison, prior sessions.

---

## Reconciliation Notes (Checkpoint 2)

- Every ID above is used identically here and will be used identically in the two graph documents (Checkpoint 3).
- `CAP-LOCAL-001` carries zero database, route, or release-wave relationships by design — it will not appear as a node with outgoing edges in either dependency graph, only as an explicitly-excluded reference where relevant (e.g., `CAP-ROSTER-001`'s input fixture).
- The `apply_roster_new_resident` conflict (`CAP-RES-DI-001` ↔ `CAP-ROSTER-001`) is the single highest-severity release-coupling finding and will be the anchor example in the Migration Dependency Graph's shared-object conflict section.
- `CAP-ASK-001`'s undocumented backend dependency and `CAP-GOV-001`'s unconfirmed constitution-consolidation are both marked as open product decisions, not technical blockers — they do not block cataloging or graphing, only release approval.
