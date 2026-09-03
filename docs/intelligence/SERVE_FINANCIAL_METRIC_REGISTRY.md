# Serve Financial Metric Registry

**Platform:** Serve OS / Serve Intelligence Platform  
**Domain:** Financial Intelligence  
**Document Type:** Canonical Metric Registry  
**Version:** 0.1  
**Status:** Foundational Design  
**Related Documents:**
- `SERVE_INTELLIGENCE_CONSTITUTION.md`
- `SERVE_INTELLIGENCE_ENGINEERING_STANDARDS.md`
- `SERVE_EXECUTIVE_INTELLIGENCE_DOMAIN_CHARTER.md`
- `SERVE_BUSINESS_ONTOLOGY.md`

---

## 1. Purpose

The Serve Financial Metric Registry defines the canonical meaning, calculation basis, source expectations, aggregation grain, and known limitations of financial and operating-economic metrics used by Serve Intelligence.

This registry exists so that a metric has one governed meaning wherever it appears.

A metric should not be independently redefined by:

- Executive Intelligence;
- Community Intelligence;
- Financial Intelligence;
- a dashboard component;
- a report;
- an API integration;
- or an AI-generated narrative.

The Business Ontology defines what Serve's business concepts mean.

This Metric Registry defines how specific measurements of those concepts are constructed.

---

## 2. Governing Principles

### 2.1 Deterministic Before AI

Metric values are deterministic calculations from governed source data.

AI may explain, summarize, compare, or contextualize a metric.

AI does not calculate a different version of the metric.

### 2.2 Source Traceability

Every metric must identify the authoritative source or sources from which it is calculated.

Where source authority remains unresolved, the registry must say so explicitly.

### 2.3 Same Metric, Same Meaning

A metric name must represent the same calculation regardless of where it appears.

If two legitimate calculations answer different questions, they must receive different metric names.

### 2.4 Grain Must Be Explicit

Every metric must identify the lowest meaningful business grain at which it can be calculated.

Examples include:

- Visit;
- Client;
- Caregiver;
- Community;
- Enterprise;
- Time Period.

### 2.5 Unknown Is Preferable to Invented

An unresolved accounting treatment, source mapping, allocation methodology, or business rule remains unresolved until deliberately defined.

Implementation convenience is not authority to invent financial semantics.

---

# PART I — SOURCE AND CALCULATION STATUS

## 3. Metric Status Vocabulary

Each metric should use the following status vocabulary during implementation.

### Defined

Business meaning and formula are sufficiently established.

### Source Validation Required

Business meaning is established, but authoritative source fields or API support still require validation.

### Partial Source Available

Some required inputs are available, but the complete metric cannot yet be calculated authoritatively.

### Future Source Required

The metric depends upon a source not yet integrated into Serve OS.

### Leadership Definition Required

The metric requires a business-policy or financial-policy decision before implementation.

---

# PART II — FINANCIAL SPINE METRICS

## 4. Service Revenue

**Metric ID:** `financial.service_revenue`

**Business Question**

How much economic value did Serve generate from Client service during the measurement period?

**Canonical Definition**

The value of Serve service activity recognized under the selected Revenue basis.

**Initial v0.1 Basis**

For initial operating intelligence, AxisCare invoiced service activity is expected to provide the primary practical revenue basis.

The final accounting definition of Service Revenue remains subject to validation.

**Initial Formula**

```text
Service Revenue
=
Sum of qualifying invoiced service amounts
for the selected period and population
```

**Primary Source**

AxisCare Client Invoices / underlying invoice activity.

**Source Status**

Source Validation Required.

**Required Validation**

Determine:

- invoice-level API availability;
- invoice-item API availability;
- service-date vs invoice-date availability;
- adjustments;
- surcharges;
- credits;
- voids;
- payer distinctions;
- invoice status;
- relationship between invoice items and Visits.

**Supported Grain — Intended**

- Enterprise
- Community
- Client
- Visit, if invoice-item linkage permits
- Service Type, if available
- Time Period

**Planning Dimensions**

- Actual: Yes
- Plan: Yes, future
- Forecast: Yes, future
- Target: Yes, future

**Drill-Down Path**

Enterprise → Community → Client → Invoice / Visit / Billable Activity

**Known Limitation**

Invoiced Revenue must not silently be treated as collected cash or GAAP-recognized revenue.

---

## 5. Direct Caregiver Labor

**Metric ID:** `financial.direct_caregiver_labor`

**Business Question**

How much direct caregiver compensation is attributable to delivered Client service?

**Canonical Definition**

Direct compensation attributable to Caregiver service delivery during the measurement period.

**Initial Formula**

```text
Direct Caregiver Labor
=
Sum of qualifying caregiver payable amounts
associated with service delivery
```

