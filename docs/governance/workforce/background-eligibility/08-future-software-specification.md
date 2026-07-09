# 08 — Future Software Specification: Background Eligibility Engine

**Framework:** Serve Workforce Governance Framework
**Module:** 1 — Background Eligibility
**Version:** 0.1 (Draft)
**Status:** Specification — Not Yet Built
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

> **Nothing described in this document exists yet.** No application code, UI, database schema, or API described here has been built. This document is a specification for a future Serve OS capability, written against the governance defined in this module so that, when the time comes to build it, engineering has an unambiguous, already-approved source of truth to implement against — not a blank page.

## 1. Vision

The **Serve OS Background Eligibility Engine** is the eventual software implementation of this entire module. Its job is to take a normalized background investigation and produce a Background Eligibility Classification — deterministically, explainably, and auditably — exactly as defined in [`01-background-eligibility-ontology.md`](./01-background-eligibility-ontology.md) through [`06-offense-taxonomy.md`](./06-offense-taxonomy.md).

The engine does not make hiring decisions and does not make role-eligibility decisions (per [`01-background-eligibility-ontology.md`](./01-background-eligibility-ontology.md) §3.7–3.8). It produces one classification, with full supporting rationale, per background investigation. Everything downstream of that classification is a separate system's concern.

## 2. Design Principles Carried Forward From This Module

- **Documentation is the source of truth.** The engine's logic must be a direct implementation of [`classification-rules.yml`](./classification-rules.yml) and [`offense-taxonomy.yml`](./offense-taxonomy.yml) — not a reinterpretation of them in code. Where the two diverge, the YAML wins and the code is wrong.
- **Determinism is non-negotiable.** The same normalized findings must always produce the same classification. Any component of the eventual system that introduces non-determinism (for example, an LLM used for offense normalization) must be isolated to the normalization step and never permitted to influence the classification decision itself, which must remain rule-based and reproducible.
- **Every classification must be explainable end-to-end.** The engine must always be able to answer "why" — which offense, matched against which rule, produced this result — not just "what."
- **No silent fallback.** If normalization cannot confidently map a reported offense to a taxonomy entry, the system must escalate for human review rather than guess.

## 3. Anticipated Data Model

The following fields are anticipated based on the organization's original background eligibility decision fields, formalized against this module's ontology. **This is not a finalized schema** — field names, types, and structure are subject to change during actual implementation, and no Supabase table or migration exists for this yet.

### 3.1 Applicant / Investigation Context

| Field | Description |
|---|---|
| Applicant identifier | Reference to the applicant/prospect record. |
| Role applied for | Reference to the role, used to look up its exposure profile — not used by the classification engine itself. |
| Background report reference | Reference to the source investigation report/vendor record. |

### 3.2 Per-Offense Findings

| Field | Description |
|---|---|
| Offense (as reported) | Raw offense description from the report. |
| Normalized offense category | The taxonomy category from [`offense-taxonomy.yml`](./offense-taxonomy.yml) this offense was mapped to. |
| Jurisdiction | Where the offense occurred / was adjudicated. |
| Disposition | Conviction, deferred adjudication, dismissal, etc. |
| Conviction date | Date of conviction, if applicable. |
| Years since conviction | Derived field, used in individualized review. |
| Pattern indicator | Whether this offense is part of a broader pattern across multiple findings. |
| Registry match | Whether this finding corresponds to a registry or exclusion-list match (see [`03-risk-domains.md`](./03-risk-domains.md) §4 — **Requires Legal Review**). |

### 3.3 Role Exposure (Reference Only)

The fields in [`role-exposure.yml`](./role-exposure.yml) (Direct Client Contact, Home/Apartment Access, Transportation Duties, Medication Access, Financial/Property Access, Unsupervised Access, Overnight/Extended Duration Contact) are anticipated to be recorded per role, for consumption by a future role-eligibility system — not consumed by the classification engine itself.

### 3.4 Decision Output

| Field | Description |
|---|---|
| Algorithm classification | The classification produced by the deterministic evaluation sequence. |
| Matched criterion | The specific taxonomy entry / rule that produced the classification. |
| Applicant explanation | Any explanation or context the applicant provided, captured as part of individualized review (not used to alter Automatic Disqualification outcomes). |
| Reviewer | The human reviewer, if the classification required Reviewable or Presumptive Disqualification handling. |
| Final decision | The outcome of individualized or executive review, where applicable. |
| Approval date | Date the final classification/decision was recorded. |

## 4. Anticipated Algorithm

The classification algorithm is a direct implementation of [`05-review-workflow.md`](./05-review-workflow.md) §3 and [`classification-rules.yml`](./classification-rules.yml):

```
for each normalized offense in investigation:
    if offense matches an Automatic Disqualification category:
        return AUTOMATIC_DISQUALIFICATION (final, no further evaluation)

for each normalized offense in investigation:
    if offense matches a Presumptive Disqualification category:
        route to EXECUTIVE_REVIEW
        return PRESUMPTIVE_DISQUALIFICATION (pending executive outcome)

for each normalized offense in investigation:
    if offense matches a Reviewable category:
        route to INDIVIDUALIZED_REVIEW
        return REVIEWABLE (pending review outcome)

return ELIGIBLE
```

This pseudocode is illustrative, not a commitment to any specific implementation language or architecture.

## 5. Audit Trail Requirements

Every classification produced by the engine must generate an immutable audit record containing, at minimum: the applicant/investigation reference, every normalized offense considered, the classification produced, the specific rule matched, the reviewer or system that performed the evaluation, and a timestamp. Audit records are never deleted or overwritten — corrections are appended as new, dated entries that reference the record they correct, mirroring the append-only convention already used in [`decision-log.md`](./decision-log.md).

## 6. Anticipated Integration Points

- **Recruiting / Prospects pipeline** — the engine is expected to consume completed background investigations tied to applicants already tracked in Serve OS's recruiting workflow, and to surface classification results back into that workflow as one input among several (not as the hiring decision itself).
- **Notification system** — completion of a classification, and especially routing to executive review, is expected to trigger a notification through Serve OS's existing notification architecture, consistent with how other workforce events are already handled.
- **Future role-eligibility module** — once chartered, a role-eligibility capability is expected to consume both a Background Eligibility Classification and a role's exposure profile ([`role-exposure.yml`](./role-exposure.yml)) as independent inputs.

## 7. Explicit Non-Goals for This Version

The following are explicitly out of scope for this specification and for Version 0.1 of this module generally:

- No UI is specified or implied.
- No Supabase schema, table, or migration is specified or implied.
- No API endpoint is specified or implied.
- No change to any existing Serve OS behavior is specified or implied.
- No commitment to a specific technology, vendor, or implementation timeline is made.

## 8. Roadmap Notes Toward a Mature ("v10") System

These are aspirational and explicitly non-binding — included so that near-term implementation decisions do not foreclose them unnecessarily:

- Automated ingestion and structured parsing of background investigation reports (reducing manual normalization).
- Real-time or periodic re-checks against relevant registries and exclusion lists, where legally appropriate (**Requires Legal Review**).
- A queryable audit interface for compliance and legal review, independent of the operational recruiting workflow.
- Expansion of the offense taxonomy based on accumulated case history, governed by the same append-only decision-log discipline used in this module.
- Formal role-eligibility logic that consumes this engine's output, once that module is chartered.

None of the above should be read as a commitment. They exist to keep the "architect for version 10" principle visible while Version 0.1 remains deliberately narrow.
