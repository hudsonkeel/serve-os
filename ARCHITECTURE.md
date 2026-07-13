## 2026-07-01 Architecture Update

Serve OS architecture has shifted toward an Operating System model rather than a standalone application.

Current architectural principles:

- Serve OS is the operational layer above external systems.
- External systems execute work.
- Serve OS organizes, tracks, and understands work.
- Residents are the canonical business object.
- External systems enrich resident relationships rather than own them.

Current system roles:

Serve OS
- Resident directory
- Relationship management
- Operational dashboard
- Workspace
- Community Intelligence
- Ask Serve
- Future proposal engine
- Future assessment engine

External Systems

Apploi
- Recruiting

Viventium
- HR
- Payroll
- Employee administration

Cinch CCM
- Community Care execution

AxisCare
- Traditional Home Care execution

Dialpad
- Phone
- Call transcripts
- Relationship history

Google Workspace
- Email
- Documents

Serve Intake
- Assessment
- Proposal generation
- Draft email generation

Design philosophy:

Employees work inside Serve OS.

Serve OS launches external systems as needed.

External systems will gradually be replaced by native Serve functionality while preserving employee workflow.

Authentication is now production-ready.

Serve OS uses Supabase Authentication with Resend SMTP for branded password reset emails. Password recovery is fully self-service and no longer requires administrator intervention.

## 2026-07-03 — Website Architecture Stabilization

### Public Website

The public website remains a static Netlify-hosted marketing site.

Current production architecture intentionally uses native Netlify Forms for all website submissions. Supabase and Resend integration remain under development and are not yet part of the production website.

Current active form architecture:

- Family Consultation
- Professional Referral
- Managing Director Application
- Caregiver Application
- Partner Referral

### Canonical Data Direction

Although multiple public forms exist for different audiences, the long-term architecture is:

Multiple public entry points
→ One canonical referral/intake record
→ Serve OS
→ Notifications
→ Cinch CCM

Professional Referral and Partner Referral are intentionally treated as separate user experiences but should ultimately write into a single canonical referral record with source attribution.

Current production source of truth:
Netlify Forms

Future source of truth:
Supabase canonical intake database

## 2026-07-04 — Conversational Intake Operationalization

Completed the first end-to-end operational pipeline connecting the redesigned public website to Serve's backend infrastructure.

Verified production-capable flow:

Public Website
→ Conversational Care Inquiry
→ Netlify Forms (fallback)
→ Netlify Function
→ Supabase
→ Resend Notifications

This establishes Supabase as the canonical operational datastore while preserving Netlify Forms as an independent capture path during the transition period.

Future architecture remains:

Care Inquiry
→ Qualification
→ Community Care OR Traditional Home Care
→ Serve Client

## 2026-07-05 — Homepage Intake Architecture Expansion

The homepage conversational intake architecture has matured into two independently testable UX approaches:

- Version A — Conversation First
- Version B — Progressive Homepage Intake

Both versions intentionally reuse the same conversational intake engine, Netlify Functions, Supabase integration, and notification pipeline. The only architectural difference is the timing of when the conversation is revealed to the visitor.

Professional Referral has become a first-class Care Inquiry workflow rather than simply another relationship selection. The intake now supports referral-specific conversation paths while remaining aligned with the overall Care Inquiry architecture.

Serve OS has begun recognizing Professional Referral inquiries as distinct operational records through inquiry classification and improved administrative presentation.

## 2026-07-06 — Product Architecture Clarification

### Architectural Direction

No structural architecture changes were introduced today.

The core product philosophy was clarified:

- Serve OS is the operational orchestration layer, not a replacement for operational platforms.
- External systems (Cinch CCM, AxisCare, Viventium, Dialpad, Google Workspace, etc.) remain systems of execution.
- Serve OS provides context, prioritization, operational memory, and launches the appropriate external system when work must be completed.
- Resident information and operational history remain centralized within Serve OS.

Architecture Status

Phase 0 — Enterprise Architecture Foundation

STATUS: COMPLETE

Date Completed:
July 8, 2026

Deliverables:
✓ Policy Coverage Matrix
✓ Governance Crosswalk
✓ Knowledge Architecture
✓ Canonical Source Registry

Next Phase:
Governance Module Implementation

## 2026-07-13 — Platform Architecture Checkpoint (Documentation Reconciliation)

This entry brings ARCHITECTURE.md current with the repository as it
actually exists — earlier entries above are preserved as historical
record and are not rewritten; several are now superseded in specifics
(e.g. "Netlify remains production host," see "Deploy target" below).

### Technology stack