**Primary Source**

AxisCare Caregiver Payroll / underlying payable activity.

**Future Reconciliation Source**

Viventium executed payroll.

**Source Status**

Source Validation Required.

**Required Validation**

Determine whether AxisCare exposes:

- payroll batch;
- payroll item;
- Caregiver;
- Visit;
- payable duration;
- pay rate;
- regular vs overtime classification;
- adjustments;
- mileage;
- reimbursements;
- service date;
- payroll date.

**Supported Grain — Intended**

- Enterprise
- Community
- Caregiver
- Client, through Visit attribution where supported
- Visit
- Time Period

**Planning Dimensions**

- Actual: Yes
- Plan: Future
- Forecast: Future
- Target: Future

**Drill-Down Path**

Enterprise → Community → Caregiver / Client → Visit → Payable Activity

**Known Limitation**

AxisCare operational payroll calculation and Viventium executed payroll are distinct concepts and must not be silently treated as identical.

---

## 6. Direct Service Contribution

**Metric ID:** `financial.direct_service_contribution`

**Business Question**

How much economic contribution remains from care delivery after direct caregiver compensation?

**Canonical Formula**

```text
Direct Service Contribution
=
Service Revenue
− Direct Caregiver Labor
```

**Primary Sources**

- Service Revenue
- Direct Caregiver Labor

**Source Status**

Dependent on source validation of both component metrics.

**Supported Grain — Intended**

- Enterprise
- Community
- Client
- Visit, where both sides can be attributed
- Service Type, where supported
- Time Period

**Planning Dimensions**

- Actual: Yes
- Plan: Future
- Forecast: Future
- Target: Yes, future

**Drill-Down Path**

Contribution → Revenue + Direct Labor → underlying Billable and Payable Activity

**Interpretation Boundary**

Direct Service Contribution is not net income, operating profit, or fully loaded margin.

---

## 7. Direct Labor Percentage of Service Revenue

**Metric ID:** `financial.direct_labor_pct_revenue`

**Business Question**

What percentage of Service Revenue is consumed by direct caregiver compensation?

**Canonical Formula**

```text
Direct Labor % of Revenue
=
Direct Caregiver Labor
÷ Service Revenue
× 100
```

**Required Guardrail**

If Service Revenue is zero, the metric is undefined rather than zero.

**Primary Sources**

- Service Revenue
- Direct Caregiver Labor

**Supported Grain — Intended**

- Enterprise
- Community
- Client
- Service Type, where supported
- Time Period

**Interpretation**

Lower is not automatically better.

Labor percentage must be interpreted alongside:

- service type;
- care intensity;
- wage levels;
- billing rates;
- quality;
- client needs;
- and other operating conditions.

---

## 8. Revenue per Visit

**Metric ID:** `financial.revenue_per_visit`

**Business Question**

How much Service Revenue is generated per qualifying Visit?

**Canonical Formula**

```text
Revenue per Visit
=
Service Revenue
÷ Count of qualifying Visits
```

**Visit Population**

The qualifying Visit population must correspond to the same service activity represented in the Revenue numerator.

**Primary Sources**

- Service Revenue
- Visit data

**Supported Grain — Intended**

- Enterprise
- Community
- Client
- Service Type
- Time Period

**Known Limitation**

Visit duration varies substantially. Revenue per Visit is therefore useful but should not replace Revenue per Care Hour.

---

## 9. Direct Labor per Visit

**Metric ID:** `financial.direct_labor_per_visit`

**Business Question**

How much direct caregiver compensation is incurred per qualifying Visit?

**Canonical Formula**

```text
Direct Labor per Visit
=
Direct Caregiver Labor
÷ Count of qualifying Visits
```

**Visit Population**

The Visit denominator must correspond to the service activity represented in the labor numerator.

**Primary Sources**

- Direct Caregiver Labor
- Visit data

**Supported Grain — Intended**

- Enterprise
- Community
- Client
- Caregiver
- Service Type
- Time Period

---

## 10. Revenue per Delivered Care Hour

**Metric ID:** `financial.revenue_per_delivered_hour`

**Business Question**

How much Service Revenue does Serve generate per hour of delivered care?

**Canonical Formula**

```text
Revenue per Delivered Care Hour
=
Service Revenue
÷ Delivered Care Hours
```

**Delivered Care Hours**

Must be derived from the authoritative actual service-duration definition established for Delivered Service.

**Primary Sources**

- Service Revenue
- Delivered Service / Visit duration

**Source Status**

Source Validation Required.

**Required Validation**

Determine the correct AxisCare duration basis:

- scheduled duration;
- clocked duration;
- EVV duration;
- approved duration;
- billable duration;
- or another normalized value.

These must not be assumed equivalent.

**Supported Grain — Intended**

