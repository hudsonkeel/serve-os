# 2026-07-01

## Added

- Live Supabase Residents table
- Imported 307 active Watermere residents
- Resident staging architecture
- Workspace page
- Employee Portal
- Live resident detail pages
- Live resident directory
- Workspace external system launcher
- Employee authentication
- Resident relationship import staging
- Contact import staging

## Changed

- Removed mock resident data
- Connected Residents module to live Supabase
- Corrected resident identity precedence
- Corrected hostname from servercaregiving to servecaregiving
- Connected public website Employee Portal to Serve OS

## Fixed

- Resident identity merge bug
- Workspace launch URLs
- Notification hostname consistency
- Resident relationship logic
- Active Client calculation

## Added

- Added production password reset flow.
- Integrated Supabase recovery.
- Configured Resend SMTP.
- Added forgot-password and reset-password routes.
- Implemented branded Serve password reset emails.

## 2026-07-04

Major Milestone

- Completed conversational homepage intake implementation.
- Verified Netlify Forms in Deploy Preview.
- Implemented dual-write architecture (Netlify + Supabase).
- Added ZIP code and explicit consent capture.
- Resolved Deploy Preview cache-control issue.
- Restored Serve OS authentication.
- Clarified product terminology:
  - Website Inquiries → Care Inquiries
  - Active Prospects → Serve Prospects
- Introduced dedicated Care Inquiries navigation within Serve OS.

## 2026-07-05

### Added

- Progressive Homepage Intake (Version B) prototype.
- Professional Referral workflow refinements.
- Professional Referral visual entry point using dedicated clipboard icon.
- Need Help Right Away support section.
- Improved Professional Referral operational visibility within Serve OS.

### Changed

- Homepage now supports two independently testable UX approaches.
- Professional Referral payload classification.
- Professional Referral admin rendering.
- Homepage CTA progressive reveal behavior (Version B).

## 2026-07-06

### Product Planning

- Defined the next major development milestone as the Daily Operations Workspace.
- Planned the evolution of Resident Detail into a comprehensive Resident 360 experience.
- Prioritized workflow optimization ahead of additional AI functionality.
- Refined the long-term product roadmap around employee usability and operational simplicity.

## 2026-07-09

### Changed

- Refined the Serve OS continuation prompt used to start future development chats — reduced to three sections (where we are, what we are building next, how to think) rather than a full archive.
- Reaffirmed operational pilot status and re-centered product philosophy around reducing clicks, cognitive load, and confusion for Serve staff. No code changes.

## 2026-07-11 to 2026-07-13

Retrospective entry covering the period since the last changelog update —
recorded now as part of a documentation checkpoint, not logged day-by-day
at the time.

### Added

- **Design System 2.0** (Blue & White / Clean & Clinical) — new color
  tokens in `app/globals.css` (`navy`, `blue`, `gold`, `canvas`, `surface`,
  `ivory*`, semantic state colors), applied to Global Shell, Workspace,
  Dashboard, Resident Directory, Resident Detail, and Resident Wellness.
  See `docs/design/SERVE_DESIGN_SYSTEM_2.md`.
- **Serve OS Operating Model** — Dashboard = Know, Workspace = Do,
  Residents = Manage, Community Intelligence = Think proactively, Ask
  Serve = Think on demand, Communications = ensure nothing is missed,
  Settings = configure/govern/secure/connect. See
  `docs/architecture/SERVE_OS_OPERATING_MODEL.md`.
- **Navigation model** — sidebar reduced to five top-level items plus
  Communications (Coming Soon) and Settings; Recruiting, Scheduling, and
  Care Plans removed as top-level items without deleting any route. See
  `docs/architecture/SERVE_OS_NAVIGATION_MODEL.md`.
- **Settings architecture** — `/settings` became a real authenticated
  route with six sections; only My Account and a presence-checked
  Integrations status list show live data. See
  `docs/architecture/SERVE_OS_SETTINGS_ARCHITECTURE.md`.
- **Read-only AxisCare integration** (`lib/integrations/axiscare/`) —
  server-only, GET-only client for Visits/Schedules/Clients/Caregivers,
  live-verified against the real API. No write capability exists anywhere
  in this layer. See `docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md`.
- **Vendor-neutral scheduling domain** (`lib/scheduling/`) — normalizes
  raw AxisCare visits into `ServeScheduleVisit`; deterministic status
  rules, timezone-safe date handling, bounded pagination, removed-visit
  policy. See `docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`.
- **Workspace live schedule visibility** —
  `components/scheduling/TodaysSchedulePanel.tsx` replaces the static
  Today's Schedule placeholder with a server-rendered, read-only view:
  summary metrics, an "Attention Needed" unassigned-visit section,
  chronological visit list, and a deep link back to AxisCare Real Time
  View.
- **Server-side scheduling feature flag** — `AXISCARE_SCHEDULE_ENABLED`
  (server-only, no `NEXT_PUBLIC_` prefix, exact `"true"` match) gates the
  Workspace schedule feature independently of AxisCare credentials.
  Defaults to disabled; a disabled feature makes zero AxisCare requests
  and never reveals whether credentials are configured.
- Community Intelligence framework — five named categories with honest
  "Illustrative" or "Not Yet Connected" labeling; no fabricated data.
