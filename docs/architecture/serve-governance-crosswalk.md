# Serve Governance Crosswalk v0.1

**Type:** Architecture Roadmap — **not** a policy document, **not** a software specification
**Version:** 0.1
**Status:** Draft — Initial Architecture
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## What This Document Is

This is the architectural bridge between four layers that currently exist in isolation from each other:

1. **Texas Regulations** — external, non-negotiable requirements.
2. **Existing Serve Documentation** — the organizational knowledge inventoried in the [Policy Coverage Matrix](../compliance/regulatory-registry/policy-coverage-matrix.md).
3. **Future Governance Modules** — the Serve Workforce Governance Framework and its future siblings (Client Care Governance, Compliance Governance, etc.).
4. **Future Serve OS Modules** — the software that will eventually implement that governance, and the operational intelligence it will eventually enable.

**This document does not modify the Policy Coverage Matrix, rewrite any policy, create any new governance documentation, or specify any software.** It is a map of *where things will eventually go*, built entirely from what the coverage matrix already established. Every "Current Serve Documentation" and "Coverage Status" value below is reused verbatim from that matrix — not re-derived.

A note on one relationship worth stating up front: **Background Eligibility already exists** as Module 1 of the Workforce Governance Framework (`docs/governance/workforce/background-eligibility/`), including its own future-software specification. Every other governance module, playbook, and software module named in this document is a *future* entity — chartered here for the first time, not yet built. Background Eligibility is the one row in every inventory below that is further along than the rest, and it is called out as such rather than presented as equally hypothetical.

**Revision note (2026-07-08):** The "Future Serve OS Module" column below, and the inventory in §3, were named before the [Serve OS Scope Philosophy](./serve-os-scope-philosophy.md) was formalized. That philosophy establishes that Serve OS is not intended to become an HRIS, ATS, payroll, scheduling, phone, or documentation platform — those functions belong to Apploi, Viventium, AxisCare, Dialpad, SAS, and Cinch CCM — and gives every module a test: does Serve need to own this knowledge regardless of vendor, or does a vendor already perform this function well? §3 now carries an **Ownership Model** column applying that test to each module named here. Regulation-to-module mappings in the main crosswalk table are unaffected; only what each named module *is* (owned decision layer vs. vendor integration surface) is clarified.

---

## Crosswalk

