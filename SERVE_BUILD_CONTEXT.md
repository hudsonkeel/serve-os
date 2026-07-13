# SERVE_BUILD_CONTEXT.md

# Serve Caregiving Build Context
_Last Updated: 2026-07-13 (documentation checkpoint)_
_Current Revision: v.0.4_

---

# READ THIS FIRST — 2026-07-13 Correction

Everything under "Current Session Context" immediately below (Active
Focus, Current Goal, Do Not Do Today) is **historical** — it describes
the state as of 2026-06-29 and is now stale on its central claims.
Preserved for history, not deleted; **do not treat it as current**. In
particular: "Deploying Serve OS to production" and "Authentication not
yet implemented" (further down, under Current Constraints) are both
**false as of this update**. Use this section and the sections below it
instead.

## What Serve Caregiving is

Serve Caregiving provides senior care in two models: **Traditional Home
Care** (visit-based, scheduled via AxisCare) and **Community Care**
(delivered within a residential community, via CINCH CCM). **Watermere**
is the residential community whose residents are Serve OS's first live
resident dataset (307 active residents imported).

## What Serve OS is, and what it intentionally does not replace

Serve OS is the operational intelligence and coordination layer above:
AxisCare (Traditional Home Care scheduling/execution), CINCH CCM
(Community Care execution), Apploi (recruiting), Viventium (HR/payroll),
Google Workspace (email/documents), Dialpad (phone), and SAS Specialty
Answering Service (planned). It does **not** intend to replace any of
these as a system of record or execution. It provides context,
prioritization, operational memory, and (in Phase 2) intelligence, and
launches the right external system when execution work must happen
there.

## Current architecture (accurate as of 2026-07-13)

- Next.js 16 (App Router, Turbopack) / React 19 / TypeScript / Tailwind
  v4 / Supabase.
- Design System 2.0 (Blue & White) applied to the core operational
  surfaces — see `docs/design/SERVE_DESIGN_SYSTEM_2.md`.
- Operating model: Dashboard = Know, Workspace = Do, Residents = Manage,
  Community Intelligence = Think proactively, Ask Serve = Think on
  demand, Communications = Coming Soon, Settings = configure/govern.
- Full detail in `ARCHITECTURE.md`'s 2026-07-13 checkpoint entry.

## Completed modules (Phase 1 — see `MILESTONES.md` for full detail)

Authentication (Supabase Auth — login, forgot-password, reset-password,
fully self-service, **now live**, not a future item), Workspace,
Dashboard, Residents (directory, search, profiles, Connections, Wellness
Manager/Observations/Follow-Ups/Watch), Prospects, Recruiting, Ask Serve
(placeholder), Community Intelligence (framework), Settings, navigation
architecture, Design System 2.0, **read-only AxisCare scheduling
integration** (see next section).

## AxisCare scheduling state (the newest major work)

- `lib/integrations/axiscare/` — server-only, GET-only vendor adapter.
  Live-verified. No write capability exists — `axisCareGet()` hardcodes
  `method: "GET"`.
- `lib/scheduling/` — vendor-neutral normalization
  (`ServeScheduleVisit`, `ServeTodaysScheduleResult`), deterministic
  status rules, timezone-safe parsing, bounded pagination.
- `components/scheduling/TodaysSchedulePanel.tsx` — live in Workspace,
  manually validated against AxisCare Real Time View.
- Gated behind `AXISCARE_SCHEDULE_ENABLED` (server-only, off by default).
  **Production must stay disabled until Hud explicitly approves.**
- Currently on branch `feature/axiscare-read-only-schedule`, pushed to
  `origin`, **not yet merged to `main`**.
- Full detail: `docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md`,
  `docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`.

## Current branch and deployment conventions

- Feature work happens on `feature/*` branches off `main`; `main` is the
  production-review branch (confirmed via `git remote show origin`).
- Node-native TypeScript execution (`node --experimental-strip-types
  --conditions=react-server`) is used for standalone scripts/tests under
  `lib/integrations/axiscare/` and `lib/scheduling/` only — everywhere
  else in the app uses normal Next.js bundling. See `package.json`
  scripts (`test:axiscare`, `test:scheduling`, `axiscare:discover`,
  `schedule:preview`).
