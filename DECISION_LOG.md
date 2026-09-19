# Decision Log

Decisions are recorded here in order. Each entry includes the date, the decision, and the reason.
This log is append-only — do not modify past entries; add new ones at the bottom.

---

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-28 | Separate canonical assessment record from Cinch CCM | Preserve version history, auditability, AI reasoning, and vendor independence. Cinch receives only the approved operational subset. |
| 2026-06-28 | Build Intake before Serve OS | Immediate operational value. Validate the data model before building the dashboard. |
| 2026-06-28 | Human review is mandatory before any push to operational systems | AI assists; humans decide. Never allow AI to push records directly into production. |
| 2026-06-28 | Deterministic pricing engine — AI extracts facts, engine calculates price | Explainable, repeatable, auditable. Price must not be a generated estimate. |
| 2026-06-28 | Workflow-first development philosophy | Understand and simplify before automating. Avoid encoding broken processes. |
| 2026-06-28 | Netlify remains production host for public-facing properties | Website is already deployed there. No reason to migrate yet. |
| 2026-06-29 | `/get-started` is the unified public entry for both care seekers and job seekers | One URL, one experience, one codebase. Mode-switching via query param (`?mode=care` / `?mode=careers`). Reduces surface area and maintenance burden. |
| 2026-06-29 | `recruiting_leads` is a separate Supabase table from `prospects` | Different entity type (employee vs. care seeker), different lifecycle, different workflow. Mixing them would require too many nullable fields and create ambiguity in reporting. |
| 2026-06-29 | Notification system is event-driven (`emitEvent` → rules → channels) | Decouples forms and actions from notification logic. Adding a new channel (SMS, Slack) or a new recipient list requires no change to the caller. Rules are pure code — easy to read, test, and extend. |
| 2026-06-29 | Email recipients stored in env vars, not a database table | No deploy needed to change recipients. Avoids building a premature admin UI. Acceptable for the current staff size and workflow. |
| 2026-06-29 | Apploi redirect is optional and tracked; MD role has no Apploi path | Caregiver formal application lives in Apploi. MD pipeline is manual and relationship-driven — no external portal. `apploi_redirected_at` timestamp enables funnel tracking. |
| 2026-06-29 | `/careers` URL redirects to `/get-started?mode=careers` rather than hosting a separate page | External links and marketing materials pointing to `/careers` continue working. Avoids duplicating the entry experience. |
| 2026-06-29 | Recruiting status vocabulary: `new → contacted → in_review → applied → not_a_fit → hired → archived` | Mirrors the actual Serve recruiting workflow. Initial migration used generic terms that did not match operations; second migration aligned them. |

# 2026-07-01

Decision

Residents are the canonical business object.

Reason

Every workflow ultimately relates back to a resident.

Result

Assessments
Proposals
Wellness
Clients
Care
Timeline
Communications

all attach to Resident.

--------------------------------

Decision

Workspace becomes the operational home.

Dashboard remains executive intelligence.

Reason

Employees need operational workflow more than analytics.

--------------------------------

Decision

Organize by business process instead of software.

Reason

Employees should not think about Cinch, Apploi or Viventium.

They should think about:

Residents
Care Delivery
Recruiting
Communications
People

--------------------------------

Decision

External systems are temporary execution platforms.

Serve OS owns workflow.

External systems will be gradually replaced.

## 2026-07-04

Decision

Maintain dual data paths during transition.

Website submissions continue to write to:

- Netlify Forms
- Supabase

Rationale

Leadership continuity.

Netlify Forms remains the operational safety net while Serve OS becomes the long-term operational platform.

Future consideration:

Once Serve OS is fully adopted, evaluate retiring Netlify Forms as the primary operational record.

## 2026-07-05

Decision:
Maintain two homepage UX approaches during evaluation.

Conversation First (Version A) and Progressive Homepage Intake (Version B) will remain independent branches until stakeholder review determines long-term direction.

Decision:
Professional Referral is a distinct Care Inquiry workflow rather than another family relationship option.

Decision:
Serve OS visual refresh will adopt the homepage hero design language rather than the cream marketing pages.

## 2026-07-06

### Decision
Serve OS will orchestrate work rather than replace existing operational systems.

