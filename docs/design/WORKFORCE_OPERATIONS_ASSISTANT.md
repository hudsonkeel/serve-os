# Workforce Operations Assistant — Design Document

**Phase:** 1 — Hiring Workflow
**Document Type:** Software Design (Serve OS Future Module) — **not** governance, **not** policy, **not** an implementation
**Status:** Draft — Design Only, Nothing Built
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-20

---

## What This Document Is

This document designs the **Workforce Operations Assistant**, a future Serve OS module, beginning with its first workflow: **Hiring**. It answers the "Hiring Playbook" gap named but not yet filled in [`docs/architecture/serve-governance-crosswalk.md`](../architecture/serve-governance-crosswalk.md) and [`docs/architecture/serve-canonical-source-registry.md`](../architecture/serve-canonical-source-registry.md), and it names the eventual Serve OS module sitting beneath that playbook — a module neither "Personnel Manager" nor the "Background Eligibility Engine" alone fully covers, since it orchestrates *across* Apploi, background screening, Viventium, and Module 1, rather than owning any one of them.

**Nothing in this document is built.** No table, RPC, component, or route described here exists. This is a design for review, following the same "documentation before software" discipline the [Serve Workforce Governance Framework](../governance/workforce/README.md) itself uses.

## What This Document Explicitly Does Not Do

- It does **not** modify, rewrite, or reinterpret [Module 1: Background Eligibility](../governance/workforce/background-eligibility/README.md). Every one of that module's nine documents remains authoritative within its stated **Draft — Pending Legal & Executive Review** status, exactly as published. This document only maps the *workflow's* boundary around that module — see §7.
- It does **not** treat Module 1, or anything in this document, as adopted policy. Nothing here should be read as binding organizational practice.
- It does **not** propose that Serve OS become an ATS or an HRIS. Per the [Scope Philosophy](../architecture/serve-os-scope-philosophy.md), Apploi and Viventium remain the systems of record for applicant tracking and HR/payroll respectively; Serve OS owns the cross-system workflow state, the decision layer, and the audit trail — not the underlying vendor records.
- It does **not** invent a parallel reasoning architecture. Per the [Serve Intelligence Constitution](../intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md) Article X, `recruiting` is already a registered Intelligence Platform domain (`lib/intelligence/core/shared.ts`). Every primitive named below (evidence, requirement, action) is designed as this domain's instance of the platform's existing Fact / Signal / Rule / Recommendation / Action / Outcome / Explanation layers — not a new, competing set of concepts.

---

## 1. Current-State System Map

What exists today, verified against the actual codebase and governance documents — not aspirational.

```
                         ┌─────────────────────────────┐
                         │   Public website inquiry     │
                         │   (careers / get-started)    │
                         └───────────────┬───────────────┘
                                         │
                                         v
                         ┌─────────────────────────────┐
                         │      intake_submissions       │  Serve OS — canonical,
                         │  (Serve Intake Intelligence    │  owned end-to-end
                         │   Engine, recruiting path)     │
                         └───────────────┬───────────────┘
                                         │  classification only
                                         v
                         ┌─────────────────────────────┐
                         │       recruiting_leads        │  Serve OS — self-serve
                         │  role_interest: caregiver /    │  website inquiries ONLY.
                         │  managing_director             │  status: new → reviewing →
                         │  apploi_redirected_at (hand-   │  contacted → advanced →
                         │  off marker only — one-way)    │  hired / declined / withdrawn
                         └───────────────┬───────────────┘
                                         │  external hand-off (link only,
                                         │  no data returned)
                                         v
                         ┌─────────────────────────────┐
                         │            Apploi              │  Vendor system of record.
                         │  System of record for job       │  Status: External Launch.
                         │  postings, applicants, pipeline │  No API integration exists.
                         └───────────────┬───────────────┘   Nothing flows back into
                                         │                    Serve OS today.
                                         │  (no digital connection today)
                                         v
                         ┌─────────────────────────────┐
                         │   Background Screening         │  Entirely outside Serve OS.
                         │   (Sapphire, ordered via        │  No digital record of any
                         │   Viventium per the Canonical   │  kind exists in Serve OS
                         │   Source Registry)               │  today.
                         └───────────────┬───────────────┘
                                         │  (no digital connection today)
                                         v
                         ┌─────────────────────────────┐
                         │  Module 1: Background          │  Fully specified governance.
                         │  Eligibility (governance only) │  Draft — Pending Legal &
                         │  — the classification logic     │  Executive Review. Zero
                         │  itself, not yet software        │  software built.
                         └───────────────┬───────────────┘
                                         │  (no digital connection today)
                                         v
                         ┌─────────────────────────────┐
                         │           Viventium             │  Vendor system of record.
                         │  HR, payroll, I-9, onboarding   │  Status: External Launch.
                         └─────────────────────────────┘   No API integration exists.
```