- **Deploy platform is unresolved.** `netlify.toml` exists and documents
  Netlify as the target, but live evidence (a GitHub check-run query on
  a recent push) shows Vercel is what actually auto-deploys this
  repository. Do not assume either platform's environment-variable
  configuration is the one that matters until this is reconciled with
  Hud. See `ARCHITECTURE.md`'s 2026-07-13 entry.

## Phase 2 objective

Serve OS has completed its Phase 1 operational platform foundation and
is entering **Phase 2 — Operational Intelligence**: deterministic
intelligence engines (not new pages) that explain, prioritize,
recommend, monitor, remind, identify risk, preserve relationships, and
reduce administrative burden. Five domains identified for design:
Relationship Intelligence, Proposal Intelligence, Scheduling
Intelligence, Community Intelligence, Operational Intelligence. **None
implemented yet — design/architecture stage only.** Principles:
deterministic before AI, normalized domain models, explainable
recommendations, evidence/provenance, human judgment remains
authoritative, vendor systems remain systems of record. Full detail:
`ARCHITECTURE.md`, `DECISION_LOG.md` (2026-07-13 entries).

## Current known investigations (open, not resolved)

- **Recruiting test-data cleanup** — website test inquiries remain in
  recruiting-related data. Source table(s) not yet confirmed. One
  intentional standardized test record may be meant to remain. No
  deletion has occurred.
- **Workspace Follow-Ups metric** — the displayed count may be
  incorrect. Query lineage, source table, filters, row-vs-resident-count
  semantics, and completed/cancelled inclusion all need confirmation. No
  logic correction has occurred.
- **Deploy platform discrepancy** — see above.

## Immediate next engineering priorities

1. Reconcile the Vercel/Netlify deploy-platform discrepancy with Hud.
2. Trace and confirm (or fix) the Workspace Follow-Ups metric.
3. Confirm and safely clean up recruiting test data (not yet done).
4. Get explicit approval before enabling `AXISCARE_SCHEDULE_ENABLED` in
   production, and before merging `feature/axiscare-read-only-schedule`.
5. Begin Phase 2 architecture design (intelligence kernel: shared
   rule/signal/recommendation/evidence/outcome model) — design first,
   not broad feature construction.

## Documentation discipline expectations

- This file, `CURRENT_STATUS.md`, `ARCHITECTURE.md`, `CHANGELOG.md`,
  `DECISION_LOG.md`, `ENVIRONMENT.md`, `MILESTONES.md`, and
  `PRODUCTION_READINESS.md` are the canonical governance/status
  documents. Update them when they drift from the repository, not just
  when a feature ships — this checkpoint exists because a prior
  documentation update did not complete.
- Never document a feature as complete/live because a route or component
  exists — verify it's actually wired to real data and reachable.
- Preserve historical sections; mark superseded claims explicitly rather
  than deleting them (as done above).
- Never write a real credential, token, or secret value into any
  documentation file.

---

# Current Session Context *(historical — 2026-06-29, superseded above)*

## Active Focus
- Deploying Serve OS to production so staff can begin using recruiting and prospect workflows.
- Wiring live environment variables so email notifications and deep-links are active.
- Connecting the public `/get-started` entry to the live Supabase production database.

## Current Goal
Get the completed recruiting and intake workflows live in production so Serve staff can begin using them — even behind the scenes without a public launch.

## Do Not Do Today
- Do not rewrite the architecture.
- Do not overbuild authentication, compliance, or enterprise features before the workflow is deployed.
- Do not replace Cinch; design around Cinch as the downstream operational system.
- Do not couple systems that should remain independent (see Architecture Checkpoint section).

---

# Project Purpose

Serve Caregiving is building an AI-assisted operational platform that reduces administrative burden while improving the quality, consistency, and speed of care delivery.

The long-term vision is **Serve OS**, an internal operating system that supports every operational workflow while preserving the human-centered nature of caregiving.

This repository should prioritize:

- Operational simplicity
- Staff usability
- Human review
- Structured data
- Reusable architecture
- Future AI capabilities

---

# Guiding Principles

## AI Assists — Humans Decide