- Wellness Manager, Wellness Observations, Wellness Follow-Ups, and
  Wellness Watch across the Residents module (migrations
  `20260712000000_create_resident_wellness_notes.sql` and
  `20260712010000_create_resident_wellness_follow_ups.sql`).
- Resident Connections (`20260711000000_create_resident_connections.sql`).
- Documentation checkpoint reconciling `CURRENT_STATUS.md`,
  `ARCHITECTURE.md`, `DECISION_LOG.md`, `ENVIRONMENT.md`,
  `MILESTONES.md`, `PRODUCTION_READINESS.md`, `SERVE_BUILD_CONTEXT.md`,
  `VISION.md`, and `README.md` against the actual repository state, and
  documenting the transition into Phase 2 — Operational Intelligence.

### Changed

- Ask Serve retained as a "Coming soon" placeholder — no new AI reasoning
  behavior was added in this period; only its positioning within the
  operating model was clarified (Think on demand, distinct from Community
  Intelligence's Think proactively).
- Sidebar's "Recruiting" top-level item removed; `/recruiting` remains
  fully functional, now reachable from Workspace.

### Fixed

- Removed-visit inflation bug in AxisCare schedule summary counting — a
  removed visit with no caregiver no longer counts as actionable
  "unassigned" coverage. See `ServeScheduleSummary` in
  `lib/scheduling/types.ts`.

### Known issues (carried forward, not fixed in this period)

- Recruiting-related data still contains website test inquiries; source
  table(s) and safe-to-delete scope not yet confirmed.
- Workspace's "Follow-ups" metric may be inaccurate; query lineage not yet
  traced.
- Deploy-target discrepancy: `netlify.toml`/`SERVE_APP_URL` reference
  Netlify, but a live GitHub check-run query shows Vercel is what
  currently auto-deploys this repository on push. Not yet reconciled.

## 2026-07-13 — Serve Intelligence Constitution

### Added

- **`docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md`** — the
  canonical, permanent governing document for the Serve Intelligence
  Platform. Establishes the platform's purpose, human-authority
  principle, deterministic-before-AI discipline, the Knowledge/
  Reasoning/Recommendation three-layer model, the explicit AI-assist vs.
  AI-forbidden boundary, vendor neutrality, the organizational-learning
  loop, and auditability/privacy/stewardship expectations. Design-only —
  no architecture decision was changed to produce this document; it
  formalizes decisions already made across the three prior Serve
  Intelligence Platform design sessions (initial proposal, primitive
  refinement, layered reconciliation).
- Brief cross-references added to `README.md` ("Start Here"),
  `ARCHITECTURE.md` (Phase 2 section), and `SERVE_BUILD_CONTEXT.md`
  (Phase 2 objective section) pointing future sessions and readers at
  the Constitution before any intelligence-domain work begins. No
  content duplicated — each reference links to the canonical file.

### Not yet done

- No Serve Intelligence Platform code, types, or database schema exist
  yet. This entry is documentation only, consistent with every prior
  Serve Intelligence Platform session in this period (audit → primitive
  design → layered reconciliation → this constitutional document) —
  implementation has not begun.

## 2026-07-13 — Intelligence Foundation: Phase A Primitives and Engineering Standards

### Added

- **`lib/intelligence/core/`** (commit `c5fec9b`) — Phase A shared
  TypeScript primitive types for the Serve Intelligence Platform:
  `Subject`, `HistoricalFact`, `Signal`, `Evidence`, `Recommendation`,
  `Action`, `Outcome`, `Rule`, `RuleVersion`, `RuleRun`, `Explanation` (11
  of the 13 approved primitives — `ReferenceKnowledge` and `ContextNote`
  intentionally deferred to Phase E). Types only; no persistence, no UI,
  no application behavior changed. Includes a `node:assert` runtime test
  suite and `@ts-expect-error` compile-time boundary proofs confirming
  Context-shaped data can never satisfy deterministic Rule input.
- Scheduling Intelligence V1 requirements finalization (design/audit
  session, no commit — documentation-only proposal) — an evidence-based
  review of the actual AxisCare/scheduling data available today,
  resolving the exact V1 rule set: `visit_started_late`,
  `visit_not_started`, and `visit_duration_variance` recommended;
  `caregiver_reassigned` Blocked (no stable recurring-slot identity in
  the live data path); four historical-pattern rules deferred to V1.1
  pending persistence this repository has never had.
- **`docs/intelligence/SERVE_INTELLIGENCE_ENGINEERING_STANDARDS.md`**
  (commit `8e46bfe`) — the canonical implementation handbook for every
  future Serve Intelligence domain: a Rule Engineering template,
  Fact/Signal/Recommendation/Action/Outcome engineering standards, a
  precise AI engineering boundary, naming conventions, an implementation
  checklist, a Definition of Done, and an Engineering Oath. Now the
  canonical engineering standard beneath the Constitution and
  `ARCHITECTURE.md` — see `DECISION_LOG.md`'s corresponding 2026-07-13
  entry.

### Status

- Intelligence Platform governance and shared type structure are
  complete. Persistence (Phase B), the reasoning engine (Phase C), and
  every domain (Phase D onward, including Scheduling Intelligence V1)
  remain unimplemented. No intelligence domain is live in any form; no
  application behavior changed by any of today's work.