- Enterprise
- Community
- Client
- Caregiver, where economically meaningful
- Service Type
- Time Period

---

## 11. Direct Labor per Delivered Care Hour

**Metric ID:** `financial.direct_labor_per_delivered_hour`

**Business Question**

How much direct caregiver compensation does Serve incur per delivered care hour?

**Canonical Formula**

```text
Direct Labor per Delivered Care Hour
=
Direct Caregiver Labor
÷ Delivered Care Hours
```

**Primary Sources**

- Direct Caregiver Labor
- Delivered Care Hours

**Supported Grain — Intended**

- Enterprise
- Community
- Client
- Caregiver
- Service Type
- Time Period

**Interpretation**

This is an operating labor-cost measure and is not necessarily equivalent to a Caregiver's nominal hourly wage.

---

## 12. Direct Contribution per Delivered Care Hour

**Metric ID:** `financial.direct_contribution_per_delivered_hour`

**Business Question**

How much Direct Service Contribution does Serve generate per delivered care hour?

**Canonical Formula**

```text
Direct Contribution per Delivered Care Hour
=
Direct Service Contribution
÷ Delivered Care Hours
```

Equivalent where inputs are aligned:

```text
Revenue per Delivered Care Hour
− Direct Labor per Delivered Care Hour
```

**Primary Sources**

- Direct Service Contribution
- Delivered Care Hours

**Supported Grain — Intended**

- Enterprise
- Community
- Client
- Service Type
- Time Period

**Strategic Value**

This is expected to become a particularly useful measure for comparing care-delivery economics across Clients, Communities, and service models with different Visit durations.

---

# PART III — CLIENT ECONOMICS

## 13. Active Clients

**Metric ID:** `operations.active_clients`

**Business Question**

How many Clients currently have an active Serve service relationship?

**Canonical Definition**

Count of Clients satisfying Serve's canonical active-client lifecycle rules.

**Governing Principle**

AxisCare supplies lifecycle evidence. Serve owns lifecycle interpretation.

AxisCare statuses, class codes, inactive flags, and other vendor fields are legitimate authoritative source *evidence*. They must not, by themselves, determine Active Client status. Serve-owned deterministic logic maps that evidence into canonical lifecycle states, and Serve-owned human-correction paths may override the result when the vendor evidence is misleading or incomplete.

**Primary Source**

Serve OS canonical Client lifecycle — the existing pipeline: `axiscare_client_operational_state.computed_lifecycle` (Serve-owned deterministic interpretation of AxisCare evidence, via `classifyAxisCareClientLifecycle()`) → disposition override (`axiscare_client_dispositions`) → `projectServeRelationship()` (multi-source combinator) → `applyServeRelationshipCorrection()` (human correction, highest precedence) → `isAuditEligibleActiveClient()` (identity-confidence gate).

**Source Status**

Defined. `getAuditEligibleActiveClientResidents()` is confirmed as the existing, already-governed implementation of this pipeline end-to-end and is the recommended v0.1 canonical Active Client population. Implementation should reuse it rather than recreate Active Client semantics inside Financial Intelligence, and should not query `computed_lifecycle` directly — doing so would bypass the disposition-override, multi-source, and human-correction layers.

**Supported Grain**

- Enterprise
- Community
- Time Period / point-in-time

**Planning Dimensions**

- Actual: Yes
- Plan: Yes
- Forecast: Yes
- Target: Yes

**Drill-Down Path**

Enterprise → Community → Client

**Important Boundary**

AxisCare status labels must not independently redefine Active Client. Confirmed satisfied by the current implementation — see `SERVE_FINANCIAL_INTELLIGENCE_V0.1_ARCHITECTURE_AND_API_DISCOVERY.md` for the supporting code-level investigation.

---

## 14. Service Revenue per Active Client

**Metric ID:** `financial.service_revenue_per_active_client`

**Business Question**

How much Service Revenue is generated per Active Client?

**Canonical Formula**

For a defined measurement period:

```text
Service Revenue per Active Client
=
Service Revenue
÷ Appropriate Active Client Denominator
```

**Denominator Policy**

Leadership Definition Required.

Possible denominator approaches include:

- Active Clients at period end;
- average Active Clients during period;
- Clients generating service during period.

The selected method must be explicit before implementation.

**Primary Sources**

- Service Revenue
- Active Client population

**Supported Grain — Intended**

- Enterprise
- Community
- Time Period

**Known Limitation**

A period-end Client count can distort the measure when Client starts and losses occur materially during the period.

---

## 15. Visits per Active Client

**Metric ID:** `operations.visits_per_active_client`

**Business Question**

How much Visit activity does the average Active Client receive?

**Canonical Formula**

