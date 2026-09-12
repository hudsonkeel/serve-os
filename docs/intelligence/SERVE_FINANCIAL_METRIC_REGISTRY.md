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

**Two-Model Note:** "Visit" in the Supported Grain above means Traditional Visit. For Community Care, the natural payable grain is the Community Shift, not the Community Visit — see Part XIV, §50 for the full Traditional Care vs. Community Care semantics.

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

**Two-Model Note:** at Visit grain, this metric is Direct Labor Actual only for a Traditional Visit. At Community-Visit grain, the labor component is necessarily Allocated Direct Labor — see Part XIV, §50.

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

**Two-Model Note:** see Part XIV, §50 — below the Community-Shift grain, this ratio's labor term is Allocated Direct Labor for Community Care.

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

**Two-Model Caution:** for Community Care, this metric is **not an actual per-Visit labor cost**. A caregiver is paid for the Community Shift, not per resident Visit within it; `Community Shift labor ÷ Community Visits` is at best an aggregate efficiency measure, not Direct Labor Actual for any individual Community Visit. See Part XIV, §50–§51 before presenting this metric for Community Care.

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

**Two-Model Note:** for Community Care, the numerator (labor) is naturally Community-Shift-grain while the denominator (Delivered Care Hours) is naturally Community-Visit-grain — different natural grains. Aggregating both sides to a common Community/period population is authoritative; computing this ratio at the individual-Community-Visit level requires Allocated Direct Labor. See Part XIV, §50.

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

**Two-Model Note:** inherits the grain caution from §11 — authoritative at Community/Shift-population grain for Community Care; requires Allocated Direct Labor below that grain. See Part XIV, §50–§51.

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

**Two-Model Note:** for Community Care, Community-attributed Direct Caregiver Labor sums Community Shift payable amounts for caregivers whose Shifts occurred in that Community — this is actually the *natural*, non-allocated case, since Community sits at or above the Shift grain. See Part XIV, §50.

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

**Two-Model Note:** this metric is Visit-grain for both Traditional and Community Care and is **unaffected** by the Work Assignment distinction — it measures service delivery, not labor cost. A Community Shift also has its own scheduled/actual time, which is a distinct concept not currently in this metric's scope; do not conflate Shift-level and Visit-level scheduled/delivered hours. See Part XIV, §50.

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

**Two-Model Note:** for Community Care, Billable Care Hours are naturally Community-Visit-grain while Paid Care Hours are naturally Community-Shift-grain — these do not share a natural grain. The ratio is directly meaningful at a grain where both can be validly aggregated (Caregiver-day, Community-day, or higher), not at the individual-Community-Visit level unless Paid Care Hours are allocated down to that Visit. See Part XIV, §50.

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

# PART XIV — TRADITIONAL CARE / COMMUNITY CARE LABOR AMENDMENT

## 47. Purpose of This Amendment

Serve operates at least two materially different care-delivery/economic models: **Traditional Care** and **Community Care** (Business Ontology Part XII). The original v0.1 financial spine (Parts II–VII above) is directionally correct on the revenue side for both models, but was written assuming the labor side always traces through the Visit. That assumption holds for Traditional Care and does not hold for Community Care, where the caregiver's payable Work Assignment is the Community Shift, not the individual Community Visit.

This Part clarifies, for each affected metric, how Traditional Care and Community Care semantics differ. It does not change any metric's approved formula from Parts II–V; it clarifies grain, aggregation authority, and allocation requirements. Metrics not listed here — Service Revenue, Revenue per Visit, Active Clients, Service Revenue per Active Client, Visits per Active Client — are unaffected, because their natural grain is already the Visit/Client side, which this amendment does not change.

---

## 48. Natural Economic Grain Rule

**Revenue and cost must be modeled at their natural authoritative economic grain before aggregation or allocation.**

### Revenue

Prefer the lowest authoritative billable grain — Visit / Billable Activity / Invoice Line — where source data supports it. This is unchanged by the two-model amendment and applies identically to Traditional Visits and Community Visits.

### Direct Labor

Prefer the lowest authoritative payable grain:

- **Traditional Care:** Visit / Work Assignment (a Traditional Visit satisfies both roles — Ontology §53).
- **Community Care:** Community Shift / Work Assignment (Ontology §54).

