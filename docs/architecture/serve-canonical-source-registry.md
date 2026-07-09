# Serve Canonical Source Registry v0.1

**Type:** Governance Ownership Registry — **not** a policy rewrite, **not** governance creation, **not** software design
**Version:** 0.1
**Status:** Draft — Initial Registry
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## What This Document Is

This registry answers one question per operational domain: **which document is in charge?** — today, and eventually. It is the fourth document in the architecture series, and it depends entirely on the first three rather than re-deriving anything from source material:

1. `docs/compliance/regulatory-registry/policy-coverage-matrix.md` — what's required and how well it's covered.
2. `docs/architecture/serve-governance-crosswalk.md` — how coverage flows into future governance, playbooks, software, and AI.
3. `docs/architecture/serve-knowledge-architecture.md` — every document Serve has, catalogued and classified.
4. **This document** — for each domain, which one of those catalogued documents actually governs it, which one will, and how you get from one to the other.

**Nothing here rewrites a policy, creates governance content, or designs software.** Where a domain has no current authoritative document, that absence is recorded, not filled. Where two documents compete for the same domain, that conflict is recorded, not resolved.

### How to read "Supporting Documents"

Each supporting document is tagged with what it becomes once the Future Canonical Source exists:

- **(→ Implementation)** — feeds directly into the future canonical document as source material or as the operational/software layer beneath it.
- **(→ Historical)** — superseded once migration completes; retained for record, not consulted operationally.
- **(→ Reference-only)** — remains useful (e.g., training delivery, external regulatory text) but is never itself the authoritative statement of policy.

---

## Registry

### Workforce

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft), §245–246 |
| Future Canonical Source | Workforce Governance (parent module — `docs/governance/workforce/`) |
| Supporting Documents | Hiring Process document (→ Implementation); Employee Orientation Presentation, staffing-relevant slides (→ Implementation); Background Eligibility Module 1 (→ Implementation — already the completed sub-domain) |
| Migration Strategy | Charter the remaining, non-background-eligibility portions of Workforce Governance (general staffing policy, personnel records, drug testing) using the same section-by-section pattern Background Eligibility Module 1 already proved out. |
| Current Status | Partially Canonical — one sub-domain (Background Eligibility) is fully governed; the rest is current-but-ungoverned. |

### Background Eligibility

