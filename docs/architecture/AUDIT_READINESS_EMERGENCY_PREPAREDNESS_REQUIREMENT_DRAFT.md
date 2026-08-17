# Emergency Preparedness Requirement Draft (v0.1) — For Human Review

**Status:** DRAFT — not seeded as canonical `person_requirements` data. Nothing in this
document has been inserted into any database. This is the deliverable requested for
"draft the Emergency Preparedness requirement set directly from Serve P&P §256... present
that draft for human review before seeding it as canonical requirement data."

**Source:** `Serve Caregiving Policies & Procedures (draft).docx`, §256 "Emergency
Preparedness Policy and Procedure" — the full section, extracted verbatim from the source
document (not the Coverage Matrix's summary of it, not paraphrased). Confirmed by the
Serve Canonical Source Registry and Governance Crosswalk to be Serve's most complete,
cleanest existing policy section, and the recommended first governance module to charter.
Every requirement below quotes or closely paraphrases specific P&P language so its origin
is checkable line-by-line against the source document.

**Do not invent requirements without a source** — every row below traces to a specific
P&P §256 sentence. Where the source is ambiguous or silent on something a deterministic
rule needs (a review cadence, a reassessment interval), that is flagged as an **Open
Question** rather than resolved by assumption.

---

## How to read this draft

Each requirement proposes:
- `requirement_code` — new, distinct from every existing workforce code
- **Authority** — the exact P&P §256 clause
- **Applicability / Subject** — `agency` (org-wide, one instance), `resident` (per client),
  or `workforce_member` (composed from the existing Workforce domain, not owned here — see
  the note on requirement 6)
- **Trigger / Frequency** — calendar-recurring, event-triggered, or both
- **Expected Evidence** — what a `person_evidence` row should represent
- **Deterministic Satisfaction Rule** — stated in terms the existing engine
  (`evaluateRequirementSetStatus()`) already understands: verified evidence exists, is
  current (not expired), and (where relevant) which `source_system` value on that evidence
  the Emergency Preparedness domain-interpretation layer would recognize as
  `satisfied_by_event` per `lib/compliance/auditReadinessStatus.ts`'s classifier extension
  point — no schema change, no new engine state.

---

## 1. `EP_PLAN_MAINTAINED` — Emergency Preparedness and Response Plan (EPRP) on file and current

**Authority:** "The Emergency Preparedness and Response Plan (EPRP) will be initiated for
any emergency situation that interferes with normal operations and disrupts service
delivery... Serve Caregiving will take the following actions to develop, maintain and
implement an EPRP." (§256, opening policy statement)

**Applicability / Subject:** `agency` (one instance — the plan itself, not per-client or
per-employee).

**Trigger / Frequency:** Continuously current; re-verified at each annual review (see
requirement 4).

**Expected Evidence:** The current, dated EPRP document itself (or a reference to where it
is stored), uploaded/verified as `person_documents` + `person_evidence`.

**Deterministic Satisfaction Rule:** Satisfied when current, verified evidence of the EPRP
document exists and has not expired per the annual review cadence (requirement 4).

---

## 2. `EP_DISASTER_COORDINATOR_DESIGNATED` — Disaster Coordinator and Alternate designated and registered

**Authority:** "The Administrator will be Serve Caregiving's Disaster Coordinator. The
Alternate Administrator will be Serve Caregiving's Alternate Disaster Coordinator... The
Managing Director (Administrator) and Community Care Coordinator (Alternate Administrator)
will register themselves with the AlertMedia state-wide emergency reporting system upon
designation." (§256, item 2)

**Applicability / Subject:** `agency`.

**Trigger / Frequency:** Event-triggered — re-verified whenever the Administrator or
Alternate Administrator role changes.

**Expected Evidence:** A record naming the current Disaster Coordinator and Alternate, plus
confirmation of AlertMedia registration for both.

**Deterministic Satisfaction Rule:** Satisfied when current, verified evidence names both
roles and confirms AlertMedia registration for each.

**Open Question:** The P&P does not state a re-verification cadence beyond "upon
designation" — is annual re-confirmation desired even with no role change, or only
event-triggered? Recommend event-triggered only, pending confirmation.

---

## 3. `EP_RISK_ASSESSMENT_CURRENT` — Risk Assessment and Hazard Vulnerability Assessment current

**Authority:** "As part of the EPRP development Serve Caregiving will conduct a risk
assessment to identify the potential disasters from natural and man-made causes most
likely to occur in its service area." (§256, item 5) The source document includes a
worked example: "Region 3 Dallas Area Hazard Threat Analysis, Updated 8/2025 for Region 3."

**Applicability / Subject:** `agency`.

**Trigger / Frequency:** **Open Question** — the P&P states the assessment must exist but
does not state a required update interval. The one dated example in the source ("Updated
8/2025") implies periodic updates occur, but no stated cadence. Recommend aligning to the
annual EPRP review (requirement 4) unless a compliance officer specifies otherwise —
**not assumed here.**

**Expected Evidence:** The current, dated risk assessment / hazard vulnerability
assessment document.

**Deterministic Satisfaction Rule:** Satisfied when current, verified evidence of a dated
risk assessment exists; "current" pending resolution of the Open Question above.

---

## 4. `EP_ANNUAL_PLAN_REVIEW` — Annual EPRP review, and review after each actual emergency response

**Authority:** "The Administrator and other individuals designated by the Administrator
will review the plan at least annually, and after each actual emergency response, to
evaluate its effectiveness and to update the plan as needed." (§256, item following the
communication-method list)

**Applicability / Subject:** `agency`.

**Trigger / Frequency:** **Both** — calendar-annual, AND event-triggered by any actual
emergency response (a second, independent review obligation on top of the annual one, not
a substitute for it).

**Expected Evidence:** A dated review record for the annual review; a separate dated
post-emergency review record for each actual emergency response that occurred.

**Deterministic Satisfaction Rule:** Satisfied when verified evidence of the annual review
exists within the review period, AND — only when an actual emergency response occurred
during that period — verified evidence of a corresponding post-emergency review also
exists. The event-triggered obligation does not arise at all in a period with no actual
emergency (a legitimate `not_applicable` outcome for that sub-condition, not a missing one).

---

## 5. `EP_ANNUAL_RESPONSE_DRILL` — Annual test of the EPRP's response phase (drill, or a qualifying actual emergency)

**Authority:** "As part of the annual internal review, Serve Caregiving's office staff will
test the response phase of the emergency preparedness and response plan in a planned drill
**if not tested during an actual emergency response**. A planned drill will be limited to
implementation of Serve Caregiving's 'Communication Tree'." (§256, immediately following
requirement 4's clause) — **this is the exact source of the "satisfied by event" rule** in
the Audit Readiness spec.

**Applicability / Subject:** `agency`.

**Trigger / Frequency:** Annual.

**Expected Evidence:** EITHER (a) a dated record of a planned Communication Tree drill
within the annual period, OR (b) a dated record of an actual emergency response that
exercised the response phase within the same period — both are legitimate evidence for
this same requirement; the P&P text itself states the drill is only required "if not
tested during an actual emergency response."

**Deterministic Satisfaction Rule:** Satisfied when verified evidence exists within the
annual period, regardless of which of the two evidence types it is. The Emergency
Preparedness domain-interpretation layer distinguishes the two only for **explanation**
purposes (`lib/compliance/auditReadinessStatus.ts`'s `satisfied_by_event` label vs. the
ordinary `compliant` label) — never as a different compliance outcome, and never by adding
a new engine state, per explicit instruction. Proposed convention: evidence for this
requirement records `source_system = "planned_drill"` or `source_system =
"actual_emergency_response"` (both values already fit the existing free-text
`person_evidence.source_system` column — no schema change needed).

---

## 6. `EP_STAFF_TRAINED` — Staff trained on EPRP responsibilities at hire, plan revision, and annually via drill/activation

**Authority:** "Serve Caregiving will ensure that all staff are trained and oriented about
their responsibilities in Serve Caregiving's EPRP upon hire and whenever the plan is
revised." (§256) Separately, from earlier in the P&P draft (Continuing Education section):
"Annual Emergency Preparedness Training will occur with annual Emergency Drills or Plan
Activations, and documented as such."

**Applicability / Subject:** `workforce_member`.

**Ownership note — composition, not a new corrective-action domain:** Per the explicit
instruction that Workforce Compliance is a native domain composed into Audit Readiness, not
duplicated, this requirement's evidence/status/corrective-action lifecycle belongs in the
existing Workforce requirement/evidence pipeline (the same `person_evidence` /
`workforce_compliance_actions` path every other workforce training requirement already
uses — see `WORKFORCE_EMPLOYEE_RECORD_AUDIT`'s existing `HIPAA_HB300_TRAINING` /
`INFECTION_CONTROL_TRAINING` rows as the direct precedent for how a training requirement
already lives in this schema). Audit Readiness composes this into the Workforce Readiness
view (spec Module E); it does not get a `compliance_corrective_actions` row of its own.

**Trigger / Frequency:** Event-triggered (hire, plan revision) **and** annual (tied to
requirement 5's drill or an actual plan activation).

**Expected Evidence:** Training-completion evidence per staff member, dated against the
triggering event.

**Deterministic Satisfaction Rule:** Same shape as the existing score-gated/attendance
training requirements already in `WORKFORCE_EMPLOYEE_RECORD_AUDIT` — verified evidence of
completion exists and is current relative to the most recent triggering event (hire, plan
revision, or annual drill/activation).

---

## 7. `EP_CLIENT_TRIAGE_CLASSIFIED` — Client emergency triage classification on file (4-level system)

**Authority:** "Serve Caregiving will triage clients using a four-class system (Level 1, 2,
3 and 4)... Serve Caregiving will identify clients who may need evacuation assistance and
maintain triage records in the event of an emergency." (§256, item 4) The source document
includes the actual form: "Emergency Preparedness Classification Assessment Form," with
named fields (priority level 1–4, evacuation-assistance need, 211-Texas registration
offered/agreed/declined, assessor, date).

**Applicability / Subject:** `resident`. **This is the first real Module D (Client File
Readiness) requirement** — the Phase 0 report's identified blocker (`person_evidence` not
yet resident-enabled) is what Migration 1 of this phase resolves so this requirement is
technically representable once seeded.

