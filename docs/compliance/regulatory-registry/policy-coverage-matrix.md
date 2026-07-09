# Serve Compliance Coverage Matrix v0.1

**Type:** Information Architecture / Regulatory Inventory — **not** a policy document
**Version:** 0.1
**Status:** Draft — Initial Inventory
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## What This Document Is

This is an inventory, not a policy. It maps every written-policy requirement in **Texas Administrative Code, Title 26, Part 1, Chapter 558, Subchapters A–D** (Personal Assistance Services / Home and Community Support Services Agencies) against Serve Caregiving's existing documentation, so that the organization — and any future governance module — knows exactly what already exists, where it lives, how complete it is, and where it should eventually be formalized or superseded.

**Nothing in this document is new policy.** No policy language was rewritten. No new requirements were invented. This is strictly a coverage audit.

## Authoritative Sources Used

| Source | Role | Location |
|---|---|---|
| `1.Regulations.All.Must Haves.docx` | External source of truth — full text of every §558 written-policy requirement in scope | `Serve Drive Docs/` (outside this repository) |
| Individual `Texas PAS/558.*.docx` files | Per-section regulation text | `Serve Drive Docs/Texas PAS/` — spot-checked against the master doc and confirmed verbatim-identical |
| `Serve Caregiving Policies & Procedures (draft).docx` | Primary current organizational implementation, organized by the same §558 section numbers | `Serve Drive Docs/` |
| `Serve Caregiving Hiring Process 6.22 (2).2026` (Word doc, non-standard extension) | Operational hiring playbook — names actual tools/vendors (Apploi, Viventium, AxisCare, TULIP, Sapphire) | `Serve Drive Docs/` |
| `Serve Caregiving Employee Orientation Presentation_6.14.2026.pptx` | New-hire training content | `Serve Drive Docs/` |
| `Training_In-Service_Cultural Sensitivity and Diversity (1).pptx` | In-service training content | `Serve Drive Docs/` |
| `docs/governance/workforce/background-eligibility/` (this repository) | Existing Module 1 governance work, for cross-reference in the Future Governance Module column | This repository |

**A note on location:** the primary source documents above are **not currently checked into this repository** — they live in a sibling folder (`Serve Drive Docs/`) outside of `serve-os`. This matrix was built by reading them directly. Whether and how those source documents should be brought under version control in this repository is itself a Priority 1 recommendation below (see §Recommended Priority 1 Work).

**A note on citation precision:** these are working `.docx` files without stable page numbers once extracted as plain text. "Current Section/Page" below cites the section heading exactly as it appears in Serve's own document (Serve's draft is organized by the same §558 numbering as the regulation, which made this mapping tractable). Exact page numbers can be added in a follow-up pass against the live Word document if needed for a formal audit binder.

## Scope Boundary

This matrix covers **only** the written-policy requirements enumerated in the "All Must Haves" document (TAC Title 26, Part 1, Chapter 8 [558], Subchapters A–D). Two adjacent topics were deliberately **excluded as rows** because they are not Texas PAS requirements, even though they surfaced repeatedly in the source material and are flagged in the narrative sections below:

- **HIPAA / Texas House Bill 300** (federal and state privacy law, not a PAS-specific written-policy requirement) — has real training content but no dedicated written policy in Serve's current documents. Flagged as a high-risk gap below, but tracked separately from this Texas-PAS-specific matrix.
- **Personal Appearance Standards** — an internal Serve operational standard referenced in orientation and hiring materials, not a regulatory requirement. Flagged as a consolidation opportunity below.

---

## Coverage Matrix

