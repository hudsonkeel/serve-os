# Canonicalization Report — Background Eligibility, Phase 1

**Framework:** Serve Workforce Governance Framework
**Module:** 1 — Background Eligibility
**Document Type:** Reconciliation Report (bridge document — not policy, not governance)
**Version:** 0.1
**Status:** Draft — For Leadership Review
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## What This Document Is

This report compares two documents that currently both speak to background eligibility at Serve Caregiving:

- **Serve Caregiving Policies & Procedures (draft)**, §245 "Staffing Hiring" — the current, operating, organizational policy.
- **Background Eligibility Module 1** (`docs/governance/workforce/background-eligibility/`) — the newly built governance framework, Version 0.1, pending legal and executive review.

**Neither document is modified by this report.** This is the reconciliation step that has to happen *before* anyone can responsibly decide which one governs. Per the work order that created it: after leadership approval, governance becomes canonical and the Policies & Procedures document is updated to reference it rather than duplicate it — but that update is future work, not this document.

## Method

Every sentence of P&P §245 that touches criminal history, registries, or hiring disqualification was compared against the full text of Module 1 (`01-background-eligibility-ontology.md` through `08-future-software-specification.md`, plus `offense-taxonomy.yml`, `classification-rules.yml`, and `role-exposure.yml`). Nine distinct differences were found — the eight named in the work order, plus one additional legal-citation discrepancy discovered during the comparison. One apparent overlap was reviewed and found *not* to be a difference at all; it is documented at the end for completeness.

**Revision note (2026-07-08):** this report was revised to apply the [Governance Analysis Framework](../../governance-analysis-framework.md), adopted the same day. The original version of this report classified five of these nine findings as requiring legal review by default, on the basis that governance and current policy disagreed. Under the framework now in effect, existing Serve operational documents are assumed to represent the organization's current approved operating position unless there is specific evidence of regulatory inconsistency — and several of those five findings, on that basis, are simply existing operational practice that governance had not yet caught up to. Every finding below is now classified using the framework's four-tier hierarchy: **Inherited Operational Standard**, **Governance Enhancement**, **Regulatory Reference Update**, or **Verified Regulatory Conflict**. No finding in this report reached the fourth tier.

---

## Findings

### 1. The "Not Hirable" List

| Field | Detail |
|---|---|
| **Current Policy** | P&P §245 presents a single flat list of "reasons an individual is not hirable": felony conviction under Texas Health and Safety Code §250.006, negative EMR or NAR listing, no-show to a scheduled interview without valid excuse, and an unsatisfactory reference check. |
| **Governance Position** | `01-background-eligibility-ontology.md` §3.8 states hiring decisions are not background classifications, and the canonical definition itself (§1) requires a Background Eligibility Classification to be "independent of qualifications, experience, references, interviews, or other hiring considerations." |
| **Classification** | **Inherited Operational Standard**, with a structural clarification. The disqualifying criminal-history and registry criteria in this list are existing, approved organizational practice — governance should inherit them directly. The list's *structure* (bundling them with unrelated hiring criteria) is simply an artifact of P&P never having needed to separate "background eligibility" from "hiring" as distinct concepts before governance existed to make that distinction. |
| **Recommended Canonical Source** | Governance, for the criminal-history/registry portion — inheriting P&P's existing criteria, not inventing new ones. P&P remains canonical for the non-criminal portion (interview no-shows, unsatisfactory references), which was never a background-eligibility matter. |
| **Migration Recommendation** | Split the "Not Hirable" list at its root: criminal-history and registry items are inherited into Module 1's classification system as-is; interview/reference-based hiring criteria remain in P&P §245 as ordinary hiring policy. This is a reorganization of existing, already-approved content — not a policy change, and not a legal question. |
| **Rationale** | The current policy structurally treats "why someone isn't hired" as one undifferentiated list because it never had to be otherwise. Governance's ontology gives a reason to separate the two — it does not give a reason to doubt either one. |

### 2. Criminal History Language

