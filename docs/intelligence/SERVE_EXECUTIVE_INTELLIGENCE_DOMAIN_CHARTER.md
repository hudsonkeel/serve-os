# Serve Executive Intelligence Domain Charter

**Platform:** Serve Intelligence Platform  
**Domain:** Executive Intelligence  
**Version:** 0.1  
**Status:** Foundational Design  
**Governing Documents:**  
- `SERVE_INTELLIGENCE_CONSTITUTION.md`
- `SERVE_INTELLIGENCE_ENGINEERING_STANDARDS.md`

---

## 1. Purpose

Serve Executive Intelligence exists to give Serve leadership a concise, trustworthy, cross-functional understanding of the business.

It does not create a separate intelligence platform.

It extends the existing Serve Intelligence Platform by aggregating and interpreting governed intelligence from financial, growth, workforce, care, community, recruiting, governance, quality, and other domains.

Its primary executive questions are:

> **Where are we?**  
> **Why are we there?**  
> **Where are we headed?**  
> **What matters most?**  
> **What should leadership consider doing next?**

The domain should reduce the time leadership spends assembling and interpreting information and increase the time available for sound decisions and follow-through.

---

## 2. Inheritance and Architectural Boundary

This domain inherits the Serve Intelligence Constitution and Engineering Standards in full.

Nothing in this charter supersedes those documents.

In particular:

- Truth must precede intelligence.
- Deterministic reasoning precedes AI.
- Evidence is required for Signals.
- Recommendations remain advisory.
- Human authority remains final.
- Existing platform primitives must be reused.
- Vendor systems remain systems of record for the functions they execute.
- Serve OS remains the intelligence layer above them.
- Executive Intelligence must not create duplicate Fact, Signal, Recommendation, Action, Outcome, Evidence, or Rule machinery.

Executive Intelligence should primarily consume intelligence that other domains already produce and create only the additional cross-domain reasoning necessary for executive use.

---

## 3. The 60-Second Executive Test

The primary executive experience should enable a leader, within approximately 60 seconds, to understand:

1. How is Serve performing overall?
2. Are actual results ahead of, behind, or aligned with plan?
3. What materially changed?
4. What caused the change?
5. What is likely to happen next if current conditions continue?
6. What are the most important risks?
7. What are the most important opportunities?
8. What decisions or actions require leadership attention now?

The goal is **decision clarity, not information density**.

A successful executive experience interprets the business rather than forcing leadership to interpret a wall of charts.

---

## 4. Executive Scope

Executive Intelligence should support understanding at four primary levels.

### Enterprise

Serve Caregiving overall.

### Community

Individual communities, operating markets, or other meaningful business units.

### Functional Domain

Financial, growth, clients, workforce, recruiting, care delivery, quality, governance, and other major operating areas.

### Underlying Entity

The client, caregiver, prospect, candidate, visit, invoice, payroll item, incident, action, or other record responsible for an executive-level result.

Executive Intelligence should support drill-down from summary to source evidence wherever the underlying data permits it.

---

## 5. Cross-Domain Aggregation Principle

Executive Intelligence should not independently recreate reasoning that properly belongs to another intelligence domain.

Where a Scheduling, Workforce, Growth, Relationship, Governance, QAPI, Recruiting, Community, or other domain has already established a Signal, Executive Intelligence should consume that governed Signal rather than re-derive the same conclusion from raw data.

Cross-domain executive Rules may combine existing Signals and Facts to identify conditions that only become meaningful when viewed together.

Example:

> caregiver-capacity constraint  
> + probable client starts  
> + expected service revenue  
> → revenue exposure caused by capacity

This is an executive-level finding because the material business meaning emerges from the relationship among multiple domains.

---

## 6. Financial Intelligence as a Reusable Domain

Financial reasoning should not be buried inside Executive Intelligence.

A dedicated **Financial Intelligence domain** should provide reusable financial Facts, Rules, Signals, and calculations that Executive Intelligence can consume.

Initial financial source families are expected to include:

### Care Revenue

Primarily derived from AxisCare client billing and invoice activity.

### Direct Caregiver Labor

Primarily derived from AxisCare caregiver payroll/payable activity, later reconciled or enriched by Viventium payroll execution data where appropriate.

### Payroll Burden and Workforce Cost

Expected to require Viventium and/or accounting data for items not represented in AxisCare.

### Operating Expense

Expected to require accounting or general-ledger data for community-direct and shared organizational costs.

Source ownership and exact definitions will be established in the Serve Business Ontology and Metric Registry rather than assumed by this charter.

### Community Capacity Economics

Future Community Care capacity intelligence must be judged by the Business Ontology's Community Shift Optimization Objective — sustainable Direct Service Contribution and reliable Client service, subject to caregiver fillability and workload constraints — never by utilization or Visit count alone. Executive Intelligence should not present a capacity recommendation, or a leadership-facing capacity metric, that implies maximizing caregiver utilization is itself the goal.

---

## 7. Visit as the Core Economic Bridge

The Executive Intelligence design should preserve the relationship between care delivery and economics.

Where supported by source data:

> **Client → Visit → Billable Activity → Revenue**

and:

> **Caregiver → Visit → Payable Activity → Direct Labor**