| Regulation | Required Written Policy | Current Serve Document | Current Section/Page | Coverage Status | Gap / Concern | Future Governance Module |
|---|---|---|---|---|---|---|
| 558.210 | Agency Operating Hours | Serve Caregiving Policies & Procedures (draft) | "210 Agency Operating Hours" (opening section) | ✅ Complete | None identified | Compliance |
| 558.245 | Staffing Policies (orientation, training, job descriptions, criminal history/NAR/EMR checks, evaluations, discipline, volunteers, pediatric care, signed policy acknowledgment) | Serve Caregiving Policies & Procedures (draft); *procedure detail also in* Hiring Process document | "245 Staffing Hiring"; job descriptions; "New Employee Orientation"; "Employee Training and Continuing Education"; "Disciplinary Actions" | 🟡 Partial | Regulation cited but operational detail missing: the required "procedures for processing criminal history checks and searches of the nurse aide registry and employee misconduct registry" (§558.245(b)(5)) exist in detail only in the informal Hiring Process document (names Sapphire/Viventium as the actual background-check vendor/workflow), not in the governed P&P draft itself. Needs governance module. | Workforce Governance (Background Eligibility Module 1 already covers the criminal-history classification piece — see `docs/governance/workforce/background-eligibility/`) |
| 558.246 | Personnel Records | Serve Caregiving Policies & Procedures (draft) | "246 Personnel Records" | ✅ Complete | Content maps closely to the regulation's required record elements. Minor: explicit NAR/EMR "printed copy of initial and annual searches" language could be tightened to mirror regulatory wording exactly. | Workforce Governance |
| 558.249 | Self-Reported Incidents — Abuse, Neglect, Exploitation | Serve Caregiving Policies & Procedures (draft) | "249 Self-Reporting Abuse, Neglect and Exploitation"; "Investigation of Report of Abuse, Neglect, or Exploitation" | ✅ Complete | None identified — includes reporting hotlines, timelines, retaliation protection, and Form 3613 procedure. | Compliance (client-safety dimension also relevant to Client Care Governance) |
| 558.250 | Agency Investigations (complaints and ANE reports) | Serve Caregiving Policies & Procedures (draft) | "Investigation of Report of Abuse, Neglect, or Exploitation"; "Complaints"; "Investigating Complaints" | ✅ Complete | None identified — includes 10-day/30-day timelines and a defined complaint-handling script. | Compliance |
| 558.251 | Peer Review | Serve Caregiving Policies & Procedures (draft) | "251 Peer Review Policy" | 🟡 Partial | Regulation cited but operational detail missing — this is a single sentence restating the regulatory text ("must comply with their respective professional practice acts...") with no Serve-specific procedure: no named responsible party, no process, no documentation requirement. The thinnest section in the entire draft. | Compliance |
| 558.253 | Disclosure of Drug Testing Policy | Serve Caregiving Policies & Procedures (draft) | "253 Employee Drug Testing Policy" | 🟡 Partial | Covers method and consequence for employees, but the regulation's separate requirement to "provide a copy of the policy to anyone applying for services from the agency and any person who requests it" (i.e., disclosure to prospective *clients*, not just employees) is not clearly addressed. | Workforce Governance |
| 558.254 | Billing and Insurance Claims Accuracy | Serve Caregiving Policies & Procedures (draft) | "254 Accuracy of Billings and Insurance Claims" | ✅ Complete | Brief but matches the regulation's simple requirement. | Compliance |
| 558.255 | Prohibition of Solicitation of Clients | Serve Caregiving Policies & Procedures (draft) | "255 Prohibition of Solicitation of Clients" | ✅ Complete | None identified. | Compliance |
| 558.256 | Emergency Preparedness, Planning and Implementation | Serve Caregiving Policies & Procedures (draft) | "256 Emergency Preparedness Policy and Procedure" (largest single section in the document) | ✅ Complete | None identified — this is the most thoroughly developed section in Serve's entire document: EPRP, disaster coordinator designation, risk/hazard assessment matrix (Region 3 Dallas), 4-level client triage system, communication tree, client-facing emergency kits and fire-safety content. | Emergency Management |
| 558.260 | Continuing Education for Administrators | Serve Caregiving Policies & Procedures (draft) | "260 Continuing Education For Administrators" | ✅ Complete | Matches regulatory hour requirements and documentation elements. | Training & Competency |
| 558.281 | Client Care Policies | Serve Caregiving Policies & Procedures (draft) | "281 Client Care Policies"; "List of Services"; "Services Serve Does Not Provide"; "Care for the Dying" | ✅ Complete | None identified — includes an unusually clear "what Serve does not do" boundary list, which is a strong compliance/liability asset. | Client Care Governance |
| 558.282 | Client Care Conduct, Responsibility, and Client Rights | Serve Caregiving Policies & Procedures (draft) | "282 Client Care Conduct and Responsibility and Clients Rights"; "Clients' Bill of Rights"; "Rights Of The Elderly" | ✅ Complete | None identified — reproduces Texas Human Resources Code Chapter 102 rights in full. | Client Care Governance |
| 558.283 | Advance Care Directives | Serve Caregiving Policies & Procedures (draft) | "283 Advanced Care Directives"; "Do Not Resuscitate (DNR)"; "Cardio-Pulmonary Resuscitation (CPR)" | ✅ Complete | None identified. | Client Care Governance |
| 558.285 | Infection Control | Serve Caregiving Policies & Procedures (draft) | "285 Infection Control Policy"; "Blood-borne Pathogens Policy"; Hepatitis B vaccination forms | ✅ Complete | Covered but outdated — extensive and technically compliant (OSHA/Bloodborne Pathogens, Texas Health & Safety Code Ch. 81/85), but written almost entirely in COVID-19-era language and references a 2024 CDC URL. Needs a content refresh to a general, disease-agnostic infection-control framing rather than a rewrite of substance. | Client Care Governance |
| 558.287 | Quality Assessment and Performance Improvement (QAPI) | Serve Caregiving Policies & Procedures (draft) | "287 Client Satisfaction Survey Policy" *and, separately,* "287 Quality Assessment and Performance Improvement" + a second "Client Satisfaction Survey Policy" | 🟡 Partial | Duplicated in multiple documents — the Client Satisfaction Survey Policy appears twice, near-verbatim, in two different places in the same draft. The QAPI Committee substance itself (composition, semi-annual meeting cadence, review scope) is solid, but the duplication creates ambiguity about which copy is canonical — a real concern in a survey/audit setting. | Quality & Performance |
| 558.288 | Coordination of Services | Serve Caregiving Policies & Procedures (draft) | "288 Coordination of Services" | ✅ Complete | Brief but adequate for the regulation's requirement. | Client Care Governance |
| 558.290 | Backup Services and After-Hours Care | Serve Caregiving Policies & Procedures (draft) | "290 Back-up Caregiver Plan and Process" | ✅ Complete | None identified. | Client Care Governance / Emergency Management |
| 558.291 | Agency Dissolution | Serve Caregiving Policies & Procedures (draft) | "291 Agency Dissolution Policy" | ✅ Complete | Meets the regulation's baseline requirement; contingency-plan detail is comparatively brief relative to §256's depth, but nothing is missing. | Compliance |
| 558.292 | Agency and Client Agreement and Disclosure | Serve Caregiving Policies & Procedures (draft) | "292 Agency and Client Agreement and Disclosure" | ✅ Complete | None identified. | Client Care Governance |
| 558.293 | Client List and Services | Serve Caregiving Policies & Procedures (draft) | "293 Client List and Services" | ✅ Complete | None identified. | Information Governance |
| 558.294 | Time Frame(s) for Initiation of Care | Serve Caregiving Policies & Procedures (draft) | "294 Time Frames for the Initiation of Start of Services" | ✅ Complete | None identified — Serve commits to 5 days, with a referral-out procedure if that can't be met. | Client Care Governance |
| 558.295 | Client Transfer or Discharge Notification Requirements | Serve Caregiving Policies & Procedures (draft) | "295 Client Transfer and Discharge Process"; "Client Discharge Policy"; "Client Readmission Policy" | ✅ Complete | Three overlapping sub-sections cover this one regulation — not a coverage gap, but a consolidation opportunity (see below). | Client Care Governance |
| 558.297 | Receipt of Physician's Orders | Serve Caregiving Policies & Procedures (draft) | "297 Receipt of Physician Orders" | ✅ Complete | Serve's policy is a clean non-applicability statement ("Serve Caregiving does not provide services requiring physician orders and Serve does not accept physician orders"), which satisfies the regulation's requirement to have a written policy on the subject. Operationally, this creates a hard boundary Serve must consistently enforce. | Client Care Governance |
| 558.301 | Client Records | Serve Caregiving Policies & Procedures (draft) | "301 Client Records"; "Confidentiality of Client Records"; "Retention of Client Records" | ✅ Complete | None identified — five-year retention and litigation-hold language both present. | Information Governance |
| 558.302 | Pronouncement of Death | Serve Caregiving Policies & Procedures (draft) | "302 Pronouncement of Death" | ✅ Complete | Clean non-applicability statement ("Serve Caregiving does not pronounce death under any circumstances"), which satisfies the regulation. | Client Care Governance |
| 558.321 | Standards for Branch Offices | Serve Caregiving Policies & Procedures (draft) | "321 Standards for Branch Offices" | 🟡 Partial | Content is present but reads as a generic restatement of the regulation rather than a Serve-specific procedure (no named responsible party for monthly supervisory visits, no confirmation of whether Serve currently operates any branch offices). Needs confirmation of current applicability; if inapplicable today, should be explicitly marked as a contingency policy rather than left ambiguous. | Compliance |
| 558.404 | Standards Specific to Agencies Licensed to Provide Personal Assistance Services | Serve Caregiving Policies & Procedures (draft) | "404 Standards Specific to Agencies Licensed to PAS"; "Supervision of Personnel" | ✅ Complete | None identified — 12-month supervisory visit cadence, ISP content requirements, and task-scope boundaries all present and consistent with §281/§301. | Client Care Governance |