**Trigger / Frequency:** At admission (event-triggered). Re-assessment: "The client's
priority level may change as the client's condition progresses and is monitored
regularly" — **Open Question**: no fixed reassessment interval is stated. Recommend this
be resolved by a compliance officer before this requirement is seeded, not assumed here.

**Expected Evidence:** A completed, signed Emergency Preparedness Classification Assessment
Form (or Serve OS's own structured equivalent capturing the same fields), on file per
resident.

**Deterministic Satisfaction Rule:** Satisfied when verified evidence of a completed
classification assessment exists for the resident; "current" pending resolution of the
reassessment-cadence Open Question above.

---

## 8. `EP_CLIENT_INFO_PROVIDED_AT_ADMISSION` — Client provided EPRP information and responsibilities at admission

**Authority:** "Serve Caregiving will discuss and provide the following information to each
client upon admission to Serve Caregiving: the actions and responsibilities of Serve
Caregiving's staff during and immediately following an emergency; the client's
responsibilities in Serve Caregiving's emergency preparedness and response plan... a list
of community disaster resources... materials that describe survival tips." (§256, item
following the triage classification)

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** At admission (event-triggered, one-time per resident unless
re-admitted).

**Expected Evidence:** A signed acknowledgment or provided-materials checklist, dated at
admission.

