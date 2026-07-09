# 04 — Role Exposure Model

**Framework:** Serve Workforce Governance Framework
**Module:** 1 — Background Eligibility
**Version:** 0.1 (Draft)
**Status:** Draft — Pending Legal & Executive Review
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## 1. Purpose and Boundary

Per [`01-background-eligibility-ontology.md`](./01-background-eligibility-ontology.md) §3.7, **role eligibility is not background classification**. A Background Eligibility Classification is computed entirely from an applicant's background investigation findings and does not vary by role. What *does* vary by role is how much a given classification should matter — a Reviewable classification touching minor theft is a very different question for a role with no property access than for a role with unsupervised access to a client's home and finances.

This document defines the **Role Exposure Model**: the set of factors that describe what a role is exposed to, independent of any specific applicant. It exists so that a future role-eligibility determination (explicitly out of scope for this module — see [`00-purpose-and-scope.md`](./00-purpose-and-scope.md) §2.2) has a structured, consistent input to combine with a Background Eligibility Classification. This module stops at defining and structuring the exposure factors themselves; it does not define how they combine with a classification to produce a role decision.

## 2. Exposure Factors

Each role at Serve Caregiving is described by the presence or absence of the following exposure factors. A role may have any combination of these factors; they are not mutually exclusive.

### 2.1 Direct Client Contact

Whether the role involves direct, in-person interaction with clients as a routine part of its duties.

### 2.2 Home / Apartment Access

Whether the role requires entry into a client's private residence, independent of whether a caregiving task is being performed at the time.

### 2.3 Transportation Duties

Whether the role involves transporting a client, or driving on the organization's behalf, as part of its duties. This factor is the primary link to the Public Safety & Driving Risk domain (see [`03-risk-domains.md`](./03-risk-domains.md) §2.8).

### 2.4 Medication Access

Whether the role involves handling, administering, or having access to a client's medications.

### 2.5 Financial / Property Access

Whether the role involves access to a client's financial instruments, valuables, identifying information, or other property, whether incidental or a routine part of duties.

### 2.6 Unsupervised Access

Whether the role routinely operates without a coworker, supervisor, or other Serve Caregiving representative present — i.e., whether the applicant would be alone with the client, the client's home, or the client's belongings for meaningful periods of time.

### 2.7 Overnight / Extended Duration Contact

Whether the role involves overnight shifts or extended-duration contact with a client, which materially increases both the duration and the intimacy of exposure relative to a short, supervised visit.

## 3. How Exposure Factors Are Used

Exposure factors describe the **role**, not the applicant and not the background investigation. They are recorded once per role (or role type) and do not change per applicant. A future role-eligibility determination is expected to take a role's exposure profile and an applicant's Background Eligibility Classification as two independent inputs — this module defines and structures the first input only.

This module does **not** currently define:

- Which combinations of exposure factors require which classification threshold.
- Any numeric weighting or scoring across exposure factors.
- Any mapping between a specific job title and its exposure profile.

These are reserved for a future revision of this module or a related Workforce Governance module, once this framework has been reviewed and adopted. See [`08-future-software-specification.md`](./08-future-software-specification.md) §4 for how this is expected to evolve toward executable logic.

## 4. Relationship to Serve OS Decision Fields

The exposure factors above correspond directly to fields already identified in the organization's original background eligibility draft as relevant "Serve OS Decision Fields" — `Direct Client Contact`, `Apartment Access`, and `Transportation Duties` specifically. This document formalizes those fields into a named, structured model and extends them (Medication Access, Financial/Property Access, Unsupervised Access, Overnight/Extended Duration Contact) to cover the full range of exposure this framework anticipates needing. See [`08-future-software-specification.md`](./08-future-software-specification.md) for how these fields are expected to appear in the eventual data model, and [`role-exposure.yml`](./role-exposure.yml) for their structured representation.
