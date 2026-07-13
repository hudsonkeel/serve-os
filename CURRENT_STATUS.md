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

## 2026-07-12 — AxisCare Read-Only Discovery (Phase 1 Spike)

Branch: `feature/axiscare-read-only-schedule`. Server-only, read-only
AxisCare integration boundary added at `lib/integrations/axiscare/` —
config validation, an auth'd GET-only HTTP client, thin wrappers for
visits/schedules/clients/caregivers, and a sanitized discovery layer. Full
detail in
[`docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md`](docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md).

- Discovery script (`npm run axiscare:discover`) and a pure-function test
  suite (`npm run test:axiscare`) both verified working via Node's native
  TypeScript execution — no new build tooling added, only the small
  official `server-only` package plus one `tsconfig.json` flag
  (`allowImportingTsExtensions`) to let the integration's internal relative
  imports resolve under both Next.js and plain Node.
- No live AxisCare API call was made in this task (out of scope by
  instruction) — verified the script's unconfigured/error paths only, plus
  fictional-fixture tests. Real endpoint paths, headers, and response shape
  are documented as unverified assumptions pending a real discovery run.
- No write capability exists anywhere in this integration — `axisCareGet()`
  hardcodes `GET`, no method parameter exists to override it.

Not yet complete:

- Real discovery run against live AxisCare API (requires Hud to run
  `npm run axiscare:discover` locally with `.env.local` populated).
- Vendor-neutral `ServeScheduleVisit` model — explicitly deferred to a
  follow-up task per this phase's scope.
- Production Today's Schedule UI — not started, explicitly out of scope
  for this spike.

## 2026-07-12 — Workspace Today's Schedule Goes Live

Branch: `feature/axiscare-read-only-schedule`. Workspace's static Today's
Schedule placeholder is replaced with a live, read-only view built on the
now-tested `getAxisCareTodaysSchedule()` service and the vendor-neutral
`lib/scheduling/` model. Full policy in
[`docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`](docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md)'s
"Workspace Today's Schedule (Live)" section.

- New `components/scheduling/` components (`TodaysSchedulePanel`,
  `ScheduleSummaryMetrics`, `ScheduleVisitRow`, `ScheduleUnavailableState`)
  and a new pure-formatting module, `lib/scheduling/format.ts` (status
  labels/badge tones, timezone-safe time-range formatting, chronological
  sort, fallback copy).
- `app/workspace/page.tsx` now fetches the schedule once, server-side,
  alongside its existing `Promise.all` data calls — no new client-side
  fetch, no polling added.
- Active visits only; removed visits never appear in the list and never
  inflate the Unassigned count. Unassigned active visits surface in a
  dedicated "Attention Needed" section above the chronological "Today's
  Visits" list.
- A new `axisCareRealTimeViewUrl` export in `lib/workflows/serveWorkflows.ts`
  (derived from the existing AxisCare origin) gives every schedule state —
  including every fallback state — a working link back to AxisCare's Real
  Time View. Serve OS still writes nothing back to AxisCare.
- `components/ScheduleCard.tsx` (already unused/dead code prior to this
  task) was left in place, untouched and still unused — retired in effect,
  not deleted.
- Test suite grew from 45 to 60 passing scheduling/AxisCare tests
  (`npm run test:scheduling`, `npm run test:axiscare`); `npm run build`
  succeeds. `npm run lint` has one pre-existing failure in
  `components/auth/ResetPasswordForm.tsx`, unrelated to this task.

