# Decision Log — Module 1: Background Eligibility

**Framework:** Serve Workforce Governance Framework
**Module:** 1 — Background Eligibility
**Classification:** Internal — Confidential

---

## Purpose

This is an **append-only** record of decisions made about this governance module itself — its structure, scope, and content. It is not a record of individual applicant background eligibility decisions; those are retained per [`05-review-workflow.md`](./05-review-workflow.md) §3 (Step 6) as part of the operational audit trail, not here.

Entries are never edited or removed once recorded. A decision that is later superseded gets a new entry marked as superseding the old one; the old entry stays in place so the history of the module's evolution remains intact.

## Entry Format

```
## YYYY-MM-DD — <short title>

**Decision:** <what was decided>
**Rationale:** <why>
**Status:** Adopted / Superseded by <link> / Reversed
```

---

## 2026-07-08 — Module 1 Created: Background Eligibility

**Decision:** Established Module 1 of the Serve Workforce Governance Framework, governing Background Eligibility Classification. Adopted the canonical ontology (exactly four classifications: Eligible, Reviewable, Presumptive Disqualification, Automatic Disqualification), the risk domain model, the role exposure model, the deterministic review workflow, the offense taxonomy, the organizational policy draft, and the future software specification for the eventual Serve OS Background Eligibility Engine.

**Origin:** This module was seeded from the organization's existing working draft, `Serve_Background_Eligibility_Policy_v0.1_Draft.docx` (retained at `public/Serve_Background_Eligibility_Policy_v0.1_Draft.docx` in this repository), which had already established the four-classification structure, an initial offense taxonomy, a six-step review workflow outline, and a set of anticipated Serve OS decision fields. This module formalizes, extends, and structures that draft into the full governance framework format — the substance of the original draft's classification boundaries and offense examples was preserved rather than rewritten.

**Rationale:** Per the framework's governing philosophy ("architect for version 10, build version 0.1"), this module is documentation-first: it is written to serve simultaneously as organizational policy, operational playbook, software requirements specification, and AI decision model, so that any future Serve OS implementation has an unambiguous, already-reasoned source of truth to build against rather than starting from a blank page.

**Scope of this commit:** Documentation and specification only. No application code, UI, Supabase schema, or API was created or modified. No existing Serve OS behavior was changed.

**Status:** Adopted (as Version 0.1 Draft — module status itself, not the underlying policy, which remains unreviewed).

---

## 2026-07-08 — Legal and Executive Review Not Yet Performed

**Decision:** This module, including [`07-policy-draft.md`](./07-policy-draft.md), is explicitly marked as not yet reviewed by legal counsel and not yet adopted by Serve leadership. Every point in this module that touches a legal or regulatory question is flagged "Requires Legal Review" rather than resolved.

**Rationale:** The offense taxonomy, classification boundaries, and workflow in this module were carried forward from an internal draft that predates formal legal review. Presenting this module as adopted policy before that review would misrepresent its status and create risk. Explicitly marking every legal touchpoint keeps the module honest about what it does and does not yet establish.

**Status:** Adopted. This entry remains open until legal and executive review is completed and a superseding entry is recorded here documenting that review's outcome.

---

## 2026-07-08 — Canonicalization Report Created, Then Revised Under the Governance Analysis Framework

**Decision:** Created `canonicalization-report.md`, comparing Serve Caregiving Policies & Procedures §245 ("Staffing Hiring") against this module in full, and identifying nine distinct findings (the "Not Hirable" list structure, "employability" terminology, appeals, executive review, registry requirements generally, NAR, EMR, hiring terminology generally, and a legal citation discrepancy).

The report's first draft classified five of those nine findings as requiring legal review, on the basis that governance and current policy disagreed. That same day, standing engineering guidance was issued establishing the [Governance Analysis Framework](../governance-analysis-framework.md), which holds that existing Serve operational documents are assumed to represent the organization's current approved operating position unless there is specific evidence of regulatory inconsistency — and that governance/policy differences should default to inheritance, not legal escalation. The report was revised accordingly: appeals, registry requirements (general, NAR, and EMR), and the "Not Hirable" list's underlying criteria were reclassified from "requires legal review" to **Inherited Operational Standard** — existing, approved practice that this module should adopt directly. Executive review and the four-term classification vocabulary were classified as **Governance Enhancement** — genuinely new capability requiring leadership adoption, not legal review. The citation discrepancy was classified as a **Regulatory Reference Update**. No finding reached **Verified Regulatory Conflict**.

**Rationale:** The original "legal review by default" posture would have blocked adoption of provisions (the existing appeal path, the existing registry-check rules) that Serve already operates without evidence of any problem. The Governance Analysis Framework exists specifically to prevent that outcome — a new governance module being incomplete relative to years of accumulated practice is not the same thing as that practice being legally suspect.

**Status:** Adopted. The canonicalization report's five Inherited Operational Standard findings are not yet incorporated into this module's text (that is a documentation task the report explicitly recommends but does not perform) — see the report itself for the specific sections each finding should update.

---

## Open Items Carried Forward

The following gaps are known and intentional at Version 0.1, and are recorded here so they are not lost before the next revision:

- Registry and exclusion-list check requirements (federal/state healthcare exclusion lists, sex offender registry, vulnerable-adult and nurse-aide registries) are not yet defined. See [`03-risk-domains.md`](./03-risk-domains.md) §4.
- Applicant-facing appeal / reconsideration process, and any legally required adverse-action procedure, is not yet defined. See [`05-review-workflow.md`](./05-review-workflow.md) §7.
- Records retention duration for background eligibility decisions is not yet defined. See [`05-review-workflow.md`](./05-review-workflow.md) §3, Step 6.
- Role-to-exposure-factor mapping and any role-eligibility threshold logic is not yet defined. See [`04-role-exposure-model.md`](./04-role-exposure-model.md) §3 and [`role-exposure.yml`](./role-exposure.yml).
- Turnaround-time expectations for the review workflow are not yet defined. See [`05-review-workflow.md`](./05-review-workflow.md) §8.
