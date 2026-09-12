# Serve Financial Source Readiness and Canonical Economic Mapping

**Status:** Investigation and architecture-mapping only. No `financial.*` Fact implemented, no migration created, no vendor write performed.
**Prepared for:** Hud (and review with ChatGPT)
**Scope:** Repository-observable evidence, reconciled against established workstream evidence supplied by Hud that is not present in this repository — specifically a previously completed live AxisCare discovery run (`GET /api/invoices` → 403; guessed payroll-shaped routes → 404) and direct AxisCare Support correspondence (Baylor Hubble, Sept 8), plus current Viventium API-provisioning status (contact: Rebecca Green). No new live AxisCare/Viventium/Accounting API call was made *by this investigation itself* (see §2.6, §11); the AxisCare live-discovery evidence incorporated here was completed previously, outside this session, and is reported as USER-OBSERVED OPERATIONAL FACT / VENDOR-DOCUMENTED FACT rather than re-derived from the repository.

**Evidence classification used throughout:**
- **AUTHORITATIVE SOURCE FACT** — the vendor's own documented/live-confirmed behavior, treated as ground truth for that vendor's domain.
- **REPO-CONFIRMED FACT** — directly observed in this repository's code or vendored specification.
- **VENDOR-DOCUMENTED FACT** — stated in vendor-supplied documentation (e.g., the OpenAPI spec) but not independently live-verified in this session.
- **USER-OBSERVED OPERATIONAL FACT** — Hud's direct knowledge of real operating behavior, not derivable from this repository.
- **INFERENCE** — a reasonable conclusion drawn from the above, explicitly flagged as such.
- **UNKNOWN** — genuinely undetermined; not guessed.

---

## 1. Executive Conclusion

Serve's canonical economic model (Charter/Ontology/Registry, as committed through `ba40840`) is architecturally sound and does not need to change as a result of this investigation. What changes is the buildability picture underneath it:

- **AxisCare** is **UNRESOLVED / VENDOR-CLARIFICATION-OR-CONFIGURATION-REQUIRED for Revenue.** Visit-level rate intent (`chargeRate`/`billableRateMode`) is currently available. Authoritative invoiced Revenue is not yet accessible: a previously completed live discovery confirmed `GET /api/invoices` exists and returns HTTP 403 (a real, gated route — not a nonexistent one; guessed payroll-shaped routes returned 404 by contrast), and AxisCare Support (Baylor Hubble, Sept 8) has separately stated there is no additional permission/tier/feature model for APIs — leaving open exactly what does gate that route. This is not "not currently usable," it is genuinely unresolved pending vendor clarification.
- **Viventium** is **NOT CURRENTLY ACCESSIBLE — API ACCESS IN PROGRESS.** No payroll API integration exists in this repository today, but this is an active, in-progress provisioning effort (contact: Rebecca Green, who has supplied the API-user setup path and questions; intended permission level is Read Only) — not a dead end. Actual payroll fields/grain remain unconfirmed until credentials and API documentation are received.
- **Accounting/GL platform is UNKNOWN** — no platform has been identified anywhere in this repository; Patrick/accounting remains a planned source-discovery track, not a blocked one.
- **No `financial.*` Fact should be implemented yet.** The reason is that the authoritative source contracts for Revenue (AxisCare) and Direct Labor (Viventium) are not yet sufficiently accessible or confirmed — not that no plausible vendor path exists. Both AxisCare and Viventium have identified, active paths forward (vendor clarification and in-progress API provisioning, respectively); neither has yet produced a confirmed, authoritative field-level contract to build against.
- Community Shift-to-Visit linkage remains **confirmed absent from the AxisCare Customer API surface** and **UNKNOWN for CINCH** (no CINCH API documentation exists in this repository).
- The one piece of real, actionable progress available today is **not** a Financial Fact — it is the two already-buildable operational metrics (`operations.scheduled_vs_delivered_hours`, and partially `operations.visits_per_active_client`), which the prior Investigation Report already identified and which the Visit Historical Fact pipeline (already shipped) already supports.

---

## 2. AxisCare Revenue Readiness

### 2.1 Visit/service economics field-by-field

