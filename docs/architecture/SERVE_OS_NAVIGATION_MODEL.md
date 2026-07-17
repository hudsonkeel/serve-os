# Serve OS Navigation Model

This document is the durable reference for the global left sidebar —
what's in it, in what order, and why items that used to be there are gone.
Defined in [`components/Sidebar.tsx`](../../components/Sidebar.tsx), the
single source of navigation for both desktop and any future mobile
presentation (there is currently no separate mobile nav implementation —
`Sidebar.tsx` is the only navigation component in the app).

## Current structure

```
TOP-LEVEL (CORE OPERATING AREAS)
1. Workspace               /workspace
2. Dashboard                /
3. Residents                /residents
4. Relationships            /relationships
5. Community Intelligence   /community-intelligence
6. Ask Serve                /ask-serve

COMING SOON
7. Communications           (no route yet — dimmed, non-interactive)

SYSTEM
8. Settings                 /settings
```

Each top-level item maps to exactly one operating mode from
[`SERVE_OS_OPERATING_MODEL.md`](./SERVE_OS_OPERATING_MODEL.md): Know, Do,
Manage, Think proactively, Think on demand. Residents and Relationships
are both Manage — the former manages identity records, the latter manages
engagement records; see below for why that split earns a second top-level
item rather than folding into Residents or Workspace.

## Why Relationships is a top-level item, not a Workspace action

This is the same test applied to Recruiting below — is it a distinct
management *domain* with its own structured, growing record set, or is it
operational work that belongs inside Workspace? Relationships passes that
test where Recruiting didn't: it's not a task list, it's a new class of
persistent record (`relationships`, with its own stage history, touches,
next actions, working notes, and Timeline — see
[`docs/design/RELATIONSHIPS.md`](../design/RELATIONSHIPS.md)) that Brian
is expected to open many times a day as his primary CRM surface, the same
way Residents is opened as the primary resident-management surface. A
Workspace tile pointing at attention counts (overdue/due today/due this
week) is a reasonable *future* addition to Workspace, the same way
Wellness Follow-up counts already appear there — but the record-management
surface itself belongs at the top level.

## Why Recruiting, Scheduling, and Care Plans are not top-level items

**Recruiting** — Recruiting is primarily operational work (applicants
needing attention, interviews, hiring progress), not a distinct awareness,
action-launching, or resident-management *domain* in its own right. It's a
Workspace action, not a fifth pillar. The `/recruiting` route was **not**
deleted and remains fully functional — it's reachable from Workspace's
"Recruiting & Hiring" section ("Open Recruiting Pipeline") and from
Workspace's "Today's Work" tile (applicants needing attention count).
Removing the sidebar item only removes a second, redundant entry point; it
does not orphan the route.

**Scheduling** — never had a route. It was a dimmed, non-interactive
"Coming Soon" placeholder with no destination. Scheduling belongs in
Workspace's "Today's Schedule" section (already present) and in a future
Scheduling Intelligence domain within Community Intelligence. No
schedule-related code was deleted because none existed beyond that
placeholder label.

**Care Plans** — never had a route. It was also a dimmed, non-interactive
placeholder. Care plans primarily belong inside Resident management. Future
care-plan review deadlines are expected to surface as Workspace actions,
Dashboard aggregate awareness, Communications required communication, and
Community Intelligence compliance-risk signals — not as a standalone
top-level page. No care-plan functionality was built in this task.

In both cases, the sidebar item is removed; nothing behind it existed to
orphan.

## Communications — the only "Coming Soon" item

Communications is the sole remaining dimmed, non-interactive sidebar entry.
It has no route today. See
[`SERVE_OS_OPERATING_MODEL.md`](./SERVE_OS_OPERATING_MODEL.md#communications--ensure-important-communication-is-not-missed)
for its future scope. The sidebar item stays non-clickable so it never
routes a user to a broken page.

## Settings — now a real route

Settings changed from a decorative, `aria-disabled` span with no `href` to
a real `Link` to `/settings`, participating in the same active-state
highlighting as every other primary nav item. See
[`SERVE_OS_SETTINGS_ARCHITECTURE.md`](./SERVE_OS_SETTINGS_ARCHITECTURE.md).

## Audit findings (recorded for future reference)

- Sidebar items are defined in one place: `components/Sidebar.tsx`
  (`primaryNav`, `comingSoonNav`, and the standalone Settings link). Desktop
  and any future mobile navigation share this single source — there is no
  separate mobile nav component today.
- Active-route highlighting is computed by `isActive(href)` in `Sidebar.tsx`
  (exact match for `/`, `startsWith` for everything else) and now also
  covers `/settings`.
- No test file in the repository (outside `node_modules`) references
  sidebar label text, so removing/renaming labels carries no test risk.
- `/recruiting` has other references beyond the old sidebar link: it's
  linked from `app/workspace/page.tsx` (Today's Work tile and the
  Recruiting & Hiring section) — confirmed not orphaned.
- No role-based navigation logic exists in `Sidebar.tsx` — every
  authenticated visitor sees the same sidebar (all four roles). Route-level
  auth is enforced by [`proxy.ts`](../../proxy.ts) (Next.js's renamed
  middleware), which redirects any unauthenticated request for a non-public
  path — including the new `/settings` — to `/login`. Role-based *content*
  gating (as opposed to route access) exists only on the new `/settings`
  page.