Serve must not force both models into one vendor-shaped grain, and must not treat Community Visit as the natural payable grain for Community Care direct labor.

---

## 49. Direct Labor: Actual vs. Allocated

See Business Ontology §61 for the canonical definitions of **Direct Labor Actual** and **Allocated Direct Labor**.

For metric purposes: a metric computed at the natural payable Work Assignment grain (Traditional Visit or Community Shift) is Direct Labor Actual. A metric computed at any finer grain for Community Care (for example, per Community Visit or per Client, within a Shift) necessarily uses Allocated Direct Labor and must be labeled as such, carrying the allocation method, source Work Assignment, period, and model/version where applicable. No allocation method is approved by this registry.

---

## 50. Per-Metric Review — Traditional Care vs. Community Care

For each metric: natural source grain; Traditional Care semantics; Community Care semantics; whether aggregation is authoritative; whether lower-grain reporting requires allocation; current data-source support. Data-source findings are not re-derived here — see `SERVE_FINANCIAL_INTELLIGENCE_V0.1_INVESTIGATION_REPORT.md` for the underlying AxisCare/CINCH capability findings; this section states the semantic implication, not a new capability finding.

### `financial.direct_caregiver_labor` (§5)

1. **Natural source grain:** Traditional Visit (Work Assignment) for Traditional Care; Community Shift (Work Assignment) for Community Care.
2. **Traditional Care semantics:** unchanged from §5 — Visit-linked payable amounts.
3. **Community Care semantics:** the sum of qualifying Community Shift payable amounts for the caregiver population in scope — not the sum of amounts attributed to individual Community Visits.
4. **Aggregation authoritative?** Yes, at Caregiver / Community / Enterprise / Time Period, for both models, since both aggregate from their own natural grain.
5. **Lower-grain (per-Visit) reporting requires allocation?** Yes, for Community Care, if a per-Community-Visit or per-Client figure is ever required. Not for Traditional Care, where Visit already is the natural grain.
6. **Current data-source support:** No — both AxisCare payroll/payable data and any CINCH-side Shift payable data remain unconfirmed/unintegrated as of the Investigation Report. Unchanged by this amendment.

### `financial.direct_service_contribution` (§6)

1. **Natural source grain:** inherits from its two inputs — see §5 (labor) and §4 (revenue, unaffected by this amendment).
2. **Traditional Care semantics:** unchanged — Visit-level Revenue minus Visit-level Labor is directly meaningful.
3. **Community Care semantics:** meaningful and authoritative at Community-Shift-and-its-Community-Visits grain or higher (e.g., Community, Enterprise). At the individual-Community-Visit grain, the labor term is necessarily Allocated Direct Labor (§49), so a per-Community-Visit contribution figure is an allocated metric, not an actual one.
4. **Aggregation authoritative?** Yes, at Community/Enterprise for both models.
5. **Lower-grain requires allocation?** Yes, for a per-Community-Visit figure under Community Care.
6. **Current data-source support:** No, per §5/§4 — both inputs remain unconfirmed.

### `financial.direct_labor_pct_revenue` (§7)

1. **Natural source grain:** same population as its two inputs.
2. **Traditional Care semantics:** unchanged.
3. **Community Care semantics:** meaningful at Community-Shift-and-Community-Visits grain or higher. A per-Community-Visit ratio would divide Community-Visit-level Revenue by an Allocated Direct Labor figure — must be labeled as allocated/derived, not compared directly to a Traditional Care per-Visit ratio without noting the labor-cost basis difference.
4. **Aggregation authoritative?** Yes, at Community/Enterprise.
5. **Lower-grain requires allocation?** Yes, for Community Care below the Shift grain.
6. **Current data-source support:** No.

### `financial.direct_labor_per_visit` (§9) — see also §51

1. **Natural source grain:** Traditional Visit for Traditional Care; not naturally Visit-grain for Community Care.
2. **Traditional Care semantics:** unchanged — directly attributable.
3. **Community Care semantics:** not an actual per-Visit labor cost. `Community Shift labor ÷ Community Visits` is, at best, an aggregate efficiency measure over the Shift's Visit population — see §51.
4. **Aggregation authoritative?** Yes, only at Shift-and-its-Visits grain or higher; not authoritative at the individual-Community-Visit level.
5. **Lower-grain requires allocation?** Yes, and the registry recommends against presenting it as Direct Labor Actual.
6. **Current data-source support:** No.

