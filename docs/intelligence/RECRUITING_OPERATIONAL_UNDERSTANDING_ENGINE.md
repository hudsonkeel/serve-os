# Recruiting Operational Understanding Engine

**Document Type:** Domain-scoped design — first reference implementation of "Gap-Based Operational Intelligence"
**Status:** Draft — Design Only, Nothing Built. **Revision 2** — corrects an evidentiary-boundary violation in Revision 1's worked example (resume absence was treated as blocking Application Submitted; Apploi's own negative Viventium-integration report was treated as proof no employment record exists). Neither correction changes the architecture's good decisions (§8); both narrow what the engine is permitted to conclude from a given observation.
**Relationship to prior work:** narrows and makes concrete the same conceptual loop already specified, more generally and more heavily, in [`SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md`](./SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md). Builds directly on the recruiting-domain tables that already exist (`recruiting_lead_observations`, `recruiting_lead_rules`, `recruiting_lead_rule_versions`, `recruiting_lead_inferences`, `recruiting_lead_human_confirmations`) rather than the heavier `Case`/`Workflow`/`ReviewGate` apparatus.
**Last Updated:** 2026-07-21

---

## 1. Governing principle (unchanged)

Turn persisted evidence into a defensible statement of where an operational case stands, using only deterministic rules — no AI, no probability, no heuristic scoring. Every output names the desired state, the required evidence, what was actually observed, what's missing, and the exact rule version that produced the conclusion.

**Revision 2 adds a second, equally load-bearing principle, made explicit because Revision 1 violated it:** *an observation may only be used for exactly what it directly proves, from exactly the source that produced it, and never generalized to a broader claim the source was never in a position to make.* "Apploi shows no resume" proves something about Apploi's resume field. It does not, by itself, prove anything about whether Serve requires a resume, whether the application is complete, or whether the candidate can progress. Confusing "an observation exists" with "an observation settles this question" is exactly the error this revision removes.

---

## 2. The loop, mapped to concrete primitives (unchanged)

| Loop step | Concrete primitive | New or existing |
|---|---|---|
| Desired State | `DesiredStateDefinition` (versioned, declarative TS data) | New |
| Observed State | `recruiting_lead_observations` rows | Existing |
| Gap Detection | `evaluateDesiredState()` — pure function | New |
| Operational Understanding | `DesiredStateEvaluation` (persisted) | New |
| Next Recommended Action | `OperationalRecommendation` (derived from Blocking Gaps only) | New |
| Evidence Still Needed | `missingEvidence` on the Gap/Evaluation | New |

Each `DesiredStateDefinition` still registers as a row in the existing `recruiting_lead_rules` / `recruiting_lead_rule_versions` tables (slug `desired_state.<key>`). **New in this revision:** the governance metadata for each requirement (§4) lives in that same rule version's existing `parameters` jsonb column — no new governance table is needed, matching the Engineering Standards' existing "thresholds live in `RuleVersion.parameters`" discipline, extended to *whether a requirement is even allowed to block anything yet*.

---

## A. Updated lifecycle recommendation

Adopting your proposed rename, with one explicit judgment call flagged for your confirmation rather than silently decided:

1. **Lead Identified**
2. **Application Received**
3. **Candidate Evaluation Complete**
4. **Hiring Decision Confirmed**
5. **Employment Record Confirmed**
6. **Employment Requirements Complete**
7. **Scheduling Ready**

**"Interview Completed" is removed as a universal stage.** It becomes one *possible* governed requirement feeding "Candidate Evaluation Complete" (§4 below) — not the stage itself. A future role or process may evaluate candidates a different way; the stage name no longer assumes interviews are the only mechanism.