- **Next.js 16 (App Router, Turbopack), React 19, TypeScript.** This
  version of Next.js has meaningful breaking changes from prior training
  data — `proxy.ts` is this version's renamed `middleware.ts`.
- **Tailwind CSS v4**, `@theme`-based tokens in `app/globals.css` — see
  Design System 2.0 below. No CSS-in-JS, no component library dependency.
- **Supabase** — Postgres database, authentication, and (for recruiting)
  file storage. `@supabase/supabase-js` is the only database client.
- **Node's native TypeScript execution** (`--experimental-strip-types`)
  for a small set of standalone scripts/tests under
  `lib/integrations/axiscare/` and `lib/scheduling/` — no jest/vitest/
  mocha in this repository. These two folders use relative imports with
  explicit `.ts` extensions so the same files run under both Next's
  bundler and plain Node.

### Supabase role and authentication boundaries

Supabase is Serve OS's own canonical operational datastore — residents,
resident wellness notes/follow-ups/connections, recruiting leads, and
(historically) prospect/care-inquiry staging. It is **not** used to store
AxisCare or CINCH data; those remain queried live or reconciled via
staged imports, never mirrored wholesale into Supabase.

Authentication is Supabase Auth. `proxy.ts` enforces a cookie-based
session check (`serve_os_access_token` / `serve_os_refresh_token`,
`lib/auth/constants.ts`) against `user_profiles` on every non-public
route, redirecting unauthenticated requests to `/login`. Role model:
`AUTH_ROLES = ["admin", "manager", "executive", "operations"]`
(`lib/auth/constants.ts`). Today, role enforcement is **route-level only**
for most of the app (any authenticated role sees the same content) —
role-based **content** gating exists only on `/settings`. This is a real,
current limitation, not a placeholder claim.

### Deploy target — unresolved discrepancy

`netlify.toml` exists at the repo root and `ENVIRONMENT.md`/
`PRODUCTION_READINESS.md`/`SERVE_APP_URL` all reference Netlify as the
deploy target. However, a live GitHub commit-status/check-run query
against this repository's public API (no credentials required) shows
that pushes are currently auto-deployed by **Vercel**, not Netlify — no
Netlify GitHub-integration activity was found on recent commits at all.
**This has not been reconciled.** Until Hud confirms the intended
platform, treat both `netlify.toml` and any Netlify-specific
documentation elsewhere in this repository as unverified against actual
current infrastructure.

### Serve OS module architecture

Top-level pages each own exactly one operating mode — Dashboard (Know),
Workspace (Do), Residents (Manage), Community Intelligence (Think
proactively), Ask Serve (Think on demand), Communications (Coming Soon —
ensure nothing is missed), Settings (configure/govern/secure/connect).
Full model in
[`docs/architecture/SERVE_OS_OPERATING_MODEL.md`](docs/architecture/SERVE_OS_OPERATING_MODEL.md);
sidebar structure in
[`docs/architecture/SERVE_OS_NAVIGATION_MODEL.md`](docs/architecture/SERVE_OS_NAVIGATION_MODEL.md);
Settings section model in
[`docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md`](docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md).

### Design System 2.0

Blue & White ("Clean & Clinical") token system in `app/globals.css` —
`navy`/`blue`/`gold` brand tokens, `canvas`/`surface`/`ivory*` surface
tokens, semantic state colors (`warning-surface`+`warning-text`,
`overdue-surface`+`danger-text`, `success-surface`+`success-text`).
Applied to Global Shell, Workspace, Dashboard, Resident Directory,
Resident Detail, Resident Wellness. **Not yet applied** to Prospects,
Recruiting, Community Intelligence, Ask Serve, or the public website —
see [`docs/design/SERVE_DESIGN_SYSTEM_2.md`](docs/design/SERVE_DESIGN_SYSTEM_2.md).

### Source-system integration boundary, vendor adapter layer, normalization

Every external system (AxisCare, CINCH CCM, Apploi, Viventium, Google
Workspace, Dialpad, SAS) remains its own system of record and execution
platform. Serve OS's role is coordination and (eventually) intelligence
above them, not replacement. For AxisCare specifically, the boundary is
now concretely implemented, not just stated as policy:

- **Vendor adapter layer** — `lib/integrations/axiscare/`: server-only,
  GET-only HTTP client (`client.ts`), configuration/credential handling
  (`config.ts`, including the release-control flag — see below),
  endpoint wrappers (`visits.ts`, `schedules.ts`, `clients.ts`,
  `caregivers.ts`), error categorization (`errors.ts`), and raw AxisCare
  types (`types.ts`). Nothing here is vendor-neutral by design — that's
  the normalization layer's job.