### `financial.direct_labor_per_delivered_hour` (§11)

1. **Natural source grain:** Traditional Visit for Traditional Care; Community Shift for Community Care.
2. **Traditional Care semantics:** unchanged — Direct Caregiver Labor ÷ Delivered Care Hours, both Visit-attributable.
3. **Community Care semantics:** the denominator (Delivered Care Hours) is naturally Community-Visit-grain, while the numerator (Direct Caregiver Labor) is naturally Community-Shift-grain — different natural grains. Computing this ratio at the individual-Community-Visit level requires Allocated Direct Labor in the numerator. At the Community/Shift-population level, both sides can be aggregated to a common period/population without allocation.
4. **Aggregation authoritative?** Yes, at Community/Enterprise, aggregating each side from its own natural grain first.
5. **Lower-grain requires allocation?** Yes, at the individual-Community-Visit/Caregiver-hour level.
6. **Current data-source support:** No (also inherits the Delivered Care Hour basis validation, §41).

### `financial.direct_contribution_per_delivered_hour` (§12)

1. **Natural source grain:** inherits from §6 and §11.
2. **Traditional Care semantics:** unchanged.
3. **Community Care semantics:** authoritative at Community/Shift-population grain; requires Allocated Direct Labor for any finer grain, same as §11.
4. **Aggregation authoritative?** Yes, at Community/Enterprise.
5. **Lower-grain requires allocation?** Yes.
6. **Current data-source support:** No.

### `financial.community_direct_service_contribution` (§16)

1. **Natural source grain:** Community, aggregating Community-attributed Revenue (Visit-grain) and Community-attributed Direct Labor (Traditional Visit or Community Shift grain, per caregiver).
2. **Traditional Care semantics:** unchanged from §16.
3. **Community Care semantics:** Community-attributed Direct Labor sums Community Shift payable amounts for caregivers whose Shifts occurred in that Community — not a sum of per-Community-Visit allocated amounts. This is actually the natural, non-allocated case for Community Care, since Community sits at or above the Shift grain.
4. **Aggregation authoritative?** Yes — one of the few metrics where Community Care's natural grain (Shift) already sits at or below the metric's own grain (Community), so no allocation is required to compute it authoritatively.
5. **Lower-grain requires allocation?** Only if drilling below Community to individual Community Visit.
6. **Current data-source support:** No, per existing §16 Source Status — unchanged; Community attribution for Shifts is an additional open item alongside the existing Community-attribution-for-Visits question (§43).

### `operations.scheduled_vs_delivered_hours` (§17)

1. **Natural source grain:** Visit (Traditional or Community) — this metric is about service delivery, not labor cost, so it is unaffected by the Work Assignment distinction. Scheduled/Delivered Care Hours are Visit-level concepts for both models.
2. **Traditional Care semantics:** unchanged.
3. **Community Care semantics:** unchanged — computed per Community Visit, exactly as for Traditional Visits. A Community Shift also has its own scheduled/actual time, a distinct concept not currently in this metric's scope; do not conflate Shift-level and Visit-level scheduled/delivered hours.
4. **Aggregation authoritative?** Yes, unchanged.
5. **Lower-grain requires allocation?** No.
6. **Current data-source support:** Unchanged from §17 (Source Validation Required); see the Visit Intelligence documents for the Visit-history persistence work already underway.

### `financial.billable_vs_paid_labor` (§18)

1. **Natural source grain:** mixed — Billable Care Hours are naturally Visit-grain (Traditional or Community); Paid Care Hours are naturally Work-Assignment-grain (Traditional Visit or Community Shift).
2. **Traditional Care semantics:** unchanged — both sides share the same Visit grain.
3. **Community Care semantics:** the two sides do not share a natural grain. Billable Care Hours aggregate from Community Visits; Paid Care Hours aggregate from Community Shifts. A Community Care Paid-to-Billable ratio is only directly meaningful at a grain where both can be validly aggregated (e.g., Caregiver-day, Community-day, or higher) — not at the individual-Community-Visit level unless Paid Care Hours are allocated down to that Visit.
4. **Aggregation authoritative?** Yes, at Caregiver/Community/Enterprise/Time Period, aggregating each side from its own natural grain.
5. **Lower-grain requires allocation?** Yes, for a per-Community-Visit ratio.
6. **Current data-source support:** No, per existing §18 Source Status — unchanged; this amendment adds a grain-alignment caution on top of the existing source gap.