**Recommendation requiring your confirmation:** I did not fold "Application Complete" back in as its own top-level stage. Instead, artifact-completeness questions (a resume, references, work-history detail) are represented as *requirements attached to* "Candidate Evaluation Complete," each individually governed (§4) — none of them currently adopted, so none currently affects that stage's status beyond an informational note. If you'd rather have a distinct "Application Complete" stage sitting between Application Received and Candidate Evaluation Complete, that's a straightforward change to this document before implementation — I'm flagging the choice rather than deciding it, per your instruction to report before changing the lifecycle.

Per-stage detail:

### 1. Lead Identified
- **Purpose:** A real, specific person is being tracked by Serve, with a vendor identity Serve trusts.
- **Required evidence:** confirmed `recruiting_lead_vendor_identities` row (`is_human_confirmed = true`), **or** directly observed `apploi.candidate_name` matching the lead's name on file.
- **Blocking conditions:** a vendor-identity mismatch (already a hard stop at collection time).
- **Completion criteria:** vendor identity confirmed, or candidate name corroborated.
- **Operational owner:** Recruiting staff.

### 2. Application Received
- **Purpose:** Confirms an application-level relationship exists in the vendor system — nothing about completeness or quality.
- **Required evidence:** a directly observed application-existence signal (e.g. a future non-"New" `apploi.application_status`/`pipeline_stage`, or `apploi.application_submitted = true` from the guided-manual key set).
- **Open question flagged for you, not decided here:** does a confirmed Apploi *candidate record* (`candidate_name` + `position`, already collected for Alma) itself constitute sufficient evidence of "Application Received," since Apploi is fundamentally an applicant-tracking system? I have **not** assumed yes. Until a governed requirement says so explicitly, this stays **unknown** rather than satisfied — see §D.
- **Blocking conditions:** none currently governed (adopted) — see §4.
- **Operational owner:** Recruiting staff.

### 3. Candidate Evaluation Complete
- **Purpose:** Confirms Serve has gathered what it needs to make a hiring decision — the *mechanism* (interview, work sample, reference check) is a governed requirement, not assumed by the stage itself.
- **Required evidence:** at least one **adopted** evaluation-completion requirement. Today, none is adopted — "interview completion" exists only as a **proposed** requirement (§4), so this stage cannot currently resolve to `satisfied` no matter what's observed.
- **Optional supporting evidence:** `recruiting.interview_activity_present`, `recruiting.interview_scheduled_or_rescheduled` (Rule A/C) — informative, never sufficient.
- **Unknown conditions:** `recruiting.interview_completion_unconfirmed` (Rule D) reused verbatim as this stage's canonical "why unknown" explanation once an interview-based requirement is adopted.
- **Operational owner:** Hiring manager / interviewer.

### 4. Hiring Decision Confirmed
- **Purpose:** Serve itself made a go/no-go decision.
- **Required evidence:** exactly one `recruiting_lead_human_confirmations` row, `confirmation_key = "hiring_decision"`.
- **Blocking conditions (adopted, organizational — see §4):** an unresolved `recruiting.possible_pipeline_stage_inconsistency` or `recruiting.cross_system_stage_inconsistency` blocks this stage until a human resolves it. This is the one blocking rule in the whole model that predates this document — it was already established, repeatedly, as a standing project rule ("don't let reasoning race ahead of an acknowledged conflict"), not invented for this engine.
- **Operational owner:** Hiring manager / executive.

### 5. Employment Record Confirmed *(renamed from "Employment Record Created")*
- **Purpose:** A real employee record exists in the payroll/HR system.
- **Required evidence:** a directly observed **positive** Viventium employee-record signal, **or** an authorized human confirmation from a governed source.
- **Blocking conditions:** **none.** Corrected per §B/§C — Apploi's own negative integration report can never block this stage.
- **Unknown conditions (default today):** no positive Viventium evidence has ever been collected.
- **Operational owner:** HR/payroll admin.

