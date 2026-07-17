# Serve OS Operating Model

Serve OS separates awareness, action, resident management, proactive
intelligence, on-demand reasoning, communication assurance, and system
configuration into distinct operating modes. Each top-level nav destination
owns exactly one of these modes:

| Page | Mode | Primary question |
|---|---|---|
| Dashboard | **Know** | "What is happening?" |
| Workspace | **Do** | "What should I do next?" |
| Residents | **Manage** | "What should I know and do for this resident?" |
| Community Intelligence | **Think proactively** | "What patterns, risks, or opportunities should I be aware of without asking?" |
| Ask Serve | **Think on demand** | "What am I missing, and what should I consider?" |
| Communications *(Coming Soon)* | **Ensure nothing important is missed** | "What communication is required, incoming, or overdue?" |
| Settings | **Configure, govern, secure, connect** | "How is Serve OS set up, and who can change it?" |

This document is the durable reference for that separation. When a new
component or metric doesn't obviously belong to one page, check this document
before placing it — and if it's still ambiguous, document the ambiguity here
rather than guessing. For sidebar structure and why Recruiting, Scheduling,
and Care Plans are not top-level nav items, see
[`SERVE_OS_NAVIGATION_MODEL.md`](./SERVE_OS_NAVIGATION_MODEL.md). For the
Settings section model, see
[`SERVE_OS_SETTINGS_ARCHITECTURE.md`](./SERVE_OS_SETTINGS_ARCHITECTURE.md).

---

## Dashboard = Know

**Purpose:** help users understand the current state of the business and
community.

**Content types:** high-level counts, summaries, trend indicators. Minimally
interactive.

**Interaction model:** a Dashboard metric card may link to a filtered
management view for investigation (e.g. "Active Prospects" → Relationships,
the authoritative surface for prospect status — see
[`docs/design/RELATIONSHIPS.md`](../design/RELATIONSHIPS.md), "A prospect
is a Relationship type, not a Resident classification"). It must never link
to a creation workflow or a launch card grid — that is Workspace's job. If
a Dashboard card opens something other than an investigative, read-oriented
view, it has drifted out of the Know mode.

**Belongs here:** Community Snapshot (Residents, Serve Clients, Active
Prospects, Needs Follow-up), Relationship Pipeline (Pending Assessments,
Families Awaiting Proposal, Birthdays This Week), Resident Wellness
(Wellness Follow-Ups due/overdue and due-this-week), Staffing & Recruiting
(applicants needing attention).

**Does not belong here:** Quick Actions, workflow launch cards, Today's
Schedule, Starting This Week, or any other date-sensitive operational content
— those are action-oriented and belong in Workspace.

**Future direction:** executive brief, trend lines, schedule utilization,
visit completion rate, staffing risk, revenue, resident wellness trends.

**Relationship to Supabase / CINCH / AxisCare / Serve Intake:** Dashboard
reads the same `getCommunityMetrics()` / `getRecruitingLeads()` data used by
Workspace and Residents. It has no direct relationship with CINCH, AxisCare,
or Serve Intake — those are execution platforms, not awareness surfaces.

---

## Workspace = Do

**Purpose:** help users execute today's operational work.

**Content types:** actionable, task-oriented, date-sensitive work items and
workflow launch points.

**Interaction model:** every card either shows work that needs doing (with a
link to the resident or record involved) or launches a tool. Resident
Operations and Care Delivery launch cards render from the shared workflow
registry (`lib/workflows/serveWorkflows.ts`) so label, description,
destination, icon, and platform attribution can never drift between
renderings.

**Belongs here:** Today's Work (assessments, follow-ups, wellness
follow-ups, proposals, recruiting, payroll — all counted from the same
queries Dashboard uses), Today's Schedule, Starting This Week, Resident
Operations launch cards (Resident Directory, Assessment Intake, Proposal
Builder, Wellness Checks), Care Delivery launch cards (Community Care /
CINCH, Traditional Home Care / AxisCare), Recruiting & Hiring launch cards
(Open Recruiting Pipeline, Apploi, Viventium).

**Recruiting is a Workspace action domain.** Recruiting is primarily
operational work — applicants needing attention, interviews, hiring
progress — so it has no permanent top-level sidebar item. `/recruiting`
remains a fully functional, real management route; Workspace's "Recruiting &
Hiring" section is its action entry point ("Open Recruiting Pipeline"),
alongside the existing external Apploi/Viventium launch cards. Nothing about
the recruiting pipeline itself changed — only where staff discover it.