---

## 51. Important Metric Caution — Labor/Contribution per Visit Under Community Care

Some metrics remain mathematically computable under Community Care but would be semantically misleading if presented as though they meant the same thing as their Traditional Care counterpart.

**Labor per Visit** (§9): for Traditional Care, this is naturally attributable — the Visit is the Work Assignment. For Community Care:

> Community Shift labor ÷ Community Visits (within that Shift)

may be a useful **aggregate efficiency measure**, but it is **not** the actual labor cost of any individual Community Visit. A caregiver is not paid per resident Visit during a Community Shift; the Visits within a Shift may vary in duration, service type, and billable rate while the caregiver's pay for that Shift does not vary by which resident Visit is being performed at a given moment.

**Contribution per Visit**, similarly, may require Allocated Direct Labor (§49) for Community Care and must be presented as an allocated/derived figure, never as Direct Service Contribution Actual, when computed below the Community-Shift grain.

Any Financial Intelligence surface presenting either metric for Community Care must distinguish:

- **authoritative metric** — computed at a grain the current data actually supports without allocation;
- **derived aggregate** — a ratio computed across a shared population without allocation (e.g., the Shift-level efficiency measure above);
- **allocated metric** — uses Allocated Direct Labor and must carry `allocated` semantics per §49;
- **not yet supportable** — the required source data does not yet exist.

---

## 52. Candidate Future Community Economics Metrics

The following are identified as candidate future metrics arising from the Community Care model. None are added to the 15-metric v0.1 Financial Spine (§19) by this amendment; each would require its own definition, source validation, and Metric Implementation Gate (§37) review before implementation.

- Community Shift Revenue
- Community Shift Direct Labor
- Community Shift Direct Service Contribution
- Revenue per paid Shift hour
- Contribution per paid Shift hour
- Delivered service minutes per paid Shift hour
- Community Shift utilization
- Visits per Shift
- Revenue per Community Visit
- Allocated labor per Community Visit

### Most likely valuable, in the registry's assessment

**Community Shift Direct Service Contribution** and **Contribution per paid Shift hour** appear most valuable first, because they are computable at Community Care's *natural* payable grain (the Shift) without requiring any allocation methodology to be decided first — matching the Natural Economic Grain Rule (§48) and avoiding the allocation-policy dependency most of the other candidates carry. **Community Shift utilization** (delivered service minutes per paid Shift hour) is a close second, since it directly answers a real operating question — how much of a paid Shift is spent in resident-facing service — without requiring Billable Activity data at all; it could plausibly be built before the revenue side of Community Care is even source-validated.

The remaining candidates (Revenue per Community Visit, Allocated labor per Community Visit, Visits per Shift) are reasonable future measures but either require an allocation methodology decision (§49) or duplicate information already available via the metrics above at a coarser, non-allocated grain.

---

## 53. Source Truth vs. Serve Economic Truth — Financial States

See Business Ontology §57 for the canonical statement of this distinction. For Financial Intelligence specifically: none of the 15 v0.1 metrics may be computed by reading a single vendor status (a CINCH or AxisCare "completed" flag, for example) as simultaneously meaning delivered, verified, billable, invoiced, payable, and paid. Each metric's Source Status and Required Validation fields (Parts II, IV, V above) should be read as implicitly requiring the specific state that metric actually needs — for example, `financial.service_revenue` needs invoiced state, not merely delivered or verified state.

## 54. Service-Day Data Maturity — Metric Implication

See Business Ontology §58 for the canonical concept and §57 for the four-state model (service completion / AxisCare appearance / AxisCare verification / financial realization) this section relies on. Implication for this registry: any metric computed for the current (`open`) or still-`settling` service day should be understood as provisional, particularly for Community Care, where CINCH activity can precede AxisCare verification within the same day. This registry does not yet define a finalization policy or delay; per §58, that should follow measurement of actual lag between the four states, not an assumed value.

