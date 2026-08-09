# Serve Human Lifecycle Ontology

**Document Type:** Foundational domain model — peer document to [`SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md`](./SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md) and [`RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md`](./RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md)
**Status:** Draft — Design Only, Nothing Built, Nothing Migrated
**Last Updated:** 2026-08-01

*Where anything here conflicts with the Serve Intelligence Constitution or the Recruiting Operational Understanding Engine's proven behavior, those win. This document does not redesign what already works — it names the general shape that the Recruiting implementation already is one instance of, so the next domain reuses it instead of reinventing it.*

---

## 1. Executive Summary

Serve OS does not mirror Apploi, Viventium, AxisCare, Cinch, Dialpad, Gmail, or Serve Intake. Those systems produce **evidence**. Serve OS owns the **operational understanding** of what is happening in a person's life and what Serve should do next — the same discipline already proven, end to end, in the Recruiting domain this session: a person moves through a lifecycle of Serve-owned, vendor-agnostic states; every state is evaluated deterministically from evidence, never asserted; every gap is classified by exactly what it does and doesn't prove; every recommendation traces back to a governed requirement and a specific gap.

This document generalizes that proven pattern into a durable vocabulary — **Person, Role, Lifecycle, State, Capability, Requirement, Evidence, Gap, Transition, Recommendation, Outcome, Flourishing** — and applies it, as a first pass, to five human populations Serve already touches: caregivers/workforce, residents/clients, families, referral partners, and care delivery.

**It proposes almost no new database schema.** The Recruiting engine already built and proved the load-bearing primitives (`recruiting_lead_rules`/`rule_versions`, the three evidence classes, `DesiredStateDefinition`/`EvidenceRequirement`/`RequirementGovernance`, the gap taxonomy, gap-derived recommendations). This document's job is to name that pattern generally enough that Residents, Family, and Care Delivery reuse it as a **module boundary and a set of TypeScript types**, not a new universal table, until a second real domain proves a shared persistence layer is actually worth the migration.

---

## 2. Core Thesis

> Systems that preserve human dignity while augmenting human capability.

Serve's purpose is not to move records through workflows faster. It is to help a specific person move through a real season of their life — applying to work, being cared for, supporting a loved one, referring a client, declining, dying — with less friction, less guesswork, and more honesty about what is and isn't yet known. The canonical loop:

```
Human Subject → Lifecycle → Current State → Capabilities → Requirements
   → Evidence → Gaps and Unknowns → Permitted Transition
   → Recommended Next Action → Outcome → Flourishing
```

Every arrow above already exists, concretely, in the Recruiting implementation:

| Loop step | Recruiting's concrete instance |
|---|---|
| Human Subject | `recruiting_leads` row, linked to vendor identities |
| Lifecycle | The 7-stage Recruiting/Workforce lifecycle (`RECRUITING_DESIRED_STATES`) |
| Current State | `DesiredStateEvaluationResult.status` (satisfied/blocked/unknown/in_progress/not_applicable) |
| Capabilities | *Not yet named as such — see Part 3; today implicit in "what the next stage's requirements need"* |
| Requirements | `EvidenceRequirement` + `RequirementGovernance` |
| Evidence | `recruiting_lead_observations` / `_inferences` / `_human_confirmations` |
| Gaps and Unknowns | `OperationalGap` (blocking/integration/potential) + `unknownEvidence` |
| Permitted Transition | Implicit in `gatedBy` — not yet a named, independently-evaluated primitive (see Part 4) |
| Recommended Next Action | `OperationalRecommendation` / `selectNextRecommendedAction()` |
| Outcome | `recruiting_lead_human_confirmations` rows, collector-run completions |
| Flourishing | **Not yet modeled anywhere** — see Part 10 |

This table is the honest starting point for the whole document: most of the loop is real and tested; **Capability**, **Transition-as-its-own-primitive**, and **Flourishing** are the three genuinely new concepts this design introduces, and each is deliberately kept as light as possible (Part 3, 4, 10).

---

## 3. Canonical Vocabulary

Precise, non-overlapping definitions — collapsing any two of these to "simplify" is exactly what this document was asked not to do.