| Field | Classification | Evidence |
|---|---|---|
| Visit ID | AVAILABLE | REPO-CONFIRMED — `AxisCareRawVisit.id`, composite `v={id}:s={scheduleId}:d={date}` (types.ts, OpenAPI spec) |
| Client ID | AVAILABLE | REPO-CONFIRMED — `client.id`/`client.externalId` |
| Service date | AVAILABLE | REPO-CONFIRMED — `startDate`/`scheduledStartDate` |
| Scheduled duration | AVAILABLE | REPO-CONFIRMED — `scheduledStartDate`/`scheduledEndDate` |
| Delivered duration | AVAILABLE (as clocked time only) | REPO-CONFIRMED — `clockIn.time`/`clockOut.time`; already the v0.1-approved "Recorded Delivered Care Hours" basis (Registry §41) |
| Service type/code | AVAILABLE | REPO-CONFIRMED — `service.code`/`service.description`/`service.procedureCode` |
| Charge rate | AVAILABLE | REPO-CONFIRMED — `chargeRate` (visit create/update schema, OpenAPI lines ~7500, ~8121) |
| Billable-rate mode | AVAILABLE | REPO-CONFIRMED — `billableRateMode` (`custom`/`auto`) |
| Billable state | NOT EXPOSED | No `billable`/`isBillable` field documented anywhere on the Visit schema |
| Verified state | AVAILABLE | REPO-CONFIRMED — `verified: boolean` |
| Invoice linkage | ROUTE EXISTS BUT BLOCKED | `GET /api/invoices` confirmed to exist and return HTTP 403 (previously completed live discovery, USER-OBSERVED OPERATIONAL FACT) — a real, gated route, not a nonexistent one; separately, zero occurrences of "invoice" anywhere in the vendored ~12,000-line OpenAPI spec (REPO-CONFIRMED), meaning the route exists in the live API but is undocumented in this repository's spec copy |
| Invoice line linkage | UNKNOWN | Cannot be determined while the route itself returns 403 — no response body has been observed to inspect for line-level fields |
| Amount (calculated) | NOT EXPOSED | No documented field combines `chargeRate` × duration into a calculated line amount |
| Quantity/units | PARTIALLY AVAILABLE | `billableRateMode` implies unit basis (Hourly/Daily/Fixed per the visit `type` enum) but no explicit "quantity" field |
| Discounts/adjustments | NOT EXPOSED | No field found |
| Invoice status | ROUTE EXISTS BUT BLOCKED | The invoice object confirmed to exist at `/api/invoices` is currently 403-gated; status field presence unconfirmed |
| Payment status | ROUTE EXISTS BUT BLOCKED | Same — unobservable while the route returns 403 |
| Write-offs/credits | NOT EXPOSED | No field found |

### 2.2 Invoice API reconciliation

1. **Does `/api/invoices` still return 403?** YES — **USER-OBSERVED OPERATIONAL FACT**, from a previously completed live discovery run (not re-run by this investigation): `GET /api/invoices` exists and returns HTTP 403. Distinctly, guessed/nonexistent payroll-shaped routes returned HTTP 404 in the same discovery pass. The 403-vs-404 distinction matters: a 404 means the path doesn't exist at all, while a 403 means the route exists and is being actively denied — `/api/invoices` is a real, gated endpoint, not a nonexistent one. **Do not claim the route is absent; do not claim invoice access is currently available.**
2. **Does the current supported Customer API surface document it?** NO — REPO-CONFIRMED. `docs/integrations/axiscare/AxisCare-Customer-API-OpenAPI.yaml` (the vendor-supplied spec already in this repository) contains zero matches for "invoice" anywhere, and its documented resource set is exactly: clients, caregivers, contacts, visits, schedules, applicants, ADLs, call-logs, organizations, classes, tagging categories, referrals, expiring tokens. The route exists live but is **undocumented in this repository's copy of the spec** — the spec's silence and the 403 are two separate, mutually consistent pieces of evidence, not one.
3. **Are invoice objects/line items present in any current schema?** NOT ACCESSIBLE — a 403 response has not exposed any object shape to inspect, and no schema for it appears in the documented spec.
4–8. **Visit linkage / Client linkage / service-date linkage / line-level amount/rate/quantity / invoice status:** UNKNOWN — none of these can be observed while the route returns 403.
9. **Payment/collection state available?** UNKNOWN, same reason.

**Vendor clarification received (Sept 8):** AxisCare Support (Baylor Hubble) stated: *"There is no additional permission, limited-release, feature, tier, etc. for APIs."* This directly rules out the most obvious explanation for the 403 (a locked feature/tier requiring an upgrade or add-on) without explaining what actually gates the route. **This leaves the specific cause of the 403 genuinely open** — possibly an account-level API-scope setting AxisCare Support controls directly, a different authentication requirement for that route, or something else not yet identified. This is a named open vendor question (§12), not resolved by this statement.

### 2.3 AxisCare revenue classification

> **VENDOR CLARIFICATION REQUIRED (also possibly configuration-required) — Visit-level rate intent currently available; authoritative invoiced Revenue not yet accessible**

AxisCare can authoritatively tell Serve what rate/rate-mode was set on a Visit at schedule time (a *pricing intent* signal). It cannot currently tell Serve what was actually billed, invoiced, adjusted, or collected — not because no invoice object exists (one does, confirmed by the 403), but because access to it is currently blocked for a reason AxisCare Support's own statement does not explain. This is a real, resolvable gap, not a dead end: the next action is a targeted vendor follow-up (§12), not further repository investigation.

### 2.4 Care-note/ADL/verification behavior (carried forward, unchanged)

Per the prior amendment's investigation (Business Ontology §57): `verified` is confirmed to lock ADL/care-note documentation edits, is not shown to gate billing-field validity, and is not confirmed either way for invoice generation or payroll. Nothing new was found this session that changes this.

### 2.5 Caregiver-side payroll cross-reference field

**REPO-CONFIRMED, new finding this session:** the AxisCare Caregiver/Applicant creation schema documents a `payrollId` field (string, nullable) and a standing `payRate` field (string, pattern-validated numeric) — both on the **Caregiver** object, not the Visit. `payrollId` is a plausible cross-system key candidate (see §6) if it is populated with a Viventium employee identifier, but this repository has no evidence of what value AxisCare actually stores there — UNKNOWN whether it is populated, and UNKNOWN whether it is a Viventium ID specifically.

### 2.6 Live-probe reconciliation