**Different metrics mature at different times and must not share one finalization clock.** A narrow read-only investigation of the AxisCare Customer API (Ontology §57) confirmed that AxisCare's `verified` flag gates further edits to ADL and care-note documentation, but found no documented evidence that it gates billing-field validity, and found no evidence either way for invoice generation or payroll/payable processing (no invoice or payroll endpoint exists in this API surface at all). Concretely:

- **Service-delivery actual** (e.g., §17 Scheduled vs Delivered Care Hours) may mature earliest, since clock-in/out data does not depend on verification.
- **Invoice actual** (e.g., §4 Service Revenue) may mature later, once billability and invoicing — states this registry has no confirmed evidence are tied to verification — are actually established.
- **Payroll actual** (e.g., §5 Direct Caregiver Labor) may mature later still, following payroll processing.

A metric's `finalized` state must be justified against the specific state it actually needs (§53), not assumed equal to "AxisCare verification complete" by default.

Serve currently verifies CINCH-populated Visits in AxisCare manually; AxisCare is reportedly expected to eventually automate more of this verification, with an observed current backlog of roughly two to three days (a USER-OBSERVED OPERATIONAL FACT to measure, not a policy value). Per Business Ontology §76, automating verification would reduce settlement lag but must **not** be read as changing the underlying Community Care economic grain — Revenue remains Visit/Billable Activity grain and Direct Labor remains Community Shift/Work Assignment grain regardless of how quickly verification occurs.

To measure the actual lag and eventually support a finalization policy, future instrumentation should capture, per Community Visit, the four §57 timestamps:

- CINCH completion timestamp;
- AxisCare first-seen (appearance) timestamp;
- AxisCare verification timestamp;
- any subsequent correction timestamp.

No instrumentation is implemented by this registry. These fields are named here so a future measurement effort has an approved starting point rather than inventing its own. Separately, the outstanding verification backlog itself is identified as a candidate future operational work item (Ontology §78, "Review and resolve unverified Community Visits") — not implemented by this registry, and not itself a metric.

---

# PART XV — COMMUNITY SHIFT CAPACITY AND ECONOMICS METRICS

## 55. Purpose of This Companion Section

Business Ontology Part XIII establishes the business concepts needed to eventually evaluate and optimize Community Shift capacity. This Part promotes sixteen of those concepts into formally **designed** Metric Registry entries, using this registry's existing Metric Status Vocabulary (§3).

These metrics are kept in a dedicated companion section rather than folded into the fifteen-metric Financial Spine (§19, Part VI) because they answer a different class of business question (Community Shift capacity and optimization, not the core Revenue/Labor/Contribution spine) and because most remain source-blocked today. Designed-but-not-implemented status is expected and acceptable — see §37, Metric Implementation Gate. No metric here is authorized for implementation by virtue of appearing in this registry; each must independently satisfy §37 first, and any that would become a Signal or Recommendation must independently satisfy the Financial Intelligence Rule Gate (§38).

All money/hour/minute-based metrics below follow the Natural Economic Grain Rule (Part XIV, §48): Revenue-side inputs are Visit/Billable-Activity grain; Direct-Labor-side inputs are Community-Shift/Work-Assignment grain. Any metric that would require Direct Labor at a finer grain than the Community Shift is an **allocated** metric under §49 and is called out as such below.

---

## 56. Community Shift Revenue

**Metric ID:** `financial.community_shift_revenue`

**Business Question:** How much Service Revenue is attributable to Community Visits delivered during a given Community Shift (or Shift population)?

**Canonical Definition:** Sum of qualifying Community Visit Revenue for Visits delivered during the Shift(s) in scope.

**Primary Source:** AxisCare/CINCH Community Visit billing activity (see §4, Service Revenue — same open Revenue-basis questions apply).

**Source Status:** Future Source Required — inherits §4's blocked status; no Community-Visit-to-Shift linkage is confirmed either (Ontology §56).

**Supported Grain — Intended:** Community Shift; Caregiver; Community; Time Period.

---

## 57. Community Shift Direct Labor