AI should:

- Capture information
- Structure information
- Recommend actions
- Generate drafts

Humans should:

- Review
- Approve
- Modify
- Execute

Never build fully autonomous clinical or operational workflows.

---

## Build Operational Workflows Before Writing Code

Current philosophy:

Understand Workflow

↓

Document Workflow

↓

Simplify Workflow

↓

Automate Workflow

Avoid automating broken processes.

---

## Build Once. Reuse Everywhere.

Infrastructure should support multiple future workflows.

Examples:

- Client Intake
- Employee Recruiting
- Employee Onboarding
- Resident Assessments
- Care Plans
- Future PreServe platform
- Internal operational tools

---

## Structured Data First

Always prefer:

Facts

Relationships

Objects

Schemas

over

Documents

Paragraphs

Free text

The transcript is temporary.

Structured facts are permanent.

---

# Overall Architecture

## Current Vision

**Care Seeker Path**
```
Website (/get-started?mode=care)
↓
Prospect Intake (progressive conversation)
↓
Canonical Assessment Record
↓
AI Review
↓
Human Approval
↓
Operational Systems (Cinch)
↓
Serve OS Dashboard
```

**Employee / Recruiting Path**
```
Website (/get-started?mode=careers)
↓
RecruitingPanel (role select → form → confirmation)
↓
recruiting_leads (Supabase)
↓
Notification (Resend → staff email)
↓
Serve OS /recruiting (status workflow, human review)
↓
Apploi (caregiver formal application, optional)
```

---

# Canonical Record Strategy

One of the most important architectural decisions.

Current philosophy:

The structured assessment should exist outside Cinch CCM.

Reasons:

- Version history
- Auditability
- AI reasoning
- Vendor independence
- Easier integrations
- Future analytics
- Future PreServe platform

Cinch should receive only the approved operational subset.

---

# Current Major Workstreams

---

## Website / Public Entry

Status

🟢 MVP Functional

Purpose

Public-facing brand and unified entry experience.

Current capabilities

- `/get-started` is the single public entry point for all relationship types
- Mode-switching: `?mode=care` (prospect intake) / `?mode=careers` (recruiting)
- `RelationshipSelector` tile UI — care seekers and job seekers choose their path
- `/careers` redirects to `/get-started?mode=careers` for external link compatibility

Future sections

- Existing Clients portal
- Employee portal (post-authentication)
- Public marketing pages

Current hosting

- Netlify (production)
- GitHub (source)
- Development environment separate from production

Next priorities

- Wire `/get-started` to production Supabase
- Authentication
- Employee portal

---

## Serve Intake

Status

🟢 MVP Functional

Purpose

Convert conversations into structured operational records.

Current workflow

Transcript

↓

Extraction

↓

Assessment

↓

Pricing

↓

Proposal

↓

Save Assessment

↓

Push to Cinch (next)

Current capabilities

- Transcript upload
- AI extraction
- Structured assessment
- Proposal generation
- Pricing engine
- Assessment persistence
- Cinch mapping
- HTML/PDF deliverables
- Source evidence toggle
- Human review screen

The assessment pipeline has already demonstrated generation of structured resident summaries, care needs, pricing recommendations, proposal emails, and mapped intake fields from conversation transcripts. :contentReference[oaicite:0]{index=0}

Future additions

- Live call processing
- Faster inference
- Better retry handling
- Direct Cinch API
- Better validation

---

## Serve OS

Status

🟡 Dev-Complete, Not Yet Deployed

Purpose

Daily operating system for office staff.

Current modules

- Dashboard: greeting, prospect count, follow-up count, assessment count
- Prospects: `/residents` — prospect management (live Supabase reads)
- Recruiting: `/recruiting` — recruiting lead inbox with status workflow
  - Filter tabs by status with live counts
  - Workflow actions: advance status via dropdown
  - Apploi redirect tracking visible in table

Active modules (built, pending deployment)

- Notification service: event-driven email via Resend
  - Recruiting lead notifications wired
  - Prospect notifications typed but pending deployment

Coming Soon (sidebar-visible, not yet built)

- Scheduling
- Communications
- Care Plans

Future modules