| Field | Detail |
|---|---|
| **Current Policy** | P&P §245 frames the entire inquiry as determining the applicant's "employability" — a single, undifferentiated judgment built from the criminal history check *combined with* NAR, EMR, and reference checks in one sentence. |
| **Governance Position** | `01-background-eligibility-ontology.md` §1 defines the classification as resting "solely upon criminal history and related background investigation findings" — "employability" as P&P uses it is a broader, mixed concept governance does not use or recognize. |
| **Classification** | **Governance Enhancement.** Governance's narrower, more precise term is a genuine improvement for the specific purpose of naming a background-eligibility determination — but it does not invalidate P&P's broader "employability" concept, which correctly describes a different, larger judgment (references and interview performance included). Both terms are correct for what each describes. |
| **Recommended Canonical Source** | Governance, for the term "Background Eligibility Classification" specifically, when referring to the criminal-history determination. P&P's "employability" remains correct for the broader hiring judgment. |
| **Migration Recommendation** | Use "Background Eligibility Classification" wherever a future P&P cross-reference specifically means the criminal-history determination; keep "employability" for the broader concept it already correctly describes. No content changes — a precision improvement, adoptable without leadership sign-off beyond the general adoption of Module 1 itself. |
| **Rationale** | Related to Finding 1's structural clarification, isolated here because it is a naming-precision improvement, not a disagreement about substance. |

### 3. Appeals

| Field | Detail |
|---|---|
| **Current Policy** | P&P §245 provides a concrete, currently-operating appeal path: an applicant disqualified under Texas Health and Safety Code §250.006 may appeal by obtaining a DPS Fast Fingerprint background check through a named third-party service. |
| **Governance Position** | `05-review-workflow.md` §7 states plainly that the framework "does not currently define an applicant-facing appeal or reconsideration process" and marks this a deliberate, open gap requiring legal counsel before adoption. |
| **Classification** | **Inherited Operational Standard.** This is the clearest example in this report of the pattern the Governance Analysis Framework exists to catch: governance flagged an *apparent* gap, but the organization has already been operating an approved appeal mechanism, with no evidence it conflicts with any regulation. The correct response is inheritance, not escalation. |
| **Recommended Canonical Source** | Governance — once it incorporates the existing DPS Fast Fingerprint path as-is, rather than treating appeals as an open question. |
| **Migration Recommendation** | Incorporate the existing DPS Fast Fingerprint appeal path directly into `05-review-workflow.md` §7, replacing its current "not yet defined" framing. Confirm scope (whether it applies to all four classifications or specifically to findings under the citation addressed in Finding 9) as part of that incorporation — a documentation completeness question, not a legal one. |
| **Rationale** | Governance's own text called this a hypothetical gap requiring legal counsel. It is not hypothetical — it is existing, approved, operating practice that governance simply had not yet captured. |

### 4. Executive Review

| Field | Detail |
|---|---|
| **Current Policy** | P&P §245 has no analogous concept. Its only escalation path is the applicant-initiated DPS Fast Fingerprint appeal (Finding 3) — there is no internal Serve reviewer or override mechanism described anywhere in the current policy. |
| **Governance Position** | `02-background-eligibility-classifications.md` §3 and `05-review-workflow.md` §5 establish a formal Presumptive Disqualification tier: findings are escalated to executive-level review, which may uphold or, in a documented exceptional circumstance, override the presumption in writing. |
| **Classification** | **Governance Enhancement.** No current-practice counterpart exists to inherit from — this is new process architecture, which is exactly what leadership review (rather than legal review) is for. |
| **Recommended Canonical Source** | Governance, pending leadership adoption of the new tier. |
| **Migration Recommendation** | No content to migrate; the Presumptive Disqualification / executive review tier should be adopted as net-new process when Module 1 is adopted, with a designated executive role named explicitly (not yet specified in either document). This is a leadership decision to make, not a legal one. |
| **Rationale** | Distinguished from Finding 3 because it is a genuinely new capability rather than existing practice governance failed to capture — the two should not be resolved the same way even though both involve review/escalation. |

### 5. Registry Requirements (General)

| Field | Detail |
|---|---|
| **Current Policy** | P&P §245 treats NAR and EMR checks as mandatory, independent screening steps that sit *alongside* the criminal history check, each capable of disqualifying an applicant on its own. |
| **Governance Position** | Module 1's classification system (`offense-taxonomy.yml`, `06-offense-taxonomy.md`) is built entirely around categories of criminal *offense* — it contains no registry-status category at all. `03-risk-domains.md` §4 separately flags registry and exclusion-list checks generally as not yet defined. |
| **Classification** | **Inherited Operational Standard.** Registry-based disqualification is existing, approved, currently-enforced practice. Governance's silence on it is incompleteness, not a considered decision to exclude it — there is no indication anyone decided registry checks *shouldn't* factor into background eligibility. |
| **Recommended Canonical Source** | Governance, once extended to inherit this existing practice. Current Policy remains authoritative in the interim. |
| **Migration Recommendation** | Extend Module 1 with a registry-status input path alongside its four offense-classification tiers, carrying over P&P's existing rule (NAR "unemployable" or any EMR listing → disqualifying) directly. This is inheriting an operating rule, not designing a new one — no legal review is needed to formalize a check the organization already performs. |
| **Rationale** | Named separately from NAR/EMR individually because the *general* question — should registry status be part of the same classification system as criminal offenses — is a documentation-structure decision, answered the same way (inherit) regardless of which specific registry is involved. |