**No new live AxisCare API call was made by this investigation.** The `/api/invoices` 403 and the payroll-shaped-route 404s reported in §2.2 come from a live discovery run **already completed previously**, outside this repository-scan session, and are incorporated here as established workstream evidence per Hud's instruction — not re-derived from repository code. This repository's own `runAxisCareDiscovery()` tool (`lib/integrations/axiscare/discovery.ts`) remains scoped to only the ten already-known/documented endpoints and does not itself attempt `/api/invoices` or any payroll-shaped path — it is not the tool that produced the §2.2 finding, and running it again would not add anything beyond what's already recorded there. The concrete next action, given the 403 is confirmed but its cause is not, is the targeted vendor follow-up in §12 — not a further repository or live-API investigation step.

---

## 3. Viventium Labor Readiness

### 3.1 What exists in this repository

**REPO-CONFIRMED FACT:** the only Viventium-touching code in this repository is `scripts/collectors/viventiumEmployeeCollector.ts` and its extractors (`lib/recruiting/extractors/viventium/`) — a browser-DOM (Playwright-style) scraper built for the **recruiting/onboarding-verification** domain, not payroll. Its own source comments state an explicit **evidence-minimization policy**: only three observations are collected — `viventium.employee_record_exists`, `viventium.employee_name` (identity corroboration only), and `viventium.i9_status`. The file explicitly states it deliberately does **not** define selectors for employee number, active status, caregiver role, or hire date, "per the approved evidence-minimization principle." No payroll, banking, tax, hours, earnings, or pay-rate field is collected anywhere.

**REPO-CONFIRMED FACT:** `.env.example` defines only `NEXT_PUBLIC_VIVENTIUM_URL` (a browser navigation URL for the scraper) — there is no `VIVENTIUM_API_TOKEN`, `VIVENTIUM_API_KEY`, or any credential variable anywhere in this repository. No Viventium API client exists. No Viventium OpenAPI spec or other API documentation has been vendored into this repository (unlike AxisCare).

Given this, every field-availability question in the task's Phase 2 checklist is **UNKNOWN** for this repository specifically — not because Viventium access is closed off, but because no payroll API integration has been built or credentialed yet. This session did not access any public Viventium API documentation outside this repository, per the "no credentials, do not fabricate" instruction.

**PROJECT STATUS (Hud-provided, not repository-evidenced):** Viventium API access is **actively being provisioned**, not merely absent. Rebecca Green has supplied the API-user setup path and the questions needed to move it forward; the intended permission level is **Read Only**. Actual payroll fields and grain remain unconfirmed until credentials and API documentation are actually received — this is a status update on an in-progress access request, not a resolution of the field-availability questions below, which remain genuinely UNKNOWN until that access lands.

### 3.2 One usable artifact: the employee identity key

The DOM scraper does establish one real, reusable piece of evidence: a **stable `employeeUuid`**, extracted from the Viventium employee record page's own URL (`lib/recruiting/extractors/viventium/employeeUrl.ts`, referenced in `employeeFields.ts`'s `EmployeeRecordExistsContext`). This is a genuine stable identifier for a Viventium employee record — CROSS-SYSTEM key material, not payroll data. See §6.

### 3.3 Critical linkage questions

| Target | Classification | Basis |
|---|---|---|
| Serve Caregiver (`workforce_members.id`) | UNRESOLVED today, DETERMINISTIC_DERIVED achievable | The existing `person_vendor_identity_links` table (`lib/data/personVendorIdentityLinks.ts`) already implements a generic `(vendor_system, vendor_record_id) → (subject_type, subject_id)` pattern used today for AxisCare caregiver identity. The same pattern could hold a `viventium` row keyed by `employeeUuid` — this is a REPO-CONFIRMED *mechanism*, but no Viventium row has been created; UNKNOWN whether AxisCare's `payrollId` field (§2.5) is intended to be this same key. |
| Service date | UNKNOWN | No Viventium payroll data exists to have a service date |
| Traditional Visit | UNKNOWN | Same |
| Community Shift | UNKNOWN | Same |
| Community | UNKNOWN | Same |
| Area | UNKNOWN | Same |
| Pay period only | UNKNOWN | Same |
| Department/location only | UNKNOWN | Same |

### 3.4 Traditional Care and Community Care labor grain

**UNKNOWN** for both. Without any Viventium payroll API access, this repository cannot determine whether Viventium preserves Visit-level or Shift-level linkage, or only pay-period/department-level aggregates. This is exactly the kind of "unknown is preferable to invented" case the Ontology (§47) and Registry (§2.5) require flagging rather than guessing.

### 3.5 Viventium classification

> **NOT CURRENTLY ACCESSIBLE — API ACCESS IN PROGRESS**

No payroll-capable integration exists in this repository today — only an unrelated, deliberately payroll-excluding DOM scraper — but API access is an active, in-progress provisioning effort (§3.1), not a closed door. This is distinct from "not usable": the correct read is that determinability is pending credentials and documentation that are already being arranged, not that no plausible path exists.

---

## 4. Accounting / GL Readiness

> **ACCOUNTING PLATFORM UNKNOWN**

**REPO-CONFIRMED FACT:** a full-repository search for QuickBooks, NetSuite, Xero, Sage Intacct, "general ledger," "accounting platform," and "GL export" found zero matches in any code or vendor-documentation file — the only two files mentioning these general terms are this workstream's own `SERVE_BUSINESS_ONTOLOGY.md` and `SERVE_FINANCIAL_METRIC_REGISTRY.md`, which discuss Accounting only as a future, unspecified source. No accounting platform has been identified anywhere in this repository.