- Tasks
- Alerts
- CRM
- Reporting
- AI Daily Brief

---

# Operational Workflows

## Client Lifecycle

Current documented flow

Client Inquiry

↓

Prospect

↓

Assessment

↓

Service Agreement

↓

Care Plan

↓

Proposal

↓

Client

↓

Scheduling

↓

Care Delivery

↓

Monitoring

↓

Adjust Services

↓

Discharge

Current status

✔ Process documented

✔ Ownership identified

✔ Workflow mapped

---

## Employee Lifecycle

Current progress

- Recruiting
- Screening
- Interview
- Background Check
- E-Verify
- Hiring
- Orientation

Still expanding.

---

# Current Technology Stack

## Public Website

Current

Netlify

GitHub

Future

Serve OS Authentication

---

## Cinch CCM

Purpose

Operational execution.

Handles

- Clients
- Assessments
- Visit Plans
- Scheduling
- Care documentation

Current philosophy

Cinch is the operational system.

It should not become the AI intelligence layer.

The current implementation goal is to push approved structured assessment data into Cinch after human review rather than originating intake inside Cinch. :contentReference[oaicite:1]{index=1}

---

## AxisCare

Purpose

Traditional home care scheduling.

Future integration likely.

---

## Dialpad

Purpose

Phone system.

Future

- Call recording
- AI summaries
- Intake automation

---

## Resend

Purpose

Transactional email notifications.

Current use

- Recruiting lead alerts to staff (caregiver and MD leads)
- Event-driven: `emitEvent()` in `lib/notifications/`
- Recipients from env vars (`SERVE_NOTIFY_RECRUITING`, `SERVE_NOTIFY_LEADERSHIP`)

Future

- Prospect notifications (rules typed, not yet wired)
- Assessment completion alerts
- Client onboarding communications

---

## Apploi

Recruiting.

---

## Viventium

Payroll

HR

Employee onboarding

---

## Sapphire

Background checks.

---

# Important Decisions

## Deterministic Pricing

Pricing is never generated by AI.

AI extracts facts.

Pricing engine calculates price.

Benefits

- Explainable
- Repeatable
- Auditable

---

## Human Review

Current philosophy

AI

↓

Review Screen

↓

Human Approval

↓

Operational Systems

Never allow AI to push records directly into production without review.

---

## Prompt Design

Always prefer

- JSON
- Deterministic outputs
- Small prompts
- Repeatable extraction

Avoid

- Creative responses
- Long narrative output

---

## Notification Architecture

Notifications originate from events, not directly from forms.

Pattern:

Server Action emits event → `emitEvent()` → rules match → channel dispatches

Benefits:

- Forms do not need to know who receives notifications
- New channels (SMS, Slack, push) require no caller changes
- New events are added in `types.ts` only; rules added in `rules.ts`
- Recipients change via env vars — no deploy needed

Current channels: email (Resend)

Future channels: SMS, Slack, in-app push

---

## Recruiting as a Separate Entity

`recruiting_leads` is intentionally separate from `prospects`.

Reasons:

- Different relationship type (employee vs. care seeker)
- Different lifecycle (recruiting pipeline vs. intake → care delivery)
- Different operational owner
- Different downstream systems (Apploi, Viventium vs. Cinch)

Do not merge these tables.

---

# Compliance Considerations

Current assumptions

Eventually support

- HIPAA
- Audit logging
- Version history
- User accountability
- Minimum necessary access
- Human approval workflow

Current MVP prioritizes learning and workflow validation before complete compliance implementation.

---

# Staff Experience Goals

Everything should reduce

- Typing
- Clicking
- Searching
- Duplicate work
- Context switching

Every screen should answer

"What is the next thing I should do?"

---

# Current Constraints *(historical section — see "READ THIS FIRST" at the top for corrections)*

## Technical