### 6. Nurse Aide Registry (NAR)

| Field | Detail |
|---|---|
| **Current Policy** | P&P §245: "Check the Nurses Aid Registry. If the NAR has an 'unemployable' result, the applicant will not be hired." Treated as a hard, automatic bar. |
| **Governance Position** | No mention of NAR anywhere in Module 1. |
| **Classification** | **Inherited Operational Standard.** |
| **Recommended Canonical Source** | Governance, once extended to inherit this rule as-is. |
| **Migration Recommendation** | Add an NAR-specific determination path to Module 1, carrying over the existing "unemployable result → disqualifying" rule directly rather than redesigning it. |
| **Rationale** | A real, currently-enforced screening step with zero governance coverage — the gap is documentation, not policy substance. |

### 7. Employee Misconduct Registry (EMR)

| Field | Detail |
|---|---|
| **Current Policy** | P&P §245: "Check the Employee Misconduct Registry. If the applicant is listed on the EMR, they will not be hired." Also a hard, automatic bar — any listing at all, with no severity gradation. |
| **Governance Position** | No mention of EMR anywhere in Module 1. |
| **Classification** | **Inherited Operational Standard.** |
| **Recommended Canonical Source** | Governance, once extended to inherit this rule as-is. |
| **Migration Recommendation** | Same treatment as NAR (Finding 6) — carry the existing "any listing → disqualifying" rule over directly. Worth deciding NAR and EMR together, since they are structurally identical inheritances. |
| **Rationale** | Identical situation to NAR, tracked separately because they are two distinct registries an applicant could be checked against independently. |

### 8. Hiring Terminology

| Field | Detail |
|---|---|
| **Current Policy** | P&P §245 uses "Not Hirable" as its only classification-adjacent term. It has no positive term for a cleared applicant — the policy simply proceeds silently when no disqualifying finding exists. |
| **Governance Position** | Module 1 uses exactly four defined terms — Eligible, Reviewable, Presumptive Disqualification, Automatic Disqualification — each with a precise definition in `02-background-eligibility-classifications.md`. |
| **Classification** | **Governance Enhancement.** Governance's four-term vocabulary is a genuine improvement in precision over "Not Hirable" (which has no positive counterpart and no gradation) — worth adopting going forward, though it changes how outcomes are *named*, not what the underlying criteria are. |
| **Recommended Canonical Source** | Governance. |
| **Migration Recommendation** | Any future P&P cross-reference to governance should use the four governance terms directly, so staff reading either document encounter one consistent vocabulary. Since this changes terminology staff will see and use daily, it's worth a brief leadership acknowledgment as part of adopting Module 1 — not because it's legally sensitive, but because it's an operational communication change. |
| **Rationale** | A vocabulary improvement, listed separately from Finding 1 (structural list) and Finding 2 ("employability" specifically) because it is the broadest of the three — it affects every place either document names an outcome. |

### 9. Legal Citation Discrepancy *(additional finding, not in the original example list)*

| Field | Detail |
|---|---|
| **Current Policy** | P&P §245 cites "TAC Health and Safety Code 250.006" as the controlling list of disqualifying convictions — a citation that itself conflates the Texas Administrative Code (TAC) with the Texas Health and Safety Code (a statute, not a TAC rule). |
| **Governance Position** | Module 1's offense taxonomy (`offense-taxonomy.yml`, `06-offense-taxonomy.md`) was built from a different original source (`Serve_Background_Eligibility_Policy_v0.1_Draft.docx`, per this module's own `decision-log.md`) and does not cite Health and Safety Code §250.006, or any other specific statute, anywhere. |
| **Classification** | **Regulatory Reference Update.** There is no evidence either document's underlying substance is wrong — only that the citation is imprecisely written, and that the two documents' offense lists have never been explicitly cross-walked against each other. Per the framework, this is an editorial correction, not a "Verified Regulatory Conflict": nothing here shows current practice actually falls short of Chapter 250's requirements. |
| **Recommended Canonical Source** | Neither yet — both should be corrected once the citation is confirmed. |
| **Migration Recommendation** | Correct the citation to Texas Health and Safety Code, Chapter 250 (not "TAC" §250.006), and cross-walk Module 1's four offense categories against Chapter 250's enumerated disqualifying convictions to confirm they're already captured — which is the expected outcome absent evidence otherwise, per the framework's default assumption. Only escalate to legal review if that cross-walk actually surfaces a gap. |
| **Rationale** | Discovered while comparing the two documents' offense lists — an editorial gap (never cross-referenced), not a demonstrated substantive one. |