**Metric ID:** `financial.community_shift_direct_labor`

**Business Question:** How much direct caregiver compensation is attributable to a given Community Shift?

**Canonical Definition:** Sum of qualifying payable amounts for the Community Shift — the natural, non-allocated Direct Labor Actual grain for Community Care (Ontology §61).

**Primary Source:** AxisCare/CINCH caregiver Shift payable activity (see §5, Direct Caregiver Labor).

**Source Status:** Future Source Required — inherits §5's blocked status.

**Supported Grain — Intended:** Community Shift; Caregiver; Community; Time Period.

---

## 58. Community Shift Direct Service Contribution

**Metric ID:** `financial.community_shift_direct_service_contribution`

**Canonical Formula:** `Community Shift Revenue (§56) − Community Shift Direct Labor (§57)`

**Business Question:** What Direct Service Contribution did a Community Shift generate?

**Primary Sources:** §56, §57.

**Source Status:** Future Source Required — dependent on both inputs.

**Supported Grain — Intended:** Community Shift; Caregiver; Community; Time Period.

**Note:** this is the natural, non-allocated grain for Community Care contribution — see Part XIV §50's treatment of `financial.community_direct_service_contribution` for the Community-level (not Shift-level) aggregate.

---

## 59. Revenue per Paid Community Shift Hour

**Metric ID:** `financial.revenue_per_paid_community_shift_hour`

**Canonical Formula:** `Community Shift Revenue (§56) ÷ Paid Community Shift Hours`

**Business Question:** How much Revenue does a paid hour of Community Shift capacity generate?

**Required Guardrail:** if Paid Community Shift Hours are zero, undefined rather than zero.

**Source Status:** Future Source Required.

**Supported Grain — Intended:** Community Shift; Caregiver; Community; Time Period.

---

## 60. Direct Service Contribution per Paid Community Shift Hour

**Metric ID:** `financial.direct_service_contribution_per_paid_community_shift_hour`

**Canonical Formula:** `Community Shift Direct Service Contribution (§58) ÷ Paid Community Shift Hours`

**Business Question:** How much Direct Service Contribution does a paid hour of Community Shift capacity generate?

**Required Guardrail:** if Paid Community Shift Hours are zero, undefined rather than zero.

**Source Status:** Future Source Required.

**Supported Grain — Intended:** Community Shift; Caregiver; Community; Time Period.

**Strategic Value:** identified in Part XIV §52 as one of the two candidate metrics most likely to be buildable first, since it uses Community Care's natural payable grain without requiring an allocation methodology.

---

## 61. Visits per Community Shift

**Metric ID:** `operations.visits_per_community_shift`

**Canonical Formula:** `Count of qualifying Community Visits ÷ Count of qualifying Community Shifts`

**Business Question:** How much Visit activity does a Community Shift carry?

**Source Status:** Partial Source Available — Community Visit and Shift existence may be partially observable via CINCH/AxisCare today; SOURCE_PROVEN Shift-to-Visit linkage (Ontology §56) is confirmed absent from AxisCare's Customer API (no shift/assignment ID field exists on the Visit object; `scheduleId` is a distinct, unrelated concept). Any near-term implementation of this metric would use at best a DETERMINISTIC_DERIVED or HEURISTIC linkage per Ontology §56's classification, not a source-proven one.

**Supported Grain — Intended:** Community Shift; Caregiver; Community; Time Period.

**Known Limitation:** volume alone does not determine capacity — see Ontology §64.

---

## 62. Client Service Minutes per Paid Community Shift Hour

**Metric ID:** `operations.client_service_minutes_per_paid_community_shift_hour`

**Canonical Formula:** `Client service minutes delivered during the Shift ÷ Paid Community Shift Hours`

**Business Question:** How many minutes of direct Client service does a paid Shift hour produce?

**Source Status:** Future Source Required — service-minute and paid-Shift-hour data are not yet confirmed available at Shift grain.

**Supported Grain — Intended:** Community Shift; Caregiver; Community; Time Period.

---

## 63. Client Service Utilization

**Metric ID:** `operations.client_service_utilization`

**Canonical Formula:** `Client service minutes delivered during a Community Shift ÷ Paid Community Shift minutes`