### 6. Employment Requirements Complete *(renamed from "Payroll Ready")*
- **Purpose:** I-9, W-4, and direct deposit are all complete.
- **Gated by:** stage 5. Since stage 5 is `unknown` (not `satisfied`) for Alma today, this stage evaluates to **`not_applicable`**, per the existing gating rule (§ Algorithm, unchanged).
- **Operational owner:** HR/payroll admin.

### 7. Scheduling Ready
- **Purpose:** The new hire can be scheduled.
- **Gated by:** stage 6 → `not_applicable` while stage 6 is anything but `satisfied`.
- **Operational owner:** Scheduling coordinator.

---

## B. Updated evidence-authority model

New structural type, attached to every `EvidenceRequirement`:

```ts
type NegativeEvidenceClass =
  | "direct"           // an authoritative source directly shows the required condition is absent
  | "source_limited";  // a source shows absence only within its own integration/view — never proves the broader condition

interface RequirementGovernance {
  readonly establishedBy: string;                 // e.g. "Hud, project owner" | "not yet established"
  readonly requirementClass: "organizational" | "regulatory" | "vendor" | "role_specific";
  readonly effectiveFrom: string | null;           // null when not yet adopted
  readonly applicabilityConditions: string | null;
  readonly blockingEffect: "blocking" | "informational";
  readonly authoritativeEvidenceSource: string;    // which source_system/observation is authorized to speak to this
  readonly status: "adopted" | "proposed" | "not_yet_adopted";
}

interface EvidenceRequirement {
  readonly key: string;
  readonly kind: "observation" | "inference" | "human_confirmation";
  readonly scopeJustification: string;             // why this exact observation is authorized evidence for this exact requirement — reviewed, not assumed
  readonly satisfiedByValues?: readonly string[];
  readonly negativeEvidence?: {
    readonly values: readonly string[];
    readonly evidenceClass: NegativeEvidenceClass;
    readonly scopeNote: string;                    // required whenever evidenceClass === "source_limited"
  };
  readonly governance: RequirementGovernance;
}
```

**The permitted-evidence-relationship check**, run before any negative value is allowed to affect a stage's status:

```
Observation scope + Requirement scope + Source authority → permitted evidence relationship
```

Concretely, a negative value may contribute to a **Blocking Gap** (§C) only when **all** of the following hold:

1. `governance.status === "adopted"` — an unadopted requirement can never block anything (§7 below).
2. `governance.blockingEffect === "blocking"`.
3. `negativeEvidence.evidenceClass === "direct"` — a `"source_limited"` value can never block; it can only ever produce an Integration Gap (§C) and leave the stage `unknown`.
4. The requirement's `scopeJustification` explicitly covers this observation's actual meaning — enforced by code review and a static test that every `source_limited`-classified value is excluded from any stage's blocking computation.

Worked against your two examples:
- `"No resume added."` → scope: resume availability only. It is never wired as evidence for "Application Received" — no `EvidenceRequirement` for that stage references `apploi.resume_availability` at all. It appears only under Candidate Evaluation Complete's proposed (not adopted) resume requirement.
- `"The Application has no Viventium integration records"` → scope: Apploi's own integration linkage view only, classified `negativeEvidence.evidenceClass = "source_limited"`. It can never block Employment Record Confirmed; it produces an Integration Gap instead (§C) and leaves that stage `unknown`.

---

## C. Updated gap taxonomy

Four distinct kinds, never conflated in the UI or in persisted data:

| Gap kind | Produced when | Effect on stage status | Surfaces as |
|---|---|---|---|
| **Blocking Gap** | A `direct`-class negative value, from an **adopted**, `blocking`-effect requirement, correctly scoped | Stage → `blocked` | "Blocking Gaps" |
| **Integration Gap** | A `source_limited`-class negative value (a source's own view says absent, but the source isn't authoritative for the broader question) | Stage stays `unknown` (never `blocked`) | "Integration Gaps" — its own labeled section, never merged into Blocking Gaps |
| **Potential Gap** | A requirement whose `governance.status` is `proposed` or `not_yet_adopted`, regardless of what evidence says | Never changes stage status | "Potential Gaps (pending policy)" — clearly marked conditional |
| **Unknown (no gap object)** | No observation of any kind exists for a required item | Stage → `unknown` (if nothing else is `blocked`) | "Unknowns," a plain evidence-needed statement, not a "gap" at all |