| Regulation | Regulatory Topic | Current Serve Documentation | Coverage Status | Future Governance Module | Future Operational Playbook | Future Serve OS Module | Future AI Capability | Priority |
|---|---|---|---|---|---|---|---|---|
| 558.210 | Agency Operating Hours | Serve Caregiving Policies & Procedures (draft), "210 Agency Operating Hours" | ✅ Complete | Compliance Governance | Agency Operations Playbook | Policy Manager | Monitor compliance continuously (verify posted hours/voicemail notice stays current) | P3 |
| 558.245 | Staffing Policies | Serve Caregiving Policies & Procedures (draft), "245 Staffing Hiring"; Hiring Process document | 🟡 Partial | Workforce Governance (Background Eligibility already chartered as its sub-module) | Hiring Playbook | Personnel Manager; Background Eligibility Engine | Identify missing documentation (flag incomplete pre-hire screening); explain policy decisions (background classification rationale) | P1 |
| 558.246 | Personnel Records | Serve Caregiving Policies & Procedures (draft), "246 Personnel Records" | ✅ Complete | Workforce Governance | Employee Onboarding Playbook | Personnel Manager | Detect expired certifications; identify missing documentation | P1 |
| 558.249 | Self-Reported Incidents — Abuse, Neglect, Exploitation | Serve Caregiving Policies & Procedures (draft), "249 Self-Reporting Abuse, Neglect and Exploitation" | ✅ Complete | Compliance Governance | Incident Response Playbook | Incident Manager | Generate audit packets (auto-populate Form 3613-equivalent); monitor compliance continuously (24-hour reporting clock) | P1 |
| 558.250 | Agency Investigations | Serve Caregiving Policies & Procedures (draft), "Investigation of Report of Abuse, Neglect, or Exploitation"; "Complaints" | ✅ Complete | Compliance Governance | Incident Response Playbook | Incident Manager | Predict survey deficiencies; recommend corrective actions | P1 |
| 558.251 | Peer Review | Serve Caregiving Policies & Procedures (draft), "251 Peer Review Policy" | 🟡 Partial | Compliance Governance | QAPI Playbook | Audit Manager | Identify missing documentation | P2 |
| 558.253 | Disclosure of Drug Testing Policy | Serve Caregiving Policies & Procedures (draft), "253 Employee Drug Testing Policy" | 🟡 Partial | Workforce Governance | Hiring Playbook | Personnel Manager | Identify missing documentation (client-facing disclosure not tracked) | P2 |
| 558.254 | Billing and Insurance Claims | Serve Caregiving Policies & Procedures (draft), "254 Accuracy of Billings and Insurance Claims" | ✅ Complete | Compliance Governance | Billing Accuracy Playbook | Audit Manager | Monitor compliance continuously (flag billing anomalies) | P3 |
| 558.255 | Prohibition of Solicitation of Clients | Serve Caregiving Policies & Procedures (draft), "255 Prohibition of Solicitation of Clients" | ✅ Complete | Compliance Governance | Marketing & Referral Compliance Playbook | Policy Manager | Monitor compliance continuously | P3 |
| 558.256 | Emergency Preparedness, Planning and Implementation | Serve Caregiving Policies & Procedures (draft), "256 Emergency Preparedness Policy and Procedure" | ✅ Complete | Emergency Management | Emergency Response Playbook | Emergency Manager | Monitor compliance continuously (annual drill/review cadence); predict survey deficiencies | P1 |
| 558.260 | Continuing Education for Administrators | Serve Caregiving Policies & Procedures (draft), "260 Continuing Education For Administrators" | ✅ Complete | Training & Competency | Continuing Education Playbook | Training Manager | Detect expired certifications | P2 |
| 558.281 | Client Care Policies | Serve Caregiving Policies & Procedures (draft), "281 Client Care Policies" | ✅ Complete | Client Care Governance | Client Admission Playbook | Client Record Manager | Identify missing documentation (assessment/reassessment cadence) | P1 |
| 558.282 | Client Care Conduct, Responsibility, and Client Rights | Serve Caregiving Policies & Procedures (draft), "282 Client Care Conduct and Responsibility and Clients Rights" | ✅ Complete | Client Care Governance | Client Admission Playbook | Client Record Manager | Explain policy decisions (rights-acknowledgment tracking) | P2 |
| 558.283 | Advance Care Directives | Serve Caregiving Policies & Procedures (draft), "283 Advanced Care Directives" | ✅ Complete | Client Care Governance | Client Admission Playbook | Client Record Manager | Identify missing documentation (flag missing directive on file) | P2 |
| 558.285 | Infection Control | Serve Caregiving Policies & Procedures (draft), "285 Infection Control Policy" | ✅ Complete | Client Care Governance | QAPI Playbook | Incident Manager | Monitor compliance continuously (infection log trends) | P3 |
| 558.287 | Quality Assessment and Performance Improvement (QAPI) | Serve Caregiving Policies & Procedures (draft), "287 Quality Assessment and Performance Improvement" | 🟡 Partial | Quality Governance | QAPI Playbook | Audit Manager | Predict survey deficiencies; recommend corrective actions | P1 |
| 558.288 | Coordination of Services | Serve Caregiving Policies & Procedures (draft), "288 Coordination of Services" | ✅ Complete | Client Care Governance | Client Admission Playbook | Client Record Manager | Identify missing documentation | P3 |
| 558.290 | Backup Services and After-Hours Care | Serve Caregiving Policies & Procedures (draft), "290 Back-up Caregiver Plan and Process" | ✅ Complete | Emergency Management | Emergency Response Playbook | Emergency Manager | Recommend corrective actions (auto-suggest backup caregiver) | P2 |
| 558.291 | Agency Dissolution | Serve Caregiving Policies & Procedures (draft), "291 Agency Dissolution Policy" | ✅ Complete | Compliance Governance | Agency Operations Playbook | Policy Manager | Generate audit packets | P3 |
| 558.292 | Agency and Client Agreement and Disclosure | Serve Caregiving Policies & Procedures (draft), "292 Agency and Client Agreement and Disclosure" | ✅ Complete | Client Care Governance | Client Admission Playbook | Client Record Manager | Identify missing documentation (signature/acknowledgment tracking) | P2 |
| 558.293 | Client List and Services | Serve Caregiving Policies & Procedures (draft), "293 Client List and Services" | ✅ Complete | Information Governance | Records Management Playbook | Document Manager | Generate audit packets | P3 |
| 558.294 | Time Frame(s) for Initiation of Care | Serve Caregiving Policies & Procedures (draft), "294 Time Frames for the Initiation of Start of Services" | ✅ Complete | Client Care Governance | Client Admission Playbook | Client Record Manager | Monitor compliance continuously (time-to-start metric) | P2 |
| 558.295 | Client Transfer or Discharge Notification Requirements | Serve Caregiving Policies & Procedures (draft), "295 Client Transfer and Discharge Process"; "Client Discharge Policy"; "Client Readmission Policy" | ✅ Complete | Client Care Governance | Client Discharge Playbook | Client Record Manager | Monitor compliance continuously (notice-timeline tracking) | P2 |
| 558.297 | Receipt of Physician's Orders | Serve Caregiving Policies & Procedures (draft), "297 Receipt of Physician Orders" | ✅ Complete | Client Care Governance | Client Admission Playbook | Client Record Manager | Monitor compliance continuously (flag any physician order ever received, given Serve's non-acceptance policy) | P3 |
| 558.301 | Client Records | Serve Caregiving Policies & Procedures (draft), "301 Client Records"; "Confidentiality of Client Records"; "Retention of Client Records" | ✅ Complete | Information Governance | Records Management Playbook | Document Manager | Identify missing documentation; generate audit packets | P1 |
| 558.302 | Pronouncement of Death | Serve Caregiving Policies & Procedures (draft), "302 Pronouncement of Death" | ✅ Complete | Client Care Governance | Client Discharge Playbook | Client Record Manager | Monitor compliance continuously | P3 |
| 558.321 | Standards for Branch Offices | Serve Caregiving Policies & Procedures (draft), "321 Standards for Branch Offices" | 🟡 Partial | Compliance Governance | Agency Operations Playbook | Policy Manager | Identify missing documentation (supervisory visit logs) | P3 |
| 558.404 | Standards Specific to Agencies Licensed to Provide Personal Assistance Services | Serve Caregiving Policies & Procedures (draft), "404 Standards Specific to Agencies Licensed to PAS"; "Supervision of Personnel" | ✅ Complete | Client Care Governance | Client Admission Playbook | Competency Manager | Detect expired certifications; recommend corrective actions | P2 |