**Business Question:** What portion of paid Community Shift time became direct Client service time?

**Source Status:** Future Source Required.

**Supported Grain — Intended:** Community Shift; Caregiver; Community; Time Period.

**Interpretation Boundary (Ontology §65):** an observed efficiency measure, not the optimization target. 100% is not ideal — caregivers require legitimate non-client-service time.

---

## 64. Practical Capacity Utilization

**Metric ID:** `operations.practical_capacity_utilization`

**Canonical Formula:** `Planned/expected service demand ÷ Practical Capacity (Ontology §66)`

**Business Question:** How much of a Community Shift's *practical* (not raw) capacity is being used?

**Source Status:** Leadership Definition Required — Practical Capacity is a versioned, evidence-calibrated operating parameter (Ontology §66, §80), not a fixed constant; this metric cannot be computed until an initial value is established from observed operating history and recorded in a Community Capacity Policy Version.

**Supported Grain — Intended:** Community Shift; Community; Time Period.

---

## 65. Peak Demand Density

**Metric ID:** `operations.peak_demand_density`

**Canonical Definition:** A measure of Community Visit demand concentration within a rolling time window inside a Shift, distinguishing total Shift demand from simultaneous/clustered demand (Ontology §68).

**Source Status:** Leadership Definition Required — the rolling-window size (30/60/90-minute or other) is a versioned, evidence-calibrated operating parameter (Ontology §68, §80), not approved yet.

**Supported Grain — Intended:** Community Shift; Community; Time Period.

---

## 66. Capacity Headroom

**Metric ID:** `operations.capacity_headroom`

**Canonical Definition:** The additional Community Visit demand a Shift can absorb while remaining within approved Practical Capacity and service-quality constraints (Ontology §69), expressible as service minutes, expected Visits, revenue opportunity, or contribution opportunity.

**Source Status:** Future Source Required — depends on Practical Capacity Utilization (§64) and Peak Demand Density (§65), both themselves undefined pending policy/evidence.

**Supported Grain — Intended:** Community Shift; Community; Time Period.

---

## 67. Additional Shift Readiness

**Metric ID:** `intelligence.additional_shift_readiness`

**Business Question:** Is current and expected Community Visit demand sufficiently dense, time-constrained, and economically valuable to justify adding another minimum Community Shift (Ontology §63, §70)?

**Canonical Definition:** Not a single deterministic formula — an intelligence assessment combining Demand, Existing Capacity, Client Experience, Caregiver Experience, and Economics inputs, per Ontology §70.

**Source Status:** Future Source Required — depends on §61–§66, §68–§71, none of which are source-available yet.

**Supported Grain — Intended:** Community; Community Shift population.

**Important Boundary:** this is a candidate future intelligence **output**, not a metric in the usual sense — it would require its own Financial Intelligence Rule Gate (§38) review (thresholds, evidence, false-positive analysis, AI boundary) before ever producing a Recommendation. This registry entry names and scopes it; it does not approve building it.

---

## 68. Incremental Revenue of Added Shift Capacity

**Metric ID:** `financial.incremental_revenue_added_shift_capacity`

**Business Question:** How much additional Revenue would a proposed additional Community Shift plausibly enable?

**Canonical Definition:** Revenue attributable specifically to constrained/unserved demand unlocked by added capacity (Ontology §73) — must exclude existing demand merely redistributed across a new configuration.

**Source Status:** Future Source Required; also Leadership Definition Required for the forecasting/estimation approach, since this is inherently a Forecast (§34), not an Actual.

**Supported Grain — Intended:** Community; proposed Shift configuration.

---

## 69. Incremental Direct Labor of Added Shift Capacity

**Metric ID:** `financial.incremental_direct_labor_added_shift_capacity`

**Business Question:** How much additional Direct Labor cost would a proposed additional Community Shift require?

**Canonical Definition:** The Community Shift Direct Labor (§57) expected for the proposed additional minimum Shift(s) (Ontology §63).

**Source Status:** Future Source Required.

**Supported Grain — Intended:** Community; proposed Shift configuration.

---

## 70. Incremental Direct Service Contribution of Added Shift Capacity

**Metric ID:** `financial.incremental_direct_service_contribution_added_shift_capacity`