Not yet complete (explicitly deferred, per this task's own scope):

- Deterministic exception detection (late/no-clock-in rules, missed-visit
  inference, duration variance, recurring-reassignment detection).
- Historical/trend intelligence beyond today's snapshot.
- Any write-back, Supabase persistence of AxisCare data, or webhooks.

## 2026-07-13 — Manually Validated; Release Flag, Preview Prep

Branch: `feature/axiscare-read-only-schedule`. Phase 1 (read-only AxisCare
schedule visibility in Workspace) has been manually compared against
AxisCare Real Time View and confirmed accurate — active visits, caregiver
assignments, times, removed-visit exclusion, and the actionable unassigned
count all match; the AxisCare deep link works; no write-back exists.

**New: server-only release flag, `AXISCARE_SCHEDULE_ENABLED`.** The
Workspace schedule feature is now controllable independently of AxisCare
credentials — see "Release Control" in
[`docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`](docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md).

- Exact `"true"` match only (case-sensitive); missing/empty/`"false"`/any
  other value is disabled. No `NEXT_PUBLIC_` prefix.
- Checked before any AxisCare configuration/credential lookup —
  `reason: "disabled"` makes zero AxisCare requests and never reveals
  whether credentials are configured.
- Disabled state renders a calm external-launch panel ("Schedule managed
  in AxisCare"), not an error state — distinct from every
  configuration/authentication/timeout fallback.
- **Preview policy:** Deploy Preview / branch-deploy contexts run with
  `AXISCARE_SCHEDULE_ENABLED=true`. **Production remains disabled until
  Hud explicitly approves enabling it.**
- Emergency shutdown, in order of preference: (1) set the flag `false` and
  redeploy, (2) revoke the AxisCare token, (3) roll back the Netlify
  deploy.
- 7 new tests added (flag-value matrix, disabled-makes-no-fetch,
  disabled-hides-credential-presence, enabled-preserves-existing-path, and
  a repo-wide static scan confirming no `app/`/`components/` file ever
  reads `AXISCARE_SCHEDULE_ENABLED`). Full suite: 68 passing
  (`npm run test:axiscare` + `npm run test:scheduling`); `npm run build`
  succeeds; `npm run lint` unchanged from baseline (one pre-existing,
  unrelated failure in `ResetPasswordForm.tsx`).

This session's remaining scope: commit this work in coherent history, push
`feature/axiscare-read-only-schedule`, produce and inspect a non-production
Netlify preview with the flag enabled, and confirm required Netlify
environment-variable names/deploy contexts — explicitly stopping short of
any merge or production deploy. See the branch's commit history and the
session record for exact status; production `AXISCARE_SCHEDULE_ENABLED`
must remain `false`/absent until Hud explicitly approves otherwise.

**Correction, same day:** the branch was pushed and a live GitHub
check-run/commit-status query (public repo, no credentials needed) showed
the automatic preview build for this push was produced by **Vercel**, not
Netlify — no Netlify GitHub-integration activity was found on the commit
at all, despite `netlify.toml` and several historical references in this
document to Netlify as the deploy target. This is an unresolved
discrepancy, not yet reconciled — see "Open Items" in the 2026-07-13
documentation checkpoint entry below. No environment variables were set on
either platform by this session; the auto-built preview almost certainly
has `AXISCARE_SCHEDULE_ENABLED` unset (disabled) since nothing configured
it there.

## 2026-07-13 — Documentation Checkpoint (Phase 1 → Phase 2 Reconciliation)

Yesterday's documentation update did not complete, so this checkpoint
reconciles every governance/architecture/status doc against the actual
repository rather than assuming prior docs were current. Full detail,
corrections, and file-by-file changes are recorded in this same commit's
updates to `ARCHITECTURE.md`, `CHANGELOG.md`, `DECISION_LOG.md`,
`ENVIRONMENT.md`, `MILESTONES.md`, `PRODUCTION_READINESS.md`,
`SERVE_BUILD_CONTEXT.md`, `VISION.md`, and `README.md`. Summary:

### Current state, categorized honestly

**Live (in production or ready to be, pending explicit enablement):**
- Supabase authentication — login, forgot-password, reset-password, protected app shell (`proxy.ts`).
- Role-aware access foundation — `AUTH_ROLES = ["admin","manager","executive","operations"]`, enforced today only on `/settings` content gating; every other authenticated route is visible to any authenticated role.
- Dashboard, Workspace, Residents (directory, search, profiles, Connections, Wellness Manager/Observations/Follow-Ups/Watch), Prospects, Recruiting, Ask Serve (placeholder), Community Intelligence (framework + illustrative/honest-empty-state metrics), Settings.
- Design System 2.0 (Blue & White) — applied to Global Shell, Workspace, Dashboard, Resident Directory, Resident Detail, Resident Wellness. **Not yet applied** to Prospects, Recruiting, Community Intelligence, Ask Serve, or the public website.
- Read-only AxisCare integration (`lib/integrations/axiscare/`) and vendor-neutral scheduling model (`lib/scheduling/`) — both live-verified.
- Workspace's live AxisCare Today's Schedule UI (`components/scheduling/`) — code-complete, tested, manually validated against AxisCare Real Time View on `feature/axiscare-read-only-schedule` (not yet merged to `main`).

**Implemented but feature-flagged (off by default):**
- `AXISCARE_SCHEDULE_ENABLED` gates the entire Workspace schedule feature independently of AxisCare credentials. Default: disabled. Must stay disabled in production until Hud explicitly approves enabling it.

**Foundation only (structure exists, not yet real/live data):**
- Community Intelligence's Relationship Intelligence, Operational Best Practices metrics — labeled "Illustrative," not backed by live pattern detection.
- Settings' Users & Roles, Workflow Configuration, Governance & Audit sections — honest future-state descriptions, no admin backend.
- `lib/scheduling/`'s `ServeRecurringSchedule` model — normalized but not consumed by any UI yet.

**In design (Phase 2 — see below):** Relationship Intelligence, Proposal Intelligence, Scheduling Intelligence (the deterministic exception layer — late/no-clock-in, missed-visit inference, variance), Community Intelligence expansion, Operational Intelligence. None implemented.

**Planned, not started:** Communications (sidebar "Coming Soon," no route). CINCH-provenance verification for `careModel` (`CARE_MODEL_BY_SERVICE_CODE` mapping table is empty by design).

**Blocked / requires validation:**
- **Deploy target discrepancy** — see the correction above this entry. Requires Hud to confirm whether Vercel or Netlify is the actual intended production host for `serve-os`, and reconcile `netlify.toml`/`SERVE_APP_URL`/`PRODUCTION_READINESS.md` accordingly.
- **Recruiting test-data cleanup** — website test inquiries remain in recruiting-related data (`recruiting_leads` and/or related staging tables — exact source table(s) not yet confirmed). Historical test clutter needs review; one intentional standardized test record may be meant to remain. **No deletion performed** — this is a documentation checkpoint only.
- **Workspace Follow-Ups metric investigation** — the "Follow-ups" count shown in Workspace's Today's Work tile may be incorrect. Query lineage (which function, which table, which filters), row-count-vs-resident-count semantics, and completed/cancelled inclusion all need confirmation before the number can be trusted. **No logic correction performed** — this is a documentation checkpoint only.

### Phase 2 — Operational Intelligence

Serve OS has completed its primary operational platform foundation (Phase 1: authentication, navigation, Design System 2.0, resident/wellness/recruiting/prospect management, read-only AxisCare scheduling visibility). Serve OS is now entering **Phase 2 — Operational Intelligence**, whose objective is deterministic intelligence engines — not new pages — that explain, prioritize, recommend, monitor, remind, identify risk, preserve relationships, and reduce administrative burden. Full architectural framing recorded in `ARCHITECTURE.md` and `DECISION_LOG.md`'s 2026-07-13 entries. **No intelligence kernel or individual intelligence engine exists in the repository yet** — Phase 2 is architecture-and-design stage only.