---

## 1. Governance Module Inventory

| Module | Status | Regulations Mapped |
|---|---|---|
| **Workforce Governance** | Module 1 (Background Eligibility) already chartered — see `docs/governance/workforce/`. Remainder of the module (general staffing, personnel records, drug testing) not yet chartered. | 245, 246, 253 |
| **Client Care Governance** | Not yet chartered | 281, 282, 283, 285, 288, 290, 292, 294, 295, 297, 302, 404 |
| **Compliance Governance** | Not yet chartered | 210, 249, 250, 251, 254, 255, 291, 321 |
| **Quality Governance** | Not yet chartered | 287 |
| **Emergency Management** | Not yet chartered | 256, 290 |
| **Information Governance** | Not yet chartered | 293, 301 |
| **Training & Competency** | Not yet chartered | 260 |

*(§558.290 appears under both Client Care Governance's sibling Emergency Management, reflecting that backup/after-hours care is genuinely a shared concern — see the crosswalk row for the specific assignment used.)*

## 2. Operational Playbook Inventory

| Playbook | Regulations Implemented |
|---|---|
| Hiring Playbook | 245, 253 |
| Employee Onboarding Playbook | 246 |
| Continuing Education Playbook | 260 |
| Incident Response Playbook | 249, 250 |
| QAPI Playbook | 251, 285, 287 |
| Emergency Response Playbook | 256, 290 |
| Client Admission Playbook | 281, 282, 283, 288, 292, 294, 297, 404 |
| Client Discharge Playbook | 295, 302 |
| Records Management Playbook | 293, 301 |
| Agency Operations Playbook | 210, 291, 321 |
| Billing Accuracy Playbook | 254 |
| Marketing & Referral Compliance Playbook | 255 |

## 3. Future Serve OS Module Inventory

Per the [Scope Philosophy](./serve-os-scope-philosophy.md)'s guiding question — *"the vendor already performs this function well" → integrate; "Serve needs this regardless of vendor" → own* — each module below is now marked with an Ownership Model. Four modules (Personnel Manager, Training Manager, Competency Manager, Document Manager) are reframed from what their original name implies; none of the underlying regulation-to-module mappings change.

| Module | Status | Ownership Model | Regulations Served |
|---|---|---|---|
| **Background Eligibility Engine** | Already specified — see `docs/governance/workforce/background-eligibility/08-future-software-specification.md`. Not yet built. | **Serve owns** — the classification decision (Eligible / Reviewable / Presumptive / Automatic Disqualification) applied to a background check result. Sapphire (via Viventium) already runs the check well; Serve's own risk taxonomy is knowledge no vendor supplies. Already correctly scoped — no reframing needed. | 245 (background-check component) |
| Personnel Manager | Not yet specified | **Reframe → integration surface.** Viventium already owns personnel records, I-9, and payroll. Serve should not duplicate that record store. This module should become a *personnel compliance view* — cross-system visibility into whose documentation/certifications/screening are current — referencing Viventium data rather than re-storing it. | 245, 246, 253 |
| Training Manager | Not yet specified | **Reframe → integration surface.** Serve should own the training *standard* (what's required, by whom, by when) and completion *visibility*, not become the training delivery/LMS system itself. | 260 |
| Competency Manager | Not yet specified | **Reframe → integration surface.** Same pattern as Training Manager — own the competency standard and status visibility, not the administration of competency validation. | 404 |
| Client Record Manager | Not yet specified | **Serve owns** — this already matches the pre-existing architectural principle (`ARCHITECTURE.md`) that residents are Serve OS's canonical business object and external systems (AxisCare, Cinch CCM) enrich that relationship rather than own it. Own the canonical cross-system view; AxisCare/Cinch CCM continue to own day-to-day operational care documentation. | 281, 282, 283, 288, 292, 294, 295, 297, 302 |
| Incident Manager | Not yet specified | **Serve owns** — no named vendor (Apploi, Viventium, AxisCare, Dialpad, SAS, Cinch CCM) performs incident/complaint tracking. Squarely organizational knowledge. | 249, 250, 285 |
| Emergency Manager | Not yet specified | **Serve owns** — no vendor equivalent; emergency-preparedness planning and drill tracking is organizational-standard territory. | 256, 290 |
| Audit Manager | Not yet specified | **Serve owns** — "Audit Readiness" is named explicitly in the Scope Philosophy as a Serve OS responsibility. | 251, 254, 287 |
| Policy Manager | Not yet specified | **Serve owns** — governance and organizational knowledge ownership, named explicitly in the Scope Philosophy. | 210, 255, 291, 321 |
| Document Manager | Not yet specified | **Reframe → evidence index, not document store.** AxisCare/Cinch CCM already hold operational client documentation. Serve should own a cross-system *audit-evidence index* — what evidence exists, where it lives, who owns it — not a duplicate file repository. | 293, 301 |

## 4. AI Capability Inventory

| Capability | Regulations Where It Applies |
|---|---|
| Detect expired certifications | 246, 260, 404 |
| Identify missing documentation | 245, 246, 253, 251, 281, 283, 288, 292, 301, 321 |
| Monitor compliance continuously | 210, 249, 254, 255, 256, 285, 294, 295, 297, 302 |
| Predict survey deficiencies | 250, 256, 287 |
| Recommend corrective actions | 250, 287, 290, 404 |
| Generate audit packets | 249, 291, 293, 301 |
| Explain policy decisions | 245, 282 |

None of these capabilities exist today. They are named here as the eventual purpose of the Serve OS modules above — not as commitments to build, and not as a description of anything currently running.

## 5. Dependency Graph

The architecture flows in one direction. Nothing below a layer can be built before the layer above it exists in a form stable enough to build against.

```
Regulation
   (Texas Administrative Code, Title 26, Part 1, Chapter 558 —
    external, non-negotiable, already fully inventoried in the
    Policy Coverage Matrix)
        |
        v
Governance
   (Organizational policy + operational playbook + software
    requirements + AI decision model, written documentation-first,
    per the Serve Workforce Governance Framework's own philosophy —
    "architect for version 10, build version 0.1")
        |
        v
Operational Playbook
   (The step-by-step procedure staff actually follow — the same
    playbook a human executes manually today, and the same
    playbook software eventually executes on their behalf)
        |
        v
Serve OS Module
   (Software that implements the playbook, per the Serve OS Scope
    Philosophy: own the decision, the standard, and the compliance
    status; integrate with — rather than duplicate — whatever vendor
    system already owns the underlying operational record. Built
    against the governance module as its requirements specification,
    not against the raw regulation.)
        |
        v
Operational Intelligence
   (AI capability layered on top of a working Serve OS module —
    only possible once the module below it exists and is
    generating the structured data the AI needs to reason over)
```

**Worked example — the most mature thread in this crosswalk:**

```
558.245 (Staffing — criminal history/NAR/EMR requirement)
        |
        v
Workforce Governance -> Background Eligibility (Module 1, already chartered)
        |
        v
Hiring Playbook (not yet formalized — currently an informal,
   unversioned internal document, per the Policy Coverage Matrix)
        |
        v
Background Eligibility Engine (already specified in
   08-future-software-specification.md; not yet built)
        |
        v
"Explain policy decisions" — the engine's classification
   rationale, surfaced back to a human reviewer
```

**Worked example — the least mature thread in this crosswalk:**

```
558.256 (Emergency Preparedness)
        |
        v
Emergency Management (not yet chartered as a governance module)
        |
        v
Emergency Response Playbook (not yet formalized as a distinct
   playbook, despite this being Serve's most thoroughly developed
   existing policy)
        |
        v
Emergency Manager (not yet specified)
        |
        v
"Predict survey deficiencies" / "Monitor compliance continuously"
   (not possible until the module above it exists)
```

The gap between these two threads is the roadmap: Background Eligibility shows what "done" looks like at the governance layer; every other module in the inventories above is at the top of this graph today, with the rest of the path still ahead of it.