- ~~Serve OS not yet deployed — all workflows are dev-only.~~ **Superseded 2026-07-13: Serve OS is deployed and operational (pilot status); see "READ THIS FIRST" above.** Deploy platform itself (Vercel vs. Netlify) is unreconciled.
- Email notifications inactive until `RESEND_API_KEY`, `SERVE_APP_URL`, and `SERVE_NOTIFY_*` env vars are set in production. *(Status of these specific env vars in the actual production/deploy environment not re-verified as part of this documentation checkpoint.)*
- `NEXT_PUBLIC_APPLOI_CAREGIVER_URL` not yet set — Apploi redirect button will not appear in production until this is configured. *(Not re-verified this checkpoint.)*
- Prospect notification rules (`prospect.created`, `prospect.completed`) are typed but commented out — wire after deployment. *(Not re-verified this checkpoint.)*
- Cinch API availability still unknown.
- ~~Authentication not yet implemented.~~ **Superseded 2026-07-13: Supabase Auth is live — login, forgot-password, reset-password, route protection via `proxy.ts`.**
- Large prompts occasionally increase processing time.

---

## Operational

Office staff have limited time.

The software must feel easier than paper.

Training burden must stay low.

---

## Business

Current focus is proving value.

Enterprise architecture can mature later.

Speed matters.

Correctness matters more.

---

# Open Questions

Deployment

- What is the exact Netlify deploy configuration for Serve OS?
- Which environment variables need to be set before first deploy?
- Are Supabase production migrations applied?

Notifications

- Who specifically should receive caregiver lead notifications (`SERVE_NOTIFY_RECRUITING`)?
- Who specifically should receive MD lead notifications (`SERVE_NOTIFY_LEADERSHIP`)?
- What is the Apploi caregiver application URL (`NEXT_PUBLIC_APPLOI_CAREGIVER_URL`)?
- When do we wire `prospect.created` / `prospect.completed` notification rules?

Authentication

- What is the authentication strategy — Supabase Auth, Clerk, or other?
- Should authentication be added before or after first deployment?
- What is the minimum role model needed at MVP (admin only, or role-based)?

Website / Public Entry

- When does `/get-started` point to production Supabase vs. dev?
- Is Netlify production deployment already live, or still pending?

Serve OS

- Who is the initial user (Elizabeth Butler placeholder — when does this become real auth)?
- When do we wire `prospect.created` notification rules?

Serve Intake

- Cinch API — is access available?
- Direct Cinch push — when does this become a priority?

Relationship Intelligence

- When does `relationship_events` table get introduced?
- Every meaningful interaction (lead created, status changed, prospect contacted) should eventually become a relationship event — when do we start?

---

# Near-Term Priorities

Completed

- ✅ Unified Public Entry (`/get-started` dual-mode)
- ✅ Recruiting lead capture (public form → Supabase)
- ✅ Recruiting → Serve OS (inbox, status workflow, workflow actions)
- ✅ Resend notification architecture (event-driven, email channel)
- ✅ Recruiting status vocabulary aligned to operations

Highest Priority (current)

- ⬜ Deploy Serve OS to production
- ⬜ Wire production environment variables (Resend, SERVE_APP_URL, recipients, Apploi URL)
- ⬜ Verify live recruiting lead → Supabase → email notification end-to-end
- ⬜ Connect `/get-started` to production Supabase (prospects + recruiting leads)
- ⬜ Employee authentication

Medium Priority

- ⬜ Wire `prospect.created` / `prospect.completed` notification rules
- ⬜ Relationship Timeline (`relationship_events` table)
- ⬜ Assessment Intelligence integration with Serve OS
- ⬜ CRM / prospect management enhancements
- ⬜ Reporting

Future

- Client Portal
- Employee Portal
- Family Portal
- Scheduling
- Knowledge Base
- Operational Intelligence
- AI Daily Brief
- PreServe

---

## Long-Term Vision

- Serve OS is not a CRM.
- Serve OS is not an intake application.
- Serve OS is not an assessment application.
- Those are modules.
- Serve OS is an Operational Intelligence Platform.
- Every workflow should ultimately answer:
- What happened?
- What should happen next?
- Who owns it?
- Has it happened?
- What risks exist?
- What should be surfaced to leadership?
- Everything else exists to support those questions.

---

# Lessons Learned

- Understand operations before coding.
- Structured data beats documents.
- Every workflow should remove duplicate work.
- AI should assist, not replace.
- Build reusable systems.
- Simplicity wins.
- Every feature should save staff time.

---

# Decisions Log