```text
Visits per Active Client
=
Qualifying Visits
÷ Appropriate Active Client Denominator
```

**Denominator Policy**

Should use the same approved Client-period methodology as Service Revenue per Active Client unless a deliberate reason exists otherwise.

**Primary Sources**

- Visits
- Active Client population

**Supported Grain — Intended**

- Enterprise
- Community
- Time Period

**Strategic Value**

Helps distinguish growth caused by:

- more Clients;

from growth caused by:

- greater service intensity per Client.

---

# PART IV — COMMUNITY ECONOMICS

## 16. Community Direct Service Contribution

**Metric ID:** `financial.community_direct_service_contribution`

**Business Question**

How much Direct Service Contribution is generated by care delivered within a Community?

**Canonical Formula**

```text
Community Direct Service Contribution
=
Community Service Revenue
− Community Direct Caregiver Labor
```

**Primary Sources**

- Community-attributed Service Revenue
- Community-attributed Direct Caregiver Labor

**Source Status**

Source Validation Required.

**Required Validation**

Determine canonical Community attribution for:

- Client;
- Visit;
- invoice / Billable Activity;
- Caregiver labor / Payable Activity;
- cross-community Caregiver activity.

**Supported Grain**

- Community
- Time Period

**Drill-Down Path**

Community → Clients / Visits → Revenue + Direct Labor

**Important Boundary**

This is not yet **Community Contribution** as defined in the Business Ontology.

Community Contribution additionally requires Payroll Burden and Community-Direct Operating Costs.

---

# PART V — DELIVERY AND LABOR RECONCILIATION

## 17. Scheduled vs Delivered Care Hours

**Metric ID:** `operations.scheduled_vs_delivered_hours`

**Business Question**

How closely does actual service delivery align with scheduled service demand?

**Canonical Components**

```text
Scheduled Care Hours
=
Sum of qualifying scheduled Visit duration
```

```text
Delivered Care Hours
=
Sum of qualifying actual delivered Visit duration
```

```text
Delivery Variance Hours
=
Delivered Care Hours
− Scheduled Care Hours
```

```text
Delivery Rate
=
Delivered Care Hours
÷ Scheduled Care Hours
× 100
```

**Required Guardrail**

If Scheduled Care Hours are zero, Delivery Rate is undefined.

**Primary Source**

AxisCare Visit / scheduling / EVV or equivalent service-delivery records.

**Source Status**

Source Validation Required.

**Supported Grain — Intended**

- Enterprise
- Community
- Client
- Caregiver
- Time Period

**Intelligence Value**

May expose:

- missed care;
- shortened Visits;
- extended Visits;
- schedule changes;
- demand variation;
- documentation issues;
- and potential revenue or labor effects.

**Interpretation Boundary**

Variance alone does not establish why the difference occurred.

---

## 18. Billable Labor vs Paid Labor

**Metric ID:** `financial.billable_vs_paid_labor`

**Business Question**

How does Client-billable service time compare with Caregiver-compensated work time?

**Canonical Components**

```text
Billable Care Hours
=
Hours represented in qualifying Billable Activity
```

```text
Paid Care Hours
=
Hours represented in qualifying Payable / Payroll Activity
```

```text
Paid-to-Billable Hour Ratio
=
Paid Care Hours
÷ Billable Care Hours
```

**Required Guardrail**

If Billable Care Hours are zero, the ratio is undefined.

**Initial Primary Source**

AxisCare Billable Activity + AxisCare Caregiver Payroll / Payable Activity.

**Future Reconciliation Source**

Viventium executed payroll.

**Source Status**

Source Validation Required.

**Supported Grain — Intended**

- Enterprise
- Community
- Client, where attributable
- Caregiver, where attributable
- Visit, where linkage exists
- Time Period

**Intelligence Value**

Potentially identifies:

- non-billable compensated time;
- billing/payroll mismatch;
- overtime effects;
- rounding differences;
- minimum-pay rules;
- documentation problems;
- and operational inefficiency.

**Interpretation Boundary**

A ratio above 1.0 is not automatically evidence of waste or error.

Legitimate differences may result from:

- compensation rules;
- training;
- travel;
- minimum shift requirements;
- overtime;
- administrative time;
- rounding;
- or other approved workforce policies.

---

# PART VI — REGISTRY SUMMARY

## 19. Financial Spine v0.1 Metrics