**What this map proves:**

- **No single record ties one human applicant across all four systems.** `recruiting_leads` exists only for self-serve website inquiries — an applicant who applies directly in Apploi (the more common path, per the Canonical Source Registry) never gets a Serve OS record at all today.
- **Background screening has zero digital footprint in Serve OS.** It happens entirely inside Sapphire/Viventium and, presumably, paper or email review. Module 1's own precondition — "this workflow begins only once a background investigation report has been received and is considered complete" ([`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §2) — has no software home to begin from yet.
- **`recruiting_leads.status = "hired"` is asserted, not derived.** Nothing today connects that status to an actual Viventium onboarding event, a completed background classification, or a role-eligibility determination. It is presently just a manually-set label.
- **The Hiring Playbook does not exist as a governed document.** Per the Canonical Source Registry, the only current source for hiring process is an informal, external, non-standard-file-extension "Hiring Process document" with no version control and no stated authority.
- **The Intelligence Platform's `recruiting` domain is registered but empty.** No Fact, Signal, Rule, or Action has ever been produced for it. Phase 1 of this design is the first real implementation of that domain.

---

## 2. Canonical Hiring-State Model

The single most important design constraint in this document, per the explicit tasking: **workflow state, background classification, role eligibility, and hiring outcome are four independent fields on the Applicant record. None may be derived from, collapsed into, or inferred from another.** This directly extends Module 1's own structural rules — [`01-background-eligibility-ontology.md`](../governance/workforce/background-eligibility/01-background-eligibility-ontology.md) §3.6–3.8 already establish this boundary for *classification*; this section extends the same discipline to the whole hiring workflow.