This directly implements items 1 and 2 of your corrections: resume absence is a **Potential Gap** (the resume requirement is `proposed`, not `adopted`) and the Viventium integration report is an **Integration Gap** (source-limited), and neither is capable of producing a Blocking Gap under any circumstance until the underlying governance state changes.

**Precedence for stage status (unchanged from Revision 1, restated for clarity):** `blocked > unknown > in_progress > satisfied`. Integration Gaps and Potential Gaps never enter this precedence computation at all — only Blocking Gaps do.

---

## D. Corrected Alma worked example

Using exactly the 4 persisted observations, zero human confirmations, zero fired inferences, and the confirmed vendor identity:

| Stage | Status | Why |
|---|---|---|
| 1. Lead Identified | **Satisfied** | Vendor identity confirmed (candidateID, human-confirmed) |
| 2. Application Received | **Unknown** | No approved application-existence observation exists yet; a confirmed candidate record alone is not treated as sufficient (open question, §A) |
| 3. Candidate Evaluation Complete | **Unknown** | No adopted evaluation-completion requirement exists yet; no completion evidence collected either way |
| 4. Hiring Decision Confirmed | **Unknown** | No human confirmation recorded; no unresolved inconsistency exists to block it |
| 5. Employment Record Confirmed | **Unknown** | No positive Viventium evidence exists; Apploi's negative integration report cannot resolve this question (source-limited) |
| 6. Employment Requirements Complete | **Not Applicable** | Gated by stage 5, which is not `satisfied` |
| 7. Scheduling Ready | **Not Applicable** | Gated by stage 6 |

**Potential Gap:** Resume not present in Apploi — relevant only if Serve formally adopts a resume requirement for Candidate Evaluation Complete. Not currently blocking anything.

**Integration Gap:** Apploi reports no Viventium integration record for this application. This describes a linkage/visibility gap in Apploi's own view — it does not describe, and must never be read as describing, the absence of an actual employment record.

**Current Operational Understanding (generated):** "Alma Dhora Owolabi is an identified, vendor-confirmed candidate. Whether her application has been formally received, her candidate evaluation is complete, a hiring decision has been made, or an employment record exists cannot yet be determined from the evidence collected so far. Apploi shows no resume on file and no Viventium integration record, but neither of these facts, by itself, proves those things haven't happened elsewhere."

**Next recommended action:** "Collect direct Apploi activity/interview evidence and direct Viventium evidence before determining hiring or readiness state." *(There is no Blocking Gap to recommend against yet — the next action is evidence-gathering, not remediation of a confirmed problem, which is itself an honest and correct output of this model.)*

**Evidence still needed:** an approved application-existence observation; direct evaluation-completion evidence (once a requirement is adopted); a recorded hiring decision; direct positive Viventium employment-record evidence (or an authorized human confirmation).

This result is deliberately modest — it says less than Revision 1's worked example, and that is the correct outcome given what four observations can actually prove.

---

## E. Schema changes required

**None beyond what Revision 1 already proposed**, per your instruction that the two evaluation tables may remain appropriate:

- `recruiting_lead_desired_state_evaluations` — unchanged shape (`id, recruiting_lead_id, desired_state_key, rule_version_id, status, gaps jsonb, missing_evidence jsonb, explanation, evaluated_at, created_at`). The `gaps` jsonb array now carries a `kind` field per entry (`"blocking" | "integration" | "potential"`) — an enrichment of the planned shape, not a new column.
- `recruiting_lead_desired_state_evidence` — unchanged.
- **No new governance table.** `RequirementGovernance` (§B) is stored as part of the existing `recruiting_lead_rule_versions.parameters` jsonb for that desired state's rule version — reusing existing schema exactly as the Engineering Standards already intend for versioned policy data. A change to a requirement's governance status (e.g., "proposed" → "adopted") is a **new rule version**, never an edit to `parameters` on an existing row — same immutability discipline as every other rule in this codebase.
- `desired_state_key` values and the stage count change (7 renamed stages) — a data change to the literal `DesiredStateDefinition[]`, not a schema change.

---

## F. Exact implementation plan after correction

```
lib/recruiting/operationalUnderstanding/
  types.ts                        DesiredStateDefinition, EvidenceRequirement, RequirementGovernance,
                                   NegativeEvidenceClass, OperationalGap (with `kind`), etc.
  desiredStates.ts                 The 7 renamed DesiredStateDefinition literals (§A), each requirement's
                                   governance explicit and mostly "proposed"/"not_yet_adopted" today
  evaluateDesiredState.ts          The algorithm — gating, then Blocking/Integration/Potential/Unknown
                                   classification (§B/§C), then precedence (§C)
  evaluateRecruitingLifecycle.ts    Orchestrator: runs all 7 in gatedBy order
  generateRecommendations.ts        Recommendations derive only from Blocking Gaps; Integration/Potential
                                   gaps may surface as lower-priority advisories, never as "the" next action
                                   unless no Blocking Gap exists
  __tests__/
    evaluateDesiredState.test.ts    Including: an unadopted requirement never blocks; a source_limited
                                   value never blocks; scope-mismatched evidence is structurally impossible
                                   to wire (a requirement never references an out-of-scope observation key)
    evaluateRecruitingLifecycle.test.ts
    generateRecommendations.test.ts
    almaWorkedExample.test.ts        Reproduces §D exactly from Alma's real persisted observation values
lib/data/recruitingLeadOperationalUnderstanding.ts   Persistence, reuses ensureRuleVersion()
supabase/migrations/<ts>_create_recruiting_lead_desired_state_evaluations.sql   Per §E — no governance table
components/recruiting/
  OperationalUnderstandingCard.tsx   Satisfied / Blocking Gaps / Integration Gaps / Potential Gaps (pending
                                   policy) / Unknowns / Next Recommended Action / Evidence Still Needed —
                                   four visually distinct sections, never merged
  DesiredStateExplainabilityDetail.tsx
app/recruiting/[id]/page.tsx      Wires the new card above HiringSynthesisCard (unchanged, still shows
                                   Rule A–F's raw signals)
```

Nothing here touches the collector or any vendor-facing code.

---

## G. Preserved architectural decisions (§8 of your corrections, confirmed unchanged)

- Reuse of `recruiting_lead_rules` / `recruiting_lead_rule_versions` for Desired State evaluators.
- The two evaluation/evidence tables (§E).
- Prerequisite gating (`gatedBy`).
- Precedence: `blocked > unknown > in_progress > satisfied`.
- Recommendations derived from gaps, never raw observations.
- Full explainability on every recommendation (desired state, required evidence, observed evidence, missing evidence, rule version, explanation).
- Vendor-agnostic desired-state naming.
- No LLM, no probabilistic reasoning, anywhere in this engine.

---

## 7. Requirements are governed, not embedded assumptions

Every `EvidenceRequirement` in `desiredStates.ts` will carry a fully populated `RequirementGovernance` record before implementation — none may be left with an implicit "this is obviously required" assumption. Current governance status for every requirement identified so far:

