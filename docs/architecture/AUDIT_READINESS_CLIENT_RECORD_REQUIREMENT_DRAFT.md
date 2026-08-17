# Client Record Requirement Draft (v0.1) — For Human Review

**Status:** DRAFT — not seeded as canonical `person_requirements` data. Nothing in this
document has been inserted into any database. This is the deliverable requested for
"produce a source-grounded definition of the requirements constituting a complete Serve
Client record... present that draft for human review before seeding it as canonical
requirement data" — the Client File Readiness analog of the existing Emergency
Preparedness draft (`AUDIT_READINESS_EMERGENCY_PREPAREDNESS_REQUIREMENT_DRAFT.md`), same
rigor, same review-first discipline.

**Source:** `Serve Caregiving Policies & Procedures (draft).docx`, primarily §301 "Client
Records" — the section that directly enumerates, item by item, what a complete client
record must contain (HHS Standard 558.301) — extracted verbatim, not paraphrased from the
Policy Coverage Matrix's summary of it. Supplemented, where §301 itself cross-references
another section for the substance or cadence of a listed item, by §281 "Client Care
Policies" (initial assessment, reassessment cadence), §283 "Advanced Care Directives" (DNR
documentation), §292 "Agency and Client Agreement and Disclosure" (the Service Agreement
§301 item c actually specifies), and §404 "Standards Specific to Agencies Licensed to PAS"
(supervisory-visit cadence). Confirmed by
`docs/compliance/regulatory-registry/policy-coverage-matrix.md:70` (regulation 558.301,
coverage ✅ Complete) as Serve's complete, current treatment of client-record content —
same "cleanest existing section, first module to charter" standing §256 had for Emergency
Preparedness.

**Do not invent requirements without a source** — every row below traces to a specific
§301 item letter (a–p) or an explicitly cross-referenced section. Where the source is
silent or ambiguous on something a deterministic rule needs, that is flagged as an **Open
Question** rather than resolved by assumption — same discipline the Emergency Preparedness
draft already established.

