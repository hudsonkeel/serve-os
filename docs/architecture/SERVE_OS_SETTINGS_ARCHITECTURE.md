# Serve OS Settings Architecture

`/settings` ([`app/settings/page.tsx`](../../app/settings/page.tsx)) is a
real authenticated page, not a decorative dead end. This document is the
durable reference for its section model, access model, current
implementation, and — most importantly — what must never be exposed
client-side as this page grows.

## Section model

Six sections, in this order:

1. **My Account** — the authenticated user's own identity and security.
2. **Users & Roles** — who has access and what they can do.
3. **Organization & Communities** — organization/community context.
4. **Workflow Configuration** — rules governing wellness, assessments,
   escalation.
5. **Integrations** — every external system Serve OS connects to or
   launches, and its real status.
6. **Governance & Audit** — audit-readiness and change history.

Each section is rendered by the page-local `SettingsSection` helper
(white card, icon, title, description) — not a new shared component, since
nothing else in the app renders this exact shape yet. If a second page ever
needs the same card shape, promote it to `components/ui/`.

## Integration presentation model

Every integration in [`app/settings/integrations.ts`](../../app/settings/integrations.ts)
(`IntegrationDefinition`) presents three architectural attributes, not just a
name and a status badge:

1. **Current Status** — one of `connected`, `external_launch`, `planned`, or
   `not_connected`, rendered with an unambiguous expanded label
   (`INTEGRATION_STATUS_LABELS`): "Connected Integration", "External System
   Link", "Planned Integration", "Not Connected". The short forms
   ("Connected" / "External Launch" / "Planned") were deliberately replaced
   — they read as more definitive than the underlying reality.
2. **Role in Serve OS** — a one-sentence statement of the system's
   operational responsibility and source-of-truth role (`role` field).
3. **Current / Future Scope** — `currentScope` and `futureScope` string
   arrays, rendered as a single middot-joined line each. Both are optional
   on the type (a future integration added later might genuinely have no
   future scope yet), but every integration defined today populates both.

### Status semantics

- **`connected`** — Serve OS has a real, verifiable data relationship.
  Reserved for Supabase (required env vars validated at startup via
  `lib/env.ts`) and Resend when `RESEND_API_KEY` is present. Never assigned
  because a launch URL merely exists.
- **`external_launch`** — Serve OS only opens the system in a new tab; it
  holds no data relationship with it. This is the status for Serve Intake,
  CINCH CCM, AxisCare, Apploi, Viventium, Dialpad, and Google Workspace
  today.
- **`not_connected`** — a real integration path exists (an env var Serve OS
  checks) but the check currently fails. Today this is only Resend without
  `RESEND_API_KEY` set.
- **`planned`** — no code, env var, or data path exists anywhere in the
  repo yet. Reserved for SAS Answering Service. **Do not add a separate
  "Trial" status** — a vendor trial being underway is communicated through
  `currentScope` ("Trial in progress"), not through the status enum.

### Role semantics

One sentence, stated as fact about what the *external system* owns or does
— never what Serve OS will eventually do with it. E.g. "Downstream system of
record for community-care delivery," not "Will eventually sync community
care data."

### Current vs. future scope rules

- `currentScope` describes only what is true **today**. For external-launch
  systems with no real data integration, this is honest and short — e.g.
  AxisCare's `currentScope` is `["External launch only", "Traditional
  home-care scheduling, EVV, visit execution, and related operations remain
  in AxisCare"]`, not a blank field.
- `futureScope` describes plausible future integration surface — never a
  commitment or a timeline. Every future-scope bullet in the current data
  set is qualified with words like "future," "planned," or "where
  supported" rather than stated as settled fact.