See [DECISION_LOG.md](./DECISION_LOG.md) for the full append-only decision log.

Summary of key decisions:

| Date | Decision |
|------|----------|
| 2026-06-28 | Separate canonical assessment from Cinch |
| 2026-06-28 | Build Intake before Serve OS |
| 2026-06-28 | Human review mandatory before operational push |
| 2026-06-28 | Deterministic pricing engine |
| 2026-06-28 | Workflow-first development |
| 2026-06-28 | Netlify as production host |
| 2026-06-29 | `/get-started` as unified public entry |
| 2026-06-29 | `recruiting_leads` separate from `prospects` |
| 2026-06-29 | Event-driven notification architecture |
| 2026-06-29 | Email recipients from env vars |
| 2026-06-29 | Apploi redirect optional; MD has no Apploi path |
| 2026-06-29 | `/careers` redirects, not a separate page |
| 2026-06-29 | Recruiting status vocabulary aligned to operations |

---

# Developer Notes

When making changes:

Ask:

- Does this reduce staff work?
- Does this create reusable infrastructure?
- Does this preserve structured data?
- Does this maintain human review?
- Does this fit the long-term Serve OS vision?

If the answer is "no", reconsider the implementation before coding.

---

# AI Agent Instructions

Before changing architecture:

1. Read this document.
2. Preserve existing design decisions unless intentionally changing them.
3. Prefer extending reusable systems over creating one-off solutions.
4. Do not duplicate workflows already represented elsewhere.
5. Keep the user experience simple for non-technical office staff.
6. Optimize for long-term maintainability rather than short-term convenience.
7. If unsure, favor modular, composable architecture over tightly coupled implementations.

## July 1, 2026

Serve OS entered Operational Pilot.

Major philosophy shift

The project is no longer focused primarily on building software.

The project is focused on simplifying daily work.

Current priority order

1. Employee usability

2. Operational workflow

3. Live data

4. AI assistance

5. Intelligence

Artificial intelligence should support work rather than become the product.

Current design philosophy

Employees should begin every day inside Serve OS.

Workspace becomes the operational starting point.

Dashboard becomes executive intelligence.

Residents remain the canonical business object.

External systems execute work.

Serve OS organizes work.

Long-term vision

Replace external execution platforms gradually while preserving employee workflow.

Success metric

Employees no longer ask:

"Where do I go?"

Instead they ask:

"What work do I need to complete today?"

## Current Build Philosophy

The website should remain intentionally simple.

Public website responsibilities:

- Marketing
- Trust
- Lead capture

Serve OS responsibilities:

- Intelligence
- Operational workflow
- CRM integration
- AI extraction
- Notifications

Current architecture intentionally separates these concerns.

Future integrations should enhance the website without coupling marketing pages to internal operational systems.

Multiple public forms are acceptable when they improve user experience.

Backend systems should consolidate these into one canonical intake record.

Architectural clarification

Serve distinguishes between two fundamentally different business concepts:

Care Inquiry

An inbound request for care regardless of acquisition channel.

Serve Prospect

A resident within a community who has not yet become an active Serve client.

These concepts are intentionally separate.

Future qualification workflow:

Care Inquiry
↓

Qualification

↓

Community Care
or

Traditional Home Care

↓

Serve Client

## Current Product Direction

The homepage is no longer viewed solely as a marketing experience.

It is now considered the beginning of the Serve operational platform.

The website initiates the relationship.

Supabase becomes the canonical Care Inquiry datastore.

Serve OS operationalizes the relationship.

Future work centers on a unified Care Inquiry architecture spanning:

- Family Care Inquiry
- Professional Referral
- Community Partners
- Future marketing channels
- AI Assessment Engine

## 2026-07-06

### Product Vision Refinement

A significant product philosophy refinement was made today.

Serve OS is no longer viewed as simply another application.

It is being designed as the operational layer that connects every system employees use throughout the day.

Target workflow:

Employee
→ Serve OS
→ Today's Work
→ Resident Context
→ Launch Appropriate Operational System

Long-term success will be measured by reduced cognitive load, fewer clicks, clearer priorities, and improved daily employee workflow rather than the number of individual features delivered.