### Reason
Employees should focus on resident care instead of deciding which software they need to open.

### Result
Serve OS becomes the employee's operational home screen, providing resident context, operational memory, workflow prioritization, and launching external systems when execution is required.

---

### Decision
Workflow improvements take priority over additional AI features.

### Reason
Employee adoption depends more on reducing friction than increasing intelligence.

### Result
Development order becomes:

Daily Operations Workspace
→ Resident 360
→ Relationship Timeline
→ Operational Intelligence

## 2026-07-08

### Decision
Serve OS will not become an HRIS, ATS, payroll system, scheduling system, phone system, or documentation platform. Those functions remain owned by Apploi, Viventium, AxisCare, Dialpad, SAS (planned), and Cinch CCM. Serve OS owns: governance, organizational knowledge, operational intelligence, audit readiness, cross-system visibility, decision support, and AI.

### Reason
Every future governance module's software layer should be evaluated against one question: what organizational knowledge, operational standards, audit evidence, or cross-system intelligence should Serve own independently of any vendor? Where a vendor already performs a function well, Serve OS should integrate with it rather than recreate it.

### Result
This refines the 2026-07-01 "external systems will be gradually replaced" decision and the 2026-07-06 "orchestrate rather than replace" decision into a concrete, testable boundary. Recorded in full as [`docs/architecture/serve-os-scope-philosophy.md`](docs/architecture/serve-os-scope-philosophy.md). Applied retroactively to the Future Serve OS Module Inventory in [`docs/architecture/serve-governance-crosswalk.md`](docs/architecture/serve-governance-crosswalk.md) §3 — Personnel Manager, Training Manager, Competency Manager, and Document Manager reframed from owned systems to vendor-integration surfaces (compliance-status views and an audit-evidence index, not duplicate record stores); Background Eligibility Engine, Client Record Manager, Incident Manager, Emergency Manager, Audit Manager, and Policy Manager confirmed already correctly scoped as Serve-owned.

## 2026-07-09

### Decision
Future continuation prompts should be short orientation tools, not full archives.

### Reason
The documentation files already preserve architecture, decisions, status, deployment history, and build context. New chats need enough context to restart well without becoming overloaded.

### Result
Use three sections for future continuation prompts: (1) where we are, (2) what we are building next, (3) how to think. Long historical detail stays in the documentation files, not in every new chat prompt.

---

### Decision
Serve OS development should continue prioritizing usability and operational clarity before adding intelligence or automation layers.

### Reason
The platform only matters if it makes daily work easier for Serve employees.

## 2026-07-12

### Decision
Formalize the top-level operating model: Dashboard = Know, Workspace = Do, Residents = Manage, Ask Serve = Think. Each page owns exactly one of these modes; a component that doesn't clearly fit one is documented as an open ambiguity rather than placed by guess.

### Reason
Dashboard and Workspace had converged on the same job — both showed Today's Schedule, Starting This Week, and workflow launch points (Dashboard's Quick Actions duplicated Workspace's launch cards under different labels). This made it unclear which page to open for a given need and created two places where the same launch destination could drift apart.

### Result
This refines the 2026-07-01 "Workspace becomes the operational home, Dashboard remains executive intelligence" decision and the 2026-07-06 "Serve OS becomes the employee's operational home screen" decision into a concrete, testable page-ownership boundary. Recorded in full as [`docs/architecture/SERVE_OS_OPERATING_MODEL.md`](docs/architecture/SERVE_OS_OPERATING_MODEL.md).

Concretely:
- Dashboard: removed Quick Actions, Today's Schedule, and Starting This Week; rebalanced into Community Snapshot → Relationship Pipeline → Resident Wellness → Staffing & Recruiting, each metric card an optional investigative link into a filtered Residents/Prospects/Recruiting view (never a creation workflow).
- Workspace: gained Today's Schedule and Starting This Week (moved from Dashboard, same honest "not yet connected" placeholder copy, reworded per page purpose); Resident Operations and Care Delivery launch cards now render from a new shared registry, `lib/workflows/serveWorkflows.ts`, instead of being defined inline.
- `/ask-serve-ai` confirmed unreferenced anywhere in the app (Sidebar, Workspace, and every page were searched) — flagged in the architecture doc as a duplicate for a future cleanup pass rather than deleted in this task.
- No Supabase schema, server action, or business-logic change. No new AI behavior added to Ask Serve.