### 4.1 Canonical categories Accounting must eventually provide

Per Ontology §19–§21 and Registry §32 (unchanged by this investigation): Payroll Burden, Community-Direct Operating Costs, Shared Operating Costs, and — per this task's broader framing — Revenue realization detail (invoiced/collected revenue, AR, credits/write-offs, bad debt) if AxisCare's own invoicing proves insufficient once/if it becomes accessible.

### 4.2 Accounting grain (expected, not confirmed)

**INFERENCE**, since no platform is known: a typical small-to-mid-size accounting platform's natural grain is the **journal entry / journal line**, with **invoice** and **vendor bill** as higher-level documents composed of lines, and **account + period (+ class/location)** as the reporting dimension. This is standard double-entry accounting structure, not something specific to Serve's setup — flagged as INFERENCE, not AUTHORITATIVE SOURCE FACT, because the actual platform is unknown.

### 4.3 Accounting classification

> **UNKNOWN UNTIL SYSTEM CONFIRMED**

Cannot be classified as GL-only, revenue-collection-only, reconciliation-only, or all of the above, until the actual platform and its API/export capability are identified (see §11).

---

## 5. Canonical Source Mapping

| Canonical concept | Primary source | Secondary source | Source object | Natural grain | Stable key | Serve link key | Confidence | Ready? |
|---|---|---|---|---|---|---|---|---|
| Client | AxisCare | — | `client` (on Visit) | Client | `client.id`/`externalId` | `residents.id` via existing reconciliation pipeline | AUTHORITATIVE (identity), NOT READY (financial) | Identity: yes. Financial: no |
| Visit | AxisCare | — | `AxisCareRawVisit` | Visit | composite `v={id}:s={scheduleId}:d={date}` | `historical_facts` natural key (already implemented) | AUTHORITATIVE | Yes (service-delivery grain, already shipped) |
| Traditional Visit | AxisCare | — | same as Visit | Visit | same | same | AUTHORITATIVE | Yes, for service delivery; labor/revenue financial grain not ready |
| Community Visit | AxisCare (appearance) / CINCH (origin) | — | same Visit object once it appears in AxisCare | Visit | same | same | REPO-CONFIRMED for AxisCare side; UNKNOWN for CINCH origin fields | Same as above |
| Caregiver | AxisCare | Viventium (identity only) | `caregiver` (on Visit); Viventium `employeeUuid` | Caregiver | AxisCare caregiver id/externalId; Viventium `employeeUuid` | `workforce_members.id` via `personVendorIdentityLinks` | AUTHORITATIVE for identity; NOT READY for payroll | Identity: yes. Payroll: no |
| Work Assignment | Ontology-only (§52) | — | none (Serve-owned concept) | Traditional Visit or Community Shift | N/A — inherits specialization's key | N/A | CANONICAL (Serve-owned) | No source object exists yet |
| Community Shift | None | None | Not modeled in AxisCare; UNKNOWN in CINCH | Shift | None confirmed | None yet | MISSING | Not ready — no source object |
| Billable Activity | AxisCare (rate intent only) | — | `chargeRate`/`billableRateMode` on Visit | Visit | Visit id | Visit natural key | PARTIAL | Rate intent only, not actual billed amount |
| Payable Activity | None confirmed | — | UNKNOWN (Viventium payroll object; API access in progress, not yet received) | UNKNOWN | UNKNOWN | UNKNOWN | ACCESS IN PROGRESS | Not ready yet |
| Invoice | AxisCare (route confirmed to exist) | — | `/api/invoices` — exists, returns 403; undocumented in the vendored spec | UNKNOWN | UNKNOWN | UNKNOWN | VENDOR CLARIFICATION REQUIRED | Not ready — access blocked, cause unresolved |
| Invoice Line | AxisCare (assumed, unconfirmed) | — | Not observable while `/api/invoices` returns 403 | UNKNOWN | UNKNOWN | UNKNOWN | VENDOR CLARIFICATION REQUIRED | Not ready |
| Payroll Activity | None | — | Not accessible (§3) | UNKNOWN | UNKNOWN | UNKNOWN | MISSING | Not ready |
| Pay Run | None | — | Not accessible | UNKNOWN | UNKNOWN | UNKNOWN | MISSING | Not ready |
| Direct Labor | None | — | Depends on Payable Activity | UNKNOWN | UNKNOWN | UNKNOWN | MISSING | Not ready |
| Community | AxisCare (class/site mapping) | — | `axiscare_community_id` → `resolved_community_id` | Community | `resolved_community_id` | `communities.id` | AUTHORITATIVE — already implemented (`lib/data/axiscareOperationalState.ts`) | Yes |
| Area | Serve-owned | — | none | Area | Serve-owned id | N/A | CANONICAL (Serve-owned, per Ontology §50) | Yes, conceptually; no financial data flows through it yet |
| Accounting Period | Unknown platform | — | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Not ready |
| Expense / GL Line | Unknown platform | — | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Not ready |

---

## 6. Stable Key Inventory

