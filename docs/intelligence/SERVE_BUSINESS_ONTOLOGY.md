# Serve Business Ontology

**Platform:** Serve OS / Serve Intelligence Platform  
**Document Type:** Canonical Business Ontology  
**Version:** 0.1  
**Status:** Foundational Design  
**Related Documents:**
- `SERVE_INTELLIGENCE_CONSTITUTION.md`
- `SERVE_INTELLIGENCE_ENGINEERING_STANDARDS.md`
- `SERVE_EXECUTIVE_INTELLIGENCE_DOMAIN_CHARTER.md`

---

## 1. Purpose

The Serve Business Ontology defines the canonical business entities, meanings, and relationships used across Serve OS and the Serve Intelligence Platform.

Its purpose is to establish one shared organizational language for understanding:

- clients;
- caregivers;
- communities;
- prospects;
- visits;
- service delivery;
- revenue;
- caregiver labor;
- financial contribution;
- workforce capacity;
- growth pipeline;
- governance;
- and executive performance.

This document defines **business meaning**.

It does not define:

- database tables;
- API payloads;
- vendor schemas;
- intelligence primitives;
- UI components;
- metric formulas;
- or implementation architecture.

Those may implement this ontology, but they should not redefine it silently.

---

## 2. Governing Principle

Serve should own the meaning of its business independently of the systems used to operate it.

AxisCare, CINCH, Viventium, accounting platforms, recruiting platforms, and future vendors may each represent clients, visits, payroll, invoices, employees, or other concepts differently.

Those vendor-specific shapes stop at the integration boundary.

Above that boundary, Serve uses canonical business concepts defined here.

The intended pattern is:

> **Vendor Record → Serve-Normalized Business Entity / Event → Intelligence**

rather than:

> **Vendor Schema → Organization-Wide Meaning**

Changing vendors should require integration work.

It should not require Serve to redefine what a Client, Visit, Revenue, Caregiver, or Community means.

---

# PART I — CORE OPERATING ENTITIES

## 3. Community

A **Community** is a defined Serve operating environment, market, senior-living community, or other organizational unit within which Serve develops relationships, serves clients, deploys caregivers, and evaluates operating performance.

A Community is more than a location.

For management and intelligence purposes, a Community is a first-class operating and economic entity.

A Community may have:

- residents;
- prospects;
- active clients;
- inactive or former clients;
- referral relationships;
- caregivers;
- caregiver capacity;
- candidates;
- visits;
- service revenue;
- direct caregiver labor;
- other attributable costs;
- incidents;
- quality activity;
- governance requirements;
- recommendations;
- actions;
- and performance metrics.

### Primary Relationships

> Community → Residents

> Community → Prospects

> Community → Clients

> Community → Visits

> Community → Caregivers

> Community → Revenue

> Community → Direct Labor

> Community → Pipeline

> Community → Governance / Quality Conditions

Community is therefore a primary aggregation dimension for Executive Intelligence.

See §50 (Area) for the related management/reporting aggregation dimension, and §51 for how economic attribution relates to Area versus Community.

---

## 4. Resident

A **Resident** is a person associated with a senior-living community or other Serve-addressable population who may or may not currently receive Serve services.

A Resident is not necessarily a Client.

Possible relationships include:

> Resident → no current Serve relationship

> Resident → Prospect

> Resident → Client

> Resident → Former Client

Where Serve operates outside a defined senior-living community, the equivalent person may exist as a Client without a Community-associated Resident record.

Resident identity and Client relationship status must remain distinct concepts.

---

## 5. Prospect

A **Prospect** is a person or household for whom a potential future Serve service relationship is being actively evaluated or pursued.

A Prospect may originate from:

- a Resident;
- a family inquiry;
- a community referral;
- a professional referral;
- marketing activity;
- an existing client relationship;
- or another approved source.

A Prospect may progress through stages such as:

> Inquiry  
> → Assessment  
> → Proposal  
> → Agreement  
> → Client Start

The exact pipeline stages are operational workflow concepts and may evolve.

The core ontology relationship is:

> **Prospect → potential future Client**

A Prospect may have:

- expected start date;
- expected service needs;
- expected visit frequency;
- expected service intensity;
- estimated revenue;
- conversion probability;
- referral source;
- assigned owner;
- and pipeline status.

Those attributes enable future growth and forecast intelligence.

---

## 6. Client

A **Client** is a person with an established Serve service relationship under the canonical Serve client-lifecycle rules.

Client status must be determined by Serve-owned lifecycle semantics rather than inferred from a vendor label alone.

A Client may have:

- a Community;
- a service agreement;
- an assessment;
- a care or service plan;
- scheduled services;
- Visits;
- billing activity;
- responsible parties;
- family contacts;
- incidents;
- governance requirements;
- and relationship history.

### Primary Relationships

> Client → Community, where applicable

> Client → Service Plan

> Client → Visits

> Client → Billable Activity

> Client → Revenue

> Client → Incidents / Quality Events

> Client → Governance Requirements

The Client is the primary economic recipient of Serve service delivery.

---

## 7. Caregiver

A **Caregiver** is a worker who delivers Serve services to Clients.

A Caregiver may have:

- employment status;
- readiness status;
- Community assignments;
- availability;
- scheduled capacity;
- actual worked time;
- Visits;
- pay rates;
- Payable Activity;
- payroll history;
- training requirements;
- credential requirements;
- quality history;
- and governance requirements.

### Primary Relationships

> Caregiver → Visits

> Caregiver → Work Assignment

> Caregiver → Payable Activity

> Caregiver → Direct Labor

> Caregiver → Community

> Caregiver → Workforce Capacity

The Caregiver is the primary labor-side economic participant in care delivery. See Part XII for how a Caregiver's Work Assignment — the canonical unit of labor responsibility — is satisfied differently under Serve's Traditional Care and Community Care models.

---

## 8. Candidate

A **Candidate** is a person being evaluated for a potential workforce relationship with Serve.

A Candidate may progress through:

> Applicant  
> → Screening  
> → Hiring Decision  
> → Onboarding  
> → Ready Caregiver

A Candidate is not yet assumed to be available caregiver capacity.

Only once required employment, onboarding, eligibility, and readiness conditions are satisfied does the individual become part of usable workforce capacity.

The Candidate pipeline is therefore the primary bridge between:

> **Recruiting activity → Future Caregiver Capacity**

---

# PART II — CARE DELIVERY

## 9. Service Plan

A **Service Plan** defines the intended services Serve has agreed or planned to provide to a Client.

It may describe:

- service type;
- tasks;
- frequency;
- duration;
- schedule windows;
- safety considerations;
- caregiver requirements;
- and other care-delivery instructions.

A Service Plan describes intended care.

It is not evidence that care was actually delivered.

### Relationship

> Client → Service Plan → Scheduled Visits

---

## 10. Visit

A **Visit** is the canonical bridge between operations and economics.

A Visit represents a defined instance of Serve service associated with a Client and, when assigned or completed, one or more Caregivers.

A Visit may have several operational states, including:

- planned;
- scheduled;
- assigned;
- started;
- completed;
- cancelled;
- missed;
- adjusted;
- or otherwise resolved under applicable operating rules.

The exact workflow state vocabulary belongs to the relevant operational domain.

The ontology-level importance of the Visit is that it connects:

### Client-side economics

> **Client → Visit → Billable Activity → Revenue**

and simultaneously:

### Workforce-side economics

> **Caregiver → Visit → Payable Activity → Direct Labor**