---

### Decision
Extend the operating model to the full sidebar: Community Intelligence = Think proactively, Communications = ensure nothing important is missed, Settings = configure/govern/secure/connect. Remove Recruiting, Scheduling, and Care Plans as top-level sidebar items without deleting any route.

### Reason
Recruiting was a permanent sidebar item despite being operational work, not a fifth awareness/action/management/reasoning domain — it was competing for top-level space with genuinely distinct domains. Scheduling and Care Plans were dimmed placeholders pointing at nothing. Settings was a decorative, non-clickable label with no route at all, despite the platform needing a real (if deliberately scoped) place to see account, organization, integration, and governance context.

### Result
Recorded in full as [`docs/architecture/SERVE_OS_NAVIGATION_MODEL.md`](docs/architecture/SERVE_OS_NAVIGATION_MODEL.md) and [`docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md`](docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md).

- Sidebar order is now: Workspace, Dashboard, Residents, Community Intelligence, Ask Serve — Coming Soon: Communications — System: Settings.
- `/recruiting` was not deleted; it remains reachable from Workspace's new "Recruiting & Hiring" section ("Open Recruiting Pipeline") and the existing Today's Work applicant count.
- Scheduling and Care Plans never had routes, so removing their sidebar placeholders orphans nothing.
- Community Intelligence's existing illustrative metrics were reorganized under five named categories (Resident Wellness, Relationship Intelligence, Scheduling Intelligence, Operational Best Practices, Quality/Compliance), each honestly labeled "Illustrative" or "Not Yet Connected" — no insight was manufactured from data Serve OS doesn't have.
- `/settings` is now a real authenticated route with six sections (My Account, Users & Roles, Organization & Communities, Workflow Configuration, Integrations, Governance & Audit); only My Account and a real, presence-only-checked Integrations status list show live data — everything else is an honest future-state description, gated to manager/executive/admin roles using the existing `AUTH_ROLES` model. No new write actions, no new database migrations, no secrets exposed client-side.

### Result
Near-term development stays focused on workflow clarity, live data usefulness, resident-centered operations, and employee usability.

## 2026-07-13

### Decision
AxisCare remains the scheduling and visit-execution system of record. Serve OS's AxisCare integration is read-only, and Serve OS must not create, edit, cancel, assign, or otherwise mutate an AxisCare schedule or visit without a separately approved future decision.

### Reason
This is a scheduling-specific instance of the 2026-07-08 vendor-independence boundary ("Serve OS will not become... a scheduling system... those functions remain owned by... AxisCare") and the 2026-06-28 "human review is mandatory before any push to operational systems" decision, made concrete for the first vendor integration actually built. Write access carries real operational risk (a wrong write directly disrupts a caregiver visit) that read access does not.

### Result
`lib/integrations/axiscare/client.ts`'s `axisCareGet()` hardcodes `method: "GET"` with no override parameter — write access is not reachable through this integration without a deliberate code change, not merely a policy convention. Recorded in full in `docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md` and `docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`'s "Permanent Rule." Any future write capability requires its own explicit decision entry here, not an incremental extension of this one.

---

### Decision
External vendor records (starting with AxisCare) are normalized into Serve-owned, vendor-neutral domain models before anything else in Serve OS consumes them. Vendor-specific field shapes and types stay isolated inside a dedicated adapter layer.

### Reason
Coupling the rest of the application directly to a vendor's field names and response shapes would mean every future vendor swap or API change ripples through UI and business logic. It would also make it easy to accidentally leak vendor-specific sensitive fields (e.g. AxisCare's Clients endpoint) into a UI that only needs display identity.

### Result
`lib/integrations/axiscare/` owns AxisCare-specific paths, headers, envelope shapes, and raw field types. `lib/scheduling/` owns vendor-neutral types (`ServeScheduleVisit`, `ServeTodaysScheduleResult`) and the normalization logic that produces them. Nothing outside `lib/integrations/axiscare/` may import an `AxisCareRaw*` type except `lib/scheduling/normalize.ts`, whose entire job is that conversion — enforced by convention today, not yet by a lint rule. Future vendor integrations (a second scheduling system, a second CRM, etc.) should follow the same adapter-then-normalize pattern rather than each UI surface learning a new vendor's shape directly.