The Visit therefore becomes a key bridge between operational truth and financial truth.

This holds directly under Serve's Traditional Care model, where a caregiver's Visit is simultaneously the service event and the caregiver's unit of labor responsibility. It does not hold universally: under Serve's Community Care model, a caregiver's direct labor is anchored to the caregiver's Community Shift rather than to any individual resident Visit delivered during that Shift, even though each such Visit still drives Client-side revenue in the usual way. Executive Intelligence should not assume every Visit is also the labor unit — see the Business Ontology's Work Assignment model for the governing distinction. This does not change the Visit's role as the Client-side economic bridge for revenue.

This should allow financial performance to be understood not only at the enterprise level, but eventually by:

- community;
- client;
- service type;
- caregiver;
- visit;
- time period.

---

## 8. Economic Layers

Serve Executive Intelligence should preserve distinct layers of financial performance rather than collapsing all economics into a single margin number.

The intended hierarchy is:

> **Service Revenue**  
> minus **Direct Caregiver Labor**  
> = **Direct Service Contribution**

then, as additional cost data becomes available:

> minus **Payroll Burden and Other Direct Workforce Costs**  
> = **Fully Loaded Care Contribution**

then:

> minus **Community-Direct Operating Costs**  
> = **Community Contribution**

then:

> minus **Shared Operating Costs**  
> = an appropriate measure of overall operating profitability.

Each layer answers a different management question and should remain explainable.

The exact formulas and source definitions belong in the Metric Registry.

---

## 9. Actual, Plan, Forecast, and Target

Executive Intelligence should distinguish four planning concepts wherever applicable.

### Actual

What has occurred.

### Plan

What leadership expected or budgeted to occur.

### Forecast

What current evidence suggests will occur.

### Target

What leadership wants to occur.

These values should never be treated as interchangeable. Nor should "Actual" itself be treated as arriving all at once: for Community Care in particular, service-delivery Actual, invoice Actual, and payroll Actual may mature at different times (Business Ontology's Service-Day Data Maturity, §58), and a Visit being verified in AxisCare must not be assumed to mean its Revenue or labor cost is already final. Executive Intelligence should present recent figures with their actual maturity state, not a false appearance of completeness.

Material variance between them is itself a source of intelligence.

Forecasts should retain their assumptions and prior versions where practical so Serve can later understand:

- what was expected;
- what changed;
- why expectations changed;
- how accurate forecasts proved to be.

---

## 10. Executive Attention

Executive Intelligence should deliberately suppress routine noise.

A condition deserves executive attention when one or more of the following are materially present:

- financial impact;
- operational risk;
- client or caregiver impact;
- significant opportunity;
- deviation from plan;
- deviation from forecast;
- unusual or persistent change;
- cross-community significance;
- need for leadership authority;
- need for coordinated action across functions.

The executive surface should answer:

> **What deserves leadership attention now?**

rather than:

> **What data exists?**

---

## 11. Executive Outputs

Executive Intelligence should eventually support multiple outputs from the same governed intelligence model.

### Executive Home

The persistent 60-second operating view within Serve OS.

### Daily Executive Brief

A concise summary of material conditions and leadership attention.

### Weekly Leadership Brief

A chief-of-staff-style summary of performance, changes, forecasts, risks, opportunities, and priorities for the coming week.

### Community Operating Review

A periodic community-level view of economic and operational performance.

### Exception Alerts

Material conditions that should surface before the next scheduled review.

These outputs should not independently generate conflicting interpretations. They should derive from the same shared Facts, Signals, Evidence, Rules, and Recommendations.

---

## 12. Executive Actionability

Executive Intelligence should not stop at explanation when an evidenced condition requires intervention.

Where appropriate, executive intelligence should connect to the platform's existing lifecycle:

> **Signal → Recommendation → Action → Outcome**

and to Serve OS's existing operational work surfaces.

The goal is for leadership intelligence to become owned work rather than passive reporting.

Executive Intelligence should not create a separate task-management system.

---

## 13. Success Criteria

Serve Executive Intelligence is successful when leadership can:

- understand business performance faster;
- identify material risks earlier;
- identify important opportunities earlier;
- understand why performance changed;
- connect operational conditions to financial consequences;
- compare community performance meaningfully;
- understand client and workforce economics;
- improve forecast accuracy over time;
- convert important findings into owned action;
- reduce manual executive reporting effort;
- experience fewer avoidable surprises.

The primary success question is:

> **Does Serve leadership understand the business better and make better decisions because this domain exists?**

---

## 14. Explicit Non-Goals of v0.1

This charter does not define:

- the final executive UI;
- the final KPI set;
- individual metric formulas;
- database schema;
- AxisCare API mappings;
- Viventium API mappings;
- accounting integrations;
- cost-allocation methodology;
- forecasting algorithms;
- a business-health score;
- autonomous AI agents;
- a separate executive reasoning platform.

Those belong to subsequent artifacts and implementation work.

---

## Domain Statement

> **Serve Executive Intelligence is the leadership-facing aggregation layer of the Serve Intelligence Platform. It combines governed intelligence across financial and operational domains to explain how Serve is performing, why conditions are changing, where the organization is headed, and what deserves leadership attention — without duplicating the reasoning already owned by the domains beneath it.**