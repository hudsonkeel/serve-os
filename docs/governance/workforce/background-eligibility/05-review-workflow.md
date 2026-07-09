# 05 — Review Workflow

**Framework:** Serve Workforce Governance Framework
**Module:** 1 — Background Eligibility
**Version:** 0.1 (Draft)
**Status:** Draft — Pending Legal & Executive Review
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## 1. Purpose

This document defines the deterministic procedure by which a completed background investigation is evaluated and resolved into exactly one of the four classifications defined in [`02-background-eligibility-classifications.md`](./02-background-eligibility-classifications.md). It exists so that "how do we decide" has one answer, followed the same way every time, by every reviewer. Its structured form is maintained in [`classification-rules.yml`](./classification-rules.yml).

## 2. Preconditions

This workflow begins only once a background investigation report has been received and is considered complete. Ordering, vendor selection, and turnaround-time management for the investigation itself are out of scope for this module (see [`00-purpose-and-scope.md`](./00-purpose-and-scope.md) §2.2).

## 3. The Deterministic Evaluation Sequence

Every completed investigation is evaluated in the following fixed order. Evaluation stops at the first step that produces a match — this ordering is what guarantees the mutual exclusivity required by [`01-background-eligibility-ontology.md`](./01-background-eligibility-ontology.md) §3.2.

### Step 1 — Normalize Findings

Extract and normalize each discrete offense from the background investigation report: offense description, jurisdiction, disposition, conviction date (if applicable), and any registry or exclusion-list match. Normalization maps report-specific language to the canonical offense categories in [`06-offense-taxonomy.md`](./06-offense-taxonomy.md).

### Step 2 — Match Against Automatic Disqualification Criteria

Compare each normalized offense against the Automatic Disqualification offense categories ([`06-offense-taxonomy.md`](./06-offense-taxonomy.md) §1). If any offense matches, the investigation is classified **Automatic Disqualification** and evaluation stops. No further steps are performed.

### Step 3 — Match Against Presumptive Disqualification Criteria

If no offense matched Step 2, compare each normalized offense against the Presumptive Disqualification offense categories ([`06-offense-taxonomy.md`](./06-offense-taxonomy.md) §2). If any offense matches, the investigation is classified **Presumptive Disqualification** and routed to the executive review tier (§5 below). Evaluation stops for classification purposes; the executive review tier governs what happens next.

### Step 4 — Match Against Reviewable Criteria

If no offense matched Step 2 or Step 3, compare each normalized offense against the Reviewable offense categories ([`06-offense-taxonomy.md`](./06-offense-taxonomy.md) §3). If any offense matches, the investigation is classified **Reviewable** and routed to the individualized review procedure (§4 below).

### Step 5 — Default to Eligible

If no offense matched any of Steps 2 through 4, the investigation is classified **Eligible**. This is the deterministic fallback, not a default assumption made in the absence of information — it only applies once every normalized offense has been evaluated against every prior tier and none matched.

### Step 6 — Document and Retain

Regardless of which classification is reached, the record must capture: the normalized offense(s) considered, the specific criterion matched (or the fact that none matched, for Eligible), the classification produced, the reviewer or system that performed the evaluation, and the date. This record is retained per the organization's records retention policy (**Requires Legal Review** for retention duration and applicable requirements).

## 4. Individualized Review Procedure (Reviewable Classification)

When Step 4 produces a Reviewable classification, a human reviewer evaluates the case against the factors defined in [`02-background-eligibility-classifications.md`](./02-background-eligibility-classifications.md) §2:

1. Nature and severity of the offense.
2. Time elapsed since the offense or conviction.
3. Evidence of rehabilitation.
4. Employment history since the offense.
5. Relevance of the offense to the specific role or duties in question — informed by, but not identical to, the role's exposure profile in [`04-role-exposure-model.md`](./04-role-exposure-model.md).
6. Whether the finding reflects an isolated incident or a pattern.

The reviewer documents a rationale for each factor considered and records a final outcome. The final outcome and its rationale become part of the permanent record for that applicant, per Step 6 above.

## 5. Executive Review Tier (Presumptive Disqualification)

When Step 3 produces a Presumptive Disqualification classification, the case is escalated to executive-level review. The reviewing executive:

1. Confirms the matched offense and criterion.
2. Considers whether any documented, exceptional circumstance warrants overriding the presumption.
3. Records a written decision — either upholding the presumption or overriding it — with rationale.

Any override of a Presumptive Disqualification presumption must be in writing, must state the rationale, and is retained as part of the permanent record. Overrides are expected to be rare; the presumption exists precisely because these offense categories warrant disqualification in the ordinary case.

## 6. No Review Path for Automatic Disqualification

Per [`02-background-eligibility-classifications.md`](./02-background-eligibility-classifications.md) §4, an Automatic Disqualification classification has no review or override path within this framework. Step 2 above is final upon match.

## 7. Reconsideration and Appeal

**Requires Legal Review.** This framework does not currently define an applicant-facing appeal or reconsideration process, nor does it address any legally required adverse-action or ban-the-box procedures that may apply independent of this framework (for example, individualized assessment or pre-adverse-action notice requirements under applicable law). This gap is deliberate at Version 0.1 and must be closed with legal counsel before this module is adopted as binding policy.

## 8. Timelines

This framework does not currently specify target turnaround times for any step of this workflow. Timeline expectations are reserved for a future revision, once operational experience with this workflow exists.