| # | Metric | Metric ID | Primary Question |
|---|---|---|---|
| 1 | Service Revenue | `financial.service_revenue` | How much service value did Serve generate? |
| 2 | Direct Caregiver Labor | `financial.direct_caregiver_labor` | What direct caregiver compensation did service delivery require? |
| 3 | Direct Service Contribution | `financial.direct_service_contribution` | What remains after direct caregiver labor? |
| 4 | Direct Labor % of Revenue | `financial.direct_labor_pct_revenue` | How much Service Revenue is consumed by direct caregiver labor? |
| 5 | Revenue per Visit | `financial.revenue_per_visit` | How much Service Revenue is generated per qualifying Visit? |
| 6 | Direct Labor per Visit | `financial.direct_labor_per_visit` | How much direct caregiver labor is incurred per qualifying Visit? |
| 7 | Revenue per Delivered Care Hour | `financial.revenue_per_delivered_hour` | How much Service Revenue is generated per delivered care hour? |
| 8 | Direct Labor per Delivered Care Hour | `financial.direct_labor_per_delivered_hour` | How much direct caregiver labor is incurred per delivered care hour? |
| 9 | Direct Contribution per Delivered Care Hour | `financial.direct_contribution_per_delivered_hour` | How much Direct Service Contribution is generated per delivered care hour? |
| 10 | Active Clients | `operations.active_clients` | How many Clients currently have an active Serve service relationship? |
| 11 | Service Revenue per Active Client | `financial.service_revenue_per_active_client` | How much Service Revenue is generated per Active Client? |
| 12 | Visits per Active Client | `operations.visits_per_active_client` | How much Visit activity does the average Active Client receive? |
| 13 | Community Direct Service Contribution | `financial.community_direct_service_contribution` | How much Direct Service Contribution is generated within each Community? |
| 14 | Scheduled vs Delivered Care Hours | `operations.scheduled_vs_delivered_hours` | How closely does actual service delivery align with scheduled service demand? |
| 15 | Billable Labor vs Paid Labor | `financial.billable_vs_paid_labor` | How does Client-billable service time compare with Caregiver-compensated work time? |

---

## 20. Why These Metrics Form the v0.1 Financial Spine

These 15 metrics are intentionally narrow.

They are not intended to represent every financial or executive metric Serve will eventually need.

They exist to prove the foundational operating-economic relationship established in the Serve Business Ontology:

```text
Client
  ↓
Visit
  ↓
Billable Activity
  ↓
Service Revenue
```

and simultaneously:

```text
Caregiver
  ↓
Visit
  ↓
Payable Activity
  ↓
Direct Caregiver Labor
```

which produces:

```text
Service Revenue
      −
Direct Caregiver Labor
      =
Direct Service Contribution
```

If Serve OS can calculate, explain, reconcile, and drill into these relationships reliably, the platform will have established the financial foundation upon which more complete Community and enterprise economics can later be built.

---

# PART VII — METRIC RELATIONSHIPS

## 21. Core Financial Relationship

The primary v0.1 financial relationship is:

```text
Service Revenue
      −
Direct Caregiver Labor
      =
Direct Service Contribution
```

This relationship should remain mathematically consistent wherever its component metrics are presented.

Executive Intelligence, Community Intelligence, reports, dashboards, and AI-generated explanations must not independently calculate alternate versions of these metrics.

---

## 22. Visit-Level Economic Relationship

Where source-system granularity permits:

```text
                         Visit
                       ↙       ↘
             Billable Activity  Payable Activity
                    ↓                 ↓
             Service Revenue    Direct Caregiver Labor
                    ↘                 ↙
                  Direct Service
                   Contribution
```

This is the preferred foundation for understanding unit economics because both the revenue and direct labor sides can potentially be traced to the same underlying instance of service delivery.

Where Visit-level attribution is not available, the metric must explicitly identify the higher grain at which the calculation is authoritative.

The system must not fabricate Visit-level attribution from aggregate totals.

---

## 23. Client Economic Relationship

Where Visit-level attribution exists:

```text
Client
  ↓
Visits
  ↓
Service Revenue
  −
Direct Caregiver Labor
  =
Client Direct Service Contribution
```

This enables future analysis of:

- Client service intensity;
- Client Revenue;
- Client direct labor requirements;
- Client Direct Service Contribution;
- Revenue per Client;
- Visits per Client;
- Revenue per delivered care hour;
- Direct Labor per delivered care hour;
- Direct Contribution per delivered care hour.

Client-level economics should not be interpreted as a judgment about the desirability or value of serving a particular person.

They are management information used to understand how Serve's service model operates economically.

---

## 24. Community Economic Relationship

Community-level v0.1 economics are:

```text
Community
   ↓
Clients
   ↓
Visits
   ↓
Service Revenue
   −
Direct Caregiver Labor
   =
Community Direct Service Contribution
```

This allows Serve to compare the direct care-delivery economics of Communities before introducing broader cost allocations.

Future versions may extend this relationship:

```text
Community Direct Service Contribution
      −
Payroll Burden and Other Direct Workforce Costs
      =
Fully Loaded Care Contribution

Fully Loaded Care Contribution
      −
Community-Direct Operating Costs
      =
Community Contribution
```

