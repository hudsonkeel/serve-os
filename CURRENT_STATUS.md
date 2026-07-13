# CURRENT_SESSION.md

---

## Session 2026-06-28

### Completed
- Connected Netlify repository
- Unified dashboard metrics
- Added SERVE_BUILD_CONTEXT.md documentation

### Decisions
- Netlify remains production host
- Human review remains mandatory before any operational push

### Architecture
- Continue canonical assessment outside Cinch

### Blockers
- Waiting for production access

---

## Session 2026-06-29

### Completed

**Unified Public Entry**
- `/get-started` is now the single public entry point for both care seekers and job seekers
- Accepts `?mode=care` (default) or `?mode=careers` query param
- `RelationshipSelector` component: "I need care" / "Join Our Team" dual-path tile UI
- `/careers` URL redirects to `/get-started?mode=careers` so external links continue working
- `LeftPanel` copy adapts to mode (care vs. careers)

**Recruiting Lead Capture (Public)**
- `RecruitingPanel` embedded in `/get-started` under the careers path
- 3-step flow: Role Select → Form → Confirmation
- Two roles: Caregiver / Managing Director
- Caregiver fields: ZIP code, availability, experience level
- Managing Director fields: city/state, LinkedIn URL, open-ended message
- Confirmation step includes optional Apploi redirect for caregivers (tracked via `apploi_redirected_at`)
- MD confirmation is internal-only; no Apploi redirect

**Recruiting → Supabase**
- `recruiting_leads` table with full schema
- Two migrations applied:
  - `20260629000000_create_recruiting_leads.sql` — table + indexes + RLS
  - `20260629000001_update_recruiting_leads_status.sql` — vocab alignment
- Email deduplication: upserts by (email, role_interest) on repeat submissions
- TypeScript types in `lib/supabase/types.ts`
- Server action: `saveRecruitingLead()` in `lib/actions/recruiting.ts`

**Recruiting Status Workflow**
- 7-status pipeline: `new → contacted → in_review → applied → not_a_fit → hired → archived`
- `updateRecruitingLeadStatus()` server action
- DB constraint enforced at the Supabase level

**Recruiting → Serve OS**
- `/recruiting` page: server-rendered, force-dynamic
- `RecruitingInbox` component: filterable table by status with live counts
- `RecruitingStatusBadge` component
- `RecruitingWorkflowActions` component: dropdown to advance status, refreshes page on change
- Sidebar: "Recruiting" nav item added (`/recruiting`)

**Resend Notification Architecture**
- `lib/notifications/` — event-driven notification service
  - `types.ts` — typed event union (`NotificationEventType`, payload shapes)
  - `rules.ts` — pure-code rules mapping events to recipients and HTML email templates
  - `channels/email.ts` — Resend API integration with HTML escaping
  - `index.ts` — `emitEvent()` as the single entrypoint
- Events wired: `recruiting_lead.caregiver_created`, `recruiting_lead.md_created`
- Events typed but not yet wired: `prospect.created`, `prospect.completed`
- Recipients from env vars — changeable without a deploy

**Environment Variable Standardization**
| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend email sending |
| `SERVE_APP_URL` | Base URL for "View in Serve OS" links in emails |
| `SERVE_NOTIFICATION_FROM` | Sender address (default: `Serve OS <alerts@servecaregiving.com>`) |
| `SERVE_NOTIFICATION_REPLY_TO` | Optional reply-to address |
| `SERVE_NOTIFY_RECRUITING` | Comma-separated recipients for caregiver leads |
| `SERVE_NOTIFY_LEADERSHIP` | Comma-separated recipients for MD leads |
| `NEXT_PUBLIC_APPLOI_CAREGIVER_URL` | Apploi URL for caregiver application redirect |

### Decisions
- Recruiting leads are a separate Supabase table from prospects — different entity type, different lifecycle
- Notification system is event-driven: server actions emit events; rules handle routing and templating
- Email recipients live in env vars — no admin UI needed to change them
- Apploi redirect is tracked but optional; MD role has no Apploi path
- `/careers` redirects rather than duplicates the entry experience

### Blockers / Open Items
- Serve OS not yet deployed — email deep-links in notification emails are inactive
- `RESEND_API_KEY`, `SERVE_APP_URL`, `SERVE_NOTIFY_RECRUITING`, `SERVE_NOTIFY_LEADERSHIP` not yet set in production
- `NEXT_PUBLIC_APPLOI_CAREGIVER_URL` not yet set in production
- `prospect.created` / `prospect.completed` notification rules are typed but commented out — wire when Serve OS is deployed

