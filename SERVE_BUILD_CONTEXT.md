# SERVE_BUILD_CONTEXT.md

# Serve Caregiving Build Context
_Last Updated: June 2026 (session 2026-06-29)_
_Current Revision: v.0.3_

---

# Current Session Context

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

# Current Constraints

## Technical

- Serve OS not yet deployed — all workflows are dev-only.
- Email notifications inactive until `RESEND_API_KEY`, `SERVE_APP_URL`, and `SERVE_NOTIFY_*` env vars are set in production.
- `NEXT_PUBLIC_APPLOI_CAREGIVER_URL` not yet set — Apploi redirect button will not appear in production until this is configured.
- Prospect notification rules (`prospect.created`, `prospect.completed`) are typed but commented out — wire after deployment.
- Cinch API availability still unknown.
- Authentication not yet implemented.
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

End of document.