Those later metrics should not be implemented until their source data and allocation policies are governed.

---

## 25. Enterprise Economic Relationship

Enterprise v0.1 financial intelligence aggregates the same governed financial spine:

```text
All qualifying Community and non-Community Service Revenue
      −
All qualifying Direct Caregiver Labor
      =
Enterprise Direct Service Contribution
```

Future enterprise profitability will require additional cost layers, including Community-Direct Operating Costs and Shared Operating Costs.

Direct Service Contribution must not be labeled or interpreted as overall Serve profit.

---

# PART VIII — TIME AND POPULATION ALIGNMENT

## 26. Numerator and Denominator Alignment

Ratio metrics must use economically and operationally aligned populations.

For example:

```text
Revenue per Visit
=
Revenue associated with Population A
÷
Visits associated with Population A
```

not:

```text
Revenue associated with Population A
÷
all Visits regardless of whether they generated that Revenue
```

The same principle applies to:

- Direct Labor per Visit;
- Revenue per Delivered Care Hour;
- Direct Labor per Delivered Care Hour;
- Direct Contribution per Delivered Care Hour;
- Revenue per Active Client;
- Visits per Active Client;
- Billable vs Paid Labor.

A mathematically valid calculation using mismatched populations is not a valid Serve metric.

---

## 27. Time-Basis Alignment

Every metric must explicitly define the time basis used by its inputs.

Potential dates include:

- service date;
- Visit completion date;
- invoice date;
- payroll date;
- pay-period date;
- accounting posting date;
- payment date.

These dates are not assumed to be equivalent.

Where two component metrics are compared, the selected time basis must support a meaningful comparison.

For operating economics, service-date attribution should be preferred where authoritative source data permits it, because it most directly connects Revenue and labor to the care that generated them.

This preference remains subject to source validation and future accounting-policy decisions.

---

## 28. Visit Population Alignment

A Visit count used in financial metrics must identify which Visits qualify.

Potential distinctions include:

- scheduled Visits;
- completed Visits;
- billable Visits;
- paid Visits;
- cancelled Visits;
- missed Visits;
- unscheduled Visits;
- adjusted Visits.

The denominator for a metric must correspond to the business question being answered.

No implementation should use a generic `visit_count` without defining the underlying Visit population.

---

## 29. Care-Hour Alignment

The term **Care Hour** must identify the underlying duration basis.

Potential duration concepts include:

- Scheduled Care Hours;
- Delivered Care Hours;
- Billable Care Hours;
- Paid Care Hours.

These are separate business concepts.

A metric using one must not silently substitute another.

For v0.1, "Delivered Care Hours" specifically means Recorded Delivered Care Hours as defined in §41 (elapsed AxisCare clock-in-to-clock-out time), not a placeholder for any convenient duration field.

For example:

```text
Revenue per Delivered Care Hour
```

must use Delivered Care Hours, not Scheduled Care Hours merely because scheduled duration is easier to retrieve.

If the required duration is unavailable, the metric remains unavailable until an approved alternative definition is established.

---

# PART IX — SOURCE RECONCILIATION

## 30. AxisCare Operating-Economic Role

AxisCare is expected to provide much of the initial financial spine because it contains both Client invoicing activity and Caregiver payroll/payable activity associated with care delivery.

The v0.1 implementation should investigate AxisCare as a potential authoritative source for:

- Visits;
- service dates;
- scheduled duration;
- delivered duration;
- billable duration;
- Billable Activity;
- invoice items;
- invoice totals;
- Client attribution;
- Community attribution;
- Payable Activity;
- Caregiver payroll calculations;
- payable duration;
- pay rates;
- payable amounts;
- and Visit-to-financial-record relationships.

These capabilities must be validated against the AxisCare API and current Serve OS integration before implementation assumptions are made.

---

## 31. Viventium Reconciliation Role

Viventium is expected to provide executed payroll truth once API access is available.

This creates an important future distinction:

```text
AxisCare Operationally Calculated Payroll
                  ↓
             reconciliation
                  ↑
Viventium Executed Payroll
```

Differences between the two may be legitimate or may identify conditions requiring review.

Potential causes may include:

- payroll adjustments;
- overtime;
- bonuses;
- reimbursements;
- taxes or employer burden;
- non-Visit compensated time;
- corrections;
- timing differences;
- or data synchronization issues.

Financial Intelligence should explain known differences rather than treating every difference as an error.

---

## 32. Accounting / General Ledger Expansion

The v0.1 financial spine does not provide complete organizational profitability.

A future accounting or General Ledger integration is expected to provide additional cost and financial information including:

- Payroll Burden;
- Community-Direct Operating Costs;
- Shared Operating Costs;
- non-care workforce expense;
- insurance;
- software;
- professional fees;
- marketing;
- office expense;
- and other operating costs.

Those sources will enable later metrics such as:

- Fully Loaded Care Contribution;
- Community Contribution;
- operating expense by Community;
- enterprise operating performance;
- cash-flow measures;
- budget variance;
- and other financial statements or executive measures.

These should be added through future governed Metric Registry revisions rather than inferred prematurely.

---

# PART X — EXECUTIVE INTELLIGENCE RELATIONSHIP

## 33. Metrics Are Inputs to Intelligence

A Metric is not automatically a Signal.

For example:

```text
Direct Labor % of Revenue = 58%
```

is a calculated business measure.

Whether 58% represents:

- normal performance;
- favorable performance;
- an important variance;
- a concerning trend;
- or a condition requiring action

belongs to a deterministic Financial Intelligence Rule with approved thresholds and Evidence.

The Metric Registry defines the measurement.

The Intelligence Engineering Standards govern the reasoning performed using that measurement.

---

## 34. Financial Signals

Future Financial Intelligence Rules may evaluate these metrics to produce Signals such as:

```text
financial.revenue_below_plan
financial.direct_labor_ratio_above_target
financial.direct_contribution_declining
financial.community_contribution_variance
financial.billable_paid_labor_mismatch
```

These examples are illustrative only.

No Signal, threshold, severity, lifecycle, or Recommendation is approved by this registry.

Each must be separately designed under the Serve Intelligence Engineering Standards before implementation.

---

## 35. Cross-Domain Executive Reasoning

Executive Intelligence may combine Financial Intelligence with governed Signals from other domains.

For example:

```text
Growth Intelligence
    probable Client starts
             +
Workforce / Scheduling Intelligence
    projected capacity constraint
             +
Financial Intelligence
    expected Revenue associated with demand
             ↓
Executive Intelligence
    material Revenue exposure caused by capacity
```

Executive Intelligence should consume existing domain intelligence rather than independently recreating the underlying Growth, Workforce, Scheduling, or Financial determinations.

---

# PART XI — IMPLEMENTATION GATES

## 36. AxisCare Financial Capability Audit

Before implementing the financial spine, the repository and AxisCare API should be investigated to determine:

1. Which required AxisCare financial objects are exposed through the API.
2. Which are already ingested into Serve OS.
3. Which are visible in AxisCare but unavailable through the current API.
4. What grain is available for invoices and payroll.
5. Whether financial items retain Visit linkage.
6. Whether Client and Community attribution can be established reliably.
7. Which duration concepts are available.
8. How adjustments, credits, cancellations, surcharges, overtime, and other exceptions are represented.
9. What historical depth is available.
10. What polling, synchronization, or event mechanisms exist.

The investigation should report capability and gaps before proposing implementation.

---

## 37. Metric Implementation Gate

A metric is implementation-ready only when:

- its canonical definition is approved;
- its formula is approved;
- its numerator and denominator populations are defined;
- its time basis is defined;
- authoritative source fields are identified;
- source grain supports the intended calculation;
- exclusions and exception handling are defined;
- drill-down provenance is possible at the supported grain;
- and any Leadership Definition Required item has been resolved.

A metric failing one or more of these conditions should remain registered but unavailable rather than implemented approximately without approval.

---

## 38. Financial Intelligence Rule Gate

A metric becoming available does not automatically authorize a Rule.

Before a Financial Intelligence Rule ships, it must independently satisfy the Serve Intelligence Engineering Standards, including:

- Business Value;
- Inputs;
- Thresholds;
- Deterministic Logic;
- Evidence;
- Signal;
- Recommendation decision;
- Explanation;
- false-positive analysis;
- lifecycle;
- audit requirements;
- AI boundary;
- and Success Metrics.

This Metric Registry should be referenced by Rules rather than duplicated inside them.

---

# PART XII — OPEN DECISIONS

## 39. Revenue Basis

**Status:** Source Validation / Financial Definition Required

The initial operating-intelligence assumption is that AxisCare invoiced service activity will provide the most practical v0.1 Service Revenue basis.

Before implementation, confirm:

- whether Service Revenue should initially use invoice date or service date;
- treatment of adjustments;
- treatment of credits;
- treatment of voids;
- treatment of surcharges;
- treatment of non-Visit charges;
- and whether any invoice activity should be excluded.

This decision does not need to resolve every future accounting definition of Revenue.

It must resolve what `financial.service_revenue` means in v0.1.

---

## 40. Active Client Period Denominator

**Status:** Leadership Definition Required

For period-based per-Client metrics, determine whether the denominator should be:

- average Active Clients during the period;
- Active Clients at period end;
- unique Clients receiving service during the period;
- or another explicitly governed population.