| Field | Owned By | Values | Can Only Change Via |
|---|---|---|---|
| **Hiring Workflow State** | This module | See state list below | A recorded, evidenced state transition |
| **Background Eligibility Classification** | Module 1 (future engine, or human applying Module 1's rules manually until the engine exists) | `Eligible` \| `Reviewable` \| `Presumptive Disqualification` \| `Automatic Disqualification` \| *(none, if investigation incomplete)* | Only the classification workflow defined in [`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) |
| **Role Eligibility** | A future, not-yet-chartered module (combines classification + [role exposure profile](../governance/workforce/background-eligibility/04-role-exposure-model.md)) | Not yet defined — see §14 | Not yet defined |
| **Hiring Outcome** | Human decision-maker, informed by all of the above plus non-background factors (skills, references, interviews) | `Hired` \| `Declined` \| `Withdrawn` \| `Rescinded` | A recorded human decision only — never automated |

### 2.1 Hiring Workflow States

A **workflow state** describes where an Applicant is in the *process*, exactly as Module 1 §3.6 describes for classification workflow: "Pending," "In Review," and similar states are never treated as a classification. The same applies here in reverse — a workflow state is never treated as a classification, an eligibility result, or an outcome.

```
intake_received
   → applied_in_apploi
   → screening_requested
   → screening_in_progress
   → screening_report_received            (Module 1's precondition is now met)
   → background_classification_recorded    (see §7 — invokes Module 1)
        ├─ Eligible                → role_eligibility_pending
        ├─ Reviewable              → individualized_review_pending → role_eligibility_pending
        ├─ Presumptive DQ          → executive_review_pending → role_eligibility_pending (if upheld: terminal)
        └─ Automatic DQ            → terminal (Hiring Outcome = Declined, no further state)
   → role_eligibility_determined
   → offer_pending
   → offer_extended
   → onboarding_in_viventium
   → hiring_outcome_recorded (Hired | Declined | Withdrawn | Rescinded)
```

`withdrawn` and `declined` are reachable from any non-terminal state, not only the end of the chain — an applicant can withdraw, or be declined for non-background reasons, at any point.

### 2.2 Why This Separation Matters Structurally

A Reviewable classification does not, by itself, say anything about role eligibility (Module 1 §3.7) or about the hiring outcome (§3.8) — it only means individualized review is required before classification finalizes. Storing "Reviewable" as if it were a workflow status, or inferring "Declined" from "Automatic Disqualification" without a recorded human hiring-outcome action, would violate both Module 1's own ontology and Constitution Article II's requirement that "no automated recommendation bypasses appropriate human review before it becomes action." The one narrow exception — Automatic Disqualification having no review path — is Module 1's own deliberate design (§4), not a shortcut this workflow invents; even there, this design still requires a human to record the Hiring Outcome, citing the classification as rationale, rather than the software silently closing the record.

---

## 3. Evidence Taxonomy

Every evidence item is this domain's instance of the platform's `HistoricalFact` (`lib/intelligence/core/facts.ts`): immutable, normalized, source-attributed, never a raw vendor blob. `factType` is namespaced `recruiting.<event>`; `provenance.sourceSystem` identifies where it came from.

| Evidence Category | Example `factType` | Typical Source System | Notes |
|---|---|---|---|
| **Application evidence** | `recruiting.application_submitted`, `recruiting.application_stage_changed`, `recruiting.interview_scheduled`, `recruiting.interview_completed`, `recruiting.offer_extended`, `recruiting.offer_accepted`, `recruiting.application_withdrawn` | `apploi` | Today, this evidence has no digital path into Serve OS — see §10. |
| **Self-serve intake evidence** | `recruiting.website_inquiry_received` | `serve_os` | Already exists today via `intake_submissions` / `recruiting_leads`. |
| **Screening evidence** | `recruiting.background_check_ordered`, `recruiting.background_report_received`, `recruiting.background_finding_recorded` | `sapphire_background_screening` (via `viventium`) | The finding-level payload mirrors [`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md) §3.2's fields exactly: offense as reported, normalized category, jurisdiction, disposition, conviction date, pattern indicator, registry match. |
| **HR/onboarding evidence** | `recruiting.i9_completed`, `recruiting.offer_letter_signed`, `recruiting.employee_record_created`, `recruiting.start_date_confirmed` | `viventium` | No digital path today — see §10. |
| **Human-recorded evidence** | `recruiting.interview_notes_recorded`, `recruiting.reference_check_recorded`, `recruiting.manual_override_justification_recorded` | `manual` | Entered by a staff member directly, always `provenanceConfidence: "confirmed"` since a human is directly attesting to it. |

**Design rule — no inferred background evidence.** Unlike other Serve OS domains, evidence feeding a Background Eligibility Classification must never carry `provenanceConfidence: "inferred"`. A background finding is either confirmed (from the report or a human transcription of it) or it does not exist yet as evidence. This is stricter than the platform's general default and should be enforced structurally, not just by convention — mirroring how `Recommendation`'s interface structurally cannot hold a vendor-write field (see `lib/intelligence/core/recommendations.ts`'s module comment).

---

## 4. Requirement Model

A **Requirement** is a named, evidenced prerequisite that gates a specific workflow-state transition. This is new vocabulary for this domain (the platform's Phase A primitives don't yet name "requirement" as a first-class concept), introduced here because "identify completed and missing requirements" is an explicit tasking goal distinct from "evidence exists."

| Field | Description |
|---|---|
| `requirementKey` | Namespaced, e.g. `recruiting.background_report_received` |
| `gatesTransition` | The workflow-state transition this requirement blocks until satisfied |
| `satisfiedByEvidenceTypes` | One or more `factType`s whose presence satisfies this requirement |
| `status` | `unmet` \| `met` \| `waived` |
| `waivedBy` / `waiverReason` | Populated only if `status = waived` — every waiver is itself an audited Action + Outcome (§6), never a silent state |

### 4.1 Phase 1 Requirement Set (Hiring Workflow)

| Requirement | Gates | Satisfied By |
|---|---|---|
| Application on file | `intake_received → applied_in_apploi` | `recruiting.application_submitted` |
| Background check ordered | `applied_in_apploi → screening_in_progress` | `recruiting.background_check_ordered` |
| **Background investigation complete** | `screening_in_progress → screening_report_received` | `recruiting.background_report_received` — this is the exact gate Module 1 requires before it may be invoked at all (§7) |
| Background classification recorded | `screening_report_received → background_classification_recorded` | Module 1's classification result, recorded per §7 |
| Individualized/Executive review resolved (if applicable) | `*_review_pending → role_eligibility_pending` | A Review Record (§6, §11) |
| Role eligibility determined | `role_eligibility_pending → offer_pending` | A future Role Eligibility determination (§14 — not yet defined) |
| Offer signed | `offer_extended → onboarding_in_viventium` | `recruiting.offer_letter_signed` |
| I-9 / onboarding complete | `onboarding_in_viventium → hiring_outcome_recorded` | `recruiting.i9_completed`, `recruiting.employee_record_created` |

Requirements are deliberately **not** hard-coded 1:1 with workflow states in the general design — a future requirement could gate a transition without a state existing solely for it — but Phase 1's actual set above happens to line up closely with §2.1's state list, since Phase 1 is intentionally the simplest correct version of this model.

---

## 5. Exception Taxonomy

Named because most of the operational complexity in a hiring workflow lives in these paths, not the happy path.

| Exception | Description | Handling Principle |
|---|---|---|
| **Missing/delayed background report** | Screening ordered, no report received within an expected window | Surface as a stalled-requirement signal; no automated escalation timeline exists yet (Module 1 itself declines to specify timelines — [`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §8) |
| **Unmapped/ambiguous offense** | A reported finding doesn't cleanly map to the offense taxonomy | Per [`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md) §2: "no silent fallback" — must escalate for human review, never guess a classification |
| **Duplicate applicant across systems** | Same person applies via the website *and* directly in Apploi, or reapplies later | Requires a de-duplication strategy at the canonical Applicant layer (§8) — not solved by this design; flagged for Phase 1 detailed design |
| **Cross-system data conflict** | E.g., name or role mismatch between Apploi and Viventium records for the same person | Surfaced, never silently reconciled — a human resolves it |
| **Collector failure** | An evidence collector (API, automation, or import) fails to retrieve data | This is an *evidence-pipeline* failure, not an applicant-side exception — logged distinctly, never confused with "no evidence exists" |
| **Attempted override of Automatic Disqualification** | Any code path that would let a human or the system change a Hiring Outcome away from Declined after an Automatic Disqualification | Must be structurally impossible per Module 1 §4 and §6 — not merely discouraged |
| **Presumptive Disqualification override** | An executive documents an exceptional circumstance overriding the presumption | This is not an exception in the software sense — it is the governed path itself ([`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §5) and must always produce a written, retained rationale |
| **Stale requirement** | E.g., a background report older than some future-defined validity window | Validity windows are not yet defined anywhere in Module 1 — flagged in §14, not invented here |

---

## 6. Action Model

Reuses the platform's `Action` / `Outcome` / `Recommendation` primitives (`lib/intelligence/core/actions.ts`, `recommendations.ts`) directly — this domain does not define its own action lifecycle.

- **Recommendation** (`recruiting.<type>`) — deterministic, produced by evaluating the Applicant's current workflow state and requirement status against a versioned Rule (e.g., "screening_report_received requirement met and no classification recorded yet" → recommend `recruiting.record_background_classification`). Always advisory, never self-executing, per Constitution Article II.
- **Action** (human-owned, `createdBy` always a real person) — created either from a Recommendation or manually. Phase 1 action types:

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

- **Outcome** (append-only, `recordedBy` always a person) — what actually happened after an Action: `accepted`, `completed`, `dismissed`, `deferred`, `expired`. This is the permanent audit trail Constitution Article IX describes: "historical outcomes inform that judgment. They do not replace it."

**"Recommends the next valid action"** (the explicit tasking goal) is satisfied entirely by the Recommendation layer above — a deterministic Rule, not an LLM, decides what's next, exactly per Constitution Article IV.

---

## 7. Mapping Module 1 (Background Eligibility) Into the Workflow

This section is the load-bearing boundary the entire tasking is built around. It changes nothing in Module 1; it only states how this workflow touches it.

1. **Invocation precondition.** This workflow may invoke Module 1's (future) classification logic — or, until that engine is built, record a human's manual application of Module 1's rules — **only** once the `screening_report_received` requirement (§4) is met. This is a direct implementation of [`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §2's own precondition, not a new rule invented here.
2. **What gets recorded.** Exactly Module 1's own **Decision Output** fields, per [`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md) §3.4: the classification, the matched criterion, the reviewer (if any), the final decision, the approval date. This workflow is a *consumer* of that output, never a re-implementer of the logic that produces it.
3. **Reviewable → Individualized Review.** Routes to the `recruiting.conduct_individualized_review` Action, restricted to the HR/recruiting review tier (§11), following [`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §4's six review factors verbatim.
4. **Presumptive Disqualification → Executive Review.** Routes to `recruiting.escalate_to_executive_review`, restricted to the executive tier (§11), following §5. Any override must be written, must state rationale, and is retained permanently — this workflow does not soften or bypass that requirement.
5. **Automatic Disqualification → terminal, no review Action exists.** Per §6 of the review workflow, this classification is final on match. This workflow's action model (§6 above) deliberately contains **no action type** that could act on an Automatic Disqualification other than `recruiting.record_hiring_outcome` set to `Declined`, citing the classification. There is no `recruiting.override_automatic_disqualification` action, and there must never be one added without a Constitution-level amendment to Module 1 itself.
6. **Role eligibility stays out of scope.** Per Module 1 §3.7, this workflow does not let the classification alone answer "which roles is this applicant eligible for." That determination waits on a future module (§14).
7. **Hiring decision stays out of scope.** Per §3.8, a classification is one input to `recruiting.record_hiring_outcome`, never the outcome itself — even Automatic Disqualification produces a *recorded human action* (§6) that cites the classification as rationale, not an auto-generated outcome with no human attribution.

---

## 8. Phase 1 Data Model

Additive, following this codebase's established relational conventions (the `relationship_*` table family's patterns: append-only history, `NO ACTION` provenance-protecting foreign keys, `test_marker` hygiene, `created_by`/`updated_by` audit columns). **Not a finalized schema — illustrative shapes only, nothing here has been reviewed as a migration.**

| Table | Purpose | Modeled After |
|---|---|---|
| `hiring_applicants` | Canonical cross-system anchor. `id`, `display_name`, `role_interest`, `recruiting_lead_id` (nullable FK), `apploi_applicant_id` (nullable text), `viventium_employee_id` (nullable text), `current_workflow_state`, `created_at/by` | `relationships` |
| `hiring_workflow_state_history` | Append-only state transitions: `applicant_id`, `from_state`, `to_state`, `changed_at`, `changed_by`, `reason` | `relationship_stage_history` |
| `hiring_evidence` | This domain's `HistoricalFact` persistence: `applicant_id`, `fact_type`, `payload jsonb`, `source_system`, `source_record_id`, `provenance_confidence`, `occurred_at`, `recorded_at`, `supersedes_evidence_id` | `lib/intelligence/core/facts.ts`'s `HistoricalFact` shape, persisted |
| `hiring_requirements` | Requirement definitions (§4) — mostly static reference data | `lib/relationships/constants.ts`-style enum table |
| `hiring_requirement_status` | Per-applicant requirement state: `applicant_id`, `requirement_key`, `status`, `satisfied_by_evidence_id`, `waived_by`, `waiver_reason` | New — no direct precedent |
| `hiring_background_classification` | One row per completed investigation: `applicant_id`, `classification`, `matched_criterion`, `source_investigation_reference`, `classified_at`, `classified_by` | Directly implements [`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md) §3.4 |
| `hiring_review_records` | Individualized/Executive review outcomes: `applicant_id`, `review_tier`, `reviewer`, `factors_considered jsonb`, `decision`, `rationale`, `decided_at` | Directly implements [`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §4–§5 |
| `hiring_actions` / `hiring_action_outcomes` | This domain's `Action`/`Outcome` persistence | `relationship_actions` / append-only outcome log |

**A structural note, not a Phase 1 decision:** the Intelligence Platform's shared Fact/Signal/Rule/Recommendation/Action/Outcome persistence layer does not exist yet for *any* domain (Phase A is types-only). Building `hiring_evidence`/`hiring_actions` as domain-scoped tables now is a pragmatic Phase 1 choice, not a rejection of Constitution Article X's "a domain that finds itself designing its own version of a Fact table... has drifted." These tables are deliberately shaped to be *structurally identical* to the eventual shared primitives so they can migrate into a shared persistence layer later with a rename, not a redesign. Whether Hiring Workflow should be the first domain to force that shared layer into existence, or should wait, is a cross-domain decision flagged in §14 — not this document's to make unilaterally.

---

## 9. Phase 1 UI/Workspace Model

Following this codebase's established workspace/detail-page pattern (`RelationshipsWorkspace`, `/relationships/[id]`, `ActionBoard`).

- **Hiring Workspace** (list view) — filterable by workflow state, role interest, "classification pending," and "review pending." Parallels `RelationshipsWorkspace`.
- **Applicant Detail page** (`/hiring/[id]`, illustrative route) —
  - Canonical identity header (name, role interest, current workflow state).
  - Cross-system reference panel: Apploi applicant link, Viventium employee link, background investigation reference — links out, never embeds vendor UI.
  - Requirements checklist — met/unmet/waived, mirroring the Relationship Brief page's "grounded, never invented" pattern: a requirement's status is always evidence-backed or explicitly marked waived-with-reason, never blank.
  - Evidence timeline — read-only, source-attributed (parallels `RelationshipTimelineSection`).
  - Background Classification card — read-only display once a classification exists; never hand-editable, exactly like `RelationshipBriefSection` is never hand-editable, since Module 1 owns this value, not this UI.
  - Review Record section — visible only once a classification requiring review exists; gated by the reviewer's tier (§11).
  - Recommended Next Action card — parallels `RelationshipNextActionCard`.
  - Action log — parallels `RelationshipActionsList`.
- **Review Queues** — two distinct queues, not one: an Individualized Review queue (HR/recruiting tier) and an Executive Review queue (executive tier). Kept separate because Module 1 grants them different authority, not merely different labels.
- **No direct-edit surface for classification, review outcome, or hiring outcome exists outside their governed Action flow** — every one of those fields changes only through a recorded Action + Outcome, never a plain form field, mirroring this codebase's now-established pattern (Relationship Intelligence Phase 1's `resolve_relationship_*` RPCs, never a raw `UPDATE`).

---

## 10. Collector Strategy — Apploi, Viventium, Background Screening

"Interchangeable evidence collectors" is designed as one common contract, following the read-only, normalize-at-the-boundary pattern already proven in this codebase by `lib/integrations/axiscare/*`:

```
interface EvidenceCollector {
  sourceSystem: string;                 // "apploi" | "viventium" | "sapphire_background_screening" | "manual"
  collect(applicantRef): HistoricalFact[];  // normalized Evidence only — never a raw vendor payload
}
```

Every collector, regardless of mechanism, must produce the exact same normalized `hiring_evidence` shape (§3, §8). The workflow, the Requirement model, and the UI never know or care which collector produced a given piece of evidence — only its `source_system` and `provenance_confidence`. This is the same discipline Constitution Article III already states for the platform generally: "where information comes from a vendor system, that origin stays visible — but the vendor's own data shapes and internal complexity stop at the door."

| System | Today | Phase 1 Collector | Later Collector |
|---|---|---|---|
| **Apploi** | External Launch only — no API, no data returned to Serve OS | Manual entry or report import (staff transcribes stage/status from the Apploi UI) | API/webhook collector, if/when Apploi exposes read access — same downstream shape, swap-in only |
| **Viventium** | External Launch only — no API | Manual entry or report import (I-9/onboarding status) | API/webhook collector, if/when available |
| **Background screening (Sapphire, via Viventium)** | Entirely outside Serve OS, presumably paper/email today | **Manual evidence entry** — a staff member transcribes the received report's per-offense findings into the normalized shape (§3), matching [`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md) §3.2's anticipated fields exactly | Report import (structured upload/parse) or supervised browser automation against Sapphire's portal, if ever pursued |

**Collector design rules:**
- No collector may write back to a vendor system, ever — Constitution Article VIII: "recommendations must never silently mutate a vendor system." A collector reads; a human, acting on a Recommendation, is the only thing that ever acts in Apploi or Viventium directly, and does so in that system, on purpose.
- Browser-automation collectors are the highest-risk collector type in this design — they touch vendor credentials and are subject to each vendor's Terms of Service, which have not been reviewed for this purpose. Flagged as a legal/vendor-agreement dependency in §14, not assumed available.
- Background-screening evidence must never carry `provenanceConfidence: "inferred"` (§3) — a manual-entry collector's human transcription is `"confirmed"`, same confidence tier as a future API collector's direct read, precisely because a human is directly attesting to the source document either way.

---

## 11. Human-Review Boundaries

| Tier | Triggered By | Who | Authority |
|---|---|---|---|
| **Individualized Review** | Classification = Reviewable | HR/recruiting staff | Documents rationale against Module 1's six review factors ([`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §4); produces a final classification decision |
| **Executive Review** | Classification = Presumptive Disqualification | Executive tier only | Confirms or, in a documented exceptional circumstance, overrides the presumption (§5) — a strictly higher authority than Individualized Review, never substitutable |
| **No review tier** | Classification = Automatic Disqualification | — | None exists in Module 1, and none may be added by this workflow (§7, §5 exception table) |
| **Role Eligibility determination** | After classification resolves | Human judgment, until a future module defines the combination logic | Not automatable today — [`04-role-exposure-model.md`](../governance/workforce/background-eligibility/04-role-exposure-model.md) explicitly declines to define how exposure factors combine with a classification |
| **Hiring Outcome** | Always | A human decision-maker | Never automated, regardless of how favorable every upstream signal is — Constitution Article II, Module 1 §3.8 |

**AI's role, per Constitution Article V:** may summarize, explain, contextualize, prioritize already-produced Recommendations, or draft communication. May **never** independently produce a classification, a role-eligibility result, or a hiring decision, and may never write to Apploi or Viventium. Any AI-assisted narrative (e.g., a summarized applicant timeline) must remain structurally distinguishable from deterministic evidence and reasoning, exactly as `Explanation`'s existing `deterministic` / `narrative` split already enforces platform-wide (`lib/intelligence/core/explanations.ts`).

---

## 12. Audit Requirements

Directly extends [`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md) §5 and Constitution Article XI across the whole workflow, not just the classification step:

- Every workflow-state transition, Requirement status change (including waivers), Evidence item (with full provenance), Recommendation, Action, Outcome, and Review Record must be retained and reconstructable — "what triggered it, what evidence supported it, and what rule version reasoned about it," for as long as it matters.
- **Append-only, always.** No hiring record is ever deleted or overwritten. A correction is a new, dated entry referencing what it corrects — the same discipline this codebase already implemented concretely in Relationship Intelligence Phase 1 (deliberate `NO ACTION` foreign keys from Insight/Commitment/Open Loop back to their source Interaction, specifically so a future delete path could never silently erase provenance). That precedent should be reused directly for `hiring_evidence`'s and `hiring_review_records`' foreign keys back to `hiring_applicants` and `hiring_background_classification`.
- Every classification and every review decision must remain explainable to the specific finding(s) and criterion that produced it — Module 1 §3.5's explainability rule, unchanged, just consumed here rather than restated differently.
- Sensitive data note: background investigation findings are a category of especially sensitive data Serve OS has never stored before. Access must be minimum-necessary (Constitution Article XI) — narrower than general recruiting-workspace access, not the same audience as the rest of the Hiring Workspace.

---

## 13. Phased Implementation Plan

| Phase | Scope | Depends On |
|---|---|---|
| **Phase 0** | Nothing built. Module 1 remains Draft; the Hiring Playbook remains informal. | Legal & executive review (external to this design) |
| **Phase 1** *(this document's target)* | Canonical `hiring_applicants` + workflow state machine; manual/report-import collectors for all three external systems; Requirement tracking; **manual** recording of Background Classification (humans continue applying Module 1's rules by hand — the engine doesn't exist yet, Phase 1 only records the result); Review Records for Individualized/Executive tiers; deterministic Recommended-Next-Action; full audit trail; Workspace + Detail page + Review Queues UI | §14's dependencies, at minimum the sensitive-data/privacy review |
| **Phase 2** | The actual Background Eligibility Engine gets built (per [`08-future-software-specification.md`](../governance/workforce/background-eligibility/08-future-software-specification.md)), once Module 1 is legally adopted, and plugs into the invocation boundary Phase 1 already built (§7) | Module 1 status change: Draft → Adopted |
| **Phase 3** | API/webhook collectors for Apploi and Viventium replace manual/report-import collectors as vendor access permits — additive, not a rebuild, because of collector interchangeability (§10) | Vendor API access, ToS review |
| **Phase 4** | Role Eligibility module (once chartered) plugs in as the missing combination logic between classification and role exposure profile | A new governance module — not chartered today |
| **Phase 5** | Hiring's domain-scoped Fact/Action tables (§8) migrate into a shared cross-domain Intelligence Platform persistence layer, if/when that layer is built | A cross-domain decision outside this document's authority |

---

## 14. Unresolved Policy and Legal Dependencies

Named, not resolved — consistent with Module 1's own convention of flagging rather than guessing at legal questions.

- **Module 1 itself remains Draft — Pending Legal & Executive Review.** Nothing built against it, including everything in this document, should be treated as binding compliance software until that status formally changes. This must remain visible in any Phase 1 build, not just this design document.
- **Reconsideration/appeal process** — [`05-review-workflow.md`](../governance/workforce/background-eligibility/05-review-workflow.md) §7: explicitly **Requires Legal Review**, unresolved. This workflow cannot yet define an applicant-facing appeal path.
- **Records retention duration** — §3 Step 6: **Requires Legal Review**, unresolved.
- **Registry/exclusion-list matching** — [`03-risk-domains.md`](../governance/workforce/background-eligibility/03-risk-domains.md) §4, flagged **Requires Legal Review** in the future software spec.
- **Role Eligibility combination logic** (classification × exposure factors → role decision) — explicitly not defined by [`04-role-exposure-model.md`](../governance/workforce/background-eligibility/04-role-exposure-model.md) §3. No Phase can automate this until it exists.
- **Conflicting disqualification standards** — the Canonical Source Registry flags an unresolved conflict between the P&P draft's "Not Hirable" criteria (Texas Health & Safety Code §250.006) and Module 1's four-classification taxonomy; both are technically live simultaneously since Module 1 isn't adopted. This must be cross-walked before Phase 1 treats Module 1 as the sole disqualification authority in practice.
- **Vendor Terms of Service for browser-automation collectors** against Apploi, Viventium, or Sapphire — not reviewed. Credential-handling and security review also outstanding.
- **The Hiring Playbook doesn't exist as a governed document yet.** The Governance Crosswalk's own dependency graph states governance and playbook layers should exist before the software layer is built against them. This design is, by necessity, ahead of that governance — flagged explicitly rather than quietly ignored. Recommend chartering the Hiring Playbook in parallel with any Phase 1 build, not after it.
- **Sensitive-data handling** for background investigation findings — a new category of especially sensitive data for Serve OS. Needs its own privacy/security review before `hiring_evidence` or `hiring_background_classification` go anywhere near production applicant data.
- **Cross-domain persistence layer timing** (§8, §13 Phase 5) — whether Hiring Workflow should be the first domain to force the shared Intelligence Platform persistence layer into existence is a decision outside this document's authority to make.

---

*This document does not change Module 1's status, does not modify any file under `docs/governance/`, and does not authorize implementation. It is a design for review.*