| Field | Value |
|---|---|
| Current Canonical Source | Background Eligibility Module 1 (`docs/governance/workforce/background-eligibility/`) — Version 0.1, Draft, pending legal & executive review |
| Future Canonical Source | Same location, status changed to Adopted; operational layer implemented by the Background Eligibility Engine (per `08-future-software-specification.md`) |
| Supporting Documents | `Serve_Background_Eligibility_Policy_v0.1_Draft.docx` (→ Historical — already superseded per Module 1's own `decision-log.md`); Hiring Process document (→ Implementation — names the actual Sapphire/Viventium background-check workflow not yet folded into `05-review-workflow.md`) |
| Migration Strategy | Complete legal/executive review to change module status from Draft to Adopted; fold the Hiring Process document's concrete vendor/procedure detail into the governed workflow document. |
| Current Status | Fully Canonical at the governance layer; Not Yet Implemented at the software layer. The only domain in this registry where governance work is actually finished. |

### Hiring

| Field | Value |
|---|---|
| Current Canonical Source | Hiring Process document (informal, external, non-standard file extension) |
| Future Canonical Source | Hiring Playbook (`docs/playbooks/hiring-playbook.md`, per the Governance Crosswalk) |
| Supporting Documents | Serve Caregiving Policies & Procedures §245 "Staffing Hiring" (→ Implementation); Background Eligibility Module 1 (→ Reference-only — the screening step should be cross-referenced, not duplicated, once the Hiring Playbook exists) |
| Migration Strategy | Formalize the informal Hiring Process document into a governed playbook; the playbook should call out to Background Eligibility Module 1 for the screening step rather than restating it. |
| Current Status | No Canonical Source at the governance layer — only an informal, unversioned operational document exists today. |

### Orientation

| Field | Value |
|---|---|
| Current Canonical Source | Employee Orientation Presentation (6.14.2026) |
| Future Canonical Source | Employee Onboarding Playbook (per the Governance Crosswalk, under §246) |
| Supporting Documents | Serve Caregiving Policies & Procedures, "New Employee Orientation" section (→ Implementation); Hiring Process document, orientation-as-hiring-checkpoint content (→ Implementation) |
| Migration Strategy | Extract orientation *content* (general onboarding flow, Personal Appearance Standards) into a governed Onboarding Playbook. HIPAA/HB300 content should migrate to Information Governance instead — see that domain below — since it isn't an onboarding-specific concern. |
| Current Status | No Canonical Source at the governance layer. |

### Training

| Field | Value |
|---|---|
| Current Canonical Source | **None single document** — split across the Employee Orientation Presentation and the Cultural Sensitivity & Diversity Training deck, with additional training-relevant content inside the P&P draft's "Employee Training and Continuing Education" section |
| Future Canonical Source | Training & Competency (governance module, per the Governance Crosswalk) |
| Supporting Documents | Employee Orientation Presentation (→ Reference-only — remains delivered training material); Cultural Sensitivity & Diversity Training (→ Reference-only); Serve Caregiving Policies & Procedures §260 Continuing Education (→ Implementation) |
| Migration Strategy | Charter Training & Competency as the single governance home for *what training is required and why*; the existing decks remain as the *delivery mechanism* for that requirement, not its source of truth. |
| Current Status | Conflicting Canonical Sources — three documents each hold a piece of "training policy" with no stated hierarchy among them. |

### Client Care

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft), §281 "Client Care Policies" |
| Future Canonical Source | Client Care Governance (not yet chartered) |
| Supporting Documents | §282 Client Conduct/Rights, §283 Advance Directives, §288 Coordination of Services, §290 Backup Services, §292 Agreement/Disclosure, §294 Initiation Timeframe, §295 Transfer/Discharge, §297 Physician's Orders, §301 Client Records, §302 Pronouncement of Death, §404 PAS Standards (all → Implementation — this is the largest single cluster of sections in the entire P&P draft) |
| Migration Strategy | Charter Client Care Governance as a multi-section module (mirroring Background Eligibility's proof-of-concept structure); given its size, this module will likely need its own internal numbering scheme analogous to Background Eligibility's `00`–`08` files. |
| Current Status | Fully Canonical at the organizational-knowledge layer (Coverage Matrix rates every one of these sections ✅ Complete); Not Yet Governed. |

### Emergency Preparedness

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft), §256 "Emergency Preparedness Policy and Procedure" |
| Future Canonical Source | Emergency Management (governance module) → Emergency Response Playbook → Emergency Manager (software) |
| Supporting Documents | §290 Backup Services and After-Hours Care (→ Implementation — closely linked); Employee Orientation Presentation, "Emergencies" slide (→ Reference-only) |
| Migration Strategy | This is Serve's most thoroughly developed existing policy (risk-assessment matrix, 4-level client triage, communication tree). Recommend this be the **next** governance module chartered after Background Eligibility — it requires the least transformation of any domain in this registry. |
| Current Status | Fully Canonical at the organizational-knowledge layer; Not Yet Governed. |

### QAPI

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft), §287 "Quality Assessment and Performance Improvement" |
| Future Canonical Source | Quality Governance (governance module) → QAPI Playbook → Audit Manager (software) |
| Supporting Documents | §251 Peer Review (→ Implementation, though currently the thinnest section in the P&P draft — see Coverage Matrix); §285 Infection Control (→ Reference-only — infection data feeds QAPI review but is governed separately) |
| Migration Strategy | The "Client Satisfaction Survey Policy" sub-section is duplicated twice within §287 itself — this internal conflict should be understood, not resolved, before migration begins, so the governance module isn't built from whichever copy happens to be read first. |
| Current Status | Conflicting Canonical Sources — the duplication exists *within* the current single document, which is a more fundamental ownership problem than most other domains face. |

### Incident Reporting

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft), §249 "Self-Reporting Abuse, Neglect and Exploitation" and §250 "Agency Investigations" |
| Future Canonical Source | Compliance Governance (governance module) → Incident Response Playbook → Incident Manager (software) |
| Supporting Documents | Employee Orientation Presentation, "Reporting Abuse" / "Elder Abuse Laws in Texas" slides (→ Reference-only) |
| Migration Strategy | §249 and §250 are procedurally inseparable (a report triggers an investigation) and should migrate as one governance unit, not two. |
| Current Status | Fully Canonical at the organizational-knowledge layer; Not Yet Governed. |

### Compliance

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft) — scattered across §210 (Operating Hours), §254 (Billing), §255 (Solicitation), §291 (Dissolution), §321 (Branch Offices) |
| Future Canonical Source | Compliance Governance (governance module) |
| Supporting Documents | Texas PAS "All Must Haves" (→ Reference-only — external regulatory text); Serve Compliance Coverage Matrix (→ Implementation — already structures this exact grouping) |
| Migration Strategy | Lowest per-section complexity in this registry; good candidate for a single batch charter once the higher-priority domains above are underway, rather than its own dedicated early effort. |
| Current Status | Fully Canonical at the organizational-knowledge layer for most sections; §321 Branch Offices specifically is 🟡 Partial per the Coverage Matrix (thin, generic, unclear current applicability). |