This workforce-side linkage holds directly for a **Traditional Visit** (§53), where the Visit is simultaneously the service event and the caregiver's Work Assignment (§52). It does not hold universally: in Serve's Community Care model, a caregiver's payable time is anchored to a **Community Shift** (§54), not to any single **Community Visit** (§55) delivered during that Shift, even though the Community Visit remains a Visit for service-delivery and revenue purposes. See Part XII for the full Work Assignment model. Visit itself is not redefined by this distinction — it remains the canonical unit of client service delivery described below, for both Traditional and Community Care.

This relationship makes the Visit the primary unit through which Serve can eventually explain:

- what service was delivered;
- to whom;
- by whom;
- for how long;
- what Serve could bill;
- what Serve owed the caregiver;
- and what direct economic contribution resulted.

---

## 11. Scheduled Service

**Scheduled Service** represents what Serve intended to deliver.

It may include:

- scheduled Visit;
- planned duration;
- assigned Caregiver;
- planned tasks;
- planned start/end;
- and associated service type.

Scheduled Service is distinct from Delivered Service.

This distinction supports analysis of:

> planned vs delivered

> scheduled vs completed

> expected labor vs actual labor

> expected revenue vs realized billable activity

---

## 12. Delivered Service

**Delivered Service** is the service that actually occurred.

Delivered Service may be supported by:

- Visit completion;
- actual start/end times;
- documented tasks;
- EVV records;
- caregiver documentation;
- or other authoritative operational evidence.

Delivered Service is the operating basis from which Billable Activity and Payable Activity may be derived, subject to applicable rules.

A scheduled Visit that did not occur is not Delivered Service.

---

# PART III — FINANCIAL BACKBONE

## 13. Billable Activity

**Billable Activity** is service activity that satisfies Serve's rules for charging a Client or payer.

Billable Activity may derive from a Visit but is not identical to the Visit itself.

A Visit may:

- produce one billable item;
- produce multiple billable components;
- produce an adjusted billable amount;
- or produce no billable activity.

Billable Activity may contain or reference:

- Client;
- Visit;
- service date;
- service type;
- billable duration;
- billable units;
- rate;
- surcharge;
- adjustment;
- payer;
- and calculated amount.

### Relationship

> **Delivered Service → Billable Activity → Invoice → Revenue**

The exact conditions under which Delivered Service becomes Billable Activity belong in governed operational and financial rules.

---

## 14. Invoice

An **Invoice** is a formal client or payer billing record representing one or more Billable Activities.

An Invoice may contain:

- one or more Clients;
- one or more Visits;
- one or more Billable Activities;
- billing period;
- invoice date;
- total amount;
- adjustments;
- payer;
- status;
- and downstream accounting references.

An Invoice represents billed economic activity.

It does not necessarily represent collected cash.

---

## 15. Service Revenue

**Service Revenue** is the economic value Serve recognizes from providing services.

The exact accounting definition of Revenue is not established by this ontology and must be defined in the Metric Registry.

Potential financial views may include:

- Delivered Revenue;
- Billable Revenue;
- Invoiced Revenue;
- Recognized Revenue;
- Collected Revenue.

These terms must not be used interchangeably unless their definitions are formally established as equivalent.

For Executive Intelligence v0.1, AxisCare invoicing is expected to be a primary source for care-related revenue analysis, subject to API and accounting validation.

---

## 16. Payable Activity

**Payable Activity** is work activity that satisfies Serve's rules for compensating a Caregiver.

Payable Activity may derive from a Visit but is not identical to the Visit itself.

A Visit may produce:

- regular payable time;
- overtime-related payable time;
- visit-based compensation;
- mileage or reimbursement;
- adjustments;
- or other payable components.

Payable Activity may contain or reference:

- Caregiver;
- Visit;
- work date;
- payable duration;
- pay rate;
- pay classification;
- adjustment;
- reimbursement;
- and calculated amount.

### Relationship

> **Delivered Service → Payable Activity → Payroll / Direct Labor**

For a Traditional Visit, Payable Activity may derive directly from the Visit, per the general relationship above. For Community Care, Payable Activity derives from the caregiver's Community Shift — the governing Work Assignment (§52) — rather than from any individual Community Visit occurring during that Shift. See Part XII, §52–§56.

---

## 17. Caregiver Payroll

**Caregiver Payroll** represents calculated or executed compensation owed or paid to Caregivers.

Caregiver Payroll must eventually distinguish between:

### Operationally Calculated Payroll

What the care-delivery system determines should be payable based upon service activity.

AxisCare may be an authoritative source for this layer.

### Executed Payroll

What was actually processed and paid through the payroll system.

Viventium is expected to become an authoritative source for this layer.

These may differ.

That difference is itself a potentially valuable source of financial intelligence.

---

## 18. Direct Caregiver Labor

**Direct Caregiver Labor** is the labor cost directly attributable to delivering Client services.

For v0.1, this primarily includes caregiver compensation associated with service delivery.

As financial maturity increases, Direct Caregiver Labor may need to distinguish:

- regular compensation;
- overtime;
- visit-based compensation;
- differentials;
- direct reimbursements;
- and other directly attributable caregiver compensation.

Exact definitions belong in the Metric Registry.

---

## 19. Payroll Burden

**Payroll Burden** represents employer costs associated with labor beyond direct employee compensation.

Potential components may include:

- employer payroll taxes;
- workers' compensation;
- unemployment taxes;
- employee benefits;
- payroll fees;
- and other employer-side labor costs.

Payroll Burden is distinct from Direct Caregiver Labor.

It is expected to require Viventium, accounting data, or another authoritative financial source.

---

## 20. Community-Direct Operating Cost

A **Community-Direct Operating Cost** is an operating cost attributable primarily or exclusively to a specific Community but not already classified as Direct Caregiver Labor.

Examples may include:

- dedicated community staff;
- community-specific marketing;
- local events;
- supplies;
- travel;
- local administrative support;
- or other attributable operating expense.

The exact cost-allocation rules are not defined by this ontology.

---

## 21. Shared Operating Cost

A **Shared Operating Cost** is an organizational expense supporting Serve broadly rather than one specific Client, Visit, Caregiver, or Community.

Examples may include:

- executive leadership;
- software;
- legal;
- accounting;
- insurance;
- corporate marketing;
- office expenses;
- licenses;
- and shared administrative labor.

Allocation of Shared Operating Cost is a financial-policy question and must not be invented by an intelligence implementation.

---

# PART IV — ECONOMIC RELATIONSHIPS

## 22. Direct Service Contribution

**Direct Service Contribution** is the initial unit-economic relationship between care revenue and direct caregiver labor.

Canonical relationship:

> **Service Revenue − Direct Caregiver Labor = Direct Service Contribution**

This is not equivalent to net income or overall profitability.

It represents the economic contribution of service delivery before broader labor burden, community-direct cost, and shared operating cost.

Direct Service Contribution should eventually be analyzable by:

- Visit;
- Client;
- Community;
- service type;
- time period;
- and other valid operating dimensions.

---

## 23. Fully Loaded Care Contribution

Where the required cost data exists:

> **Direct Service Contribution**
>
> minus
>
> **Payroll Burden and Other Direct Workforce Cost**
>
> =
>
> **Fully Loaded Care Contribution**

This represents care-delivery economics after more complete direct workforce cost.

---

## 24. Community Contribution

Where the required cost data exists:

> **Fully Loaded Care Contribution**
>
> minus
>
> **Community-Direct Operating Cost**
>
> =
>
> **Community Contribution**

Community Contribution provides a clearer view of the economic performance of a Community before shared organizational overhead.

---

## 25. Enterprise Operating Performance

Enterprise-level operating profitability requires:

> Community and other operating contribution
>
> minus
>
> Shared Operating Cost

The exact measure — operating income, contribution after overhead, EBITDA-related measure, or another leadership-approved concept — is intentionally not defined here.

That definition belongs in financial policy and the Metric Registry.

---

# PART V — GROWTH AND CAPACITY

## 26. Pipeline

**Pipeline** represents potential future Client relationships and associated expected service demand.

Pipeline may include:

- Prospects;
- expected start dates;
- probability of conversion;
- proposed service plans;
- expected Visit volume;
- expected care hours;
- and expected revenue.

Pipeline connects:

> **Growth → Future Service Demand**

---

## 27. Workforce Capacity

**Workforce Capacity** represents Serve's practical ability to deliver care using available, ready, appropriately qualified Caregivers.

Capacity may be influenced by:

- number of ready Caregivers;
- availability;
- qualifications;
- Community assignment;
- schedule fit;
- existing workload;
- overtime constraints;
- travel requirements;
- client-specific requirements;
- and other governed operating limitations.

Caregiver headcount alone is not workforce capacity.

### Relationship

> **Current Service Demand + Expected Pipeline Demand**
>
> compared with
>
> **Available Workforce Capacity**

This relationship supports future capacity-risk and revenue-exposure intelligence.

---

## 28. Recruiting Pipeline

The **Recruiting Pipeline** represents potential future workforce capacity.

Canonical relationship:

> Candidate Pipeline
>
> → Hiring
>
> → Onboarding
>
> → Ready Caregiver
>
> → Available Capacity

Recruiting activity is therefore economically connected to future growth when caregiver capacity is a constraint.

---

# PART VI — GOVERNANCE, QUALITY, AND MANAGEMENT

## 29. Governance Requirement

A **Governance Requirement** defines something Serve is required or has chosen to do under its policies, procedures, regulatory obligations, or governance framework.

A Governance Requirement may relate to:

- Client;
- Caregiver;
- Community;
- workforce;
- emergency preparedness;
- quality;
- financial management;
- leadership review;
- or another governed subject.

Governance Requirements may produce:

- Evidence;
- Findings;
- Corrective Actions;
- and readiness conditions.

Executive Intelligence may consume governance Signals.

It should not independently recreate governance determinations already owned by Governance.

---

## 30. Quality Event

A **Quality Event** is a material care or operational occurrence relevant to service quality or organizational learning.

Examples may include:

- incident;
- infection;
- complaint;
- significant service exception;
- or other governed quality event.

Quality Events may produce:

> Review  
> → Finding  
> → Corrective Action  
> → Outcome

Executive Intelligence may consume aggregated quality intelligence where material to leadership.

---

## 31. Management Action

A **Management Action** is owned work undertaken in response to a known operational need, human judgment, or intelligence Recommendation.

Management Action is implemented through the Serve Intelligence Platform's shared Action primitive.

It is included in this ontology only to establish the business relationship:

> **Condition → Leadership Attention → Action → Outcome**

The Action primitive itself is governed by the Intelligence Engineering Standards.

---

# PART VII — PLANNING CONCEPTS

## 32. Actual

**Actual** represents what has occurred or has been authoritatively recorded.

Actual values should derive from known or calculated business facts.

---

## 33. Plan

**Plan** represents what Serve leadership expected, budgeted, or formally planned to occur over a defined period.

A Plan is not the same as a Forecast.

---

## 34. Forecast

A **Forecast** represents the best current projection of what is likely to occur based upon available evidence and explicit assumptions.

Forecasts should retain:

- the value projected;
- applicable period;
- assumptions;
- methodology or model version;
- creation date;
- and, where practical, prior versions.

Forecast history should not be silently overwritten.

---

## 35. Target

A **Target** represents a desired outcome or performance level.

A Target may intentionally differ from both Plan and Forecast.

---

# PART VIII — CANONICAL RELATIONSHIP MAP

## 36. Care Delivery and Revenue

```text
Client
  ↓
Service Plan
  ↓
Scheduled Visit
  ↓
Visit
  ↓
Delivered Service
  ↓
Billable Activity
  ↓
Invoice
  ↓
Service Revenue

## 37. Care Delivery and Labor

```text
Caregiver
  ↓
Assignment / Schedule
  ↓
Visit
  ↓
Delivered Service
  ↓
Payable Activity
  ↓
Caregiver Payroll
  ↓
Direct Caregiver Labor
```

This diagram represents the Traditional Care labor path, where the Work Assignment (Part XII, §52) is satisfied by the Visit itself. For Community Care, the equivalent path replaces "Visit" with **Community Shift** as the Work Assignment — see §56.

---

## 38. Visit as the Economic Bridge

```text
                 Client
                   ↓
             Billable Activity
                   ↓
                Revenue
                   ↑
                 Visit
                   ↓
             Payable Activity
                   ↓
             Direct Labor
                   ↑
               Caregiver
```

The Visit is the shared operating object that allows Serve to connect service delivery to both revenue and direct workforce cost.

This diagram depicts the Traditional Care case, where one Visit is both the Billable-Activity-producing service event and the Payable-Activity-producing Work Assignment. For Community Care, the labor-side arrow instead runs from the caregiver's Community Shift; the Community Visit continues to drive Billable Activity independently. See Part XII.

---

## 39. Direct Service Economics

```text
Service Revenue
      −
Direct Caregiver Labor
      =
Direct Service Contribution
```

---

## 40. Community Economics

```text
Community
   ├── Residents
   ├── Prospects / Pipeline
   ├── Clients
   ├── Caregivers
   ├── Visits
   ├── Service Revenue
   ├── Direct Caregiver Labor
   ├── Direct Service Contribution
   ├── Payroll Burden
   ├── Community-Direct Costs
   ├── Workforce Capacity
   ├── Recruiting Pipeline
   ├── Quality Conditions
   └── Governance Conditions
```

---

## 41. Growth and Capacity

```text
Prospects
   ↓
Expected Client Starts
   ↓
Expected Service Demand
   ↓
Required Caregiver Capacity

Candidate Pipeline
   ↓
Hiring
   ↓
Onboarding
   ↓
Ready Caregivers
   ↓
Available Caregiver Capacity
```

The relationship between expected service demand and available caregiver capacity is a core cross-domain executive concern.

---

## 42. Organizational Performance

At the highest level:

```text
Growth
  ↓
Clients
  ↓
Service Demand
  ↓
Visits
  ↙       ↘
Revenue   Labor
  ↘       ↙
Contribution
     ↓
Community Economics
     ↓