- **Normalization layer** — `lib/scheduling/normalize.ts` converts raw
  AxisCare records into Serve-owned types. This is the *only* module
  outside `lib/integrations/axiscare/` permitted to import an
  `AxisCareRaw*` type.
- **Serve domain models** — `lib/scheduling/types.ts`'s
  `ServeScheduleVisit`, `ServeRecurringSchedule`,
  `ServeTodaysScheduleResult`. Deterministic status normalization
  (`status.ts`), timezone-safe date parsing (`dateTime.ts`), bounded
  pagination (`visits.ts`'s `getTodaysVisitsBounded()`), and a
  removed-visit policy (removed visits stay in the normalized record set
  for audit purposes but are excluded from every active/coverage count
  and from the UI's default visit list) all live here.
- **Workspace consumption** — `app/workspace/page.tsx` calls
  `getAxisCareTodaysSchedule()` once, server-side, inside its existing
  data-fetch `Promise.all`, and passes the vendor-neutral result down as
  a prop to `components/scheduling/TodaysSchedulePanel.tsx`. No component
  under `components/` imports an `AxisCareRaw*` type or calls AxisCare
  directly; no client/browser code touches AxisCare at all.
- **Feature flag boundary** — `AXISCARE_SCHEDULE_ENABLED`
  (`isAxisCareScheduleEnabled()` in `config.ts`) gates the entire feature
  before any credential lookup, independent of whether AxisCare
  credentials are configured. Server-only, no `NEXT_PUBLIC_` prefix;
  enforced by a repo-wide test that fails if any `app/`/`components/`
  file ever references the env var name directly.
- **Read-only data flow / error philosophy** — every request is `GET`
  only (`axisCareGet()` hardcodes the HTTP method, no override
  parameter exists). Every failure mode (not configured, authentication,
  authorization, timeout, upstream unavailable, invalid response,
  unknown, and now feature-disabled) maps to one fixed, generic,
  non-error-shaming or non-leaking message — never a raw vendor error
  string, never a stack trace, never exposes whether credentials exist
  when the feature is simply turned off.

### Data flow — AxisCare scheduling (current, live)

```
AxisCare
    ↓
AxisCare read-only adapter        (lib/integrations/axiscare/)
    ↓
Serve scheduling normalization    (lib/scheduling/normalize.ts)
    ↓
Vendor-neutral schedule models    (lib/scheduling/types.ts)
    ↓
Workspace schedule visibility     (components/scheduling/TodaysSchedulePanel.tsx)
    ↓
Future deterministic scheduling intelligence   (NOT YET IMPLEMENTED — Phase 2)
    ↓
Human review and action in source systems      (AxisCare Real Time View)
```

The "Future deterministic scheduling intelligence" stage does not exist
in the repository today — it is Phase 2 scope (see below), not a
description of current behavior.

### Separation among ingestion / normalization / reasoning / presentation / future AI

| Layer | Current state |
|---|---|
| Data ingestion | Live — `lib/integrations/axiscare/` |
| Normalization | Live — `lib/scheduling/normalize.ts` and related |
| Deterministic reasoning | Minimal — only status normalization (`status.ts`) exists; no exception/risk/recommendation engine yet |
| User presentation | Live — `components/scheduling/`, Workspace |
| Future AI assistance | Not implemented — Ask Serve remains a "Coming soon" placeholder; no LLM behavior exists anywhere in the scheduling path |

### Phase 2 — Operational Intelligence (architecture framing, not implementation)

Serve OS has completed its primary operational platform foundation and
is entering Phase 2. This phase is primarily about architecture — shared
reasoning infrastructure — not new pages. Full decision recorded in
`DECISION_LOG.md`'s 2026-07-13 entry. Principles:

- Deterministic before AI.
- Normalized domain models (the AxisCare/scheduling pattern above is the
  template every future vendor integration should follow).
- Explainable recommendations — every output must trace back to the
  specific field/rule that produced it.
- Evidence and provenance are tracked, not assumed.
- Human judgment remains authoritative over final operational decisions.
- LLMs assist reasoning and communication; they do not originate
  operational classifications deterministic logic could make instead.
- Vendor systems remain systems of record; Serve OS does not silently
  mutate vendor data.
- Every intelligence surface should answer: what should Serve know? what
  should Serve do? why?

Five initial intelligence domains are identified for **design**, not
implementation: Relationship Intelligence, Proposal Intelligence,
Scheduling Intelligence, Community Intelligence, Operational
Intelligence. **No intelligence kernel and no individual intelligence
engine exists in this repository as of this entry.**