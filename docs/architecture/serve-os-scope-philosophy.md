# Serve OS Scope Philosophy

**Document Type:** Standing Architectural Guidance
**Version:** 1.0
**Status:** Active
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## Purpose

This document defines what Serve OS is, and is not, responsible for owning — and gives every future governance module a single test to apply when deciding whether its future software layer should be new transactional software or an integration with something that already exists.

## What Serve OS Is Not

Serve OS is not intended to become:

- An HRIS
- An ATS (applicant tracking system)
- Payroll software
- Scheduling software
- A phone system
- A documentation platform

Those responsibilities belong to specialized operational systems Serve already uses: **Apploi** (hiring/ATS), **Viventium** (HRIS/payroll/I-9), **AxisCare** (hourly-client scheduling and documentation), **Dialpad** (phone system), **SAS** (planned), **Cinch CCM** (community-client care coordination/documentation), and future vendors as adopted. Recreating what any of these already does well is not a goal of this architecture, regardless of how naturally a governance module's software layer might seem to want its own data store.

## What Serve OS Owns

- Governance
- Organizational Knowledge
- Operational Intelligence
- Audit Readiness
- Cross-system Visibility
- Decision Support
- AI

## The Guiding Question

Every future governance module's software layer must be evaluated against one question:

> **What organizational knowledge, operational standards, audit evidence, or cross-system intelligence should Serve own independently of any vendor?**

- If the answer is *"the vendor already performs this operational function well,"* Serve OS should **integrate** with it — reference its data, surface its status, index its evidence — rather than recreate it.
- If the answer is *"Serve needs this knowledge regardless of vendor,"* Serve OS should **own** it.

This supersedes any implicit assumption — including in prior architecture work in this repository — that a governance module naming a "Serve OS Module" in its Future Serve OS Module Inventory means that module should become new transactional software. It usually should not. It should usually become a *decision layer* — the classification logic, the compliance status, the audit trail, the cross-system view — sitting on top of data that continues to live in the vendor system that already owns it operationally.

## Applying the Test

A useful pattern that emerges from applying this question across the modules already named in the Governance Crosswalk:

- **Own the decision, integrate with the data.** Background Eligibility Module 1's future engine does not run background checks (Sapphire, via Viventium, already does that well) — it applies Serve's own classification logic to the result. That is organizational knowledge no vendor can supply, because no vendor knows Serve's own risk tolerance and offense taxonomy.
- **Own the canonical cross-system object, not the operational record.** This mirrors an architectural principle already established in `ARCHITECTURE.md` before this document existed: residents are Serve OS's canonical business object, and external systems enrich that relationship rather than own it. The same pattern applies to personnel, training, and client documentation — Serve OS should hold the canonical *view* and *compliance status*, not duplicate the vendor's own record store.
- **Own what no vendor is positioned to own.** Incident tracking, emergency-preparedness readiness, QAPI trend analysis, and audit-evidence mapping have no natural vendor home among Apploi, Viventium, AxisCare, Dialpad, SAS, or Cinch CCM — these are squarely Serve's own organizational knowledge to own.

## Consequence for Existing Architecture Work

The Future Serve OS Module Inventory in `docs/architecture/serve-governance-crosswalk.md` was named before this philosophy was formalized, and several of its entries need to be read through this lens rather than taken as a literal build list. See that document's own revision note for the module-by-module reconciliation.
