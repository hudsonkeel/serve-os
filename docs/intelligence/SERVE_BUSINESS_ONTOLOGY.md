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

> Caregiver → Payable Activity

> Caregiver → Direct Labor

> Caregiver → Community

> Caregiver → Workforce Capacity

The Caregiver is the primary labor-side economic participant in care delivery.

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

Additional concepts should be added only when a real business or intelligence requirement requires them.

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

## Ontology Statement

> **Serve's business is understood through the relationships among people, care delivery, workforce, communities, growth, governance, and economics. The Visit is the primary bridge between operations and direct economics: Client service creates Billable Activity and Revenue, while Caregiver work creates Payable Activity and Direct Labor. Those relationships roll upward into Client, Community, and enterprise performance, allowing Serve Intelligence to explain not only what happened, but why the organization performed as it did.**