---

### Decision
External integrations that are functionally complete may still ship disabled by default, gated behind a server-only feature flag that is independent of the integration's own credentials.

### Reason
Credential presence and feature enablement are different concerns. Removing a token is a blunt, all-or-nothing emergency measure that also breaks anything else depending on that credential. A dedicated flag lets an environment (most importantly production) stay off by deliberate choice even when everything required to turn it on is already configured and tested — which is exactly the state Workspace's AxisCare schedule feature is in as of this decision.

### Result
`AXISCARE_SCHEDULE_ENABLED` (server-only, no `NEXT_PUBLIC_` prefix, exact case-sensitive `"true"` match) gates `getAxisCareTodaysSchedule()` before any credential lookup — a disabled feature makes zero AxisCare requests and never reveals whether credentials are configured. This is intended as the reusable pattern for future external-integration rollouts, not a one-off: ship the integration, keep it off by a dedicated flag, enable per-environment deliberately. Preview/branch-deploy contexts may run with the flag enabled for verification; production stays disabled until explicitly approved.

---

### Decision
Serve OS enters Phase 2 — Operational Intelligence. This phase begins with architecture and intelligence-design work, not broad feature construction. Deterministic reasoning is required before any AI-generated recommendation; human judgment remains authoritative over final operational decisions.

