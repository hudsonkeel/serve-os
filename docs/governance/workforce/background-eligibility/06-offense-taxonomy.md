# 06 — Offense Taxonomy

**Framework:** Serve Workforce Governance Framework
**Module:** 1 — Background Eligibility
**Version:** 0.1 (Draft)
**Status:** Draft — Pending Legal & Executive Review
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## 1. Purpose

This document is the human-readable presentation of the offense taxonomy that drives the evaluation sequence in [`05-review-workflow.md`](./05-review-workflow.md). Its structured, machine-readable counterpart is [`offense-taxonomy.yml`](./offense-taxonomy.yml); the two are kept in lockstep, and the YAML is the intended source of truth for any future software implementation.

**Every offense listed below is representative, not exhaustive.** This taxonomy will never enumerate every possible criminal offense. Where an offense is not explicitly listed, it is evaluated against the risk domains in [`03-risk-domains.md`](./03-risk-domains.md) and the category definitions below to determine the closest fit — see §5.

**Requires Legal Review.** The specific offenses and category boundaries below reflect the organization's original policy draft and have not been validated against Texas or federal law, nor against any healthcare-specific exclusion or registry requirements. This taxonomy must not be treated as legally reviewed or adopted until that review is complete.

## 2. Category → Classification Mapping

| Category | Classification | Risk Domain(s) |
|---|---|---|
| Violence | Automatic Disqualification | Violence & Physical Safety |
| Sexual Misconduct | Automatic Disqualification | Sexual Misconduct & Abuse |
| Crimes Against Vulnerable Persons | Automatic Disqualification | Abuse, Neglect & Exploitation of Vulnerable Persons |
| Healthcare / Trust | Automatic Disqualification | Healthcare Fraud & Regulatory Integrity; Financial & Property Trust |
| Executive Review Required | Presumptive Disqualification | Financial & Property Trust; Dishonesty & Integrity; Substance-Related Risk; Public Safety & Driving Risk |
| Reviewable Offenses | Reviewable | Substance-Related Risk; Financial & Property Trust; Public Safety & Driving Risk |
| Eligible Offenses | Eligible | None (no qualifying risk domain implicated) |

## 3. Automatic Disqualification Categories

### 3.1 Violence

Representative offenses: murder, manslaughter, kidnapping, aggravated assault, robbery, aggravated robbery.

### 3.2 Sexual Misconduct

Representative offenses: sexual assault, child sexual abuse, sex offender registration.

### 3.3 Crimes Against Vulnerable Persons

Representative offenses: elder abuse, child abuse, exploitation, neglect.

### 3.4 Healthcare / Trust

Representative offenses: healthcare fraud, theft from a client, financial exploitation, identity theft involving a care relationship.

## 4. Presumptive Disqualification Category

### 4.1 Executive Review Required

Representative offenses: felony theft, burglary, forgery, embezzlement, drug distribution, repeated domestic violence, felony DWI.

## 5. Reviewable Category

Representative offenses evaluated through the individualized review procedure in [`05-review-workflow.md`](./05-review-workflow.md) §4: simple possession offenses, a single misdemeanor DWI, minor theft or shoplifting, disorderly conduct, trespassing, criminal mischief, non-violent resisting arrest.

## 6. Eligible Category

Representative offenses: traffic citations, parking violations, expired registration, and isolated municipal violations that do not implicate any risk domain in [`03-risk-domains.md`](./03-risk-domains.md).

## 7. Handling Offenses Not Explicitly Listed

Because this taxonomy is representative rather than exhaustive (per the exhaustiveness rule in [`01-background-eligibility-ontology.md`](./01-background-eligibility-ontology.md) §3.3, which applies to classifications, not to the offense list), an offense that does not appear above is evaluated by:

1. Identifying which risk domain(s) in [`03-risk-domains.md`](./03-risk-domains.md) it implicates, if any.
2. Comparing its severity and nature to the closest representative offense already listed in that domain's category.
3. Documenting the reasoning for the category assignment made, so the decision is explainable per [`01-background-eligibility-ontology.md`](./01-background-eligibility-ontology.md) §3.5.
4. Escalating genuinely novel or ambiguous cases to executive review rather than defaulting to Eligible or Reviewable by omission.

This procedure — and the taxonomy itself — should be expected to grow over time as novel cases are encountered. Each addition should be recorded in [`decision-log.md`](./decision-log.md).
