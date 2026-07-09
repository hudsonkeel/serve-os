# Module 1: Background Eligibility

**Framework:** Serve Workforce Governance Framework
**Module:** 1 — Background Eligibility
**Version:** 0.1 (Draft)
**Status:** Draft — Pending Legal & Executive Review
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## What This Module Is

Background Eligibility is the formal, organization-wide framework Serve Caregiving uses to evaluate an applicant's criminal history and related background investigation findings, and to arrive at one of exactly four defensible, explainable classifications.

This module is deliberately narrow in scope. It governs **background eligibility classification only** — not hiring decisions, not role assignment, not onboarding. Those are related but distinct decisions that *consume* a background eligibility classification as one input among several. See [`00-purpose-and-scope.md`](./00-purpose-and-scope.md) for the precise boundary.

This module was seeded from an existing organizational draft, `Serve_Background_Eligibility_Policy_v0.1_Draft.docx`, which is preserved as the origin record in [`decision-log.md`](./decision-log.md). Everything in this module is Version 0.1: foundational, internally consistent, and **not yet reviewed by legal counsel or adopted by Serve leadership.**

## Reading Order

For someone encountering this module for the first time, read in this order:

| Order | Document | Purpose |
|---|---|---|
| 1 | [`00-purpose-and-scope.md`](./00-purpose-and-scope.md) | Why this module exists and exactly what it does and does not govern. |
| 2 | [`01-background-eligibility-ontology.md`](./01-background-eligibility-ontology.md) | The canonical definitions and structural rules everything else depends on. |
| 3 | [`02-background-eligibility-classifications.md`](./02-background-eligibility-classifications.md) | The four classifications, defined in full. |
| 4 | [`03-risk-domains.md`](./03-risk-domains.md) | The underlying categories of risk the classifications are built to address. |
| 5 | [`04-role-exposure-model.md`](./04-role-exposure-model.md) | How a role's exposure to clients, homes, and assets is modeled — separately from classification. |
| 6 | [`05-review-workflow.md`](./05-review-workflow.md) | The deterministic, step-by-step process for arriving at a classification. |
| 7 | [`06-offense-taxonomy.md`](./06-offense-taxonomy.md) | The offense categories and representative offenses that drive classification. |
| 8 | [`07-policy-draft.md`](./07-policy-draft.md) | The organizational policy itself, in adoptable form. |
| 9 | [`08-future-software-specification.md`](./08-future-software-specification.md) | What the eventual Serve OS Background Eligibility Engine is expected to do. |

## Machine-Readable Companions

| File | Mirrors | Purpose |
|---|---|---|
| [`offense-taxonomy.yml`](./offense-taxonomy.yml) | `06-offense-taxonomy.md` | Structured offense categories, representative offenses, and classification mapping. |
| [`classification-rules.yml`](./classification-rules.yml) | `05-review-workflow.md` | The deterministic evaluation order and fallback logic as data. |
| [`role-exposure.yml`](./role-exposure.yml) | `04-role-exposure-model.md` | The structured list of role exposure factors. |

## Governance

| File | Purpose |
|---|---|
| [`decision-log.md`](./decision-log.md) | Append-only record of decisions made about this module itself — not about individual applicants. |

## What This Module Does Not Contain

Per the tasking that created it, this module is documentation and specification only:

- No application code.
- No user interface.
- No Supabase schema or migrations.
- No API endpoints.
- No change to any existing Serve OS behavior.

Everything describing future software (primarily [`08-future-software-specification.md`](./08-future-software-specification.md)) is a specification for something **not yet built**.