### Reason
Phase 1 (authentication, navigation, Design System 2.0, resident/wellness/recruiting/prospect management, and now read-only AxisCare scheduling visibility) established the operational platform foundation these decisions assumed as a prerequisite (2026-06-28 "workflow-first development," 2026-07-06 "workflow improvements take priority over additional AI features"). Building exception detection, recommendations, or risk-scoring directly into UI features without a shared reasoning architecture would repeat the same "wrong classification with no visible reasoning" risk this program has avoided elsewhere (see the 2026-06-28 deterministic-pricing decision and `lib/scheduling/status.ts`'s refusal to guess "missed" from wall-clock time alone).

### Result
Five initial intelligence domains are identified for design (not implementation): Relationship Intelligence, Proposal Intelligence, Scheduling Intelligence, Community Intelligence, Operational Intelligence. Recorded architectural principles: deterministic before AI; normalized domain models; explainable recommendations; evidence and provenance; human judgment remains authoritative; LLMs assist reasoning and communication rather than originate operational classifications; vendor systems remain systems of record; Serve OS does not silently mutate vendor data. Every future intelligence surface should be able to answer "what should Serve know, what should Serve do, and why" with a traceable answer, not a black-box output. No intelligence kernel or individual engine exists in the repository yet — this decision governs how they get built, not a claim that they exist. Full framing in `ARCHITECTURE.md`'s Phase 2 section.

---

### Decision
`docs/intelligence/SERVE_INTELLIGENCE_ENGINEERING_STANDARDS.md` is the canonical engineering implementation standard for all Serve Intelligence Platform work, sitting directly beneath `docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md` (why) and `ARCHITECTURE.md` (what). It governs how every future Rule, Fact, Signal, Recommendation, Action, Outcome, and AI touchpoint is engineered, named, tested, and reviewed before merge.

### Reason
The Constitution and `ARCHITECTURE.md` establish philosophy and structure, but neither specifies the concrete, repeatable engineering process a future session — human or AI — needs to implement a new intelligence domain correctly without re-deriving decisions already made. Without a canonical "how," each new domain would risk inventing its own conventions, naming, and AI boundaries, exactly the kind of domain-specific drift the Constitution's Article X ("simplicity and shared architecture") warns against.

### Result
Any future intelligence-domain implementation (Scheduling Intelligence V1 or later) must follow the Engineering Standards' Rule template, naming conventions, Fact/Signal/Recommendation/Action/Outcome standards, AI boundary, implementation checklist, and Definition of Done before merge. Where the Engineering Standards ever conflict with the Constitution, the Constitution governs and the Engineering Standards must be corrected — not the reverse. Committed as `8e46bfe` (`docs: establish intelligence engineering standards`).

---

### Decision
Serve OS navigation shell: Today's Work is the sole Today destination, The People We Serve is the single Serve destination for the resident/client relationship realm, Workforce covers the full lifecycle of people who may/do/did serve, and "The People Who Serve" (recruiting) is retired as a separate top-level destination. Recruiting survives as Workforce -> Hiring Pipeline at its existing /recruiting route. There is no standalone Dashboard in this release; How We're Doing and Community Outlook own organizational understanding.

### Reason
Recruiting and Workforce are both "people who serve" concepts — a separate top-level Recruiting destination duplicated that idea instead of presenting one coherent Workforce journey from hiring through active/inactive/terminated employment. Residents, Relationships, and External Clients splitting into three top-level items likewise fragmented one relationship realm users already understand as a single destination. Neither retirement touches the underlying capability: recruiting_leads and workforce_members remain separate data models, and every existing route, action, and permission stays intact — only the top-level navigation surface changed.

### Result
components/Sidebar.tsx renders Today (Today's Work) / Serve (The People We Serve, Workforce) / Understand (How We're Doing, Community Outlook) / Coming Soon (Communications) / a utility area (Ask Serve, Settings) outside the work hierarchy. components/workforce/WorkforceSubNav.tsx gives Workforce a coherent sub-navigation (Overview, Hiring Pipeline, Onboarding, Active, Inactive, Terminated, Identity Review) and is reused as a breadcrumb at the top of /recruiting itself. Relationships and External Clients remain reachable at their existing routes from within The People We Serve. No database migration, permission change, or feature regression accompanied this change.

---

### Decision
Serve Intake AI extraction is provider-independent. Model providers supply draft evidence only; Serve owns the canonical schema, the human-approval boundary, and deterministic downstream behavior. Amazon Bedrock / Anthropic Claude is added as a second, optional extraction provider alongside OpenAI — neither is recorded as permanently canonical.

### Reason
Coupling the extraction pipeline to one LLM vendor was an avoidable single point of failure and negotiating leverage risk, and Serve's AWS environment has since been provisioned (BAA active, Bedrock account retention explicitly `none`, a US-region Claude inference profile active) specifically to make a second provider viable once its own PHI readiness is separately confirmed. The abstraction was deliberately built on `serve-os`'s already-governed assessment intelligence layer rather than the older `serve-intake-mvp` desktop app, which has no draft/approval separation, no epistemic vocabulary, and creates duplicate person records outside Serve OS's canonical model — building a second provider into that system would have formalized a design already flagged for retirement.

---

### Decision
The Audit Readiness Dashboard's live requirement-status count (51 non-compliant Workforce requirement-instances, from `getWorkforceDomainRollup()` calling `evaluateRequirementSetStatus()`) is left deliberately un-reconciled with the composed open-corrective-action count (18, from `getAllOpenCorrectiveActionsComposed()`). Both numbers are shown as-is; neither is adjusted to match the other.

### Reason
`compliance_corrective_actions`/`workforce_compliance_actions` are point-in-time snapshots, written only when something explicitly calls `syncCorrectiveAction`/`syncComplianceAction` (an evidence mutation, or now an Audit Drill finding) — they are not derived live from current requirement status the way the Dashboard's own status counts are. Nothing today re-syncs corrective actions on a schedule or on every requirement-status change outside those specific write paths, so the two numbers can and do diverge; 51 live non-compliant requirement-instances currently have only 18 matching open corrective-action rows. Silently forcing the counts to agree — by inflating corrective actions to match the live count, or by trusting the corrective-action count over the live evaluator — would misrepresent either the actual live compliance picture or the actual open workload, and `requirementSetStatus.ts`'s live evaluation is the one function every domain already treats as authoritative.

### Result
The Dashboard and the new Audit Drill screens (`app/audit-readiness/drills/*`) both continue to show the true live status count from the evaluator, never a count reconciled to corrective actions. Building an automatic reconciliation job (or a live-recompute-on-read approach for corrective-action presence) is recorded here as near-term architecture work, not undertaken in this phase.

### Result
`lib/assessmentIntelligence/extractionProvider.ts` defines the canonical `AssessmentExtractionProvider` interface and `ExtractionResult` shape both `extraction.ts` (OpenAI) and `lib/assessmentIntelligence/providers/bedrockClaudeProvider.ts` (Bedrock Claude, region `us-east-1`, inference profile `us.anthropic.claude-sonnet-4-6`, Converse API) implement identically — no provider-specific fields leak past either module, no separate Claude schema exists. `providerSelection.ts` reads `ASSESSMENT_EXTRACTION_PROVIDER` (default `openai`), throws on an unrecognized value, and never catches a provider failure to reroute to the other provider. The Bedrock adapter has not been exercised against real AWS (no credentials exist in the development environment) — its parsing, epistemic-status preservation, and failure handling are fully unit tested via an injectable mock client instead. Full design, security review, cost model, benchmark results, and the PHI production-readiness checklist (currently **NO** — a live Bedrock call has never succeeded from this codebase) are recorded in `docs/architecture/BEDROCK_CLAUDE_PROVIDER.md`.

---

### Decision
`/residents` and `/residents/[id]` (The People We Serve) are unrestricted for every role, including `office_staff` — revised from Office Staff Visibility v0.1's initial "hidden and blocked" treatment. `office_staff` gained the existing, previously-unrestricted operational-capture actions on that page (working notes, wellness observations/significant-change notes, current-needs updates, wellness follow-ups, relationship next-actions, prospect/lead creation) but not canonical-identity edits, resident evidence/client-readiness management, reconciliation/data-integrity actions, or Assessment capture (the last of these gated by a new predicate, `canCaptureResidentAssessment` — see `lib/auth/permissions.ts`).

### Reason
Office staff routinely field calls or receive updates about residents/clients and need to capture that information directly in Serve OS rather than via sticky notes, email, or informal handoff. Investigation (see this branch's own resident-access design report) found every one of the operational-capture actions above already had no role check beyond authentication — `office_staff` gaining page access grants them nothing any other role didn't already have on those specific actions. The one action that would have inappropriately become newly reachable — `startAssessmentCapture`, previously also unguarded — got its own explicit predicate rather than being silently swept in.

### Result
`lib/navigation/navData.ts` no longer restricts The People We Serve by role. `lib/auth/permissions.ts` gained `canCaptureResidentAssessment` (admin/manager/executive/operations — every role that already had this capability before the predicate existed; office_staff is the only exclusion), enforced both in `WorkWithThisPersonStrip.tsx` (hides the Assessment/Reassessment button) and server-side in `lib/actions/assessmentCapture.ts`'s `startAssessmentCapture`. Two items are recorded as explicit follow-up work, not undertaken here — see the two decisions immediately below.

---

### Decision
Future resident/client operational-note and observation capture (the working notes, wellness notes, and similar mechanisms `office_staff` was just given access to, and any future "intelligence" surface built on top of them) must be designed with immutable provenance: who recorded it (`recorded_by`), when, which subject it's about, the information source where known (e.g. "phone call from family member" vs. "observed directly"), surrounding context, and an explicit correction/addendum lineage rather than in-place edits that lose the original record.

### Reason
Restoring `office_staff` access to resident note-capture (this branch) surfaced that today's capture mechanisms (`createWorkingNote`, `addWellnessNote`, etc.) record only an actor label and a timestamp — sufficient for today's "who typed this" need, but not a foundation for any future system that needs to reason about *how confident* Serve should be in a given note, distinguish a firsthand observation from a secondhand report, or preserve an original record when it's later corrected. Building that model now, as a side effect of a navigation-visibility slice, was explicitly out of scope and would have risked a rushed, under-designed data model for something that deserves its own design pass — matching this repo's own "workflow-first," "deterministic before AI," and "evidence and provenance" principles already recorded above (2026-06-28, Phase 2 entry).

### Result
No new data model, table, or schema was created in this branch. This entry exists so a future session designing resident/client observation or operational-intelligence capture starts from this requirement instead of re-deriving it, and does not silently ship a note-taking mechanism without provenance.

---

### Decision
Three server actions remain reachable with no server-side role check beyond (or, in one case, including) authentication, discovered while auditing `/residents/[id]`'s mutation surface for the `office_staff` resident-access revision: `lib/actions/connections.ts` (interests/milestones/relationship-profile — no `getCurrentAuthorizedUser()` call at all, not even a signed-in requirement), `lib/actions/residentIdentity.ts` (`mergeResidents` and identity-candidate resolution), and `lib/actions/residentDataIntegrity.ts` (malformed-field correction and related actions). The latter two have their corresponding UI buttons correctly hidden via `canPerformReconciliationActions`, but the server actions themselves accept the call from any authenticated role regardless.

### Reason
This is a pre-existing gap that predates `office_staff` and affects every role equally (any authenticated user, including `operations` today, can already reach these actions directly regardless of what their UI shows them) — it is not introduced or worsened by restoring `office_staff`'s page access, since Next.js Server Actions are callable independent of whether the page containing their trigger button is reachable via navigation. Fixing it was explicitly out of scope for this branch and risked expanding a navigation-visibility slice into an unrelated security-hardening effort without its own review.

---

### Decision
Recorded, not fixed in this branch: `lib/actions/clientReadiness.ts`'s server actions (document upload, attestations, triage recording, verify/reject) perform no independent community-scope check of their own — they trust whatever `residentId` they're called with. Community scoping is enforced only at `app/residents/[id]/page.tsx` (`resolveCurrentCommunityQueryFilter` → `notFound()` for a resident outside the viewer's community).

### Reason
Found during the Priority 2 Office Staff Client Readiness UX production-acceptance investigation (2026-09-19), while auditing this file's authorization surface end to end. Same shape as the entry immediately above (page-level gating, not defense-in-depth at the server-action layer) and appears to be the same pre-existing, codebase-wide pattern — not something office_staff's document-upload authority introduces or worsens, and not unique to Client Readiness. Folding a general server-action community-scope hardening effort into this UX/wording/provenance slice was explicitly out of scope; recording it here so it isn't silently lost.

### Result
No server action in `lib/actions/clientReadiness.ts` was changed to add a community-scope check as part of this branch. This entry exists so a future authorization-hardening pass starts from a known list of affected actions instead of rediscovering them.

### Result
No change made to any of the three files in this branch. Recorded here as explicit security debt: a future pass must add `canPerformReconciliationActions` (or equivalent) checks to `residentIdentity.ts` and `residentDataIntegrity.ts`, and at minimum an authentication check to `connections.ts`, before treating resident identity-merge, data-integrity correction, and connections/interests capture as properly authorized.

---

### Decision
Recorded, not fixed: today's community-selection model (`lib/auth/communityScope.ts`, `lib/auth/currentCommunity.ts`) lets any authenticated role select any active community system-wide, not a per-user-assigned subset. `user_profiles.community_id` is a single nullable scalar (a default/home community only, per its own clarifying migration, `20260827000000_clarify_user_profile_community_semantics.sql`) — it cannot represent one-to-many community assignment. A genuine many-to-many actor-community assignment model is required to restrict a role like `office_staff` to a specific set of communities (e.g. only Frisco + McKinney); that model does not exist today, though `workforce_community_memberships` already proves the target shape works elsewhere in this codebase (for `workforce_members`, a different table from `user_profiles`). Community enforcement (extending `isValidCommunitySelection`/`isCommunityAccessAuthorized` to check assignment) and Today's Work community-awareness (`lib/data/todaysWork.ts` is explicitly documented as an "org-wide" aggregator today, with zero community filtering anywhere in it) are two separate, not-yet-built pieces of future work, not implied or attempted by this decision.

### Reason
Found during the Priority 2B Office Staff Workspace investigation (2026-09-19) while tracing why production allowed an `office_staff` user to select from all five active communities. The community-selection and query-scoping mechanism itself (`setCurrentCommunityAction`, `resolveCurrentCommunityQueryFilter`, and every page/action that calls it) is genuinely, correctly server-enforced relative to whatever is currently selected — this is not a missed authorization check, it is that the underlying assignment data needed to narrow "which communities can this identity select" below "every active community" does not exist yet. Folding a community-assignment data model and its enforcement into a presentation-only Workspace-simplification slice was explicitly out of scope for that task.

### Result
No schema, authorization predicate, or community-scoping behavior changed in this branch. This entry exists so a future community-assignment implementation starts from the already-completed investigation (current architecture, the security implications of the current unrestricted-selection design, and the `workforce_community_memberships` precedent) instead of rediscovering it.