The preferred method should support meaningful comparison across periods with Client starts and losses.

---

## 41. Delivered Care Hour Basis

**Status:** Partially Defined for v0.1 — Recorded Delivered Care Hours approved as the v0.1 basis; further validation still required before broader use.

### v0.1 Approved Definition — Recorded Delivered Care Hours

For the v0.1 Visit-based vertical slice, "Delivered Care Hours" is defined precisely as:

> **Recorded Delivered Care Hours** = the elapsed time between the authoritative recorded AxisCare clock-in and clock-out timestamps for a qualifying Visit.

This more precise term is used deliberately in place of the bare phrase "Delivered Care Hours" wherever precision matters, because it makes the source truth visible and does not imply that this duration is necessarily:

- EVV-approved duration;
- billing-approved duration;
- billable duration;
- payroll-approved duration;
- or paid duration.

Wherever this document uses "Delivered Care Hours" for a v0.1 metric (§10–§12, §17, §29), it means Recorded Delivered Care Hours as defined here, unless and until a more authoritative distinct delivered/approved/EVV duration is validated per the item below.

### Still Open — Source Validation Required

Whether AxisCare exposes a more authoritative duration distinct from clocked time remains to be determined:

- EVV duration;
- approved Visit duration;
- billable duration;
- payable duration;
- another normalized AxisCare duration.

If discovery identifies one of these as more authoritative, that finding should be reported and this section revised — the v0.1 definition above must not be silently changed in response.

Scheduled, delivered (recorded), billable, and paid duration must remain distinct concepts.

---

## 42. Direct Caregiver Labor Scope

**Status:** Source Validation / Financial Definition Required

Determine which compensation components belong in Direct Caregiver Labor v0.1.

Potential components include:

- regular Visit compensation;
- overtime attributable to care delivery;
- shift or service differentials;
- Visit-specific bonuses;
- mileage or reimbursement;
- other direct compensation.

The initial definition may intentionally be narrower if AxisCare cannot authoritatively expose every component.

Any excluded component should remain visible as a known limitation.

---

## 43. Community Attribution

**Status:** Source Validation Required

Determine how financial activity is assigned to Community.

Preferred attribution should follow the underlying service activity rather than merely the Caregiver's home Community or payroll assignment.

Cross-community Caregiver work must be attributed consistently.

Where a Client receives service outside a defined Community, the system must preserve that activity without forcing it into an unrelated Community.

---

## 44. Billable vs Paid Labor Interpretation

**Status:** Definition Refinement Required

The initial metric compares Billable Care Hours with Paid Care Hours.

Before using this as a performance Signal, Serve must determine which differences are:

- expected;
- operationally necessary;
- policy-driven;
- financially material;
- or potentially anomalous.

The metric may be implemented before those thresholds exist.

A Signal should not.

---

# PART XIII — V0.1 COMPLETION STANDARD

## 45. What Financial Spine v0.1 Must Prove

Financial Spine v0.1 should demonstrate that Serve OS can reliably answer:

1. How much Service Revenue did Serve generate?
2. How much Direct Caregiver Labor did that service require?
3. How much Direct Service Contribution remained?
4. What percentage of Service Revenue was consumed by direct labor?
5. How do Revenue and labor behave per Visit?
6. How do Revenue, labor, and contribution behave per delivered care hour?
7. How do these economics differ by Community?
8. How much service activity does each Active Client generate?
9. How closely did delivered service align with scheduled service?
10. How closely did paid labor align with billable care activity?
11. Can each material number be traced back to its underlying source records?
12. Can the same financial definitions be reused by Financial, Community, and Executive Intelligence without being recalculated differently?

If these questions can be answered consistently and explainably, the financial spine has proven the core architecture.

---

## 46. What Financial Spine v0.1 Does Not Need to Prove

Financial Spine v0.1 does not require:

- complete enterprise profitability;
- complete Payroll Burden;
- all Community-Direct Operating Costs;
- Shared Operating Cost allocation;
- cash-flow reporting;
- full accounting statements;
- final forecasting methodology;
- final budgets or targets;
- Viventium reconciliation;
- automated executive Recommendations;
- a business-health score;
- or a finished Executive Intelligence UI.

Those capabilities should build on the financial spine after its foundational relationships are validated.

---

## Registry Statement

> **Serve's Financial Metric Registry establishes one governed language for measuring the economics of care delivery. Financial Spine v0.1 begins with the relationship between Service Revenue, Direct Caregiver Labor, and Direct Service Contribution, using the Visit as the bridge between Client economics and workforce economics. Every metric must remain deterministic, source-traceable, population-aligned, and semantically consistent across Serve Intelligence. Where the required source or business definition is unresolved, the metric remains explicitly unresolved rather than being approximated silently.**