**Legend:** ✅ Complete · 🟡 Partial · 🔴 Missing · ⚪ Not Applicable

---

## Executive Summary

### Total Required Policies: 28

| Status | Count | % |
|---|---|---|
| ✅ Complete | 23 | 82% |
| 🟡 Partial | 5 | 18% |
| 🔴 Missing | 0 | 0% |
| ⚪ Not Applicable | 0 | 0% |

**Headline finding:** Serve Caregiving's existing documentation is materially stronger than the "PAS agency written policy" reputation typically assumes. Every one of the 28 required written policies has *some* documented coverage — there is no regulation with zero written policy behind it. The gaps found are about **depth, currency, and single-source-of-truth discipline**, not absence.

### Recommended Priority 1 Work

1. **Formalize the criminal history / NAR / EMR check procedure into the governed Staffing Policy (§558.245).** The actual mechanics (Sapphire background check via Viventium, TULIP screening, EMR/NAR lookups) currently live only in an informal, unversioned hiring-workflow document, not in the P&P draft that maps to the regulation. This is the direct implementation surface for the existing Background Eligibility Module 1 (`docs/governance/workforce/background-eligibility/`) — closing this gap is largely a matter of formally connecting work already done.
2. **Give Peer Review (§558.251) real operational content.** Currently the single thinnest response to any regulation in the entire document — a one-sentence restatement with no named process.
3. **Decide where HIPAA / HB 300 lives.** Not a Texas PAS requirement, but real, trained-on, legally significant content with no written policy home anywhere in Serve's current documents. Recommend a dedicated Information Governance policy, independent of this PAS-specific matrix.
4. **Bring the primary source documents (the entire `Serve Drive Docs/` folder, including all 28 regulation texts and the P&P draft) under version control in this repository**, or establish a clear, durable location for them. Right now the canonical compliance documentation for the entire organization lives in an ordinary file-system folder outside of any tracked repository.