---

## Session 2026-06-30

### Focus
TBD — pending roadmap discussion.

### Candidate Next Milestone
Deploy Serve OS (unlocks email links, live prospect pipeline, and all future staff workflows).

### Pre-Deployment Checklist
- [ ] Set `RESEND_API_KEY` in production environment
- [ ] Set `SERVE_APP_URL` to production URL
- [ ] Set `SERVE_NOTIFY_RECRUITING` recipient list
- [ ] Set `SERVE_NOTIFY_LEADERSHIP` recipient list
- [ ] Set `NEXT_PUBLIC_APPLOI_CAREGIVER_URL`
- [ ] Apply Supabase migrations in production
- [ ] Verify live recruiting lead submission → Supabase → email notification flow
- [ ] Verify Serve OS `/recruiting` page reads live data
- [ ] Confirm Supabase connection strings point to production (not development)
# Current Status

Overall

Serve OS is operational for pilot usage.

Completed

✓ Authentication
✓ Employee login
✓ Website integration
✓ Employee Portal
✓ Workspace
✓ Resident database
✓ Live resident detail pages
✓ Live resident directory
✓ Resident relationship staging
✓ Contact staging
✓ External system launchers
✓ Community Intelligence foundation

Current focus

- Employee usability
- Resident relationship refinement
- Proposal Builder
- Assessment workflow
- Timeline / Activity feed

Not yet complete

- Native proposal engine
- Timeline
- Relationship intelligence
- Native care management
- Native recruiting

Employee authentication complete.

Employees can:
- Sign in
- Reset forgotten passwords
- Recover accounts without administrator assistance

## 2026-07-03 Status

### Production

✅ Public website deployed successfully.

Production branch:
fix/static-site-cleanup

### Website Forms

Verified working:

- Managing Director Application
- Caregiver Application
- Professional Referral
- Family Consultation
- Partner Referral

Testing confirmed:

- Native Netlify POST working
- Submission accepted page functioning
- Netlify detecting submissions correctly

Observation:

Many development/test submissions were automatically classified as spam by Netlify/Akismet due to repeated testing with placeholder data.

No production code issue identified.

### SERVE-WEBSITE Repository

Added:

- .gitignore
- .env.example

Protected:

- .env.local from accidental commits

Partner Referral HTML corrected and standardized.

## Current Status

Public website conversational intake is feature complete.

Verified:

✅ UX
✅ Netlify Forms
✅ Deploy Preview
✅ Supabase writes
✅ Resend notifications
✅ Operational terminology

Next milestone:

Connect Care Inquiries into Serve OS operational workflows and visualization.

Production deployment pending leadership review.

Employee Login Audit - 07-05-2026
Employee Login audit completed. Determined old portal implementation mixed navigation and embedded OS workflows. Future Login implementation will be integrated into the conversational website experience instead of restoring legacy navigation.

## Current Development Status (2026-07-05)

Completed

- Version A conversational homepage is feature complete.
- Version B progressive homepage prototype is functional.
- Professional Referral conversational workflow implemented.
- Professional Referral data classification implemented.
- Serve OS admin recognition updated.
- Dual Netlify Preview branches prepared for stakeholder evaluation.

Current focus

- Care Inquiry canonical data model.
- Professional Referral schema review.
- Serve OS visual design system adoption.

## Current Status Update — 2026-07-06

Serve OS has successfully entered its operational pilot phase.

Current development priorities are now:

1. Improve daily employee usability.
2. Build the Daily Operations Workspace.
3. Expand Resident Detail into Resident 360.
4. Build a complete resident relationship timeline.
5. Introduce operational intelligence only after core workflows are mature.

Development emphasis has shifted from infrastructure construction toward workflow optimization and employee adoption.

## 2026-07-09 Documentation Checkpoint

Reaffirmed current state of Serve OS as an operational pilot with:

- Employee authentication
- Workspace page
- Resident directory connected to live Supabase data
- Resident detail pages
- Employee Portal connection from the public website
- Watermere resident data
- External operational system launch links

Re-centered product philosophy:

- Serve OS is the operational layer, not a replacement for every platform.
- The system should reduce clicks, cognitive load, and confusion.
- Features should help Elizabeth / Serve staff complete real work more easily.

Refined the Serve OS continuation prompt used to open future development chats — see [`DECISION_LOG.md`](./DECISION_LOG.md) 2026-07-09 entries.

Current north star: Serve OS should become the primary daily operating workspace for Serve Caregiving while maintaining production stability.

## 2026-07-12 — Operating Model Formalized