- **Never state or imply:** automatic synchronization, an existing API
  integration, connected messaging, or workflow automation for any system
  whose status is `external_launch` or `planned`. Future write access is
  never described as guaranteed — every write-capable future bullet
  includes a qualifier ("where supported," "subject to API access," "subject
  to supported access").

### Data direction definitions

Free-text, but drawn from a small consistent vocabulary: `"Read / write"`
(Supabase), `"Outbound"` (Resend), `"Launch-only today; future  ..."` (every
external-launch system, naming what future direction would look like), and
`"Not yet integrated; future ..."` (planned systems with no current data
path at all).

### Source-of-truth requirement

Every integration names which system — Serve OS or the external vendor —
is authoritative for the data it holds today. This is never left blank; if
an external system is the source of truth only for a specific slice (e.g.
"CINCH CCM for community-care execution," not "CINCH CCM" alone), the
qualifier is included so the boundary is unambiguous.

## Access model

Built on the existing role model (`AUTH_ROLES = ["admin", "manager",
"executive", "operations"]`, [`lib/auth/constants.ts`](../../lib/auth/constants.ts)) —
no new role names were invented.

| Section | Visible to |
|---|---|
| My Account | All authenticated users |
| Users & Roles | manager, executive, admin |
| Organization & Communities | manager, executive, admin |
| Workflow Configuration | manager, executive, admin |
| Integrations | manager, executive, admin |
| Governance & Audit | manager, executive, admin |

`operations` is the frontline role and sees only My Account; an honest
one-line notice explains the rest is visible to managers and above. This is
a **content-visibility** boundary within the page, layered on top of
route-level auth: `/settings` (like every other non-public route) is
already gated by [`proxy.ts`](../../proxy.ts), which redirects any request
without a valid, authorized session to `/login` before the page ever
renders. No write action exists behind any Settings section yet, so there
is nothing today that content-hiding alone could unsafely expose. **This must not become the only protection once a real
write action (invite user, edit a rule, rotate a credential) is built** —
that action must be authorized server-side (a server action checking
`profile.role`, mirroring how `getCurrentAuthorizedUser()` already gates
data fetches elsewhere), not merely hidden by a client-visible `if`.

## Current implementation (this task)

- **My Account:** real data from `getCurrentAuthorizedUser()` /
  `buildCurrentUserDisplay()` — name, email, role, and the app's existing
  Central Time (`America/Chicago`) convention. One action: a link to the
  existing `/forgot-password` flow (no new server action; reuses the
  production password-reset path as-is).
- **Users & Roles:** honest "Administration setup pending" state — access
  today is provisioned directly in Supabase, not from Serve OS. Future
  capabilities listed, not built.
- **Organization & Communities:** real values only — organization name
  ("Serve Caregiving"), the current community's name from
  `getCommunityMetrics()`, active community count (1, since Serve OS
  currently operates against a single community), and the same Central
  Time convention. No new organization schema.
- **Workflow Configuration:** "Configuration coming later" — a documented
  list of future rule categories, no editable controls.
- **Integrations:** ten `IntegrationDefinition` rows in
  [`app/settings/integrations.ts`](../../app/settings/integrations.ts) —
  see "Integration presentation model" above for the full status/role/scope
  rules. Supabase and Resend are the only two with a real `connected` /
  `not_connected` distinction (Resend via a presence-only
  `Boolean(process.env.RESEND_API_KEY)` check); the seven external-launch
  systems and SAS Answering Service (`planned`, trial acknowledged via
  `currentScope`, not a new status) are fixed architectural facts, not
  derived from any runtime check.
- **Governance & Audit:** future-state description only — no audit table
  or viewer exists yet, so none was built.

## What must never be exposed client-side

- Supabase service-role key, anon key, or URL values themselves (only
  *whether the app is configured*, never the configuration).
- `RESEND_API_KEY` or any other secret's value — presence only.
- Any future integration credential (CINCH/AxisCare API keys, Apploi/
  Viventium tokens, Dialpad/Google OAuth secrets) if those are ever added.
- Raw Supabase Auth tokens or session internals beyond what
  `buildCurrentUserDisplay()` already safely derives.

## Deliberately deferred (not built in this task)

- User invitation, deactivation, role assignment, community access
  management, forced password reset, permission-change audit, role-based
  session timeout.
- Editable organization identity, community records, operating hours,
  service areas, contact details, branding, community-specific rules.
- Any editable workflow rule (wellness follow-up rules, assessment
  intervals, care-plan review intervals, priority definitions, escalation
  thresholds, prospect statuses, notification recipients, communication
  requirements).
- Integration credential management.
- A full audit-log viewer.
- New database migrations — none were needed or added; every field shown
  is either already-fetched profile/community data or an environment
  presence check.