**Canonical Formula:** `Incremental Revenue of Added Shift Capacity (§68) − Incremental Direct Labor of Added Shift Capacity (§69)`

**Business Question:** Would adding a Community Shift produce positive incremental Direct Service Contribution?

**Source Status:** Future Source Required — dependent on §68, §69.

**Supported Grain — Intended:** Community; proposed Shift configuration.

**Strategic Value (Ontology §74):** expected to become one of the principal economic inputs to Additional Shift Readiness (§67).

---

## 71. Expected Utilization of Added Shift Capacity

**Metric ID:** `operations.expected_utilization_added_shift_capacity`

**Business Question:** How well-utilized would a proposed additional Community Shift plausibly be?

**Canonical Definition:** A forecast Client Service Utilization (§63) and/or Practical Capacity Utilization (§64) for the proposed Shift, given expected demand redistribution and unlocked demand (Ontology §73).

**Source Status:** Future Source Required; inherits the Leadership Definition Required status of §63/§64.

**Supported Grain — Intended:** Community; proposed Shift configuration.

---

## 72. Deferred — Not Promoted

The following remain explicitly **deferred**, not promoted to designed-metric status by this Part, because they require an approved allocation methodology (Ontology §61, §49) that does not yet exist:

- Allocated Direct Labor per Community Visit;
- allocated Direct Service Contribution per Community Visit;
- any Client-level Community labor allocation.

These must continue to be presented, if ever computed, as explicitly modeled/allocated figures — never as Direct Labor Actual or Direct Service Contribution Actual — per the labeling requirement in Ontology §61.

---

## 73. Community Capacity / Economics Metrics Summary

| # | Metric | Metric ID | Group |
|---|---|---|---|
| 1 | Community Shift Revenue | `financial.community_shift_revenue` | Economic |
| 2 | Community Shift Direct Labor | `financial.community_shift_direct_labor` | Economic |
| 3 | Community Shift Direct Service Contribution | `financial.community_shift_direct_service_contribution` | Economic |
| 4 | Revenue per Paid Community Shift Hour | `financial.revenue_per_paid_community_shift_hour` | Economic |
| 5 | Direct Service Contribution per Paid Community Shift Hour | `financial.direct_service_contribution_per_paid_community_shift_hour` | Economic |
| 6 | Visits per Community Shift | `operations.visits_per_community_shift` | Capacity |
| 7 | Client Service Minutes per Paid Community Shift Hour | `operations.client_service_minutes_per_paid_community_shift_hour` | Capacity |
| 8 | Client Service Utilization | `operations.client_service_utilization` | Capacity |
| 9 | Practical Capacity Utilization | `operations.practical_capacity_utilization` | Capacity |
| 10 | Peak Demand Density | `operations.peak_demand_density` | Capacity |
| 11 | Capacity Headroom | `operations.capacity_headroom` | Capacity |
| 12 | Additional Shift Readiness | `intelligence.additional_shift_readiness` | Decision / Intelligence Output |
| 13 | Incremental Revenue of Added Shift Capacity | `financial.incremental_revenue_added_shift_capacity` | Decision / Intelligence Output |
| 14 | Incremental Direct Labor of Added Shift Capacity | `financial.incremental_direct_labor_added_shift_capacity` | Decision / Intelligence Output |
| 15 | Incremental Direct Service Contribution of Added Shift Capacity | `financial.incremental_direct_service_contribution_added_shift_capacity` | Decision / Intelligence Output |
| 16 | Expected Utilization of Added Shift Capacity | `operations.expected_utilization_added_shift_capacity` | Decision / Intelligence Output |

None of these sixteen are part of the fifteen-metric Financial Spine (§19). All sixteen are designed, none are implementation-ready (§37) as of this amendment.

---

## Registry Statement

> **Serve's Financial Metric Registry establishes one governed language for measuring the economics of care delivery. Financial Spine v0.1 begins with the relationship between Service Revenue, Direct Caregiver Labor, and Direct Service Contribution, using the Visit as the bridge between Client economics and workforce economics. Every metric must remain deterministic, source-traceable, population-aligned, and semantically consistent across Serve Intelligence. Where the required source or business definition is unresolved, the metric remains explicitly unresolved rather than being approximated silently.**