Dashboard and Workspace no longer overlap. Each top-level page now owns
exactly one mode — Dashboard = Know, Workspace = Do, Residents = Manage,
Ask Serve = Think — recorded in full at
[`docs/architecture/SERVE_OS_OPERATING_MODEL.md`](docs/architecture/SERVE_OS_OPERATING_MODEL.md).

Completed this pass:

- Removed Dashboard's Quick Actions, Today's Schedule, and Starting This
  Week (Quick Actions duplicated Workspace launch cards under different
  labels; the other two are action-oriented and belong in Workspace).
- Dashboard rebalanced into a four-section story: Community Snapshot,
  Relationship Pipeline, Resident Wellness, Staffing & Recruiting. Metric
  cards may now link to a filtered investigative view (never a creation
  workflow).
- Workspace gained Today's Schedule and Starting This Week (moved, not
  duplicated).
- New shared workflow registry, `lib/workflows/serveWorkflows.ts`, is now
  the single source of truth for Workspace's Resident Operations and Care
  Delivery launch cards.
- `/ask-serve-ai` confirmed unreferenced anywhere in the app — flagged for a
  future cleanup pass, not deleted in this task.

Not yet complete:

- `/ask-serve-ai` removal/reconciliation.
- Prospects inbox does not yet support a URL-driven status filter, so
  Dashboard's Needs Follow-up / Pending Assessments / Families Awaiting
  Proposal cards link to the unfiltered `/prospects` view rather than a
  pre-filtered one.
- Recruiting's "needing attention" filter is duplicated inline (Dashboard,
  Workspace) rather than centralized — acceptable at its current size, but
  worth revisiting if more surfaces need it.

## 2026-07-12 — Sidebar and Settings Aligned to the Operating Model

Full navigation now matches the operating model — Workspace, Dashboard,
Residents, Community Intelligence, Ask Serve; Coming Soon: Communications;
System: Settings. Recorded in full at
[`docs/architecture/SERVE_OS_NAVIGATION_MODEL.md`](docs/architecture/SERVE_OS_NAVIGATION_MODEL.md)
and
[`docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md`](docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md).

Completed this pass:

- Removed Recruiting, Scheduling, and Care Plans from the sidebar.
  `/recruiting` remains fully functional, now reachable from Workspace's
  new "Recruiting & Hiring" section ("Open Recruiting Pipeline"). Scheduling
  and Care Plans never had routes, so nothing was orphaned.
- Community Intelligence reframed with honest helper copy distinguishing it
  from Ask Serve, and its existing illustrative metrics reorganized under
  five named categories (two — Scheduling Intelligence, Quality/Compliance —
  now show an honest "Not Yet Connected" state instead of no framing at
  all).
- Ask Serve helper copy updated with an explicit proactive-vs-on-demand
  distinction from Community Intelligence.
- `/settings` is now a real authenticated route (previously a decorative,
  non-clickable sidebar label) with six sections; only My Account and a
  real Integrations status list (presence-checked, no secrets) show live
  data, gated to manager/executive/admin using the existing role model.

Not yet complete:

- Communications still has no route — remains a dimmed "Coming Soon"
  sidebar label, per this task's explicit scope.
- Settings: Users & Roles, Workflow Configuration, and Governance & Audit
  are honest future-state descriptions only — no admin backend exists yet.
- `/settings` is automatically covered by the existing `proxy.ts` route
  matcher (Next.js's renamed middleware) — no gating change was needed to
  protect it; verified it redirects to `/login?next=/settings` when
  unauthenticated.

## 2026-07-12 — Settings Integrations: Three-Attribute Model

Settings > Integrations now shows Current Status, Role in Serve OS, and
Current/Future Scope for all ten integrations, not just a status badge and
a one-line summary. Moved from an inline array in `app/settings/page.tsx`
into a structured registry,
[`app/settings/integrations.ts`](app/settings/integrations.ts)
(`IntegrationDefinition[]`). Full status/role/scope semantics recorded in
[`docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md`](docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md).

- Status labels expanded for clarity: "Connected Integration", "External
  System Link", "Planned Integration", "Not Connected" — no longer the
  shorter, more definitive-sounding forms.
- SAS Answering Service kept its `planned` status; the ongoing vendor trial
  is expressed through `currentScope` ("Trial in progress"), not a new
  "Trial" status.
- Every external-launch and planned integration's `futureScope` is
  qualified ("future," "where supported," "subject to API access") — none
  are stated as committed or already working.
- No backend, schema, env var, or credential-handling change. Presentation
  only.