---

## Reviewed — No Difference Found

**Criminal history check consent and ordering procedure.** P&P §245 states a criminal history check is requested "after obtaining the applicant's permission." Module 1 says nothing about consent, ordering, or vendor selection because `00-purpose-and-scope.md` §2.2 explicitly places "the mechanics of how background checks are ordered, vendors used, or turnaround times" out of scope for this module. This is not a difference to classify — P&P's consent language sits entirely outside the boundary Module 1 was deliberately scoped to. It is noted here so it isn't mistaken for an unaddressed gap in a future reading of this report.

---

## Recommendation: How Policies & Procedures Should Reference Governance After Adoption

This report does not implement this recommendation — it describes the shape a future edit should take, for whoever performs it after leadership approval.

Once Module 1 incorporates Findings 1, 3, 5, 6, and 7 as inherited operational standards (i.e., once its text actually reflects the registry rules and appeal path Serve already operates), and its status changes from Draft to Adopted per `decision-log.md`, P&P §245's criminal-history and registry-disqualification content should be **replaced with a short cross-reference**, not left in place alongside governance and not deleted outright. The recommended pattern:

> *Background eligibility determinations (criminal history, NAR, and EMR findings) are governed by the Serve Workforce Governance Framework, Module 1: Background Eligibility. See `docs/governance/workforce/background-eligibility/` for the current classification criteria, review workflow, and offense taxonomy. This section previously stated that policy directly; it now defers to governance as the single canonical source.*

This preserves an audit trail (a reader can see *why* the section looks the way it does) while eliminating duplication. The interview-attendance and reference-check criteria currently bundled into §245's "Not Hirable" list (see Finding 1) are **not** background eligibility matters and should remain in P&P as ordinary hiring policy — they should not be moved into governance and should not be part of the cross-reference above.

This recommendation should not be executed until:

1. Findings 1, 3, 5, 6, and 7 have been formally inherited into Module 1's text (a documentation task, not a legal one),
2. Finding 9's citation has been corrected and its taxonomy cross-walk confirmed (escalating to legal review only if that cross-walk surfaces an actual gap), and
3. Leadership has formally approved Module 1's adoption per its own decision log, including the two Governance Enhancements (Findings 4 and 8).

---

## Summary Table

| # | Finding | Classification | Current Policy Status | Governance Status | Resolution Requires |
|---|---|---|---|---|---|
| 1 | "Not Hirable" list structure | Inherited Operational Standard | In effect | Ontology supports separation | Documentation reorganization |
| 2 | "Employability" terminology | Governance Enhancement | In effect (broader term) | More precise term available | Adopt precise term for the narrower case |
| 3 | Appeals | Inherited Operational Standard | In effect (DPS Fast Fingerprint) | Marked as undefined | Incorporate existing practice into governance text |
| 4 | Executive review | Governance Enhancement | Not present | Newly defined | Leadership adoption of new process |
| 5 | Registry requirements (general) | Inherited Operational Standard | In effect | Not covered | Governance scope extension (inherit as-is) |
| 6 | NAR | Inherited Operational Standard | In effect | Not covered | Governance scope extension (inherit as-is) |
| 7 | EMR | Inherited Operational Standard | In effect | Not covered | Governance scope extension (inherit as-is) |
| 8 | Hiring terminology (general) | Governance Enhancement | "Not Hirable" | Four defined classifications | Leadership acknowledgment of vocabulary change |
| 9 | Legal citation (HSC §250.006) | Regulatory Reference Update | Cited, possibly miscited | Not cited at all | Citation correction + taxonomy cross-walk |

Nine findings identified; zero classified as Verified Regulatory Conflict. Five (1, 3, 5, 6, 7) are Inherited Operational Standards — documentation work, resolvable without legal or leadership escalation. Two (4, 8) are Governance Enhancements requiring leadership adoption of something genuinely new, not legal review. One (9) is a Regulatory Reference Update — a citation fix, escalating to legal review only if the resulting cross-walk actually surfaces a gap. One (2) is a direct, low-stakes consequence of resolving Finding 1.