**Does not belong here:** aggregate/trend metrics with no action attached —
those are Dashboard's job. Deep resident-specific management content —
that's Residents' job.

**Future direction:** personalized task queue, schedule exceptions, coverage
gaps, reassessment deadlines, compliance deadlines.

**Relationship to Supabase / CINCH / AxisCare / Serve Intake:** Workspace is
the launch surface for CINCH (Community Care), AxisCare (Traditional Home
Care), and Serve Intake (Assessment Intake, Proposal Builder). It reuses
Serve OS's own Supabase-backed queries for Today's Work rather than
duplicating them.

---

## Residents = Manage

**Purpose:** help users deeply manage resident relationships, wellness,
support, and service operations.

**Content types:** the operational record for one resident at a time —
relationship tabs, Wellness Watch, connections, wellness notes and
follow-ups, assessments, profile detail.

**Interaction model:** Dashboard and Workspace both link *into* Residents
(a filtered tab, a specific resident record) but never duplicate Residents'
content inline. Residents remains the only place staff manage one resident
deeply.

**Belongs here:** everything already present — Resident Directory, blended
default view, relationship tabs, Wellness Watch, search, resident detail
pages, Connections, Resident Wellness, assessments, profile editing. Not
redesigned as part of this task.

**Does not belong here:** aggregate cross-resident metrics (Dashboard) or
workflow launch points unrelated to a specific resident (Workspace).

**Future direction:** current wellness status surfaced more prominently,
care plans, service history, family portal connections.

**Relationship to Supabase / CINCH / AxisCare / Serve Intake:** Residents is
backed directly by Supabase (`residents`, `resident_wellness_*`,
`resident_relationship_imports`, `resident_contact_imports`). CINCH and
AxisCare data are reconciled into Residents via staged imports, not queried
live.

---

## Community Intelligence = Think proactively

**Purpose:** surface system-initiated patterns, trends, risks, and
opportunities across the community — without anyone first asking.

**Content types:** recurring signals grouped into five categories: Resident
Wellness, Relationship Intelligence, Scheduling Intelligence, Operational
Best Practices, and Quality/Compliance.

**Interaction model:** proactive and read-oriented, like Dashboard, but
pattern/trend-oriented rather than count-oriented. It is **not** a
navigation launcher and it is **not** Ask Serve — Community Intelligence
tells you something before you ask; Ask Serve answers what you ask.

**Belongs here:** the illustrative metrics already on the page (Resident
Wellness, Relationship Intelligence, Operational Best Practices), each
honestly labeled "Illustrative" until backed by live pattern-detection.
Scheduling Intelligence and Quality/Compliance currently render an honest
"Not Yet Connected" empty state rather than fabricated numbers.

**Does not belong here:** user-typed questions (Ask Serve), individual
resident management (Residents), or task execution (Workspace).

**Future direction:** recurring fall-risk signals, mobility/cognition
change patterns, declining family engagement, recurring lateness or
visit-duration variance, slow assessment-to-proposal turnaround, upcoming
reassessment/care-plan-review risk, audit-readiness concerns. None of these
engines were built in this task — only the page's categories and honest
empty states.

**Relationship to Supabase / CINCH / AxisCare / Serve Intake:** will
eventually read across all of Serve OS's Supabase-backed data to detect
patterns; CINCH/AxisCare visit and scheduling data would need to be
ingested before Scheduling Intelligence can be real. Not implemented yet.

---

## Ask Serve = Think

**Purpose:** help users reason across Serve OS data.

**Content types:** natural-language question answering, prioritization,
pattern/trend surfacing, supporting evidence.

**Interaction model:** Ask Serve answers questions; it does not become
another navigation launcher. No new AI behavior was built in this task — the
existing "Coming soon" placeholder experience is preserved as-is.

**Canonical route:** `/ask-serve` is canonical — it is the route linked from
the Sidebar and from Workspace's Intelligence section.

**Duplicate route flagged for cleanup:** `/ask-serve-ai` (`app/ask-serve-ai/page.tsx`)
is a near-identical, functionally dead duplicate — it is not linked from the
Sidebar, Workspace, or any other page in the app (confirmed via a full-repo
reference search). It was not deleted in this task, since deleting a page is
a separate, deliberate decision outside "formalize the operating model" —
but it should be removed or reconciled in a future cleanup pass.

**Future direction:** "What changed?", "Who needs attention?", "What should
we prioritize?", "Why is this recommendation being made?"