### Client
| Key | Classification |
|---|---|
| AxisCare client ID (`client.id`/`externalId`) | SOURCE-LOCAL |
| Serve resident/client ID (`residents.id`) | CANONICAL |
| Accounting customer ID | MISSING (no platform known) |
| Invoice client/customer reference | VENDOR CLARIFICATION REQUIRED (invoice object confirmed to exist at AxisCare; currently 403-gated, not yet observable) |

### Visit
| Key | Classification |
|---|---|
| AxisCare Visit composite source ID (`v={id}:s={scheduleId}:d={date}`) | SOURCE-LOCAL, already used as the `historical_facts` natural key |
| `scheduleId` alone | SOURCE-LOCAL — links to the client's recurring schedule template, **not** a Shift |
| Client/date/time/service combination | DERIVED — usable as a fallback matching key, not source-proven |

### Caregiver
| Key | Classification |
|---|---|
| AxisCare caregiver ID | SOURCE-LOCAL |
| Serve `workforce_members.id` | CANONICAL |
| Viventium `employeeUuid` (DOM-derived) | CROSS-SYSTEM candidate — exists, but not yet linked to any caregiver record in this codebase |
| AxisCare `payrollId` field (§2.5) | CROSS-SYSTEM candidate, UNCONFIRMED — unknown whether populated or whether it is a Viventium reference |
| Email/HR identifier | MISSING — not evidenced as a reliable key anywhere in this repository |

