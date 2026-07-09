# Serve Workforce Governance Framework

**Framework:** Serve Workforce Governance Framework
**Status:** Active — Foundational Build
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## What This Is

The Serve Workforce Governance Framework is the canonical, version-controlled body of policy, operational procedure, and decision logic governing how Serve Caregiving evaluates, classifies, and manages the people who deliver and support care.

Each module in this framework is written to serve four purposes simultaneously:

1. **Organizational Policy** — the position Serve Caregiving takes and is prepared to defend.
2. **Operational Playbook** — the procedure staff actually follow.
3. **Software Requirements Specification** — the contract that future Serve OS features are built against.
4. **AI Decision Model** — a structure precise enough that an automated or AI-assisted system could apply it consistently and explainably.

This is a documentation-first program. Documentation is not written to describe software that already exists — documentation is written first, as the authoritative source of truth, and software is built to implement it. Where a module references future software, that software does not yet exist unless explicitly stated otherwise.

## Governing Philosophy

**Architect for version 10. Build version 0.1.**

Every module is designed with its long-term, fully-realized form in view — the eventual software system, the mature audit posture, the scaled organization. But each module is *published* at whatever version reflects its actual current state of adoption. A module marked `Version 0.1 (Draft)` is a foundation, not a finished policy — it has not yet been through legal or executive review, and nothing in it should be treated as binding organizational policy until its status changes.

## Modules

| # | Module | Status | Location |
|---|--------|--------|----------|
| 1 | Background Eligibility | Draft — Pending Legal & Executive Review | [`background-eligibility/`](./background-eligibility/README.md) |

Future modules (onboarding governance, training and competency compliance, disciplinary and corrective action, credentialing and licensure tracking, etc.) will be added to this table as they are chartered. Their absence here does not imply they are out of scope for the framework — only that they have not yet been built.

## Conventions Used Across This Framework

- **Document status** always appears near the top of every document: `Draft`, `Draft — Pending Legal & Executive Review`, `Adopted`, `Superseded`, or `Retired`.
- **"Requires Legal Review"** is used explicitly wherever a document touches a legal or regulatory question this framework is not positioned to resolve on its own. These are flags, not conclusions — nothing in this framework should be read as legal advice.
- **Machine-readable companions** (`.yml` files) exist alongside the human-readable policy documents wherever the underlying logic is meant to eventually be executable. The YAML is not decorative — it is the intended source of truth for future software, kept in lockstep with the prose that explains it.
- **Decision logs** are append-only. Nothing is deleted from a decision log; superseded entries are marked as such and left in place, so the history of *why* the framework looks the way it does is never lost.