### Recommended Priority 2 Work

5. **Consolidate the duplicated Client Satisfaction Survey Policy (§558.287)** into a single canonical instance.
6. **Clarify the client/service-applicant disclosure requirement under the Drug Testing Policy (§558.253).**
7. **Confirm current applicability of the Branch Offices policy (§558.321)** and either add Serve-specific procedure or mark explicitly as a standing contingency policy.
8. **Consolidate the three overlapping discharge-related sub-sections under §558.295** (Transfer/Discharge Process, Discharge Policy, Readmission Policy) into one coherent section.

### Recommended Priority 3 Work

9. **Refresh the Infection Control policy (§558.285)** to de-emphasize COVID-19-specific framing in favor of general, disease-agnostic infection-control language — the underlying compliance substance is sound and does not need to be rewritten, only re-framed.
10. **Formalize Personal Appearance Standards** as a short written policy (not a Texas PAS requirement, but currently exists only in orientation slides and the hiring checklist, creating enforcement ambiguity).
11. **Adopt a single, consistent regulatory citation style** across all Serve documents (some sections cite "§558.xxx," others just the bare number) for audit and survey presentation.

---

## Top 10 Highest Risk Gaps

1. **§558.245 — Criminal history/NAR/EMR procedure lives outside governed policy.** Operational continuity risk if the informal Hiring Process document is lost, outdated, or diverges from the P&P draft.
2. **§558.251 Peer Review — no operational procedure**, only a regulatory restatement. The weakest single point in the entire document relative to what the regulation actually asks for.
3. **HIPAA / HB 300 — trained-on but not written down.** Real legal exposure area (federal + state law) with orientation content but no policy of record. Outside strict Texas PAS scope but too significant to leave unflagged.
4. **§558.287 QAPI — duplicated Client Satisfaction Survey Policy** creates canonical-source ambiguity that could look disorganized to a surveyor.
5. **§558.253 Drug Testing — client/applicant-facing disclosure requirement not clearly addressed**, distinct from the employee-facing content that is well covered.
6. **§558.321 Branch Offices — thin, generic, unclear current applicability.**
7. **§558.285 Infection Control — dated COVID-19-specific framing** could read as stale during a current survey even though the underlying compliance content is sound.
8. **No version control or page-numbered canonical form for the P&P draft itself** — undermines auditability across *every* section, not just the ones flagged individually above.
9. **Background-check vendor/process detail (Sapphire via Viventium) exists only in an informal internal workflow document**, not integrated into governed policy — the same underlying issue as #1, called out separately because it's a distinct artifact (a hiring checklist, not a policy document) that needs its own decision about whether it becomes part of formal governance or stays operational-only.
10. **Personal Appearance Standards have no written-policy anchor**, despite being an active interview and orientation checkpoint — low regulatory risk, but a real enforcement-consistency risk.