### Work Assignment
| Specialization | Key | Classification |
|---|---|---|
| Traditional | Visit ID | SOURCE-LOCAL (source-proven as the Visit's own id; the Work Assignment concept itself is Serve-owned, so "source-proven" applies only to the underlying Visit) |
| Community | Shift ID | MISSING — no Shift ID exists in AxisCare (§7); UNKNOWN for CINCH |
| Community (fallback) | Derived key candidate | HEURISTIC at best — see §7 |

### Community
| Key | Classification |
|---|---|
| Serve `communities.id` | CANONICAL |
| AxisCare class/site/community mapping (`axiscare_community_id`) | SOURCE-LOCAL, already resolved into the canonical key via an existing, shipped pipeline |
| Viventium department/location | MISSING — no Viventium data access exists |
| Accounting class/location | MISSING — no platform known |

### Area
Serve-owned only (`Area` per Ontology §50) — no vendor evidence exists or is expected to exist for this concept, consistent with the Ontology's own statement that Area is a Serve-owned management dimension, not a vendor concept.

---

## 7. Community Shift Linkage

### Business linkage
Already established (per the prior amendment, Ontology §56.A): Community Visits occur inside broader Community Shift labor capacity. USER-OBSERVED OPERATIONAL FACT, treated as settled.

### AxisCare technical linkage — re-verified this session
**Confirmed absent from the currently available AxisCare Customer API surface.** This session re-confirmed, independently: (a) zero occurrences of "shift" as a modeled object anywhere in the ~12,000-line OpenAPI spec (the one incidental match is an unrelated "Extra Shifts" incident-report tag name); (b) no shift/assignment/session/batch ID field exists in `AxisCareRawVisit` or `AxisCareRawSchedule` (`lib/integrations/axiscare/types.ts`); (c) the only parent-style identifier, `scheduleId`, is confirmed (via the OpenAPI's own composite-ID documentation, `s={scheduleId}:d={date}`) to reference the client's recurring appointment/service-plan template, not a caregiver Shift. This finding is **not broadened** beyond the AxisCare Customer API surface specifically.

### CINCH linkage
**UNKNOWN.** No CINCH API documentation, OpenAPI spec, or integration code exists anywhere in this repository — confirmed by a full-repository search that found only `lib/assessmentIntelligence/cinchProjection.ts` (a one-way assessment-to-care-plan *content* projection, unrelated to visit/shift scheduling, whose own header states there is no CINCH write integration anywhere in this codebase). Whether CINCH itself exposes a Shift ID, caregiver-assignment ID, session ID, parent/child relation, or a list of Visit IDs per Shift is genuinely unknown from this repository and would require direct CINCH API access to determine.

### Derived linkage — minimum evidence needed

Per Ontology §56's classification scheme:

- **DETERMINISTIC_DERIVED** would require: for a given caregiver/Community/business-date, exactly one Community Shift record whose start/end window contains the Community Visit's time, with no other Shift for that caregiver/Community/date overlapping it. This is achievable *only if* Serve (or CINCH) can supply actual Community Shift schedule records to match against — which do not currently exist as an ingested Serve concept.
- **HEURISTIC** is the realistic near-term ceiling given current evidence: matching on Community + caregiver + business date + Visit timestamp falling within a plausible Shift window (e.g., AM/PM blocks), without a confirmed Shift record to match against — multiple caregivers or overlapping shift patterns could produce ambiguous matches.
- **UNRESOLVED** is the correct classification for any Visit where the caregiver has multiple same-day Community Shifts and the Visit's timing does not clearly fall within one specific window.

**Why not better than HEURISTIC today:** Serve does not currently ingest a Community Shift schedule record from any source (AxisCare has none; CINCH's is UNKNOWN). Without a Shift record to derive against, even a "deterministic" rule is deterministic only relative to an assumed, unconfirmed Shift structure — it is not yet safe to call DETERMINISTIC_DERIVED in the strict sense Ontology §56 requires. No matcher is implemented by this document.

---

## 8. Financial Metric Feasibility

| # | Metric | Canonical formula | Required source facts | Required grain | Available inputs | Blocked inputs | Buildability |
|---|---|---|---|---|---|---|---|
| 1 | Service Revenue | Sum of qualifying invoiced amounts | Invoice/invoice-item data | Visit/Invoice | Visit rate intent (`chargeRate`) only | Invoice, invoice line, payment status | BUILDABLE WITH AXISCARE REVENUE (requires AxisCare billing API access not currently documented) |
| 2 | Direct Caregiver Labor | Sum of qualifying payable amounts | Payroll/payable data | Visit or Work Assignment | None | Entire payroll data source | BUILDABLE WITH VIVENTIUM |
| 3 | Direct Service Contribution | Revenue − Labor | Both above | Same as inputs | None | Both | BUILDABLE WITH MULTI-SOURCE RECONCILIATION (AxisCare + Viventium) |
| 4 | Direct Labor % of Revenue | Labor ÷ Revenue | Both above | Same | None | Both | BUILDABLE WITH MULTI-SOURCE RECONCILIATION |
| 5 | Revenue per Visit | Revenue ÷ qualifying Visits | Revenue + Visit history | Visit | Visit history (already shipped) | Revenue | BUILDABLE WITH AXISCARE REVENUE |
| 6 | Direct Labor per Visit | Labor ÷ qualifying Visits | Labor + Visit history | Visit (Traditional only — see §51 caution, unchanged) | Visit history | Labor | BUILDABLE WITH VIVENTIUM (Traditional Care only; Community Care requires allocation, deferred) |
| 7 | Revenue per Delivered Care Hour | Revenue ÷ Delivered Care Hours | Revenue + delivered duration | Visit | Delivered duration (clocked, already shipped) | Revenue | BUILDABLE WITH AXISCARE REVENUE |
| 8 | Direct Labor per Delivered Care Hour | Labor ÷ Delivered Care Hours | Labor + delivered duration | Visit (Traditional) / Shift (Community) | Delivered duration | Labor | BUILDABLE WITH VIVENTIUM |
| 9 | Direct Contribution per Delivered Care Hour | Contribution ÷ Delivered Care Hours | Both revenue and labor | Same | Delivered duration | Revenue, Labor | BUILDABLE WITH MULTI-SOURCE RECONCILIATION |
| 10 | Active Clients | Canonical Serve lifecycle | Existing `getAuditEligibleActiveClientResidents()` | Client | Fully available — already governed | None | BUILDABLE NOW |
| 11 | Service Revenue per Active Client | Revenue ÷ Active Client denominator | Revenue + Active Clients | Client/period | Active Clients | Revenue; denominator policy (Registry §40, still open) | BUILDABLE WITH AXISCARE REVENUE (+ Hud policy decision) |
| 12 | Visits per Active Client | Visits ÷ Active Client denominator | Visit history + Active Clients | Client/period | Both, partially — Visit history exists, denominator policy open | Denominator policy only | BUILDABLE NOW, pending Registry §40 decision |
| 13 | Community Direct Service Contribution ("Community Contribution Before Overhead") | Community Revenue − Community Labor | Community-attributed Revenue + Labor | Community | Community attribution mechanism (already shipped, §5) | Revenue, Labor | BUILDABLE WITH MULTI-SOURCE RECONCILIATION |
| 14 | Scheduled vs Delivered Care Hours | Delivered ÷ Scheduled hours | Visit scheduled + actual duration | Visit | Both fields already live-read; only historical persistence was the gap, and that is now shipped | None | BUILDABLE NOW |
| 15 | Billable Labor vs Paid Labor | Paid ÷ Billable hours | Billable hours + Paid hours | Visit (Traditional) / mixed grain (Community, per Registry §50) | Neither side available | Both | NOT YET WELL-DEFINED (also grain-misaligned for Community Care per the prior amendment) |

**Community Care Actual vs. Allocated note (repeats Registry §49–§51, not re-derived here):** metrics #6, #8, #9, #15 remain Direct Labor Actual only at the Community Shift grain for Community Care; any per-Community-Visit view of them is Allocated Direct Labor and must be labeled as such once/if ever computed.

---

## 9. Community Metric Feasibility

| Metric | Source readiness | Shift↔Visit linkage required? |
|---|---|---|
| Community Shift Revenue | BUILDABLE WITH AXISCARE REVENUE + a Community Shift source (missing, §7) | Yes — needs a Shift record to attribute Visit revenue to |
| Community Shift Direct Labor | BUILDABLE WITH VIVENTIUM + a Community Shift source | No — this is Shift-grain by definition, needs Shift payroll data, not Visit linkage |
| Community Shift Direct Service Contribution | BUILDABLE WITH MULTI-SOURCE RECONCILIATION | Yes (inherits Revenue side) |
| Revenue per Paid Community Shift Hour | Same as above | Yes |
| Direct Service Contribution per Paid Community Shift Hour | Same as above | Yes |
| Visits per Community Shift | NOT YET WELL-DEFINED — no Shift source exists to count against | Yes |
| Client Service Minutes per Paid Community Shift Hour | NOT YET WELL-DEFINED | Yes |
| Client Service Utilization | NOT YET WELL-DEFINED | Yes |
| Practical Capacity Utilization | NOT YET WELL-DEFINED (also awaits a Hud/evidence-calibrated Practical Capacity value, Ontology §66) | Yes |
| Peak Demand Density | NOT YET WELL-DEFINED (also awaits a window-size parameter, Ontology §68) | Yes |
| Capacity Headroom | NOT YET WELL-DEFINED | Yes |
| Additional Shift Readiness | NOT YET WELL-DEFINED — depends on nearly everything else above | Yes |
| Incremental Contribution of Added Shift Capacity | NOT YET WELL-DEFINED | Yes |

**Every Community metric in this list requires, at minimum, a Community Shift source that does not currently exist anywhere** (AxisCare: confirmed absent; CINCH: unknown). This is the single dominant blocker across the entire Community Capacity/Economics metric set — more fundamental than the revenue/payroll access gaps, because even if AxisCare billing and Viventium payroll both became available tomorrow, none of these Community-specific metrics could be computed without a Shift record to anchor them to.

---

## 10. First Safe `financial.*` Fact

> **NO FINANCIAL FACT SHOULD BE IMPLEMENTED YET.**

None of the candidate types satisfy the eight required conditions today — but the reason is access, not absence:

- `financial.invoice_line_recorded` — fails condition 1 (source is authoritative enough) and 2 (grain is clear): an invoice object exists at AxisCare (`/api/invoices` is a real, confirmed route), but it is not currently accessible (403, cause unresolved pending vendor clarification, §2.2), so its grain and fields cannot yet be confirmed.
- `financial.payroll_earning_recorded` — fails the same conditions: Viventium payroll API access is in progress but not yet received (§3.1), so no authoritative field-level contract exists to build against yet.
- `financial.direct_labor_recorded` — fails condition 6 (no unresolved Community Shift ambiguity) for Community Care specifically, and fails condition 1 for both models pending the Viventium access above.

**Exact blocking evidence:** the authoritative source contracts for both Revenue (AxisCare invoicing) and Direct Labor (Viventium payroll) are not yet sufficiently accessible or confirmed — not that no plausible vendor path exists for either. AxisCare's invoice route is confirmed to exist and gated for a reason not yet explained by vendor support; Viventium access is actively being provisioned. This is unchanged in substance from the original `SERVE_FINANCIAL_INTELLIGENCE_V0.1_INVESTIGATION_REPORT.md` finding, refined by this session's incorporation of the live-discovery and vendor-correspondence evidence: the blocker is confirmed-but-unresolved access, not confirmed absence.

**What remains true and buildable without a new Financial Fact type:** the two metrics identified as "READY TO BUILD" in the original Investigation Report (`operations.scheduled_vs_delivered_hours`, and `operations.visits_per_active_client` pending Registry §40's denominator decision) still stand, and the Visit Historical Fact pipeline that supports them is already shipped and validated in production (per this branch's own commit history). If Hud wants forward progress, it is in exercising or extending that existing capability — not in inventing a new Financial Fact against data that does not yet exist.

---

## 11. Integration Sequence

1. **AxisCare invoice-access vendor follow-up (not yet an integration — a clarification step)**
   - **Unlocks:** whether metrics #1, #5, #7, #11 (Revenue-dependent) become buildable at all via AxisCare.
   - **Dependency:** a targeted follow-up with AxisCare Support asking specifically what gates `/api/invoices` given their own statement that no permission/tier/feature model exists (§2.2, §12) — the route and the 403 are already confirmed; what remains is understanding and resolving the cause.
   - **Risk:** low if kept to vendor correspondence; the main risk is treating the 403 as permanent without pursuing the clarification AxisCare Support's own statement invites.
   - **Expected first metrics enabled:** #1 Service Revenue, #5 Revenue per Visit, #7 Revenue per Delivered Care Hour (all revenue-only, no labor needed).

2. **Viventium API access (already in progress)**
   - **Unlocks:** #2 Direct Caregiver Labor, and everything downstream of it (#3, #4, #8, #9, #13).
   - **Dependency:** completing the in-progress provisioning with Rebecca Green (Read Only access) and receiving actual credentials/API documentation — this is underway, not unstarted (see §12).
   - **Risk:** Traditional vs. Community Care linkage grain is unknown until this access exists; do not assume Visit-level linkage will be available.
   - **Expected first metrics enabled:** #2 alone is already valuable (Direct Caregiver Labor in isolation); #3/#4 follow once paired with step 1.

3. **Community Shift source (AxisCare confirmation of a hidden object, CINCH access, or a Serve-owned scheduling capability)**
   - **Unlocks:** every metric in §9 (Community Capacity/Economics), and grain-correct versions of #6/#8/#9/#15 for Community Care specifically.
   - **Dependency:** either CINCH API access (unknown territory) or a decision to have Serve OS itself become the source of Community Shift scheduling truth (consistent with, but not mandated by, Ontology §60's Strategic Boundary).
   - **Risk:** highest-uncertainty step of the three — no clear owner or API surface identified yet.
   - **Expected first metrics enabled:** Visits per Community Shift, then the full Community Economics set once revenue/labor access also exist.

4. **Accounting/GL platform identification and access**
   - **Unlocks:** Payroll Burden, Community-Direct Operating Costs, Shared Operating Costs, and the deeper Ontology §23–§25 contribution layers.
   - **Dependency:** platform identification itself (see §12) — nothing can be sequenced here until the platform is known.
   - **Risk:** unknown until platform is identified.
   - **Expected first metrics enabled:** none of the current 15-metric spine directly; this unlocks the *next* tier (Fully Loaded Care Contribution, Community Contribution, Enterprise Operating Performance) per Ontology §23–§25.

**Do not build a dashboard before step 1 or 2 produces an actual authoritative Fact.** Per §10, no Financial Fact exists yet to visualize.

---

## 12. Vendor Questions

### AxisCare
- **New, most urgent:** given Support's own statement that there is no additional permission/tier/feature for APIs, what specifically causes `GET /api/invoices` to return 403 on this account? Is it an account-level API-scope setting Support must enable, a different authentication requirement for that route, or something else?
- Once resolved: do invoice line items carry a Visit ID? Do they carry a service date distinct from invoice date?
- Does AxisCare expose any object representing a caregiver's broader Community-care work block ("Shift," "Assignment," or similar), even if not called "Shift" — under any product surface, API or otherwise?
- Is the `payrollId` field on the Caregiver object actually populated in this account, and if so, with what kind of identifier (Viventium employee ID, or something else)?
- Does AxisCare's own product roadmap for automating verification have a committed timeline, or is "expected to automate" purely informal?

### Viventium (API access already in progress with Rebecca Green — questions to confirm once credentials/documentation arrive)
- Does the Read Only API surface being provisioned expose executed payroll and timecard data, separate from the web UI this repository's DOM scraper currently navigates?
- Can a payroll record be linked to a service date, and — critically — to a Community Shift or caregiver work-block concept, or only to a pay period?
- Is there a stable employee identifier exposed via API (matching or superseding the DOM-derived `employeeUuid` this repository already extracts)?
- Does Viventium expose employer burden (payroll taxes, workers' comp, benefits) at a queryable grain, or only as a payroll-run total?

### Accounting / Patrick
- What accounting platform does Serve actually use today (QuickBooks, NetSuite, Sage Intacct, or another)?
- Does that platform expose an API, or only manual export/import?
- What is the invoice/customer grain — does an invoice reference the originating Client/Community, or only a generic customer record?
- What GL dimensions are tracked (class, location, department, entity/company) and do any of them already map to Serve Communities?
- Is Community-Direct Operating Cost currently tracked at the Community level in the chart of accounts, or only at a broader (regional/company) level?

---

## 13. Blocking Evidence Gaps

- **No authoritative amount is currently accessible for Service Revenue** — `chargeRate` is a rate-intent field, not a calculated, invoiced, or collected amount; the invoice object that would carry the calculated amount exists (§2.2) but is currently 403-gated.
- **No stable key is currently observable for Invoice, Invoice Line, Payroll Activity, or Pay Run** — not because these objects don't exist, but because access to them (AxisCare invoicing: gated; Viventium payroll: in progress) has not yet been resolved.
- **No Community Shift source object exists** — this blocks every Community Capacity/Economics metric (§9) regardless of revenue/payroll access.
- **Vendor field semantics unclear:** `payrollId` on the AxisCare Caregiver object — presence confirmed, meaning/population unconfirmed.
- **Community Shift linkage would be HEURISTIC at best today** — not a sufficient basis for any Actual (non-allocated) metric.
- **Accounting platform is entirely unidentified** — every downstream Accounting-dependent metric is blocked at the most basic "which system" level, before any field-level question is even reachable.
- **Duplicate source-of-truth ambiguity:** none currently observed — because so little financial data is accessible at all, there is not yet a case of two sources disagreeing about the same fact. This gap will need re-examination once AxisCare billing and Viventium payroll both become accessible (per Ontology §17's "AxisCare operational calc vs. Viventium executed payroll may differ" caution).

None of these gaps were solved by inference in this document — each is stated as open.

---

## 14. READY TO BUILD / NOT READY TO BUILD

### READY TO BUILD (no new Financial Fact required)
- `operations.scheduled_vs_delivered_hours` (Metric #14) — already buildable on the shipped Visit Historical Fact pipeline.
- `operations.visits_per_active_client` (Metric #12) — buildable pending Hud's Registry §40 denominator-policy decision (a policy call, not a data gap).
- `operations.active_clients` (Metric #10) — already governed and available.

### NOT YET READY TO BUILD
- Every metric requiring Service Revenue, Direct Caregiver Labor, or Direct Service Contribution (Metrics #1–#9, #11, #13, #15) — pending AxisCare invoice-access vendor clarification and/or Viventium payroll API access, both of which have active, identified paths forward but neither of which has yet produced an accessible, confirmed field-level contract.
- Every Community Capacity/Economics metric (§9, all thirteen) — additionally, and more fundamentally, pending the complete absence of a Community Shift source object in any currently accessible system, which is a separate, harder gap than the revenue/payroll access questions above.
- Any Accounting-dependent metric or contribution layer (Fully Loaded Care Contribution, Community Contribution, Enterprise Operating Performance) — pending Accounting platform identification, which has not yet occurred.

**No `financial.*` Fact type should be implemented as a result of this investigation.** The concrete next actions, in order of leverage-to-effort, are: (1) send the targeted AxisCare vendor follow-up on what specifically gates `/api/invoices` (§2.2, §11 step 1); (2) complete the already-in-progress Viventium API provisioning with Rebecca Green (§11 step 2); (3) identify the Accounting platform with Patrick (§12) — all vendor-clarification/access-completion steps, not implementation steps.