**Relationship to Supabase / CINCH / AxisCare / Serve Intake:** eventually
reasons across all of Serve OS's Supabase-backed data cross-domain. No new
reasoning behavior was implemented in this task.

---

## Communications = Ensure important communication is not missed

**Purpose:** guarantee that required outbound communication, incoming
messages needing attention, and meaningful relationship touches are never
silently dropped.

**Status:** the only "Coming Soon" item in the sidebar. No route exists yet
(the sidebar entry is a dimmed, non-interactive label, matching the existing
"Coming Soon" convention) — no functionality was built in this task.

**Future content, once built:**
- **Required outbound communication:** family updates, assessment
  follow-up, proposal follow-up, care-plan review communication,
  hospital/rehab transition communication, service-change notification,
  caregiver schedule-change communication, community leadership update,
  audit/compliance communication.
- **Incoming communication requiring attention:** missed calls, voicemail,
  email, text, Dialpad transcripts, answering-service messages, caregiver
  reports, family concerns, referral-partner communication.
- **Relationship touches:** birthdays, anniversaries, welcome notes,
  post-hospital check-ins, condolences, satisfaction outreach,
  referral-partner follow-up.

**Does not belong here:** proactive pattern detection (Community
Intelligence) or one-off investigative questions (Ask Serve) — Communications
is specifically about obligations and messages that must not be missed.

**Relationship to Supabase / CINCH / AxisCare / Serve Intake:** Dialpad
(calls/voicemail/transcripts) and Google Workspace (email) are the two
existing external communication channels launched from Workspace today; an
answering-service integration is planned but not yet connected. No data
model was built for Communications in this task.

---

## Settings = Configure, govern, secure, and connect

**Purpose:** give authenticated users a real, honest place to see account
info, organization context, integration status, and the roadmap for
workflow configuration and governance — without pretending unsupported
controls work.

**Route:** `/settings`, a real authenticated page (previously a decorative,
non-clickable sidebar label).

**Section model, access model, and boundaries:** documented in full in
[`SERVE_OS_SETTINGS_ARCHITECTURE.md`](./SERVE_OS_SETTINGS_ARCHITECTURE.md).

**Does not belong here:** editable business rules (wellness thresholds,
escalation logic, etc.) until a deliberately designed, server-authorized
workflow exists. Nothing in Settings currently allows a user to alter
care/compliance rules from the browser.

---

## Shared workflow registry

`lib/workflows/serveWorkflows.ts` is the single source of truth for every
Resident Operations and Care Delivery launch card rendered in Workspace. Each
`ServeWorkflow` entry carries `id`, `name`, `description`, `href`, `icon`,
`category` (`resident_operations` | `care_delivery` | `administration`), and
`platform` (`serve_os` | `serve_intake` | `cinch_ccm` | `axiscare`).
`platformLabel()` and `isExternalWorkflow()` derive display label and
new-tab behavior from `platform`, so nothing about a workflow's presentation
is duplicated by hand across pages. Any future workflow launch surface
(e.g. a role-specific Workspace view) should read from this registry rather
than defining its own card array.

The Recruiting & Hiring, Communications, and Intelligence sections in
Workspace are not covered by the registry — they aren't duplicated anywhere
else in the app, so there is no drift risk to guard against yet. If a second
surface starts rendering those same cards, they should move into the
registry too.

## Data flow principles

The same underlying data appears in more than one place with different
presentation, never duplicated storage or competing count logic:

- **Wellness follow-ups:** `getWellnessFollowUpDashboardCounts()` powers
  Dashboard's aggregate due/overdue counts. `getOpenResidentWellnessFollowUps()`
  powers per-resident actionable follow-up lists (Residents, and indirectly
  Workspace's Today's Work tile). `getWellnessWatchSummaryByResident()` powers
  the Wellness Watch tab/badge across the Residents directory. All three
  already existed before this task and were reused as-is — no new count
  logic was introduced.
- **Community metrics:** `getCommunityMetrics()` is the single source for
  resident/prospect counts, called once per page render by Dashboard,
  Workspace, and Residents alike.
- **Recruiting:** `getRecruitingLeads()` is the single source for recruiting
  lead data, called once per page render by Dashboard, Workspace, and
  Recruiting alike. The "needing attention" filter
  (`status in [new, in_review]`) is duplicated as an inline `.filter()` in
  both Dashboard and Workspace rather than extracted into a shared helper —
  it's a two-line predicate, not a named business concept, so a shared
  function would be premature abstraction for the amount of logic involved.