**Deterministic Satisfaction Rule:** Satisfied when verified evidence of the admission-time
acknowledgment exists for the resident.

---

## 9. `EP_HHS_NOTIFICATION` — HHS notified of temporary relocation or service-area expansion (conditional)

**Authority:** "Serve Caregiving will provide the following information to HHS Home and
Community Support Services Agencies licensing unit no later than five working days after
any of the following temporary changes resulting from the effects of an emergency or
disaster [temporary office relocation; temporary service-area expansion]." (§256, HHS
notification section)

**Applicability / Subject:** `agency`.

**Trigger / Frequency:** Event-triggered only — arises solely if a temporary relocation or
service-area expansion actually occurred. In every period where neither event occurred,
this requirement is legitimately `not_applicable`, not missing.

**Expected Evidence:** A copy of the notice sent to HHS, dated within five working days of
the triggering event.

**Deterministic Satisfaction Rule:** `not_applicable` by default; becomes evaluable only
once a triggering event is recorded, at which point satisfaction requires verified evidence
of the notice dated within the 5-working-day window.

---

## Requirements deliberately NOT drafted from this pass

- **Basic Fire Safety (RACE protocol)** — this is training *content* delivered as part of
  requirement 6's staff training, not a separately auditable requirement with its own
  evidence record. Folding it into requirement 6 rather than creating `EP_FIRE_SAFETY_RACE`
  avoids inventing a requirement the source text doesn't actually structure as one.
- **Client emergency supply kits / first aid kit contents / 211-Texas registration
  mechanics** — these are client-facing guidance content (what a client should have on
  hand), not something Serve itself produces evidence of per client beyond the admission
  acknowledgment already captured in requirement 8. No separate requirement proposed.
- **PPE Statement / Mitigating Staffing Shortages (pandemic-specific language)** — the P&P
  text here is explicitly written in COVID-19-era framing (per the Policy Coverage Matrix's
  own "covered but outdated" finding). Recommend this be revisited once that content
  refresh happens, rather than seeded as-is now.

## Open Questions requiring a compliance-officer decision before seeding

1. Requirement 2 (Disaster Coordinator): is annual re-confirmation desired even absent a
   role change?
2. Requirement 3 (Risk Assessment): what update cadence applies — annual (aligned to
   requirement 4), or something else?
3. Requirement 7 (Client Triage Classification): what reassessment interval applies once a
   client's classification is on file?

None of these three requirements should be seeded with an assumed cadence — each needs an
explicit answer first.
