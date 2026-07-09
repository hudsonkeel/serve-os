# 01 — Background Eligibility Ontology

**Framework:** Serve Workforce Governance Framework
**Module:** 1 — Background Eligibility
**Version:** 0.1 (Draft)
**Status:** Draft — Pending Legal & Executive Review
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

This document is the canonical source of terms and structural rules for Module 1. Every other document in this module — and any future software that implements it — must be consistent with this ontology. Where a conflict exists between this document and any other document in this module, this document controls.

## 1. Canonical Definition

> A **Background Eligibility Classification** is Serve Caregiving's formal organizational determination of an applicant's suitability for employment based solely upon criminal history and related background investigation findings, independent of qualifications, experience, references, interviews, or other hiring considerations.

Every word in this definition is load-bearing:

- **"Formal organizational determination"** — this is not an opinion, a recommendation, or an informal read of a background report. It is a decision Serve Caregiving makes and stands behind.
- **"Based solely upon criminal history and related background investigation findings"** — a Background Eligibility Classification never incorporates skills, references, interview performance, or any other hiring signal. Those live entirely outside this classification.
- **"Independent of ... other hiring considerations"** — this classification can be computed in complete isolation from the rest of the hiring process. That independence is what makes it possible for this classification to eventually be automated: it depends on nothing that requires human judgment about the applicant's fit for the organization, only on the facts of the background investigation itself.

## 2. The Four Classifications

Every completed background investigation resolves to exactly one of these four classifications. They are defined in full in [`02-background-eligibility-classifications.md`](./02-background-eligibility-classifications.md); they are named here because the ontology depends on there being exactly four, no more and no fewer:

1. **Eligible**
2. **Reviewable**
3. **Presumptive Disqualification**
4. **Automatic Disqualification**

## 3. Structural Rules

These rules are not stylistic preferences. They are the properties that make a classification system trustworthy, auditable, and — eventually — safe to automate. Any future change to this module that would violate one of these rules must be treated as a breaking change to the ontology itself, not a routine policy update.

### 3.1 Every completed background investigation receives exactly one classification.

An investigation is not "in a classification" until it is complete. A classification is never left blank, deferred indefinitely, or represented as "TBD" in any record that treats the investigation as finished. Incompleteness is a workflow state (see §3.6), not a fifth classification.

### 3.2 Classifications are mutually exclusive.

No investigation can simultaneously be, for example, both Reviewable and Presumptive Disqualification. The moment an investigation matches the criteria for one classification, it is that classification and no other, regardless of whether it might have also satisfied a different classification's criteria under a different reading. This is why the evaluation order defined in [`05-review-workflow.md`](./05-review-workflow.md) matters — it exists specifically to prevent ambiguity when a case could plausibly fit more than one category.

### 3.3 Classifications are collectively exhaustive.

There is no background investigation outcome that fails to map to one of the four classifications. If a future case appears not to fit, that is evidence the taxonomy is incomplete — not evidence that a fifth classification, or an unclassified state, is acceptable. See [`06-offense-taxonomy.md`](./06-offense-taxonomy.md) §5 for how novel or ambiguous offenses are handled without breaking exhaustiveness.

### 3.4 Classifications are deterministic.

Given the same background investigation findings, the same classification must result — every time, regardless of who or what performs the evaluation. Determinism is what separates a classification from a judgment call. Where individualized human judgment is genuinely required (as it is within the Reviewable classification), that judgment is documented as part of the record, but the classification that triggers the requirement for judgment is itself still reached deterministically.

### 3.5 Classifications are explainable.

Every classification must be traceable to the specific finding(s) that produced it. "The system said Automatic Disqualification" is never an acceptable explanation on its own — the record must show *which offense*, matched against *which criterion*, produced that result. Explainability is a prerequisite for both fairness to the applicant and defensibility to a regulator.

### 3.6 Workflow states are not classifications.

"Pending," "In Review," "Awaiting Report," and similar states describe where an investigation is in the process defined by [`05-review-workflow.md`](./05-review-workflow.md). They are not classifications and must never be stored, displayed, or reasoned about as if they were one of the four. An investigation in the "Pending" workflow state has *no* classification yet — not a fifth classification called "Pending."

### 3.7 Role eligibility is not background classification.

Whether a given classification permits placement in a given role is a separate determination that also depends on the role's exposure profile (see [`04-role-exposure-model.md`](./04-role-exposure-model.md)). A classification of Reviewable, for example, does not by itself say anything about which roles are or are not available to that applicant — that requires combining the classification with the role's exposure factors. This module produces the classification; it does not produce role eligibility.

### 3.8 Hiring decisions are not background classifications.

The final decision to hire, decline to hire, or continue an applicant through the process belongs to the hiring workflow, not to this module. A Background Eligibility Classification is one documented input to that decision — often a decisive one, especially at the Automatic Disqualification end of the spectrum — but the classification itself is not the hiring decision and this module does not make hiring decisions. See [`00-purpose-and-scope.md`](./00-purpose-and-scope.md) §2.2.

## 4. Why These Rules Exist Together

Rules 3.1–3.5 make the classification itself trustworthy. Rules 3.6–3.8 keep this module from silently expanding beyond its intended boundary. Together, they are what make it possible for this module to eventually be implemented as software (see [`08-future-software-specification.md`](./08-future-software-specification.md)) without that software quietly becoming the organization's hiring decision-maker. The classification engine classifies. It does not hire, and it does not assign roles.
