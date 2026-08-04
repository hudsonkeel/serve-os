# Serve OS Navigation Model

This document is the durable reference for the global left sidebar —
what's in it, in what order, and why. Defined in
[`components/Sidebar.tsx`](../../components/Sidebar.tsx), the single source
of navigation for both desktop and any future mobile presentation (there is
currently no separate mobile nav implementation — `Sidebar.tsx` is the only
navigation component in the app; it stays a desktop-fixed 288px rail).

## Current structure

Navigation is organized around the work people naturally understand (per
the operating flow: do today's work → work with the people Serve supports
→ work with the people who provide care → understand performance →
understand emerging conditions → ask Serve from anywhere), not around
software modules:

```
TODAY
1. Today's Work            /workspace

SERVE
2. The People We Serve      /residents
3. The People Who Serve     /recruiting

UNDERSTAND
4. How We're Doing          /
5. Community Outlook        /community-intelligence

COMING SOON
6. Communications           (no route yet — dimmed, non-interactive)

── persistent utility area (visually separated) ──
7. Ask Serve                 (opens the panel — see ASK_SERVE_ARCHITECTURE.md;
                              falls back to a plain link to /ask-serve for
                              users the flag hasn't reached yet)
8. Settings                  /settings
```

## The People We Serve consolidates Residents, Relationships, and External Clients

Relationships and External Clients are intentionally **not** separate
top-level sidebar entries. They're sub-areas of The People We Serve,
reached via [`components/peopleWeServe/PeopleWeServeTabs.tsx`](../../components/peopleWeServe/PeopleWeServeTabs.tsx) —
a shared tab bar (styled identically to
[`RelationshipViewTabs`](../../components/relationships/RelationshipViewTabs.tsx))
rendered at the top of `/residents`, `/relationships` (+ its three sibling
views), and `/external-clients`. This mirrors, one level up, the same
pattern Relationships already used internally: a single conceptual
destination that's actually a small hub of sibling views, not a single
page. No route moved, no database object was renamed, and every existing
deep link (`/relationships/intake?tab=...`, etc.) keeps working unchanged —
this is purely a navigation/labeling change plus one new shared tab
component.

Each of the three areas' page titles now carry a 2-level breadcrumb via
the existing `PageContainer title="..."` prop (e.g. `"The People We Serve ·
Relationships"`, `"The People We Serve · Action Board"`) — no new
breadcrumb component was needed since `TopNav` already just renders
whatever string `title` is given it.

Wellness Watch is unaffected — it was already a tab inside
`components/residents/ResidentsInbox.tsx` (`wellness_watch`), part of the
resident experience, not a separate area.

## Why The People Who Serve (Recruiting) is now a top-level item

Previously Recruiting had no sidebar entry (reachable only via Workspace)
because it read as operational work rather than a distinct domain. Under
the human-centered redesign it earns a top-level slot for a different
reason: it's not being judged as "is this a management domain" anymore,
it's one of the six things the operating flow says every employee should
be able to reach in one click — the people who provide and support care.
The route itself didn't change; only its reachability did. It remains
additionally reachable from Workspace's "Recruiting & Hiring" section as a
day-to-day operational shortcut into the same route.

## Why Scheduling and Care Plans are still not top-level items

Neither ever had a route — both were dimmed, non-interactive "Coming Soon"
placeholders. Scheduling belongs in Workspace's "Today's Schedule" section
(already present) and a future Scheduling Intelligence domain within
Community Outlook. Care plans primarily belong inside resident management;
future care-plan signals are expected to surface as Workspace actions, How
We're Doing aggregate awareness, Communications required communication,
and Community Outlook compliance-risk signals — not as a standalone page.
Nothing was built or deleted for either in this task.

## Communications — the only "Coming Soon" item

Communications is the sole remaining dimmed, non-interactive sidebar entry.
It has no route today. See
[`SERVE_OS_OPERATING_MODEL.md`](./SERVE_OS_OPERATING_MODEL.md#communications--ensure-important-communication-is-not-missed)
for its future scope. The sidebar item stays non-clickable so it never
routes a user to a broken page.

## Ask Serve — persistent utility, not a navigational destination

Ask Serve moved out of the primary nav sections entirely. It's a
persistent capability in the sidebar's bottom utility area (visually
separated, above Settings), opening a right-side panel over the current
page rather than navigating anywhere — see
[`ASK_SERVE_ARCHITECTURE.md`](./ASK_SERVE_ARCHITECTURE.md) for the full
architecture (context contract, Knowledge Profiles, Context Stack,
capability-boundary roadmap). It's currently gated to admin users
(`lib/askServe/featureFlag.ts`) while it's new; everyone else still sees a
plain link to the existing `/ask-serve` page, so nothing regresses during
rollout.

## Settings — unchanged

Settings stays a real route (`/settings`), participating in the same
active-state highlighting as every other nav item. See
[`SERVE_OS_SETTINGS_ARCHITECTURE.md`](./SERVE_OS_SETTINGS_ARCHITECTURE.md).

## Audit findings (recorded for future reference)

- Sidebar items are defined in one place: `components/Sidebar.tsx`
  (`sections`, `comingSoonNav`, the Ask Serve utility, and the standalone
  Settings link). Desktop and any future mobile navigation share this
  single source — there is no separate mobile nav component today.
- Active-route highlighting is computed by `isActive(href)` in
  `Sidebar.tsx` (exact match for `/`, `startsWith` for everything else),
  unchanged, now also applied to `/recruiting` and the fallback `/ask-serve`
  link.
- No role-based navigation *item visibility* logic exists in `Sidebar.tsx`
  beyond the new Ask Serve flag — every authenticated visitor otherwise
  sees the same sidebar. Route-level auth is enforced by
  [`proxy.ts`](../../proxy.ts) (Next.js's renamed middleware), which
  redirects any unauthenticated request for a non-public path to `/login`.
- No test file in the repository references sidebar label text by string,
  so relabeling carried no automated test risk (verified manually instead
  — see `ASK_SERVE_ARCHITECTURE.md`'s testing note for why: no component-
  rendering test infrastructure exists in this repo).