**On AxisCare/Cinch CCM:** where a §301 item's content is, today, actually entered into
AxisCare (Serve's electronic care-documentation system) rather than uploaded as a document
to Serve OS, this draft says so plainly — but that is a statement about where the content
is *currently captured*, not a statement of permanent ownership. §301 itself requires this
content as client-record content regardless of which system holds it today; per
`docs/architecture/serve-governance-crosswalk.md` and the coverage matrix's own framing,
Serve owns the canonical cross-system view and AxisCare/Cinch are integration surfaces, not
permanent owners of that truth. Requirements below are drafted wherever the source
requires the content, never skipped merely because a vendor happens to hold it today.

---

## How to read this draft

Each requirement proposes:
- `requirement_code` — new, distinct from every existing workforce/Emergency Preparedness
  code
- **Authority** — the exact §301 item letter, plus any cross-referenced clause that
  supplies substance or cadence
- **Applicability / Subject** — `resident` for every requirement below; this is the
  client-record domain
- **Trigger / Frequency** — calendar-recurring, event-triggered, or both
- **Expected Evidence** — what a `person_evidence` row (or, per the widened schema in
  `20260902000000_widen_person_evidence_to_resident_subject.sql`, a resident-subject
  `person_documents`/`person_evidence` pair) should represent
- **Deterministic Satisfaction Rule** — stated in terms the existing engine
  (`evaluateRequirementSetStatus()`) already understands: verified evidence exists, is
  current, and satisfies the requirement — no schema change, no new engine state

---

## 1. `CR_CLIENT_PROFILE_ON_FILE` — Client Profile on file

**Authority:** "The client Profile will contain the client's full name, sex, date of
birth, name of the client's legal guardian if applicable, physician's name and telephone
number, emergency numbers and pertinent medical history, location that services are to be
rendered." (§301, item a)

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** Established at admission; updated whenever profile facts change
(new physician, new emergency contact, guardian change). **Open Question:** the source
states no periodic re-verification cadence independent of a known change — see Open
Questions below.

**Expected Evidence:** The completed Client Profile record (name/sex/DOB/guardian/
physician/emergency contacts/medical history/service location), on file per resident.

**Deterministic Satisfaction Rule:** Satisfied when current, verified evidence of a
completed Client Profile exists for the resident.

---

## 2. `CR_ISP_ON_FILE_AND_CURRENT` — Individualized Service Plan (ISP) on file and current

**Authority:** "The ISP will specify all services requested by the client, special diet
restrictions, supplies and equipment to be utilized, the location of services, frequency
and duration of services." (§301, item b) Created from the initial assessment and
"reviewed with the client and their family... Serve staff and the client or designated
person will sign the ISP." (§281)

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** Established at admission from the initial assessment. Reassessed
— and the ISP reviewed/updated — **every 365 days, or earlier if the client's status
changes** (§281, stated explicitly; no open question here, unlike the Emergency
Preparedness draft's comparable cadence gaps).

**Expected Evidence:** The signed ISP document, dated at creation and at each
reassessment.

**Deterministic Satisfaction Rule:** Satisfied when current, verified evidence of a
signed ISP exists and is within 365 days of its last review (or a documented earlier
reassessment triggered by a status change).

---

## 3. `CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED` — Signed Agency and Client Agreement/Disclosure on file

**Authority:** Consolidates §301 items c ("The Service Agreement that specifies the agreed
upon schedule of services and the planned date of service initiation, and the plan for
supervision. This document includes acknowledgment of receipt of the Client Bill of
Rights"), d (Billing Agreement), i (acknowledgment of receipt of HR Code Ch. 102 Rights of
the Elderly), j (acknowledgment of the abuse/neglect/exploitation reporting policy), and k
(acknowledgment of how to register a complaint per §558.282(11)) — all of which §292
"Agency and Client Agreement and Disclosure" specifies as **one document**: "Serve will
provide each client or their family member a written agreement for services. At a
minimum, the agreement will include: [rights notification; advance directive/DNR
availability notice; services to be provided; supervision; charges; a written
complaint-filing procedure]... Serve will obtain an acknowledgement of receipt from the
client or family of this agreement with their signature."

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** At admission, one-time (re-executed only if terms materially
change — event-triggered, not calendar-recurring).

**Expected Evidence:** The signed Agency and Client Agreement/Disclosure document, with
the client's or family's signature, dated at admission.

**Deterministic Satisfaction Rule:** Satisfied when verified evidence of the signed
agreement exists for the resident.

---

## 4. `CR_ADVANCE_DIRECTIVE_STATUS_DOCUMENTED` — Advance directive / DNR status documented

**Authority:** "Documentation of the acknowledgment of receipt of Advanced Directives
Policy is in the Service Agreement" (§301, item n). Substance from §283: "the client or
client's responsible party will be asked to provide information regarding whether or not
the client has Advanced Care Directives in place and the whereabouts of said
documentation... If a client is a 'DNR,' this status will be assessed during the initial
assessment... and will be documented in the profile. For the DNR status to be
acknowledged there must be a State of Texas out-of-hospital DNR form identified and
available."

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** At admission (initial assessment); event-triggered update
whenever directive status changes.

**Expected Evidence:** A documented determination of advance-directive/DNR status for the
resident — either the specific directive/DNR form on file (if one exists), or a documented
confirmation that none exists.

**Deterministic Satisfaction Rule:** Satisfied when verified evidence exists documenting
the resident's advance-directive/DNR determination; if DNR, satisfaction additionally
requires the actual Texas out-of-hospital DNR form on file (§283's explicit
form-availability requirement, not just a status flag).

---

## 5. `CR_CARE_DOCUMENTATION_CURRENT` — Ongoing care documentation current

**Authority:** "The Documentation of Client Care or 'Care Notes' that are completed by the
Caregivers in the electronic record software." (§301, item e) — §301 itself names the
required content; it happens to specify the software as the point of capture.

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** Continuous — care notes are entered as service visits occur. This
content is **currently captured in AxisCare**, not as a Serve OS document upload; per this
draft's framing above, that is a statement of where it's captured today, not who owns the
underlying truth. Serve OS's eventual role here mirrors the precedent it already has for
Workforce (`lib/workforce/axiscareCaregiverSync.ts` — a sync-status check, not a re-
implementation of AxisCare's own record) — this requirement would be satisfied by
confirming continuity of synced care documentation, not by uploading a document.

**Expected Evidence:** Presence of care-note entries within the expected service period,
as reflected through whatever Serve OS's future AxisCare care-documentation sync
surfaces (out of scope to build this phase — see the Emergency Preparedness draft's own
precedent for flagging a requirement's *existence* before its evidence pipeline is built).

**Deterministic Satisfaction Rule:** **Open Question** — the source establishes *that*
ongoing care documentation must exist, but states no minimum entry frequency or lookback
window a deterministic rule could check "current" against. See Open Questions below.

---

## 6. `CR_SUPERVISORY_VISIT_RECORDED` — Supervisory visit record current

**Authority:** "Records of supervisory visits." (§301, item g) Cadence from §404: "Serve
Caregiving administrative staff will perform supervisory visits with caregivers every 12
months. Staff may choose to perform these visits more frequently." §404 further requires
clients be informed "that Serve Caregiving will supervise its caregivers every 12 months"
at admission.

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** At least every 12 months (calendar-recurring), per §404's stated
cadence — no open question here.

**Expected Evidence:** A dated supervisory-visit record for the resident's case, including
date of visit and content/recommendations, within the last 12 months.

**Deterministic Satisfaction Rule:** Satisfied when current, verified evidence of a
supervisory visit exists dated within the last 12 months.

---

## 7. `CR_MEDICATION_LIST_CURRENT` — Current medication list on file (conditional)

**Authority:** "Current medication list, if applicable" (§301, item f).

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** Continuous while the resident has medications on record; `not
applicable` for a resident with none. **Open Question:** no update cadence is stated for
when medication changes must be reflected — see Open Questions below.

**Expected Evidence:** The current medication list, dated.

**Deterministic Satisfaction Rule:** `not_applicable` for a resident with no medications
on record; otherwise satisfied when verified evidence of a current medication list exists.

---

## 8. `CR_DISCHARGE_SUMMARY_ON_FILE` — Discharge summary on file (conditional)

**Authority:** "Discharge summary as applicable" (§301, item m).

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** Event-triggered only, at discharge — `not_applicable` for an
active resident.

**Expected Evidence:** The discharge summary document, dated at discharge.

**Deterministic Satisfaction Rule:** `not_applicable` while the resident is active;
becomes evaluable only once a discharge is recorded, at which point satisfaction requires
verified evidence of the discharge summary.

---

## 9. `CR_RECORD_RETENTION_COMPLIANT` — Record retained per the 5-year (or litigation-hold) requirement

**Authority:** "Serve Caregiving retains and stores client records for a minimum of five
years after the date of a client's discharge; does not destroy a client record that
relates to any matter that is involved in litigation if the agency knows the litigation
has not been finally resolved." (§301, item 3; restated verbatim under the "Retention of
Client Records" heading immediately following.)

**Applicability / Subject:** `resident`.

**Trigger / Frequency:** Event-triggered at discharge; continuous obligation for five
years thereafter (or indefinitely under an active litigation hold).

**Expected Evidence:** N/A in the ordinary "evidence of an action taken" sense — this is a
non-destruction guarantee, not a document to collect.

**Deterministic Satisfaction Rule:** **Open Question** — this is the one requirement in
this draft that doesn't fit the existing "verified evidence exists and is current" model
at all; see Open Questions below.

---

## Requirements deliberately NOT drafted from this pass

- **§301 item 2 (record-entry handling standard)** — "each entry to the client record must
  be current, accurate, signed, and dated... corrections must be made by striking through
  the error with a single line" is a procedural standard for *how* entries are made, not a
  discrete piece of evidence to collect — same category as the Emergency Preparedness
  draft's RACE-protocol exclusion (content, not a separately auditable requirement).
- **§301 item l** ("Serve does not utilize Medication aides") — a non-applicability
  statement, not a requirement to satisfy.
- **§301 item o** ("Services are not provided to a client's family except when specifically
  indicated in the Individual Service Plan") — a service-scope/conduct rule, not
  client-record content.
- **§301 item p** ("Consent and authorization forms as applicable") — too generic to trace
  to a named, specific form; where a specific consent is already named elsewhere (advance
  directive, Bill of Rights acknowledgment), it's captured by requirements 3–4 above. Not
  drafted separately absent a named source form.
- **§282's broader Bill of Rights / Rights of the Elderly content** — this is policy
  content the client acknowledges receipt of, already captured as part of requirement 3's
  Service Agreement acknowledgment; not re-drafted as its own requirement, same "content
  delivered as part of another requirement" treatment the Emergency Preparedness draft gave
  RACE fire-safety training.
- **Day-to-day AxisCare/Cinch CCM operational detail beyond what §301 actually names as
  required record content** (e.g. granular visit-by-visit task logs beyond the Care Notes
  requirement already drafted as requirement 5) — per the framing above, exclusion here is
  about scope of what the source requires, not about who currently holds the data.

## Open Questions requiring a compliance-officer decision before seeding

1. **Requirement 1 (Client Profile):** the source states no periodic re-verification
   cadence beyond keeping it current when facts change — is a periodic (e.g. annual, tied
   to the ISP reassessment in requirement 2) profile re-confirmation desired, or purely
   event-triggered on known change?
2. **Requirement 5 (Care Documentation):** what minimum entry frequency or lookback window
   should "current" mean for ongoing care notes, and what would Serve OS's AxisCare
   care-documentation sync need to expose to check it deterministically? This requirement
   is drafted because §301 requires the content, but its satisfaction rule can't be
   finalized until this is answered — a materially different kind of open question than
   the Emergency Preparedness draft's cadence gaps, since no pipeline for this evidence
   exists yet at all (tracked as future integration work, not this phase's problem).
3. **Requirement 9 (Record Retention):** this requirement doesn't fit the
   evidence-currency model the engine already understands — how should "retained, not
   destroyed, for 5 years" be represented and checked at all? Candidates a compliance
   officer should weigh in on: (a) treat it as an architectural guarantee (Serve OS simply
   never allows deletion/hard-delete of a resident's records, satisfied by the system's own
   design rather than by evidence), (b) a periodic attestation that no destruction
   occurred, or (c) something else. Not assumed here.

---

This draft defines the target shape for a future `client_readiness` domain rollup
(mirroring `getWorkforceDomainRollup()` in `lib/compliance/auditReadinessDashboard.ts`) and
a future resident-facing requirement UI living on the resident record (mirroring
`RequirementResolutionCard.tsx`/`EmployeeRecordAuditSection.tsx`) — neither is built this
phase. Serve OS is the intended eventual canonical cross-system client/evidence layer;
this draft's exclusions are current-state observations about where content happens to live
today, not a permanent ownership boundary.