Enterprise Performance
```

This operating-economic chain exists alongside:

```text
Governance
Quality
Recruiting
Workforce Capacity
Client Experience
Relationship Intelligence
```

Executive Intelligence aggregates governed intelligence from these domains rather than independently recreating their reasoning.

---

# PART IX — SOURCE AUTHORITY

## 43. Source-System Principle

A business concept may have multiple source systems, but each source should have a clearly defined authority for the specific fact it provides.

Initial expected source relationships include:

### AxisCare

Potential authority for:

- scheduling;
- Visits;
- delivered care activity;
- billable activity;
- invoices;
- operational caregiver payroll calculations;
- and related care-delivery economics.

Exact API capabilities must be validated.

### CINCH

Authority for the community-care operational functions Serve uses within CINCH, including Visit Plan and task-level community-care workflows where applicable.

CINCH may reflect that a Community Visit is scheduled, in progress, or completed before AxisCare reflects the same operational reality, because a Serve user has not yet verified or reconciled the Visit in AxisCare. This is an expected, transient integration state, not a data error. See Part XII, §57 for how Serve distinguishes source-evidence timing from canonical economic state.

### Viventium

Expected authority for:

- executed payroll;
- employee payroll records;
- payroll taxes;
- employer burden;
- and other workforce-payroll data available through its API.

Exact capabilities remain to be validated.

### Accounting / General Ledger

Expected authority for:

- non-care payroll expense where applicable;
- operating expenses;
- community-direct costs;
- shared costs;
- cash activity;
- accounting-period financial statements;
- and other general-ledger truth.

Source-system authority should be formalized in the Metric Registry and integration specifications.

---

# PART X — ONTOLOGY RULES

## 44. Canonical Meaning Before Implementation

Before a new metric, Rule, financial calculation, or executive intelligence feature is implemented, its underlying business concepts must map cleanly to this ontology or deliberately extend it.

Implementation convenience must not redefine business meaning.

---

## 45. Distinguish Entity, Event, and Intelligence Primitive

This ontology defines **business concepts**.

It should not be confused with the Intelligence Platform's shared primitives.

For example:

- Client = business entity
- Visit = business entity / operational occurrence
- Invoice = business financial record
- `financial.invoice_generated` = Historical Fact
- `financial.revenue_below_plan` = Signal
- `financial.review_revenue_variance` = Recommendation

The business ontology defines what the underlying thing means.

The Intelligence Engineering Standards define how intelligence about that thing is represented.

---

## 46. No Silent Semantic Duplication

Different domains should not create competing definitions of the same concept.

There should not be:

- one definition of Revenue for Executive Intelligence;
- another for Community Intelligence;
- another for Finance;
- another inside a dashboard component.

The canonical business concept is defined once.

Metrics may represent different legitimate views of that concept, but those differences must be explicit.

---

## 47. Unknown Is Preferable to Invented

Where Serve has not yet determined:

- an authoritative source;
- accounting treatment;
- cost-allocation rule;
- metric formula;
- forecasting methodology;
- or lifecycle definition;

the ontology should state that the item is unresolved.

A missing definition is a design task.

It is not permission for an engineer or AI system to invent one.

---

# PART XI — V0.1 BOUNDARY

## 48. Explicit Non-Goals

Version 0.1 does not yet define:

- complete financial accounting policy;
- GAAP treatment;
- cash versus accrual reporting rules;
- final revenue recognition methodology;
- overhead-allocation policy;
- all possible Serve entities;
- final Forecast methodology;
- final workforce-capacity formula;
- database schema;
- API contracts;
- final Metric Registry;
- final executive KPI set.

Those will be addressed through subsequent governed artifacts.

---

## 49. V0.1 Core Ontology

The concepts considered foundational for the next stage of Executive and Financial Intelligence are:

1. Community
2. Resident
3. Prospect
4. Client
5. Caregiver
6. Candidate
7. Service Plan
8. Visit
9. Scheduled Service
10. Delivered Service
11. Billable Activity
12. Invoice
13. Service Revenue
14. Payable Activity
15. Caregiver Payroll
16. Direct Caregiver Labor
17. Payroll Burden
18. Community-Direct Operating Cost
19. Shared Operating Cost
20. Direct Service Contribution
21. Fully Loaded Care Contribution
22. Community Contribution
23. Pipeline
24. Workforce Capacity
25. Recruiting Pipeline
26. Governance Requirement
27. Quality Event
28. Actual
29. Plan
30. Forecast
31. Target
32. Area
33. Work Assignment
34. Traditional Visit
35. Community Shift
36. Community Visit
37. Direct Labor Actual / Allocated Direct Labor
38. Community Capacity Intelligence
39. Minimum Community Shift Length
40. Client Service Utilization
41. Practical Capacity
42. Peak Demand Density
43. Capacity Headroom
44. Additional Shift Readiness
45. Economic Density
46. Community Shift Optimization Objective
47. Community Capacity Policy Version
48. Community Capacity Review

Additional concepts should be added only when a real business or intelligence requirement requires them.

Items 33–37 were added by the Work Assignment / Community Care labor amendment (Part XII) to correct an incomplete labor-side assumption in the original v0.1 list — see §52–§61. Items 38–48 were added by the Community Shift capacity and optimization amendment (Part XIII) — see §62–§80.

---

## 50. Area

An **Area** is a Serve-defined management and reporting grouping that may contain one or more Communities and, where appropriate, other operating populations.

Area is:

- an aggregation dimension;
- a management structure;
- mutable over time;
- separate from underlying service attribution.

Area membership and responsible management may change over time without altering how already-recorded service activity, Visits, Revenue, Direct Labor, or other economic facts are attributed.

Area may support future questions such as:

- How is this manager's Area performing?
- What Revenue / contribution / capacity / pipeline belongs to this Area?
- Which Area is furthest from Plan?

### Relationship to Community

> Area → contains → one or more Communities (and, where applicable, other operating populations)

A future implementation should be able to support effective-dated Area membership — for example, an Area's Community membership changing from one period to the next — without requiring this ontology, or any historical Community, Visit, Revenue, or Labor attribution, to be rewritten. This ontology does not require effective-dated Area membership to be implemented in v0.1. It requires only that no v0.1 design choice foreclose it later.

---

## 51. Economic Attribution Follows Service Context, Not Management Structure

Operating and economic activity — Visits, Billable Activity, Revenue, Payable Activity, and Direct Caregiver Labor — is attributed first to the Community or other service context in which the underlying service actually occurred.

Management responsibility (§50, Area) is a separate, mutable organizational dimension. It must never determine or silently rewrite the underlying economic attribution of already-recorded activity.

For example: if a Caregiver provides three Visits at one Community and two Visits at another, the associated Visit activity — and any Revenue or Direct Labor later attributed to it — follows those two Communities in that proportion, regardless of the Caregiver's home Community, default assignment, supervisor, or manager.

Activity that legitimately occurs outside a defined Community must remain explicitly attributed to its actual service context rather than being forced into an unrelated Community for administrative convenience.

Area-level rollups (e.g., "this manager's Area") are computed by aggregating Community-attributed (or otherwise service-context-attributed) activity upward through current Area membership. They are a view over the underlying attribution, not a second, competing attribution.

---

# PART XII — WORK ASSIGNMENT AND COMMUNITY CARE LABOR MODEL

This Part amends the ontology to reflect that Serve operates at least two materially different care-delivery/economic models — **Traditional Care** and **Community Care** — and that the original Visit-only labor assumption (§10, §16, §37, §38) is directionally correct for Traditional Care but incomplete for Community Care. It is additive: nothing in Parts I–XI is superseded, and Visit remains the canonical unit of client service delivery for both models.

## 52. Work Assignment

**Work Assignment** is the canonical unit of caregiver labor responsibility for which Serve incurs or expects to incur direct caregiver labor.

Work Assignment is a Serve-owned business concept. It is not defined by, or dependent on, any AxisCare or CINCH object name.

A Work Assignment may currently be satisfied by either:

1. a **Traditional Visit** (§53), or
2. a **Community Shift** (§54).

### Relationship

> **Caregiver → Work Assignment → Payable Activity → Payroll / Direct Labor**

Work Assignment is the general form of the labor-side relationship already described for Visit in §10. Visit remains the general form of the client-side, service-delivery/revenue relationship; it is not redefined as a labor object.

---

## 53. Traditional Visit

A **Traditional Visit** is a Visit (§10) delivered under Serve's Traditional Care model, in which a caregiver is assigned to a Client-specific Visit or time block.

A Traditional Visit may simultaneously be:

- a Visit / service event, satisfying the Client-side relationship in §10; and
- a Work Assignment (§52), satisfying the workforce-side relationship.

Therefore both of the following may be valid, and this is intentional rather than duplicative:

> **Traditional Visit → Billable Activity**

> **Traditional Visit → Payable Activity**

This dual role is the Traditional Care case already described generally in §10 and in the Part VIII diagrams (§37, §38).

---

## 54. Community Shift

A **Community Shift** is a caregiver Work Assignment (§52) representing a bounded period during which the caregiver provides Community Care capacity within a specific Community.

A Community Shift:

- belongs to a Caregiver;
- belongs to the service Community;
- has scheduled time;
- may later have actual/payable time;
- has a minimum practical length (§63);
- may support zero, one, or many Community Visits (§55);
- is the natural labor grain for Community Care unless authoritative evidence establishes otherwise.

For future Community capacity intelligence (Part XIII), a Community Shift should eventually be understood in terms of: the Visits associated with it; service minutes delivered during it; operational/non-client-service time within it; its practical reserve capacity; its Direct Labor; the Visit Revenue attributable to service delivered during it; and its resulting Direct Service Contribution. This ontology does not assert that all of these are currently available from any source system — see Metric Registry Part XV for source status per metric.

A Community Shift is not itself automatically a billable Client Visit, and does not by itself generate Billable Activity.

Illustrative example, not a data model: a caregiver's AM Community Shift (approximately four hours) and PM Community Shift (approximately four hours) at a Community.

---

## 55. Community Visit

A **Community Visit** is a resident/Client-level service event delivered during Community Care operations.

A Community Visit is a Visit (§10) — it does not replace or compete with the general Visit concept; it specializes it for the Community Care model, exactly as Traditional Visit (§53) specializes it for Traditional Care.

A Community Visit:

- belongs to a Client;
- belongs to a Community;
- may be associated with a Community Shift (§56);
- may have its own service duration, distinct from the enclosing Shift's duration;
- may have its own billing/rate semantics;
- may generate Billable Activity;
- does not automatically determine caregiver paid time.

Serve must not model Community Care direct labor as though each Community Visit independently generates the caregiver's payable time, unless an authoritative source explicitly establishes that relationship for a specific case.

---

## 56. Shift ↔ Visit Relationship

The conceptual relationship between Community Shift and Community Visit remains:

> **Community Shift → 0..many Community Visits**

> **Community Visit → 0..1 identified Community Shift**

This section separates two distinct questions that earlier drafts conflated: whether this relationship exists in business reality, and whether it exists as an explicit, source-proven technical linkage. These are answered differently.

### A. Business relationship — established

**USER-OBSERVED OPERATIONAL FACT:** Community resident Visits arise from Community-care activity performed within a Community caregiver Shift. Serve schedules caregivers into Community Shifts (for example, an AM and a PM Community Shift at a Community); the individual resident Visits performed during a Shift are part of that caregiver's work during that Shift. This business relationship is treated as established and is no longer conceptually uncertain.

### B. Technical linkage mechanism — confirmed absent from the AxisCare Customer API surface; unknown for CINCH

**REPO-CONFIRMED / SOURCE-DOCUMENTED FACT:** No explicit shift ID, assignment ID, caregiver-assignment ID, batch ID, or session ID field exists anywhere in AxisCare's Customer API — neither in this repository's typed `AxisCareRawVisit`/`AxisCareRawSchedule` models (`lib/integrations/axiscare/types.ts`) nor in the OpenAPI specification's documented Visit or Schedule schemas (`docs/integrations/axiscare/AxisCare-Customer-API-OpenAPI.yaml`). The word "shift" does not appear anywhere in that specification as a modeled object.

The one parent-style identifier that does exist is `scheduleId` (embedded directly in a Visit's own composite id, e.g. `v={visitId}:s={scheduleId}:d={date}`). **This must not be confused with a Shift ID.** `scheduleId` links a Visit to its AxisCare "schedule" entry — the client's own recurring appointment/service-plan template (Ontology §11, Scheduled Service) — not to a caregiver's Community Shift / Work Assignment. Treating `scheduleId` as Shift evidence would be a real modeling error, not a shortcut.

**OPEN QUESTION:** CINCH's own API was not investigated — no CINCH API documentation exists anywhere in this repository (only a one-way, human-approved care-plan *content* projection at `lib/assessmentIntelligence/cinchProjection.ts`, which is unrelated to visit/shift scheduling and confirms there is no CINCH read or write integration in this codebase at all). Whether CINCH itself exposes a Shift/assignment identifier that AxisCare does not is genuinely unknown from this repository and would require direct CINCH API access to determine.

**Conclusion:** SOURCE_PROVEN Shift-to-Visit linkage is confirmed absent from the currently available AxisCare Customer API surface. CINCH technical linkage remains unknown, because no CINCH API documentation or source was available for this investigation — it is an open question, not a second confirmed absence. A future implementation would need a Serve-derived relationship (§B below) unless CINCH access later proves otherwise.

### Candidate-relationship classification

Any candidate Shift-to-Visit relationship Serve derives must be classified as exactly one of:

- **SOURCE_PROVEN** — a specific vendor record explicitly links a Community Visit to a Community Shift or caregiver assignment. Not currently true for AxisCare (§B above); unknown for CINCH.
- **DETERMINISTIC_DERIVED** — Serve computes the linkage from a fixed, unambiguous rule over source data (for example, exactly one active Shift exists for that caregiver/Community/date covering the Visit's time window) such that the result is reproducible and has no plausible alternative match.
- **HEURISTIC** — Serve derives a probable linkage using matching dimensions such as Community, caregiver, business date, Visit timestamp, Shift start/end, service type, or Client, but more than one Shift or caregiver could plausibly match, or the rule is not guaranteed correct in every case.
- **AMBIGUOUS** — more than one equally plausible Shift/caregiver candidate exists for a given Visit and Serve cannot resolve it without human review.
- **UNRESOLVED** — no linkage is currently available or derivable at all.

Serve must not treat a HEURISTIC or DETERMINISTIC_DERIVED linkage as SOURCE_PROVEN, and must not infer a Visit belongs to a Shift merely because timestamps overlap, if multiple Shifts or caregivers could plausibly match — that case is AMBIGUOUS, not DETERMINISTIC_DERIVED. No specific derivation algorithm is approved by this ontology; §B above establishes that one will be needed, not what it should be.

### Community Care labor path

> **Caregiver → Community Shift → Payable Activity → Payroll / Direct Labor**

### Community Care revenue path

> **Client → Community Visit → Billable Activity → Invoice / Revenue**

These two paths share a Community and, typically, a caregiver and a time window — but they are not the same economic object. Revenue attributable to a Community Visit must not be assumed to determine the labor cost of the enclosing Community Shift, or vice versa.

---

## 57. Source Truth vs. Serve Economic Truth

Vendor systems supply source *evidence*. Serve owns the interpretation of that evidence into canonical economic state — the same principle already established for Active Client status (Metric Registry §13) applies generally to service, billing, and payroll state.

Community Care currently spans CINCH and AxisCare. CINCH may reflect that a Community Visit is scheduled, in progress, or completed before AxisCare reflects the same operational reality, because a Serve user has not yet verified or reconciled the Visit in AxisCare. A condition such as:

> CINCH = completed, AxisCare = missed / not yet verified

is an expected, transient state of the integration, not a data error and not evidence that the Visit did not occur.

Serve's canonical interpretation must be able to express, independently:

- service scheduled;
- service delivered;
- service verified;
- billability established;
- invoiced;
- payable;
- paid.

A single vendor status (for example, a raw CINCH or AxisCare "completed" flag) must not be allowed to silently establish all of these downstream economic states at once. Collapsing them into one generic `completed` status is exactly the kind of vendor-label passthrough the Governing Principle in §2 already prohibits.

Representative source evidence, illustrative rather than exhaustive:

- **CINCH:** scheduled, in progress, completed.
- **AxisCare:** scheduled, missed, completed, verified, billable, payable, charge rate.
- **Viventium:** expected future authoritative payroll/executed-labor evidence (§17).
- **Accounting:** expected future authoritative financial/ledger evidence.

### Observed CINCH → AxisCare workflow

**USER-OBSERVED OPERATIONAL FACT:** a Community Visit currently flows: (1) the caregiver performs the Visit within a CINCH Community Shift; (2) CINCH marks the Visit completed; (3) the completed Visit populates AxisCare as a client-level Visit record, initially appearing unverified (observed as "orange"/missed-looking in the AxisCare UI even though the service actually occurred); (4) a Community Care Coordinator (CCC) performs a human verification step in AxisCare; (5) once verified, the Visit appears as verified/delivered care. Observed backlog before verification currently appears capable of reaching approximately two to three days. AxisCare/CINCH are reportedly expected to eventually automate more of this verification step — this is a reported future capability, not an implemented fact, and must not be treated as already in effect.

### What AxisCare verification is confirmed to control

A narrow, read-only investigation of this repository's AxisCare integration (`lib/integrations/axiscare/types.ts`) and the AxisCare Customer API OpenAPI specification (`docs/integrations/axiscare/AxisCare-Customer-API-OpenAPI.yaml`) found:

- **CONFIRMED (source-documented):** `verified` is a distinct boolean field on the Visit, independent of `clockIn`/`clockOut`/`removed` — a Visit can be clocked in and out (service delivered) while still unverified. The specification's own PATCH-visit error taxonomy separately documents: *"ADLs cannot be modified on a verified visit"* and *"Care note text cannot be modified on a verified visit"* — verification locks further edits to Activities of Daily Living and care-note documentation.
- **NOT SUPPORTED (source-documented, by absence):** the same specification documents `billableRateMode`/`chargeRate` validation ("Billing errors") as a category entirely separate from the verified-visit lock errors (ADL/care-note). No documented rule ties billing-field validity to verification status.
- **UNKNOWN:** whether verification gates invoice generation or payroll/payable processing internally within AxisCare. This API surface has no `/invoices` or `/payroll` endpoint at all (consistent with the prior Investigation Report's finding), so neither this repository nor this specification can confirm or deny a relationship for those workflows. Separately, webhook events `scheduling.visit.payable` and `scheduling.visit.payRate` exist in the specification's event catalog as changes distinct from `scheduling.visit.verify`, which is suggestive that payability and pay rate are independently mutable from verification status — but their actual field shapes are not exposed anywhere in this API's documented request/response schemas, so this remains SUGGESTIVE, not CONFIRMED.
- **UNKNOWN:** CINCH's own verification/completion semantics — no CINCH API documentation exists in this repository (§56.B).

**Conclusion:** verification is confirmed to be a documentation-completion/compliance-style lock, not confirmed to be a billing or payroll gate, and not proven or disproven with respect to invoicing — those remain open questions pending direct AxisCare/CINCH API access beyond what this repository can observe. Serve's four-state model below (service completion / AxisCare appearance / AxisCare verification / financial realization) exists precisely because these must not be assumed to be the same event.

### Four distinct timestamps/states

Where source support eventually exists, Serve should be able to distinguish, for a given Community Visit:

1. **Service completion** — when CINCH says the resident Visit was completed.
2. **AxisCare appearance** — when that Visit first becomes visible in AxisCare.
3. **AxisCare verification** — when the CCC verifies/finalizes the Visit in AxisCare.
4. **Financial realization** — when the service becomes billable, invoiced, payable, or paid (itself potentially several distinct sub-states, per the list above).

These four must not be assumed to be the same event, and must not be assumed to occur in lockstep. This distinction feeds Service-Day Data Maturity (§58).

---

## 58. Service-Day Data Maturity

Community Visits can appear or change during a service day as CINCH activity occurs and AxisCare verification/synchronization catches up. Current-day service and economic figures should therefore be understood as provisional until the day matures.

Serve should be able to express a service day's data-maturity state as one of:

- **open** — the current service day; incomplete Visit activity is expected and normal.
- **settling** — the service day has ended, but some combination of CINCH completion, AxisCare appearance, human verification, and source corrections (§57's four states) may still be outstanding.
- **finalized** — the service day is sufficiently mature for official management reporting, under an approved, evidence-based finalization policy.
- **corrected** — authoritative source evidence changed after finalization.

**Finalized must not be defined merely as "all AxisCare Visits verified" unless investigation establishes that verification is actually required for the specific metric in question.** §57 already found verification confirmed to gate documentation completion but not confirmed (and not disproven) to gate billing, invoicing, or payroll. Different metrics may reach maturity at different times using different underlying states:

- **service-delivery actual** (what occurred) may mature earliest — plausibly at or shortly after AxisCare appearance, since clock-in/out data does not depend on verification;
- **invoice actual** may mature later, once billability and invoicing are confirmed;
- **payroll actual** may mature later still, following payroll processing.

A single, uniform "finalized" state for every metric would silently overstate what verification actually proves — Serve should track maturity per relevant financial-state category (§57's four-state model), not assume one maturity clock governs all of them.

This ontology does not select a finalization delay or trigger for any of these. Before establishing such a policy, Serve should measure the actual lag between the four states in §57 as observed in practice (the current ~2–3-day AxisCare verification backlog is a USER-OBSERVED OPERATIONAL FACT to measure, not a policy value to adopt), rather than choosing an arbitrary delay. This is a design concept only; no implementation is authorized by this section.

---

## 59. Vendor-Edge Principle

Vendor-specific objects and statuses are normalized at the integration edge. Internal Serve financial and operating models use Serve-owned canonical concepts.

AxisCare, CINCH, Viventium, and accounting systems should not dictate Serve's ontology. Internal financial logic should be built around the stable Serve concepts defined here (Visit, Work Assignment, Community Shift, Billable Activity, Payable Activity, and the rest of this ontology) rather than around a specific vendor's field names or status vocabulary, even where a vendor concept currently maps closely to a Serve concept.

This restates, for the two-model labor amendment specifically, the Governing Principle already established in §2.

---

## 60. Serve OS Strategic Boundary

Serve OS may increasingly become the canonical operating and orchestration layer for care delivery, while:

- CINCH remains a Community Care execution source;
- AxisCare remains a scheduling/home-care operational system and downstream integration;
- Viventium remains payroll execution;
- accounting remains ledger/financial truth.

This ontology does not propose replacing any of these systems. It exists only to ensure that Serve's ontology does not foreclose future Serve-owned capability — such as unified scheduling, Community Shift management, Visit orchestration, reconciliation, or service-day intelligence — should Serve choose to build it. This is a boundary statement, not a product roadmap.

---

## 61. Direct Labor: Actual vs. Allocated

**Direct Labor Actual** is actual or authoritative labor cost associated with the natural payable Work Assignment (§52) that generated it — a Traditional Visit or a Community Shift.

**Allocated Direct Labor** is a modeled distribution of a Work Assignment's labor cost across lower-grain objects, such as individual Community Visits or Clients, when a business question requires a finer grain than the natural payable unit provides.

Allocated Direct Labor is not source truth. Any allocated figure must retain, at minimum:

- the allocation method used;
- the source Work Assignment it was allocated from;
- a model/version identifier, where applicable;
- the period covered;
- explicit `allocated` semantics wherever presented, so it is never confused with Direct Labor Actual.

No allocation algorithm is selected by this ontology. See Metric Registry Part XIV for how this distinction affects specific metrics.

### Why allocation is a real, separate problem

Illustrative example, not a data model: a four-hour Community Shift costs Serve a known, actual amount in caregiver labor. Multiple Client Visits occur inside that Shift. Serve knows the actual Shift labor cost — that is Direct Labor Actual, and it requires no allocation. Serve does **not** automatically know what portion of that cost belongs economically to any one of the individual Visits inside the Shift.

**No allocation methodology is required to calculate authoritative Community Shift or Community-level Direct Service Contribution** — both are computable directly from the Shift's own actual Revenue and actual Direct Labor (Ontology §58 in Part XIII; Metric Registry §58). Allocation is only required for genuinely lower-grain questions, such as: contribution by individual Community Visit; contribution by resident; or per-Visit Community labor economics.

Candidate future allocation approaches — none selected by this ontology — might include a service-minute share, an equal-per-Visit share, a Visit-type-weighted share, or a revenue share. Whichever is eventually approved, any resulting figure must be labeled **Allocated Direct Labor**, never **Direct Labor Actual**.

---

# PART XIII — COMMUNITY SHIFT CAPACITY AND OPTIMIZATION MODEL

This Part extends Part XII with the business concepts needed to eventually evaluate and optimize Community Shift capacity. It is additive and defines business meaning only. Exact metric formulas, source status, and calculation grain belong in the Financial Metric Registry (Part XV there). No algorithm, threshold, or implementation is authorized by this Part.

## 62. Community Capacity Intelligence

**Community Capacity Intelligence** is a deterministic Serve Intelligence capability that evaluates Community Visit demand against available Community Shift capacity, service timing, caregiver constraints, and contribution economics to determine when additional caregiver capacity is operationally and economically justified.

This does not establish a new Intelligence domain. It should be described as a capability/model within the existing Financial and Executive Intelligence architecture unless a future design determines a separate domain is genuinely required (Executive Intelligence Domain Charter §6).

---

## 63. Minimum Community Shift Length

Serve's current staffing experience establishes a real operating constraint:

> Community caregiver Shifts shorter than approximately four hours are materially harder to fill reliably.

The v0.1 approved operating assumption is:

> **Minimum Community Shift Length = 4 hours** (`minimumCommunityShiftHours = 4`)

A future capacity recommendation should therefore normally evaluate added capacity in increments of at least one minimum Community Shift, not in arbitrary fractional caregiver blocks (for example, not a 60-, 90-, or 120-minute increment) merely because a mathematical model computes that as the exact additional service capacity needed.

This is a Serve business constraint, not an AxisCare or CINCH concept. It should be treated as a configurable Serve business rule once implementation begins, not permanently hard-coded into any algorithm. This ontology approves the 4-hour value as the current operating assumption; it does not authorize building a configuration mechanism.

---

## 64. Demand Is Not Just Visit Count

Visits per Community Shift alone cannot determine capacity. A Community Shift with ten evenly distributed Visits may be easier to operate than a Shift with seven Visits concentrated inside a narrow service window.

Community capacity must eventually consider at least:

1. Visit count;
2. service duration;
3. requested/preferred timing;
4. actual timing;
5. concentration of demand;
6. transition/coordination time;
7. unplanned service demand;
8. service-quality constraints.

---

## 65. Client Service Utilization

**Client Service Utilization** is the portion of paid Community Shift time that became direct Client service time — conceptually, Client service minutes delivered during a Community Shift, relative to paid Community Shift minutes.

Client Service Utilization is an **observed efficiency measure**, not itself the optimization target. Community caregivers require legitimate non-client-service capacity for movement between residents, documentation, coordination, schedule variability, unexpected resident needs, service overruns, operational handoffs, and reasonable working conditions. Serve must not imply that 100% Client Service Utilization is ideal.

---

## 66. Practical Capacity

**Practical Capacity** is the portion of paid Community Shift capacity that can reasonably be committed to planned Client Visits while preserving sufficient operating reserve for transitions, documentation, variability, and unplanned resident needs.

No specific percentage or threshold is established by this ontology. Practical Capacity is not a value Serve simply chooses once and keeps — it is a **versioned, evidence-calibrated operating parameter** (§80, Community Capacity Policy Version). Serve may begin with a provisional management assumption, but that assumption should be tested and revised using real operating history: Visit count, service minutes, Visit timing, lateness, missed/delayed Visits, unserved demand, caregiver fillability, caregiver workload, client experience, Revenue, Direct Labor, and Direct Service Contribution (§77, §79).

---

## 67. Practical Capacity Utilization

**Practical Capacity Utilization** relates planned/expected service demand to Practical Capacity (§66), rather than to raw paid Shift time. It is intended to eventually be more useful for capacity decisions than Client Service Utilization (§65) alone. No thresholds are established by this ontology; because it depends on Practical Capacity, it inherits that value's versioned, evidence-calibrated status.

---

## 68. Peak Demand Density

**Peak Demand Density** describes how much Community Visit demand is concentrated inside narrower time windows within a Shift, distinguishing total Shift demand from simultaneous or tightly clustered demand.

A Shift can have substantial aggregate headroom while still being unable to reliably meet a short, concentrated demand peak. No specific rolling-window size (for example, 30-, 60-, or 90-minute) is established by this ontology — like Practical Capacity (§66), the window size is a versioned, evidence-calibrated operating parameter (§80) to be set from observed demand-timing data, not chosen once arbitrarily.

---

## 69. Capacity Headroom

**Capacity Headroom** is the amount of additional Community Visit demand a Shift can absorb while remaining within approved Practical Capacity (§66) and service-quality constraints.

Capacity Headroom should eventually be expressible in forms such as service minutes, expected Visits, revenue opportunity, or contribution opportunity. No calculation is defined by this ontology.

---

## 70. Additional Shift Readiness

**Additional Shift Readiness** is an intelligence assessment of whether current and expected Community Visit demand is sufficiently dense, time-constrained, and economically valuable to justify adding another minimum Community Shift (§63).

"Additional Shift Readiness" is preferred terminology over describing this as "splitting" an existing Shift, since the operational outcome need not be a literal division. Justified added capacity may take the form of two concurrent minimum Shifts, overlapping minimum Shifts, staggered minimum Shifts, an AM/PM capacity change, or another configuration consistent with the minimum-Shift rule (§63). Serve must not assume the optimal answer is always two identical concurrent Shifts.

Additional Shift Readiness should eventually weigh, at minimum:

- **Demand:** Visit count, Visit durations, demand growth, time-of-day concentration, pending/unserved demand, delayed demand, and expected new-Client demand where evidence supports it.
- **Existing capacity:** current Shift duration, Client Service Utilization (§65), Practical Capacity Utilization (§67), Peak Demand Density (§68), Capacity Headroom (§69).
- **Client experience:** ability to meet preferred/required service windows, lateness/delay, continuity, rushed-service risk, missed/unserved demand, reliability.
- **Caregiver experience:** minimum fillable Shift length, predictable schedule, reasonable service density, transition time, workload saturation, continuity/stability, and the likelihood a Shift can actually be staffed.
- **Economics:** incremental Revenue, incremental Direct Labor, incremental Direct Service Contribution, expected contribution per paid Shift hour, Visit mix (§71), and expected utilization of added capacity.

---

## 71. Visit Mix and Economic Density

Serve charges different amounts for different Community Visit durations and service configurations. Two Community Shifts with identical Visit counts, or identical service-minute utilization, can therefore have materially different Revenue and Direct Service Contribution.

Community capacity optimization must consider **Visit mix**, not merely volume or minutes. Serve must not assume one Visit is an economically equivalent unit to another Visit, or that one service minute is economically equivalent to another; future intelligence must preserve the actual Billable Activity / rate economics associated with each Visit rather than averaging them away.

**Economic Density** describes how effectively a Community Shift converts purchased caregiver capacity into economically valuable Client service. Candidate views of Economic Density include Revenue per Paid Shift Hour, Direct Service Contribution per Paid Shift Hour, and Contribution per Client Service Minute — see Metric Registry Part XV for the specific metric definitions. Any lower-grain view of Economic Density must apply the Direct Labor Actual / Allocated Direct Labor distinction (§61) and must not imply an actual per-Visit labor cost when Community labor originates at the Shift grain.

---

## 72. Margin-Aware Capacity Optimization

Community capacity decisions must optimize sustainable Direct Service Contribution and service quality — not merely Visit count, Revenue, or caregiver utilization in isolation.

Because different Visit durations and rate structures carry different contribution economics, a future capacity recommendation must consider Visit mix (§71), expected Revenue, incremental labor cost, expected contribution, service-quality effects, and caregiver constraints together, rather than optimizing any single input alone.

---

## 73. Existing, Enabled, and Forecast Demand

Future capacity optimization must distinguish three categories of demand and must not mix them when calculating incremental economics:

- **Existing demand redistributed** — Visits already being served by existing capacity, but redistributed across a changed Shift configuration. This may improve timeliness, caregiver workload, or client experience, but does not by itself create new Revenue.
- **Constrained/unserved demand unlocked** — demand Serve currently cannot reliably accept or deliver because capacity is insufficient. Added capacity may create incremental Revenue by serving this demand.
- **Future expected demand** — projected demand based on growth/pipeline evidence (§26, Pipeline). This is Forecast (§34), not Actual (§32), and must be labeled accordingly.

---

## 74. Incremental Direct Service Contribution of Added Capacity

**Incremental Direct Service Contribution of Added Capacity** is the incremental Revenue enabled by added Community Shift capacity minus the incremental Direct Labor cost of that added capacity.

This is expected to become one of the principal economic inputs to Additional Shift Readiness (§70). No forecasting methodology or calculation is authorized by this ontology.

---

## 75. Community Shift Optimization Objective

The canonical Community Shift capacity objective is:

> **Maximize sustainable Direct Service Contribution and reliable Client service, subject to caregiver fillability, minimum Shift length, service timing, practical capacity, continuity, and reasonable caregiver workload constraints.**

This objective must not be reduced to "maximize utilization." Utilization (§65, §67) is an input to the objective, not the objective itself.

---

## 76. Verification Lag Does Not Change Economic Grain

CINCH may show a Community Visit as completed before AxisCare reflects it as verified/completed, because Serve currently verifies CINCH-populated Visits in AxisCare manually (§57). AxisCare is reportedly expected to eventually automate more of this verification. This is a current source-system workflow limitation that may improve.

Automatic AxisCare verification would reduce service-data settlement lag. It would **not** change the underlying Community Care economic grain: Revenue remains Visit / Billable Activity grain, and Direct Labor remains Community Shift / Work Assignment grain, regardless of how quickly or automatically verification occurs. A future integration improvement to verification timing must not be allowed to collapse this distinction.

---

## 77. Algorithmic Accuracy Principle

Capacity thresholds should be calibrated from observed Serve operating history rather than chosen arbitrarily.

Future capacity models should learn from actual Visit demand, actual Shift staffing, timing distributions, late/missed service, caregiver utilization, client-service outcomes, Shift fillability, Revenue, Direct Labor, and contribution. Initial rules may be deterministic, but any threshold used must be evidence-driven and versioned, consistent with the Constitution's "deterministic reasoning precedes AI" principle. Machine learning must not be introduced merely because optimization is a future goal.

---

## 78. Verification as an Operational Work Item

Community Visits completed in CINCH but still awaiting required AxisCare verification (§57) may constitute actionable operational work for the Community Care Coordinator — the current observed ~2–3-day backlog (§57) represents real, outstanding work, not merely a data-quality footnote.

A likely future Today's Work item — **"Review and resolve unverified Community Visits"** — would help identify CINCH-completed, AxisCare-present, still-unverified Visits, and the age of each pending verification. This is a Management Action (§31) candidate, using the platform's existing Action primitive rather than a new one.

**This section identifies a future operational workflow. It does not implement it.** If future investigation establishes that verification is not operationally necessary for billing or payroll and exists purely as an optional documentation step, that finding should replace this section's premise rather than be silently ignored.

---

## 79. Community Capacity Review

Before trusting a fully automated capacity-recommendation engine, Serve should review Community Shift performance on a recurring cadence, to accumulate the real operating evidence §77's calibration requires.

A recommended design concept — not a specified workflow — is an initially weekly review that compares AM vs. PM Shifts and evaluates: current demand density (§64), Capacity Headroom (§69), Peak Demand Density (§68), fillability, contribution, constrained/unserved demand (§73), and growth trend. The purpose is to collect enough real operating evidence to calibrate the algorithm described in §77 — not to operate a standing dashboard for its own sake. No workflow, UI, or code is authorized by this section.

---

## 80. Community Capacity Policy Version

A **Community Capacity Policy Version** is a future, explicitly versioned record of the operating parameters governing Community capacity decisions at a point in time — analogous to how a Forecast (§34) retains its assumptions and version.

A future policy version may capture values such as: Minimum Community Shift Length (§63); the provisional Practical Capacity assumption (§66); the Peak Demand window definition (§68); minimum reserve capacity; Additional Shift Readiness rules (§70); review cadence (§79); and an effective date.

The only value this ontology currently approves is the hard constraint in §63 (Minimum Community Shift Length = 4 hours). Every other value referenced above remains provisional and evidence-calibrated, not chosen by this document. No versioning mechanism is implemented by this section.

---

## Ontology Statement

> **Serve's business is understood through the relationships among people, care delivery, workforce, communities, growth, governance, and economics. The Visit is the primary bridge between client-side operations and revenue: Client service creates Billable Activity and Revenue. Caregiver work creates Payable Activity and Direct Labor through the caregiver's Work Assignment, which a Traditional Visit satisfies directly and which a Community Shift satisfies for Community Care. Those relationships roll upward into Client, Community, and enterprise performance, allowing Serve Intelligence to explain not only what happened, but why the organization performed as it did.**