### Client Rights

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft), §282 "Client Care Conduct and Responsibility and Clients Rights," including a full reproduction of Texas Human Resources Code Chapter 102 |
| Future Canonical Source | A named sub-section of Client Care Governance — **not** a standalone governance module (see Migration Strategy) |
| Supporting Documents | §283 Advance Directives (→ Implementation — rights-adjacent); §292 Agreement and Disclosure (→ Implementation — includes rights notification/acknowledgment) |
| Migration Strategy | Client Rights should migrate as part of Client Care Governance, not as a peer module — splitting it out separately would create two governance modules needing to cross-reference each other on nearly every page. |
| Current Status | Fully Canonical at the organizational-knowledge layer; Not Yet Governed. |

### Infection Control

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft), §285 "Infection Control Policy," including a dedicated "Blood-borne Pathogens Policy" and Hepatitis B vaccination forms |
| Future Canonical Source | A named sub-section of Client Care Governance (per the Governance Crosswalk's mapping) — flagged as a candidate to later split into its own Health & Safety module if that domain grows |
| Supporting Documents | Employee Orientation Presentation, Bloodborne Pathogens slides 17–23 (→ Reference-only — duplicates P&P content as training reinforcement, per the Knowledge Architecture's Duplicate Analysis) |
| Migration Strategy | The current content is technically compliant but written almost entirely in COVID-19-era language (per the Coverage Matrix's "covered but outdated" finding). A content refresh to general, disease-agnostic framing is recommended *before or during* migration — this registry does not perform that refresh, only flags it as a migration precondition worth planning for. |
| Current Status | Fully Canonical at the organizational-knowledge layer; Not Yet Governed. |

### HIPAA / HB300

| Field | Value |
|---|---|
| Current Canonical Source | **None.** No written policy exists in any Serve document. |
| Future Canonical Source | Information Governance (governance module — net-new policy content required, not migration) |
| Supporting Documents | Employee Orientation Presentation, slides 10–16 (→ Implementation — the only existing source of any kind, training-only) |
| Migration Strategy | This domain cannot be "migrated" in the same sense as the others — there is no current policy document to move. The orientation content can inform a first draft, but original policy drafting is required before any governance module exists here. |
| Current Status | No Canonical Source — the only domain in this registry with a true zero-document gap, not merely an ungoverned one. |

### Personnel Records

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft), §246 "Personnel Records" |
| Future Canonical Source | A named sub-section of Workforce Governance → Personnel Manager (software) |
| Supporting Documents | Hiring Process document (→ Implementation — records generated during onboarding); Background Eligibility Module 1 (→ Reference-only — NAR/EMR search records specifically already governed there) |
| Migration Strategy | Migrate alongside the broader Workforce Governance charter (see "Workforce" above) rather than as an independent effort. |
| Current Status | Fully Canonical at the organizational-knowledge layer; Not Yet Governed. |

### Information Governance

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft), §301 "Client Records" (confidentiality, retention) and §293 "Client List and Services" |
| Future Canonical Source | Information Governance (governance module) → Document Manager (software) |
| Supporting Documents | HIPAA/HB300 content, currently only in the Employee Orientation Presentation (→ Implementation — see "HIPAA / HB300" domain above; this module should absorb that gap rather than treating it as separate future work) |
| Migration Strategy | Charter this module to cover both the already-solid client-records/list content *and* the HIPAA/HB300 gap simultaneously, rather than sequencing them as two unrelated efforts. |
| Current Status | Partially Canonical — client records/list content is solid and current; the HIPAA/HB300 sub-domain has no canonical source at all. |

### Policies & Procedures

| Field | Value |
|---|---|
| Current Canonical Source | Serve Caregiving Policies & Procedures (draft) — the document as a whole |
| Future Canonical Source | **None single document.** This document does not get replaced by one successor — it is decomposed section-by-section into the governance modules named throughout this registry (Workforce, Client Care, Compliance, Quality, Emergency Management, Information Governance). |
| Supporting Documents | N/A — this document *is* the source being decomposed, not a supporting document to another source. |
| Migration Strategy | Track decomposition progress the same way Background Eligibility Module 1 already tracks its own origin (via a decision log entry citing exactly which sections were absorbed). No new "Policies & Procedures v2" should ever be written — its role is to be fully absorbed and retired. |
| Current Status | Fully Canonical today; structurally destined to become Historical once every section has a governed successor. No section of it should be treated as permanent. |

### Operational Readiness

| Field | Value |
|---|---|
| Current Canonical Source | Operational Readiness & Audit Preparedness Roadmap (`serve-os/documents/`, currently untracked) |
| Future Canonical Source | Same document, migrated to `docs/architecture/` and formally adopted — it remains authoritative over program sequencing and vision, not over any specific policy's content |
| Supporting Documents | Serve Compliance Coverage Matrix, Serve Governance Crosswalk, Serve Knowledge Architecture Inventory (all → Implementation — this entire architecture series is Phase 1 of this roadmap's own stated plan) |
| Migration Strategy | Move into `docs/architecture/` essentially immediately — this is close to a zero-effort migration and should not wait for its position in the broader sequence below. Update its "Near-Term Roadmap" section as each phase in this registry's recommended sequence actually completes, since it is a living document rather than a one-time artifact. |
| Current Status | Fully Canonical at the architecture layer; Needs Migration (untracked). |

---

## Domains With No Canonical Source

- **HIPAA / HB300** — the only true zero-document gap in this registry. Every other domain has at least an informal or ungoverned current source; this one has none.

*(Hiring, Orientation, and Training are **not** listed here — each has a current document, just not a governed one. See "Domains Not Yet Governed" implicitly throughout the registry above; the distinction matters because closing a governance gap is a different task from closing a documentation gap.)*

## Domains With Conflicting Canonical Sources

- **QAPI** — the Client Satisfaction Survey Policy is duplicated within a single current document, meaning there is no unambiguous current source even before governance is considered.
- **Training** — split across two training decks and one P&P section with no stated hierarchy among them.
- **Background Eligibility** (a narrower, cross-cutting conflict) — the P&P draft's "Not Hirable" criteria (citing Texas Health & Safety Code §250.006) and Module 1's four-classification taxonomy are two independently-built disqualification standards that have never been cross-walked against each other, and both are technically live simultaneously since Module 1 has not yet been adopted. Already flagged in the Coverage Matrix and Knowledge Architecture; repeated here because it is a genuine current-ownership conflict, not just a future consolidation opportunity.

## Domains Already Fully Canonical

Fully canonical here means an unambiguous single current source — not that governance work is complete:

- **Background Eligibility** — the only domain fully canonical *at the governance layer*.
- **Emergency Preparedness** — fully canonical at the organizational-knowledge layer; no duplication, no competing source, the strongest existing content in the entire knowledge base.
- **Incident Reporting** — fully canonical at the organizational-knowledge layer; §249/§250 form one clean, unambiguous pair.
- **Client Care**, **Client Rights**, **Infection Control**, **Personnel Records** — each fully canonical at the organizational-knowledge layer (single clear P&P section), simply not yet governed.

## Recommended Migration Sequence

1. **Operational Readiness & Audit Preparedness Roadmap** — migrate into `docs/architecture/` immediately; near-zero effort, and every other sequencing decision in this list is downstream of the vision it states.
2. **Emergency Preparedness** — charter next; cleanest existing content, highest life-safety stakes, least transformation required.
3. **Incident Reporting** — sequence alongside Emergency Preparedness; both are safety-critical and similarly clean.
4. **Workforce (remainder) + Personnel Records + Hiring** — builds directly on the momentum and pattern already proven by Background Eligibility Module 1.
5. **Client Care + Client Rights** — largest content volume; benefits from having Workforce Governance's internal-numbering pattern already proven at scale first.
6. **Infection Control** — sequence with or just after Client Care (its current governance home), pairing migration with the recommended content refresh.
7. **QAPI** — sequence after Client Care, since QAPI review depends on client-care data; resolve the internal Client Satisfaction Survey Policy duplication as part of, not before, this migration.
8. **Compliance** (Operating Hours, Billing, Solicitation, Dissolution, Branch Offices) — lowest complexity; batch these into a single charter once bandwidth allows, rather than treating each as its own effort.
9. **Information Governance + HIPAA/HB300** — sequence deliberately, not last-by-default: while this requires original policy drafting rather than pure migration (making it a poor fit for an early slot on pure "ease" grounds), the HIPAA/HB300 legal exposure argues for tackling it in parallel with steps 4–6 rather than waiting for its turn at the end.
10. **Training** — sequence last among the governance charters; it is cross-cutting (touches nearly every other domain's onboarding/competency needs) and is easiest to charter correctly once several other modules already exist to reference.