## Top 10 Opportunities to Consolidate Documentation

1. Merge the two near-identical "Client Satisfaction Survey Policy" instances under §558.287 into one.
2. Integrate the Hiring Process document's concrete tool/vendor detail (Apploi, Viventium, AxisCare, Sapphire, TULIP) into the governed §558.245/246 sections, rather than leaving it as a separate informal checklist.
3. Consolidate HIPAA/HB300 content currently spread across orientation slides into a single formal policy, with orientation referencing it rather than being its only source.
4. Designate the P&P draft's Blood-borne Pathogens section as the canonical policy source, with the orientation slide content (slides 17–23) explicitly positioned as training reinforcement of that policy rather than a parallel source.
5. Consolidate Personal Appearance Standards from orientation slides 8–9 and the Hiring Process checklist into one written policy referenced by both.
6. Split the very long §558.256 Emergency Preparedness section into an internal EPRP procedure (for staff/audit use) and a separate client-facing emergency-preparedness handout, referenced from — rather than fully embedded in — the canonical policy.
7. Consolidate the three discharge-related sub-sections under §558.295 into one coherent "Client Transfer, Discharge, and Readmission" policy.
8. Cross-reference (rather than restate) Advance Directives content between §558.282 (Client Rights) and §558.283 (Advance Care Directives), which currently repeat similar material in two places.
9. Cross-walk the existing "Not Hirable" criteria under §558.245 (which cites Texas Health and Safety Code §250.006) against the four-classification offense taxonomy already defined in Background Eligibility Module 1, so there is one consistent disqualification standard rather than two parallel ones.
10. Standardize regulatory citation format (e.g., always "§558.xxx" with the full section title) across every Serve document that references a Texas PAS regulation, for consistent presentation during licensing surveys.
