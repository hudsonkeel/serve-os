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