| Term | Definition | Distinguished from |
|---|---|---|
| **Identity** | The stable, continuous fact of being one specific person, independent of any role, system, or vendor. | *Role* (what they're doing), *Vendor Identity* (a system's own key for them) |
| **Role** | A capacity in which a person participates in Serve's operations at a point in time — caregiver candidate, employee, family member, referral source. One person may hold several, concurrently or across time. | *Lifecycle* (the journey a role often participates in) |
| **Lifecycle** | A named, purposeful, Serve-owned sequence of states a person or engagement moves through toward a meaningful outcome. | *State* (a position within one lifecycle) |
| **State** | The current position within one lifecycle, as of now. Default: derived fresh from evidence, never hand-set. | *Status* (a vendor's own label, never equated with State without a Rule) |
| **Capability** | What a person is currently permitted, prepared, or operationally able to do — a consequence drawn from one or more satisfied States/Requirements, not the state itself. | *Eligibility* (narrower — one requirement's yes/no/unknown), *Readiness* (an activity-scoped bundle of capabilities) |
| **Requirement** | A named, governed, evidenced precondition gating a transition or capability. Only ever blocking if `adopted`. | *Status* (vendor's raw label is never itself a requirement) |
| **Eligibility** | Whether a person, given current evidence, satisfies one specific governed requirement right now — yes / no / unknown. The atomic unit a Capability is built from. | *Readiness* (composite across several eligibilities) |
| **Readiness** | A practical judgment that everything a specific next activity needs (several capabilities/requirements) is in place — e.g. "Scheduling Readiness." | *State* (readiness is usually itself expressed as one Desired State) |
| **Status** | An informal or vendor-native label (Viventium "Active", Apploi "Requested Interview"). Raw evidence, never Serve's own vocabulary. | *State* |
| **Transition** | A governed change from one lifecycle state to another — gated, sometimes automatic, sometimes human-owned. | *Outcome* (the recorded result of a transition having happened) |
| **Outcome** | The recorded, attributed, timestamped result of a Transition or Action. | *Flourishing* (an evaluative frame applied across many outcomes, not one) |
| **Flourishing** | An orienting framework of human-relevant domains (dignity, autonomy, belonging, etc.) used to judge whether Serve's operational actions are actually helping — never a stage, never a score. | Everything above — it is cross-cutting, not sequential |

---

## 4. Human Subject Model (Part 1)

### 4.1 The canonical person

**Recommendation: do not build a universal `persons` table now.** Serve already has three lifecycle-scoped identity anchors, each already proven and populated: `recruiting_leads` (workforce/recruiting identity), `residents` (resident/client identity), and `relationships` (engagement identity, whose `primary_contact_*` fields carry a family/contact identity as free text, not yet a full row of its own). Merging these into one physical table today would be exactly the "giant generic ontology database" this document was told not to build, for a benefit no current workflow needs.

Instead, **Person is a conceptual primitive**, realized through:

1. **Continuity of reference within one lifecycle-scoped table.** Alma-the-candidate is one `recruiting_leads.id`, referenced consistently by every observation, inference, confirmation, and vendor identity — this is already fully proven.
2. **Explicit, human-confirmed cross-references between tables, built only when an operational reason exists.** The same `recruiting_lead_vendor_identities` pattern (match ladder, `is_human_confirmed`, `linked_by`) generalizes directly: a future `person_identity_links` table (`link_type`, `left_table`, `left_id`, `right_table`, `right_id`, `match_method`, `is_human_confirmed`, `linked_by`) — **not built now**, proposed only when Delivery Phase 1/5 (Part 15) actually needs one, e.g. a caregiver who is also a resident's family member.
3. **A minimal, purpose-built identity table only when a lifecycle genuinely has nowhere else to live.** Today, once Alma is hired, "Alma the employee" has no home — there is no `workforce_members`/`employees` table yet. The recommended fix (Delivery Phase 1) is a small `workforce_members` table with `source_recruiting_lead_id` (a `NO ACTION` FK, matching this project's established provenance-preserving convention) — never re-collecting her name/contact info, never a duplicate identity.

### 4.2 Person / Role Assignment / Organization Relationship / Community Relationship / Vendor Identity / Lifecycle Participation

| Concept | What it is | Where it lives today | Where it would live |
|---|---|---|---|
| **Person** | The conceptual, continuous human being | Implicit — one row in whichever lifecycle-scoped table currently anchors them | Unchanged; cross-references added only as needed (4.1.2) |
| **Role Assignment** | "This person is currently a caregiver candidate" / "an employee" / "a family member" | Implicit in which table/lifecycle a row participates in | A small, explicit `role_assignments`-style record per person, **once** more than one concurrent role needs to be queried together (not required for Alma alone) |
| **Organization Relationship** | Alma's relationship to Serve as an organization (employee, contractor, alumni) | Not modeled; would live alongside `workforce_members` | New, minimal, only at Delivery Phase 1 |
| **Community Relationship** | A resident's relationship to a specific community (Watermere, etc.) | Already modeled — `residents.community_name`/`community_code` | Reused unchanged |
| **Vendor Identity** | "This person is Apploi candidateID X" | `recruiting_lead_vendor_identities` — proven, tested, in production use this session | Generalize the *pattern* (not the table) per lifecycle: `workforce_vendor_identities` once `workforce_members` exists |
| **Lifecycle Participation** | "This person is currently in the Recruiting lifecycle, state=Application Received" | `recruiting_lead_desired_state_evaluations`, recomputed live | Same pattern, one table per domain, never a shared one prematurely |

### 4.3 Worked shape — Alma

```
Person: Alma Dhora Owolabi (conceptual — anchored today by recruiting_leads.id)

Roles:
  - caregiver candidate   (Recruiting lifecycle)
  - employee              (Employment lifecycle — no table yet, see 4.1.3)
  - caregiver             (Care Delivery lifecycle — future, AxisCare-evidenced)

Vendor identities:
  - Apploi candidateID     (recruiting_lead_vendor_identities, human-confirmed)
  - Viventium employeeID   (same pattern, not yet linked — pending Phase 2)
  - AxisCare caregiverID   (future — no evidence collected yet)

Lifecycle participations:
  - Recruiting             → Application Received: satisfied (as of this session)
  - Employment             → not yet begun (no workforce_members row exists)
  - Scheduling Readiness   → not applicable (gated)
  - Care Delivery          → not applicable (gated)
  - Development/Recognition → not applicable (gated)
```

### 4.4 Identity resolution, vendor linkage, human-confirmed matching

Already fully specified and implemented for Recruiting (`decideVendorIdentityAction`, the 7-tier match ladder in `recruiting_lead_vendor_identities`): a first link always requires explicit human confirmation; every subsequent run must find the stored vendor ID matching the freshly observed one, or hard-stop. This generalizes verbatim — no new design needed, only a new table per domain when that domain's identity anchor is built.

### 4.5 Historical role changes without losing history

Never overwrite a role assignment or an identity link. A role ends (recorded with an end date/reason) and a new one begins; a vendor identity is never silently repointed (a stored-vs-observed mismatch is always a hard stop, never an automatic repoint — proven in the Recruiting collector). Lifecycle participation evaluations are append-only (`recruiting_lead_desired_state_evaluations` never updates a row in place) — the same discipline applies to every future domain's evaluation table.

---

## 5. Lifecycle Model (Part 2)

### 5.1 Required fields

| Field | Recruiting's instance |
|---|---|
| lifecycle key | `recruiting.lifecycle.workforce` (implicit today — worth naming explicitly) |
| lifecycle name | "Workforce / Recruiting Lifecycle" |
| subject | `recruiting_leads.id` |
| purpose | `DesiredStateDefinition.purpose`, per stage |
| lifecycle owner | `DesiredStateDefinition.operationalOwner`, per stage |
| current evaluated state | `DesiredStateEvaluationResult.status`, recomputed live |
| desired next state | Implicit — the next `gatedBy`-unblocked stage |
| allowed transitions | Not yet a named primitive — see Part 4 |
| capabilities granted/removed | Not yet named — see Part 3 |
| applicable requirements | `EvidenceRequirement[]` per stage |
| evidence authority | `RequirementGovernance.authoritativeEvidenceSource` |
| gaps | `OperationalGap[]` |
| recommendations | `OperationalRecommendation[]` |
| outcomes | `recruiting_lead_human_confirmations`, collector-run completions |
| effective dates | `RequirementGovernance.effectiveFrom` |
| versioning | `DesiredStateDefinition.version`, reusing `rule_versions` |

### 5.2 State: persisted, derived, or both?

**Default to deterministic evaluation from evidence — persistence is audit trail, never the source of truth.** This is already the proven Recruiting answer: the live page recomputes `evaluateRecruitingLifecycle()` fresh on every load from `recruiting_lead_observations`/`_inferences`/`_human_confirmations`/`_vendor_identities`; `recruiting_lead_desired_state_evaluations` is written by the collector run as an audit-trail snapshot, **never read back by the UI**. This avoids exactly the staleness bug a persisted "current state" column invites (a human confirmation added through some other path would otherwise require a fresh collector run just to "notice"). Every future domain lifecycle should follow this same split: (A) persisted rows exist for audit/history; (B) the number the user sees is always freshly computed from (A) plus whatever's been added since.

The one exception, per the platform architecture doc (Section 6, unchanged): a **terminal human-recorded Outcome** (a hiring decision, a care-plan approval) is itself an evidenced write — not a UI toggle of "current state," but a fact that the next live evaluation will read and reflect.

### 5.3 Six concepts that must not collapse

| Concept | Question it answers | Recruiting example |
|---|---|---|
| **Descriptive state** | Where is this person right now, factually? | "Application Received: satisfied" |
| **Desired state** | Where does Serve want this person to end up? | The lifecycle's terminal state(s) — e.g. "Employment Requirements Complete" |
| **Workflow stage** | Where is this in a specific team's process, independent of the person's factual state? | Not yet modeled in Recruiting — would matter more for e.g. a multi-step HR onboarding checklist |
| **Governance state** | Has policy formally adopted the rule that decides this? | `RequirementGovernance.status` (adopted/proposed/not_yet_adopted) |
| **Eligibility state** | Does this person satisfy one specific governed requirement, right now? | Per-`EvidenceRequirement` classification inside `evaluateDesiredState()` |
| **Readiness state** | Is everything a specific next activity needs in place? | "Scheduling Ready" as a whole Desired State, aggregating several eligibilities |

Collapsing "governance state" into "descriptive state" is exactly the Revision-1 mistake this project already made and corrected (resume absence briefly "blocked" Application Submitted before a governed, adopted resume requirement existed). This ontology exists partly to make that mistake structurally harder to repeat in every future domain.

---

## 6. Capability Model (Part 3)

### 6.1 Definition

A **Capability** is what a person is currently permitted, prepared, or operationally able to do — the actionable consequence of one or more satisfied Desired States/Requirements. It is not a state; it is what a state *unlocks*.

### 6.2 Required fields per capability

| Field | Meaning |
|---|---|
| capability key | `workforce.may_be_assigned_to_client` |
| subject role/lifecycle | Employee / caregiver, Employment lifecycle |
| operational meaning | Plain-language: what this actually lets someone do |
| conditions for activation | Which Desired States/Requirements must be satisfied |
| conditions for suspension/removal | What directly-observed evidence revokes it (never inferred silently) |
| governing authority | Which `RequirementGovernance` record(s) back it |
| evidence required | The underlying `EvidenceRequirement`(s) |
| binary / graded / scoped / time-bound | e.g. "may administer medication" could be scoped to a specific medication class and time-bound to a certification's expiry |
| dependencies | Other capabilities this one presumes (e.g. cannot mentor without first being an Active Caregiver) |
| risks of incorrect activation | Named explicitly — e.g. scheduling someone without a confirmed background check is a safety risk, not just a data error |
| downstream actions enabled | What Serve or a human may now do (assign a shift, run payroll, approve a care visit) |

### 6.3 Does Capability need a new stored primitive?

**No — not yet.** Model it initially as a **versioned, derived signal**, computed the exact same way a Desired State is computed today: a pure `evaluateCapability(definition, evidenceBundle, desiredStateResults)` function, with a `CapabilityDefinition` config object (mirroring `DesiredStateDefinition`) naming which Desired States/Requirements must be satisfied. Persist a `capability_grants`-style audit row **only** when a downstream system (payroll, scheduling) needs to query "is this active right now" without recomputing the whole lifecycle — and even then, prefer reusing the Action/Outcome pattern (a capability "grant" is an Outcome of an evaluated transition) over inventing a new table shape.

### 6.4 The Employment Record Confirmed example, worked correctly

**Employment Record Confirmed = satisfied** must grant *only*:
- the ability to continue employment onboarding.

It must **not** automatically grant:
- payroll readiness (a separate, later-gated Desired State — `Employment Requirements Complete`),
- scheduling readiness (gated further still),
- permission to perform every care service (a service-specific, role-specific, possibly clinical Requirement of its own, likely per-service).

This is already structurally true in the implemented engine — `Employment Requirements Complete` and `Scheduling Ready` are `gatedBy` chains, evaluated independently, never inferred from an earlier stage's success. Naming this explicitly as "Capability" doesn't change the mechanism; it gives the *business* a vocabulary for "what does this state actually let someone do" that the raw state name doesn't answer by itself.

---

## 7. Transition Model (Part 4)

### 7.1 Required fields

transition key · source state · target state · subject/lifecycle · purpose · prerequisites · required capabilities · evidence requirements · adopted blocking requirements · nonblocking considerations · authorized decision-maker · automated-vs-human boundary · allowed actions · outcome · rollback/reversal behavior · audit requirements.

### 7.2 Is Transition a new primitive?

**Mostly not — it is the `gatedBy` relationship already in `DesiredStateDefinition`, named and made independently inspectable.** Today, "Candidate Evaluation Complete → Hiring Decision Confirmed" already exists as an implicit consequence of stage ordering and gating. What's genuinely missing is a **named, queryable record of the transition itself** — separate from the two states it connects — mainly useful for: (a) explicitly marking which transitions are human-owned vs. automatic, and (b) recording *when* a transition actually occurred (as opposed to when a state was merely evaluated as satisfied). This is a **light, typed-configuration addition** (a `TransitionDefinition[]` alongside `DesiredStateDefinition[]`), not a new table, unless audit requirements later demand a persisted "transition occurred at T" row distinct from the state-evaluation audit trail already in place.

### 7.3 Vendor status changes are never Serve transitions by themselves

Restated as a hard rule, because it is the single most important governance boundary in this whole document: **a vendor status change becomes a Serve transition only when an approved, adopted Rule explicitly maps it.** Apploi moving a candidate to "Hired" on its own board is a vendor **Status**, not a Serve **State** — this project already enforces this distinction correctly (Hiring Decision Confirmed requires a `recruiting_lead_human_confirmations` row; Apploi's pipeline stage is only ever "optional supporting evidence").

### 7.4 Transitions that must remain human-owned

Hiring decision, termination decision, major care-plan approval, eligibility override, clinical judgment, disciplinary decision, end-of-life planning decisions. Each of these is modeled the same way Hiring Decision Confirmed already is: a `human_confirmation`-kind `EvidenceRequirement`, `governance.status: "adopted"`, never satisfiable by any vendor observation alone.

---

## 8. Evidence and Authority Model (Part 5)

Fully proven in Recruiting; this section formalizes it as the **universal contract** every future lifecycle requirement must declare — reusing `EvidenceRequirement`/`RequirementGovernance`/`NegativeEvidenceClass` verbatim, generalized only in *location* (a shared type module), never in shape.

### 8.1 Per-requirement declaration (unchanged fields, restated as the universal checklist)

authoritative source/source class · acceptable supporting sources · evidence scope · observation key · positive values · direct negative values · source-limited negative values · freshness limits · identity requirements · confidence requirements · whether human confirmation is permitted · whether conflicting sources require review.

### 8.2 The four-way evidence result (already implemented, now named universally)

| Case | Result | Recruiting proof |
|---|---|---|
| **A. Evidence absent** | `unknown` | Every `EvidenceRequirement` with no matching observation |
| **B. Direct negative evidence, authoritative, adopted+blocking** | Potentially `blocked` | The stage-inconsistency inference blocking Hiring Decision Confirmed |
| **C. Source-limited negative evidence** | `unknown` for the broader state, an **Integration Gap** | Apploi's `viventium_integration_status = no_integration_record_found` |
| **D. Conflicting evidence** | Explicit inconsistency requiring review | `recruiting.possible_pipeline_stage_inconsistency` / `cross_system_stage_inconsistency` |

### 8.3 The canonical worked example, restated as doctrine

> Apploi's "No Viventium integration record" may establish that no linked Viventium integration record is visible **in Apploi**. It may not establish that no Viventium employee exists.
> Viventium's "employee record exists" may establish that an employment record exists. It may not establish that the hiring decision was properly authorized, that candidate evaluation was completed, or that the caregiver is ready to schedule.

Every future domain's requirement declarations must pass this same test before being written: *what, precisely, does this source have the authority to prove — and what does it not?*

### 8.4 Evidence authority varies by domain

- **Recruiting/Employment:** Apploi and Viventium are authoritative for their own vendor-native facts only; hiring/termination decisions are never vendor-authoritative.
- **Resident/Clinical:** a wellness observation is authoritative for "this was observed," never for a diagnosis; a diagnosis, if it ever enters Serve, is only ever a human-confirmed clinical fact from a licensed source.
- **Relationship:** an interaction log is authoritative for "this was said/logged," never for the family's actual intent — intent requires a human-recorded Insight, not an inference.

---

## 9. Requirement Governance (Part 6)

Reuses `RequirementGovernance` unchanged, with the requirement-class enum expanded per the tasking:

```ts
type RequirementClass =
  | "organizational" | "regulatory" | "contractual" | "payer_specific"
  | "community_specific" | "role_specific" | "service_specific"
  | "clinical" | "safety" | "vendor_operational" | "proposed_internal_practice";
```

This is a pure enum expansion — no schema change, since `requirement_class`-equivalent data already lives in `rule_versions.parameters` jsonb (Recruiting's exact storage decision, reused).

**A common practice is never a requirement unless `status: adopted`.** This is the single rule that prevented Revision 1's resume-blocking bug and must be the same rule every future domain follows. **Vendor configuration is never Serve policy merely because it appears in a vendor UI** — e.g., a Viventium checklist item is evidence a vendor considers something relevant, not proof Serve has adopted it as blocking.

### 9.1 Requirements vary by

State, service type, caregiver role, resident need, community, payer, employment classification, geography, risk exposure — each of these becomes an `applicabilityConditions` value on the relevant `RequirementGovernance` record, evaluated the same way `EvidenceRequirement` matching already works. No new mechanism; more data, same shape.

---

## 10. Gap and Unknown Taxonomy (Part 7)

Today's implementation has three `OperationalGap` kinds (`blocking`, `integration`, `potential`) plus a bare `unknownEvidence: string[]` list that isn't yet wrapped in a typed Gap object. The tasking asks for nine. Here is the honest reconciliation — implemented vs. proposed, not blurred together:

| # | Gap kind | Trigger | Blocks a transition? | Status today |
|---|---|---|---|---|
| 1 | **Blocking Gap** | Adopted blocking requirement has direct authoritative negative evidence | Yes | **Implemented** |
| 2 | **Integration Gap** | Systems show inconsistent linkage/sync evidence | No | **Implemented** |
| 3 | **Evidence Gap** | Needed evidence hasn't been collected at all | No | **Partially implemented** — today a bare string in `unknownEvidence`; recommend formalizing as a typed `OperationalGap{kind:"evidence"}` (low-risk refactor, not urgent) |
| 4 | **Policy-Dependent Consideration** | Proposed/unadopted requirement appears unmet | No | **Implemented** (`kind: "potential"` — recommend renaming to match this vocabulary exactly in a later pass) |
| 5 | **Data Quality Gap** | Evidence is malformed, stale, duplicated, ambiguous, mismatched | Usually no, but may force `unknown` where it would otherwise resolve | **Not implemented** — the `ambiguous` `ObservationOutcome` already exists at the observation layer; a Desired-State-layer wrapper is new but small |
| 6 | **Human Decision Required** | Evidence sufficient, but an authorized person must decide | Depends on requirement | **Partially implemented** — `human_confirmation`-kind requirements already model this; not yet its own labeled Gap kind |
| 7 | **Operational Exception** | Normal lifecycle path can't be followed, needs review | Yes, until reviewed | **Not implemented** — analogous to the platform doc's `Signal`-based `.exception.` convention, never built for Recruiting |
| 8 | **Conflicting Evidence** | Two authoritative/material sources disagree | Requires review | **Partially implemented** — Rules E/F already detect this; not wrapped in Gap vocabulary |
| 9 | **Timeliness Gap** | A required action/review/evidence refresh is overdue | Depends | **Not implemented** — no freshness/staleness evaluation exists anywhere yet; `sourceFreshness` is displayed, never evaluated |

**Recommendation:** do not build 5-9 speculatively. Build them the same way 1-3 were built — when a real domain (Resident wellness follow-ups are the most likely first candidate for Timeliness Gap; a second vendor for a single fact is the most likely first candidate for Conflicting Evidence beyond Rules E/F) actually needs one, using this table as the pre-approved target shape.

**Unknown is never displayed as failure — restated as a hard UI rule** for every future domain, exactly as already built: `OperationalUnderstandingCard`'s copy explicitly states "An unresolved requirement is never displayed as if the candidate failed it."

---

## 11. Recommendation Model (Part 8)

Reuses `OperationalRecommendation` and `generateRecommendations()`/`selectNextRecommendedAction()` unchanged in mechanism; the tasking asks for more fields and an explicit priority order. Both are additive:

```ts
interface OperationalRecommendation {
  // existing fields, unchanged:
  desiredStateKey; requirementKey; requiredEvidence; observedEvidence;
  missingEvidence; explanation; recommendationText;
  // proposed additions — additive, non-breaking:
  subject?: string;               // which person/case this is about, when not implicit
  targetState?: string;           // the state this recommendation would help reach
  capabilityAffected?: string;    // once Capability (Part 3) exists
  priority?: RecommendationPriority;
  dueDateLogic?: string;
  closureCriteria?: string;
}

type RecommendationPriority =
  | "safety_legal_blocker" | "immediate_care_risk" | "payroll_employment_failure"
  | "time_sensitive_operational_blocker" | "earliest_actionable_uncertainty"
  | "efficiency_optimization" | "development_flourishing_opportunity";
```

**Never generate a recommendation solely because a raw observation exists** — already the enforced rule (`generateRecommendations()` only ever consumes `OperationalGap`/unresolved-stage objects, tested explicitly: "recommendations only ever derive from a Gap or an unresolved stage — never a raw observation directly").

### 11.1 Weak vs. strong, restated as the standard every future domain must meet

- Weak: *"Review candidate."* — Strong: *"Complete I-9 verification before assigning the employee to a schedule, if Serve adopts I-9 verification as a scheduling prerequisite and Viventium directly shows Not Verified."* — note the explicit governance conditional; a strong recommendation never asserts a requirement is adopted when it isn't.
- Weak: *"Check Viventium."* — Strong: *"Confirm Alma's hiring decision in Serve and reconcile the Apploi–Viventium linkage because Viventium contains an employee record while Apploi reports no linked integration record."* — this exact sentence is what the Operational Brief already produces today, verified by test, when both observations are present.

---

## 12. Domain Lifecycle Maps (Part 9)

### A. Caregiver / Workforce Lifecycle — already built, restated as the canonical reference

**States:** Lead → Candidate → Application Received → Candidate Evaluation Complete → Hiring Decision Confirmed → Employee Record (Employment Record Confirmed) → Employment Requirements Complete → Scheduling Readiness → Active Caregiver → Development → Recognition → Leadership → Leave → Restricted/Suspended → Separation → Alumni → Rehire Eligibility.

**Already implemented (7 of these):** Lead Identified through Employment Requirements Complete/Scheduling Ready, exactly as built. **Not yet designed:** Active Caregiver through Rehire Eligibility — deferred to Delivery Phase 5 (Part 15), since no evidence source (AxisCare, a quality system) exists for them yet.

**Evidence sources:** Apploi (candidate/application), Viventium (employment/payroll/I-9), Sapphire/background systems (not yet integrated — Module 1 remains Draft), AxisCare (future — scheduling/visit), Cinch (future, if caregivers ever cross into Cinch's service model), Serve human confirmations (hiring decision, terminations), future training/quality systems (Development/Recognition).

**Common gaps:** Integration Gap (Apploi↔Viventium linkage — built), Policy-Dependent Consideration (resume, interview method — built), future Timeliness Gap (I-9 re-verification windows), future Conflicting Evidence (two systems reporting different employment status).

**Example recommendation:** *"Confirm Alma's hiring decision in Serve and reconcile the Apploi–Viventium linkage..."* (built, tested, live).

**Unresolved design questions:** where "Active Caregiver" evidence comes from before AxisCare integration exists; how Leave/Restricted/Suspended interact with payroll (do they pause Employment Requirements Complete or sit alongside it?); whether Rehire Eligibility is a Requirement (governed, evidenced) or a plain historical fact.

### B. Resident / Client Lifecycle — first pass

**States (smallest durable set):** Inquiry → Relationship Established → Assessment → Service Opportunity → Service Plan → Active Client → *(ongoing, non-linear: Stable ↔ Needs Attention ↔ Service Change ↔ Temporary Pause ↔ Hospitalization ↔ Return Home)* → Transition to Higher Care → End of Life → Bereavement Follow-Up → Closed Relationship.

The middle band (Stable/Needs Attention/Service Change/Temporary Pause/Hospitalization/Return Home) is **not a strict sequence** — a resident cycles among these repeatedly, unlike Recruiting's mostly-linear chain. This is a genuine structural difference the ontology must not paper over: model this band as a **current-state classifier re-evaluated on every new wellness observation**, not a `gatedBy` chain.

**Evidence sources:** Serve Intake (inquiry, assessment, preference, consent), Serve OS (relationships, wellness notes, current needs, working notes), Cinch (service delivery, visit completion — where available), AxisCare (schedule/visit — future), family communications, caregiver observations.

**Explicitly not reduced to billing/service status:** dignity, autonomy, safety, relationship continuity, and flourishing are first-class considerations at every state (Part 13, Flourishing Framework) — a resident who is "Stable" on a billing/service read can simultaneously have an unresolved dignity/autonomy concern the lifecycle must still surface.

**Common gaps:** Evidence Gap (assessment overdue), Timeliness Gap (wellness follow-up overdue — the most likely first REAL use of that not-yet-built gap kind), Human Decision Required (a care-plan change needs family/clinical sign-off).

**Unresolved design questions:** whether "Needs Attention" should itself be a Desired State or a Signal/Exception (platform doc's convention) layered on top of "Active Client"; how clinical judgment (never Serve-inferred) enters this lifecycle without Serve appearing to make a diagnosis.

### C. Family / Responsible-Party Lifecycle — first pass

**States:** Unknown → Identified → Relationship Established → Consent/Authority Confirmed → Trust Building → Active Care Partner → *(non-linear: Needs Support ↔ Conflict or Concern)* → Advocate → Bereaved → Continuing Relationship.

**Evidence sources:** Relationship Intelligence's existing Interaction/Insight/Commitment/Open Loop model (already built — see Part 12F, do not duplicate), Serve Intake consent capture, resident/family communications.

**Key distinction:** "Consent/Authority Confirmed" is a `human_confirmation`-kind, `adopted` requirement (never inferred from a form checkbox alone unless that checkbox itself is the governed evidence source) — the same discipline as Hiring Decision Confirmed.

### D. Professional Referral / Partner Lifecycle — first pass

**States:** Identified → Introduced → Engaged → Referral Source → Collaborating → Trusted Partner → Strategic Partner → *(non-linear: Dormant ↔ At Risk)* → Closed.

**Evidence sources:** Relationship Intelligence's existing model again — a referral partner is a `Relationship` with `relationship_type = "referral_source"` already in the schema (`RelationshipType`, `lib/supabase/types.ts`). This lifecycle is almost entirely a *relabeling* of `PipelineStage` transitions already tracked, not a new evidence model.

### E. Care Delivery Lifecycle — clarify its nature first

**It is a service-engagement/assignment lifecycle, not a human lifecycle.** A single caregiver (Workforce lifecycle) delivers care to a single resident (Resident lifecycle) through a Care Delivery *engagement* that has its own short lifecycle: Need Identified → Service Authorized → Scheduled → Assigned → Delivered → Verified → *(non-linear: Follow-Up Needed ↔ Adjusted ↔ Paused)* → Closed. It references both a caregiver-subject and a resident-subject but is itself neither — it is closer to the platform architecture doc's `Case` concept (Section 4/6) than to a Person's own lifecycle. **Recommendation:** model Care Delivery as its own subject type (a service engagement/visit), not as a stage bolted onto either person's lifecycle.

### F. Relationship Lifecycle — explicitly reused, not duplicated

Relationship Intelligence Phase 1 (already implemented: `relationships`, `PipelineStage`, `RelationshipTouch`/`Insight`/`Commitment`/`OpenLoop`) **is the CRM/engagement layer**, distinct from a human's lifecycle state. A `Relationship`'s `stage` (new_inquiry → ... → won/closed_lost) describes Serve's *engagement process* with a person or organization; a human lifecycle state (e.g. "Application Received") describes the *person's own operational position*. Both may exist simultaneously for the same person without contradiction — e.g. a family is simultaneously "Active Care Partner" (their own lifecycle state) and "Won" (the Relationship's pipeline stage covering how Serve engaged them). **This ontology does not create a second CRM entity — it references the existing `relationships` row wherever a lifecycle needs relationship context, exactly as Part 9C/D already do.**

---

## 13. Flourishing Framework (Part 10)

Flourishing is **not** a lifecycle stage, a score, or a synonym for independence or happiness. It is an **orienting framework**, applied *across* every lifecycle above, to keep the question "is this operationally efficient" from silently replacing the question "is this actually good for the person." It is evaluated per-domain below, never as one number.

| Domain | Serve may observe | Must remain human-reported | May be inferred (if anything) | Actions Serve may recommend | Risk of overreach | Uncertainty language |
|---|---|---|---|---|---|---|
| **Dignity** | Whether a service/decision preserved a person's own stated preferences | Whether they *felt* respected | Never | Flag a decision made without documented preference-check | Assuming dignity is preserved because a checkbox was completed | "No preference was recorded before this decision was made." |
| **Autonomy** | Whether a person made their own choice vs. one made for them | Whether they *wanted* more/less autonomy | Never | Recommend a supported-decision conversation, never a takeover | Treating declining independence as automatic incapacity | "This choice was made on the resident's behalf; whether that was requested or assumed is not recorded." |
| **Belonging** | Frequency/pattern of social/community engagement events | Whether they *feel* they belong | Weakly, only as "engagement frequency changed," never "feels isolated" | Suggest a community-connection touch, never diagnose loneliness | Pathologizing normal solitude preference | "Engagement frequency has changed; whether this reflects the resident's own preference is unknown." |
- Purpose, Comfort, Meaningful Connection, Contribution, Growth, Recognition, Spiritual/Personal Meaning, Continuity of Identity, Supported Choice, Reduced Avoidable Burden — each follows the identical five-column discipline above: **observe behavior/events, never claim the inner state; infer only the narrowest possible fact if at all; recommend a human conversation or a concrete adjustment, never a judgment; name the overreach risk explicitly; write the uncertainty sentence in the passive, evidence-first voice already proven in the Recruiting Operational Brief.**

### 13.1 For seniors and people in decline — explicit commitments

Interdependence rather than forced independence; supported decision-making; dignity under limitation; meaningful participation appropriate to current capacity; comfort; connection; continuity of identity; agency appropriate to capacity; flourishing through the final seasons of life — including decline, caregiving, aging, and end of life, without treating any of these as a lifecycle failure state. **A resident approaching end of life is not "failing" the Resident lifecycle** — End of Life and Bereavement Follow-Up (Part 12B) are named, dignified states with their own purpose and owner, exactly as Blocked/Unknown are named, non-punitive states in Recruiting.

---

## 14. Vendor Evidence Mapping (Part 11)

| Vendor | Authoritative for | Supporting only | Prohibited inference | Source-limited negative example | Freshness expectation | Likely strategy |
|---|---|---|---|---|---|---|
| **Apploi** | Candidate/application existence, application-level activity, its own integration-linkage view | Position, resume presence, communication timeline | Whether a hire actually occurred; whether Viventium has a record | "No Viventium integration record" (Integration Gap, not proof of absence) | Re-collect per supervised flight; no freshness SLA defined yet | Supervised browser collector today (built); API only if/when Apploi grants one |
| **Viventium** | Employment record existence, employment status, payroll/HR evidence, I-9/eligibility status | Onboarding stage detail | Whether a candidate was properly evaluated; whether the hiring decision was authorized | (once collected) an onboarding-stage label alone never proves compliance-requirement completion | To be defined at Phase 2 (Part 15) | Supervised browser collector (Phase 1 reconnaissance built this session, not yet run) |
| **AxisCare** | Caregiver/client record existence, availability, schedule, visit occurrence, its own payroll/billing view | Care-plan/service-delivery detail as actually exposed | Clinical judgment; whether a visit was clinically adequate | A missed clock-in never proves a visit didn't happen | Not yet defined — no collector built | Future collector, same supervised model |
| **Cinch** | Short-visit service delivery, completed visit, community-care evidence | Scheduling detail, where available | Overall care-plan adequacy | A short/no-note visit never proves a resident's need went unmet | Not yet defined | Future collector |
| **Serve Intake** | Inquiry, initial assessment, referral, stated preference, consent | — | Ongoing preference (people change their minds — this is a point-in-time capture) | — | Already immutable/point-in-time by design | Already integrated (existing) |
| **Dialpad / Gmail** | That a communication/commitment was logged | Relationship context, follow-up evidence | The other party's actual intent or satisfaction | A missed call never proves disengagement | Not yet defined | Future collector, likely API (both plausibly have one) |
| **Serve OS itself** | Canonical relationships, human confirmations, desired-state evaluations, gaps, recommendations, actions, outcomes, governance, audit trail | — | Nothing outside its own recorded facts — Serve OS is authoritative for *what Serve recorded*, never for underlying vendor/clinical truth it didn't directly observe | — | Always current — it's the audit trail itself | N/A |

**Vendors never define Serve's ontology** — every row above is phrased as "authoritative for," never "defines," precisely so a future vendor swap (a new ATS, a new payroll system) only ever changes a Collector, never a lifecycle definition.

---

## 15. Implementation Mapping (Part 12)

**A. Existing primitives reused unchanged:** `Subject` (conceptual — a lead/resident/relationship row), `HistoricalFact`-equivalent (`recruiting_lead_observations`), `Rule`/`RuleVersion`/`RuleRun`-equivalent (`recruiting_lead_rules`/`rule_versions`, reused for Desired State evaluators), `Recommendation`-equivalent (`OperationalRecommendation`), `Action`/`Outcome`-equivalent (`recruiting_lead_human_confirmations`, collector runs), `Explanation`-equivalent (every gap/recommendation's `description`/`explanation` field), `DesiredState`/`Requirement`/`RequirementStatus`-equivalent (`DesiredStateDefinition`/`EvidenceRequirement`/`DesiredStateEvaluationResult`), `Collector`/`CollectorRun` (`lib/collectors/types.ts`, `recruiting_lead_collector_runs`), the three evidence classes, `NegativeEvidenceClass`, the gap kinds (3 of 9 built).

**B. Primitives needing terminology/typing updates (additive, non-breaking):** `RequirementClass` enum expansion (Part 9); `OperationalRecommendation` additive fields (Part 11); `GapKind` expansion path (Part 10, only as each is actually needed); a `TransitionDefinition` type alongside `DesiredStateDefinition` (Part 7).

**C. Configuration that can live in code initially:** every `DesiredStateDefinition`/`EvidenceRequirement`/`RequirementGovernance` for every domain in Part 12 — exactly as Recruiting's are today, in `lib/recruiting/operationalUnderstanding/desiredStates.ts`. A future `lib/resident/operationalUnderstanding/desiredStates.ts`, `lib/family/...`, etc. follow the identical pattern.

**D. Configuration that should eventually become persisted and governed:** `RequirementGovernance` records themselves, once a non-engineer (a compliance owner, an HR policy owner) needs to adopt/revise a requirement without a code change — this is explicitly deferred (Delivery Phase 6+), matching the platform doc's own open question about who owns `DesiredState`/`ReviewGate` as policy artifacts.

**E. Truly new primitives, if any:** **Capability** (Part 3) — a versioned derived signal, no new table required initially. **Transition** (Part 4) — a named config object, no new table required initially, unless audit needs a persisted "transition occurred at T" row later. **Person cross-reference linking** (`person_identity_links`, Part 4.1) — deferred until a real cross-domain identity need exists. **`workforce_members`** — a genuinely new, small table, justified because Employment/Scheduling literally have no identity anchor today; recommended at Delivery Phase 1.

**F. Existing tables reused:** `recruiting_leads`, `residents`, `relationships` (+ its Insight/Commitment/OpenLoop/Touch family), `recruiting_lead_observations`/`_inferences`/`_human_confirmations`/`_vendor_identities`/`_rules`/`_rule_versions`/`_desired_state_evaluations`/`_desired_state_evaluation_evidence`.

**G. New tables, if any, with strong justification:** none proposed *in this design phase*. `workforce_members` (E, above) is the one table this document recommends building, but only at Delivery Phase 1, not now — this document authorizes no migration.

**H. Migration risks:** none today, because nothing is being migrated. The named future risk: if/when a shared cross-domain persistence layer is eventually built (platform doc Section 21/35 Phase 5), every domain-scoped table (`recruiting_lead_*`, future `resident_*`, `workforce_*`) was deliberately shaped to migrate by rename, not redesign — restated here as a binding constraint on any future domain's table design.

**I. Backward compatibility:**
- **Recruiting Operational Understanding:** fully unaffected — this document formalizes its vocabulary, changes none of its code.
- **Relationship Intelligence:** unaffected — Part 12F explicitly reuses it rather than duplicating.
- **Resident memory / wellness notes / follow-ups:** unaffected — Part 12B explicitly builds the Resident lifecycle *on top of* `ResidentCurrentNeeds`/`ResidentWorkingNote`/`ResidentWellnessNote`/`ResidentWellnessFollowUp`, never replacing them (Part 16, Example 3).
- **Existing vendor evidence / recruiting lead pages:** unaffected — no schema change, no UI removal, only additive vocabulary.

**J. Understandability for nontechnical users:** the vocabulary in Part 3 is deliberately plain-English and was chosen so a Recruiting/HR/Resident-Care staff member can read "Blocking Gap" / "Policy-Dependent Consideration" / "Unknown" and understand what it means for their specific case without needing the underlying type names — this is already proven by the Operational Brief's actual copy, tested against exactly this bar ("give a normal office user a useful answer in seconds").

---

## 16. Worked Examples (Part 13)

*Fictional/placeholder Viventium values below are used only to illustrate the model — Phase 1 Viventium reconnaissance has been built but not yet run for real, per the prior phase's report. No sensitive values (SSN, DOB, bank details, full address) appear anywhere below, consistent with the reconnaissance tool's own redaction rule.*

### 16.1 Alma — Caregiver Recruiting and Employment

**Canonical person:** Alma Dhora Owolabi (anchored today by one `recruiting_leads` row).
**Roles:** caregiver candidate (active), employee (not yet — no `workforce_members` row exists), caregiver (not applicable yet).
**Vendor identities:** Apploi candidateID (human-confirmed); Viventium employeeID (illustrative only — not yet linked).
**Lifecycle participations:** Recruiting (active); Employment/Scheduling/Care Delivery (not applicable, gated).

**States (as actually evaluated this session):**

| Desired State | Status |
|---|---|
| Lead Identified | Satisfied |
| Application Received | Satisfied (once `apploi.application_exists` was implemented and observed true) |
| Candidate Evaluation Complete | Unknown |
| Hiring Decision Confirmed | Unknown |
| Employment Record Confirmed | Unknown (or Satisfied — pending real Phase 1 Viventium reconnaissance) |
| Employment Requirements Complete | Not Applicable |
| Scheduling Ready | Not Applicable |

**Capabilities:** none yet granted beyond "continue through Recruiting" — Employment/Scheduling capabilities are gated and not applicable.

**Requirements:** vendor-identity confirmation (adopted); `apploi.application_exists` (adopted); resume collection (proposed, not adopted — Policy-Dependent Consideration only); a governed evaluation method for Candidate Evaluation Complete (proposed, not yet defined which method Serve adopts).

**Evidence authority:** Apploi is authoritative for application/candidate-record existence and its own integration-linkage view only; Viventium (once collected) is authoritative for employment-record existence and I-9 status only — neither is authoritative for the hiring decision.

**Gaps:** Policy-Dependent Consideration (resume not present, no adopted requirement makes this blocking); Integration Gap or (if Viventium's positive record is observed) the reconciliation-flavored Integration Gap — *"Viventium contains an employee/new-hire record, while Apploi reports no linked Viventium integration record for this application. This is a reconciliation issue, not proof that either system is wrong."*

**Recommendation (as actually generated):** *"Collect direct candidate-evaluation evidence from Apploi and direct employment-record evidence from Viventium before determining hiring or readiness state."*

**What remains unknown:** interview/evaluation outcome; hiring decision; (pending real reconnaissance) whether payroll/I-9 requirements are complete.

**What must be human-confirmed:** the hiring decision, always; the first Viventium↔Serve vendor identity link; any resume/evaluation-method requirement adoption, if Serve chooses to adopt one.

### 16.2 Caregiver Ready to Schedule

Distinguishing the four things "ready to schedule" actually requires, none of which imply the others:

| Sub-question | Evidence | Requirement governance |
|---|---|---|
| **Employment existence** | Positive Viventium employee-record observation | Adopted (already modeled) |
| **Payroll readiness** | I-9/W-4/direct-deposit all `completed` | I-9 regulatory (proposed pending scoping); W-4/direct-deposit organizational (proposed) |
| **Compliance readiness** | Background check result, if/when Module 1 is adopted | Not yet adopted — Module 1 remains Draft |
| **Service-specific qualification** | A certification/training record, per service type | Not yet modeled — no training/quality system integrated |
| **Availability** | A caregiver-supplied schedule preference | Not yet modeled — no scheduling collector |
| **Assignment fit** | A specific client's needs matching this caregiver's qualifications/availability | Not yet modeled — this is Care Delivery (Part 12E), not the Workforce lifecycle itself |

**Recommendation:** "Scheduling Ready" should remain `not_applicable` until every one of these six sub-questions has at least a declared (even if `proposed`) `EvidenceRequirement` — never approximated from just one or two.

### 16.3 Resident Need Change

A resident's caregiver logs a wellness observation suggesting a change in support needs (e.g., increased assistance needed with a daily task) — using the **already-built** `ResidentWellnessNote`/`ResidentWellnessFollowUp` model, never a new entity:

```
Observation:     ResidentWellnessNote (observed_at, observation, signals: [mobility, personal_care])
Signal:          signal_type derived deterministically from the note's own signals field (already built)
Current Needs:   ResidentCurrentNeeds — NOT auto-updated; a new version requires a human to write it,
                 citing the wellness note as source_label (already built, versioned, never silently overwritten)
Desired State:   "Service Plan reflects current needs" — not yet a named Desired State; would be modeled
                 exactly like a Recruiting stage, gated by whether a Current Needs update has occurred
                 since the triggering wellness note
Capability:      "may receive an adjusted service plan" — gated on the above
Gap:             Evidence Gap ("a Current Needs update has not yet been recorded since this observation")
                 or Timeliness Gap if a follow-up window has passed — the first real use case for that
                 not-yet-built gap kind
Follow-up:       ResidentWellnessFollowUp (already built — follow_up_type, due_at, priority)
Human review:    A clinical/care-team judgment on whether the service plan actually needs to change —
                 Serve never infers this; the follow-up's own completion is the recorded Outcome
Service change:  If approved, a new ServiceOpportunity/plan revision — outside this document's scope,
                 already modeled elsewhere in the Relationships/Resident work
```

No clinical diagnosis is made anywhere in this chain — Serve observes, flags a gap, and creates a follow-up; a human decides what it means.

### 16.4 Family Relationship and Follow-Up

A family member calls with a concern; Serve logs the interaction and makes a commitment — using the **already-built** Relationship Intelligence Phase 1 model, no new entities:

```
Interaction:      RelationshipTouch (touch_type: call, interaction_result: information_received)
Insight:          RelationshipInsight (category: concern_or_barrier, content, why_it_matters) —
                  durable context, not a one-time note
Commitment:       RelationshipCommitment (description: "Call back with an update by Friday",
                  responsible_party_type: serve, expected_date)
Open Loop:        RelationshipOpenLoop, only if the family's actual question remains unresolved
                  (e.g. "Family asked whether X is possible — needs a clinical answer before we respond")
Next Action:      Derived exactly the way Recruiting's is — from the open Commitment/Open Loop,
                  never invented from the raw Touch record alone
Relationship stage: Unaffected unless the concern itself changes the engagement's pipeline stage
                  (e.g. "Needs Attention" as an exception layered on top, not a stage change by itself)
```

The Family/Responsible-Party *human lifecycle* state (Part 12C: "Active Care Partner," "Conflict or Concern") is evaluated from this SAME evidence — the Relationship entity is not duplicated, only read from, exactly as Part 12F requires.

---

## 17. Governance and Safety Boundaries (Part 14)

| Safeguard | Mechanism already proven / to be reused |
|---|---|
| Inventing facts | Collector contract structurally forbids negative-conclusion outcomes (`ObservationOutcome` closed to observed/unknown/ambiguous/not_visible) |
| Over-inference | Every rule/requirement is versioned, explainable, and cites exact supporting evidence IDs |
| Vendor status becoming Serve truth without a rule | Part 7.3 — a hard, restated rule |
| Conflating missing evidence with failure | The `unknown`/`not_applicable` statuses, non-punitive by construction, tested explicitly |
| Automated high-impact employment/care decisions | `human_confirmation`-kind, `adopted` requirements for every such decision (Part 7.4) |
| Collecting unnecessary sensitive data | The Viventium reconnaissance's explicit redaction filter (SSN/bank/DOB/address patterns), reused as the template for every future domain's reconnaissance |
| Exposing protected data in UI | `sensitivity` field already on every observation; shortened/truncated display for identifiers (`shortenVendorId`) |
| Paternalistic flourishing judgments | Part 13's five-column discipline (observe/human-reported/inferred/recommend/risk) applied to every domain |
| Discriminatory capability classification | Capability activation conditions must cite an evidenced, governed requirement — never a protected characteristic, never an ungoverned heuristic |
| Outdated evidence | Timeliness Gap (Part 10, #9) — proposed, to be built when a real domain needs it |
| Identity mismatches | The vendor-identity hard-stop-on-mismatch already proven; extended to `person_identity_links` when built |
| Opaque recommendations | Every recommendation's mandatory fields (Part 11) |
| Ungoverned requirements | `RequirementGovernance.status` — never blocking unless `adopted` |
| Silent rule changes | `RuleVersion` immutability — a changed threshold is a new version, never an edit |
| Recommendation overload | "Only the highest-precedence, earliest-in-lifecycle" surfacing rule, already implemented and tested |

### 17.1 Decisions that must remain human-owned (restated, canonical list)

Hiring decision, termination decision, major care-plan approval, eligibility override, clinical judgment, disciplinary decision, end-of-life planning decisions, first vendor-identity link confirmation, requirement adoption itself.

### 17.2 Audit requirements

Human confirmations, overrides, requirement adoption, rule version changes, capability activation, transition approval, and recommendation closure are all **append-only, attributed, timestamped** — the same discipline already enforced for `recruiting_lead_human_confirmations`/`_inferences`/`_desired_state_evaluations`, extended without exception to every future domain table.

---

## 18. Incremental Delivery Plan (Part 15)

| Phase | Objective | Scope | Success criterion | Risk | Evidence required | Explicitly deferred |
|---|---|---|---|---|---|---|
| **1** | Finalize workforce lifecycle + employment capability model using Alma | Name Capability/Transition as typed config over the existing 7-stage engine; decide `workforce_members` table shape | A reviewer can read the capability list for "Employment Record Confirmed" and know exactly what it does/doesn't unlock | Low — additive typing only | None new — reuses what's collected | Active Caregiver→Rehire Eligibility states |
| **2** | Minimum Viventium evidence collector | `viventium.employee_record_exists`, I-9 status, 1-2 governed employment requirements | Real Viventium observations persist and evaluate correctly | Medium — first real Viventium selectors, unknown DOM | Phase 1 reconnaissance (built, not yet run) actually run | Full Viventium field set (payroll detail, training/licenses) |
| **3** | First useful cross-system Operational Brief | Already built this session for the hypothetical case; verify against real data | The brief is accurate for Alma's real, persisted cross-system evidence | Low — logic already tested | Phase 2's real observations | Broader vendor set (AxisCare, Cinch) |
| **4** | List-level change detection + local assisted automation | A cheap list-level diff so only changed/new/ambiguous candidates get a full record read | Hud stops needing to open every record manually to check for changes | Medium — needs a durable local collector service, addressed in the prior phase's Phase 5 report | A persisted "last known list-level state" | Any fully unattended/API-based collection |
| **5** | Extend to caregiver scheduling readiness | Availability + assignment-fit evidence, AxisCare collector | Scheduling Ready evaluates meaningfully for at least one real caregiver | Medium-high — new vendor, new DOM | AxisCare reconnaissance (not built) | Full scheduling optimization |
| **6** | Extend to resident/client lifecycle | Build the Resident Desired-State engine (Part 12B), reusing existing wellness/current-needs/relationship data | A real resident's lifecycle evaluates from already-collected evidence, no new collector needed first | Low-medium — mostly reuse | Existing resident tables | Clinical/assessment automation |
| **7** | Flourishing-oriented outcomes + relationship intelligence integration | Wire Part 13's framework into the Resident/Family Operational Brief | A family/resident brief surfaces a flourishing-relevant consideration at least once, without becoming a score | Medium — genuinely new, easy to get wrong | Real resident/family cases | Any numeric flourishing score (explicitly never built) |

---

## 19. Open Decisions (require Hud's approval before proceeding)

1. Whether to build `workforce_members` now (Delivery Phase 1) or continue treating Alma as a `recruiting_leads` row indefinitely.
2. Whether "Application Received" should ever be satisfiable by a confirmed candidate record alone, or must always require `apploi.application_exists` (currently: always requires it — Decision 1 from the prior phase, unchanged here).
3. Whether Care Delivery (Part 12E) should be modeled as its own new "engagement/visit" subject type now, or deferred entirely until AxisCare/Cinch collectors exist.
4. Which of the six not-yet-implemented Gap kinds (Part 10, #5-9) to build first — this document recommends Timeliness Gap (via Resident wellness follow-ups) as the most concretely motivated, but that's a recommendation, not a decision.
5. Whether `RequirementGovernance` records should move from code (`rule_versions.parameters`) to a persisted, non-engineer-editable governance UI, and if so, who owns adoption authority for each requirement class.
6. Whether the Relationship lifecycle's `PipelineStage` and a person's own human-lifecycle state should ever be displayed together on one page, or kept in clearly separate UI zones (this document recommends separate zones, per Part 12F).
7. Prioritization among Delivery Phases 5-7 — scheduling readiness vs. resident lifecycle vs. flourishing — since they're roughly independent after Phase 4.

## 20. Recommendation on What to Build Next

**Delivery Phase 1** — finalize the Capability/Transition typed-configuration layer over the *already-built* Recruiting engine using Alma as the concrete test case, and decide the `workforce_members` question (Open Decision 1) — before writing a single line of new Viventium selector code. This keeps the sequence honest: name the pattern precisely on the one domain that's fully proven, *then* let Phase 2 (real Viventium collection) exercise it for real.

---

*This document proposes no schema change, no migration, and no new stored primitive beyond what Part 15 explicitly schedules for later phases. It has not been implemented. Awaiting Hud's review of Part 19's open decisions before any further design or implementation work proceeds.*