| Requirement | Class | Established by | Status |
|---|---|---|---|
| Vendor identity confirmation (Lead Identified) | Organizational | Established this project, effective now | **Adopted** |
| Application-existence evidence (Application Received) | Organizational | Not yet formally defined which observation qualifies | **Not yet adopted** |
| Interview completion (Candidate Evaluation Complete) | Role-specific | Not yet formally adopted as *the* evaluation method | **Proposed** |
| Resume collected (Candidate Evaluation Complete) | Organizational | Not yet formally adopted | **Proposed** |
| Human-confirmed hiring decision (Hiring Decision Confirmed) | Organizational | Established this project ("never auto-mark hired"), effective now | **Adopted** |
| Unresolved stage inconsistency blocks Hiring Decision | Organizational (safety) | Established this project, effective now | **Adopted** |
| Positive Viventium record (Employment Record Confirmed) | Organizational | Not yet formally adopted which source may confirm this | **Proposed** |
| I-9/W-4/direct-deposit completion (Employment Requirements Complete) | Regulatory (I-9) / Organizational (W-4, direct deposit) | Regulatory portion self-evidently governed by law; organizational portion not yet formally scoped in this system | **Proposed** (pending scoping, even though I-9 itself is a real legal requirement) |

Only two requirements in the entire model are `adopted` today. This is expected and correct — it reflects that this project has explicitly ratified very little policy so far, and the engine must not manufacture more governance than actually exists.

---

## 9. UI redesign (updated)

- **Current Operational Understanding** — one deterministic paragraph (§D shows the real one).
- **Satisfied Requirements.**
- **Blocking Gaps** — only ever from adopted, direct, correctly-scoped negative evidence.
- **Integration Gaps** — visually and structurally distinct section; explicit copy: "This describes a limitation in what one source can see, not confirmed evidence about the underlying condition."
- **Potential Gaps (pending policy)** — visually distinct, explicit copy: "This would only matter if Serve adopts the following as a requirement: ..."
- **Unknowns.**
- **Next Recommended Action** — drawn only from Blocking Gaps; if none exist, the action is evidence-gathering, stated plainly (§D).
- **Evidence Still Needed.**

`InferredSignalsPanel`, `HumanConfirmationsPanel`, `VendorEvidencePanel`, `VendorIdentityPanel` remain unchanged below this.

---

## 11. Explicit non-goals (unchanged, restated)

No AI, no probabilistic scoring, no new vendor collection, no `Case`/`Workflow`/`ReviewGate` apparatus, no change to `recruiting_leads.status`, no autonomous advancement. **Added by this revision:** no requirement may ever produce a Blocking Gap without an explicit, reviewed `governance.status === "adopted"` record — the engine has no mechanism to infer that something is "obviously" required.

---

## 12. Testing strategy (updated)

All existing Revision 1 tests, plus:

- An unadopted (`proposed`/`not_yet_adopted`) requirement never produces a `blocked` status under any input.
- A `source_limited` negative value never produces a `blocked` status, and always produces an Integration Gap distinct from a Blocking Gap.
- A requirement's `EvidenceRequirement` can never reference an observation key outside its declared scope (a static/structural test, same style as `contractBoundaries.test.ts`'s repo-wide scan).
- `almaWorkedExample.test.ts` reproduces §D exactly.

---

## 13. Open questions (updated)

- Whether a confirmed Apploi candidate record should itself count as "Application Received" evidence (§A) — **your decision, not decided here.**
- Whether "Application Complete" should be its own top-level stage rather than requirements attached to "Candidate Evaluation Complete" — **your decision, not decided here.**
- Which specific evaluation method(s) Serve wants to formally adopt for "Candidate Evaluation Complete" (interview, work sample, reference check, or several) — a real policy decision outside this document's authority.
- Whether/when to formally adopt a resume requirement, and for which roles — same.
- Whether I-9/W-4/direct-deposit's *organizational* scoping (which system, which observation) should be formalized now or deferred until a Viventium collector exists.

---

*This document does not implement anything, adopt any policy, or establish any requirement as governed. It only models governance that has already been explicitly established elsewhere in this project, and marks everything else as proposed or not yet adopted. Awaiting your confirmation on the flagged open questions and your approval before implementation begins.*
