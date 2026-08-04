# Today's Work as Operational Home

Serve OS should never feel like a collection of unrelated modules. Instead, it should
feel like one continuous operational workspace. **Today's Work is that workspace.** Every
other area of Serve OS represents work being performed; Today's Work represents what
deserves attention, what has changed, what remains unfinished, and what should happen
next. The user should never wonder "where should I start?" — the answer is always Today's
Work.

This document reviews the current UX against that principle and separates recommendations
into Immediate (implemented this phase), Near-term, and Future architecture. It builds on
[`TODAYS_WORK_CONTINUITY.md`](./TODAYS_WORK_CONTINUITY.md) (the Work Item model and
continuity layer) and [`ASK_SERVE_ARCHITECTURE.md`](./ASK_SERVE_ARCHITECTURE.md) (the
`today_work` Knowledge Profile) — this doc is about *reaching* and *returning to* Today's
Work, not about what's inside it.

## Design principles

1. **Today's Work is the operational home** — reinforced consistently across many
   surfaces (authentication, Home behavior, navigation, branding, workflow completion,
   future notifications, future mobile behavior). No single implementation carries this
   responsibility alone.
2. **Every operational surface should have a natural return path** — not necessarily a
   literal "Back" button; the product should reinforce that Today's Work remains the
   user's operational anchor.
3. **Work should flow** — users should feel like they're progressing through work, not
   navigating software. Today's Work → Relationship Follow-up → Complete Follow-up →
   Relationship → Today's Work, not Today's Work → Relationship → Sidebar → Dashboard →
   Residents → Workspace.
4. **Preserve context when returning** — an architectural capability to build toward
   (filters, tab, scroll position, expanded sections, recently dismissed work), not
   something implemented yet.

## Home concept

**Home is Today's Work. Home is not `/`. Home is not "Dashboard."** Every future surface
that needs a "return to start" concept — a Home button, a keyboard shortcut, mobile
navigation, a notification, a push action, a deep link — should resolve against this one
definition. Nothing about "Home" is scattered per-feature; it's this one paragraph.

## Navigation review

| Surface | Disposition | Reasoning |
|---|---|---|
| Sidebar Logo | **Link home** (implemented) | Previously a bare `<Image>` with no link at all — clicking it did nothing. Now `<Link href="/workspace">` (`components/Sidebar.tsx`), so it behaves as a real Home control from anywhere in the app. |
| Sidebar "Today's Work" nav item | Unchanged | Already the correct, persistent, always-visible way to reach Today's Work — no change needed. |
| Top navigation (`TopNav.tsx`) | Unchanged this phase | Title label, search, and notification bell are already present; the bell is decorative today (see Notification philosophy below) — wiring it is Near-term, not a navigation-structure change. |
| Breadcrumbs | None exist | `PageContainer`'s `title` prop is a plain, non-interactive label, not a breadcrumb trail. A real breadcrumb component is Near-term, only if the team wants richer trail-of-navigation than the Logo-as-Home + sidebar already provide. |
| Workspace launch cards | Unchanged, confirmed correctly placed | See "Workspace launchers" below. |
| Resident detail (`app/residents/[id]`) | **Preserve context** (implemented) | Its existing "← Back to Residents" link stays — returning to the immediate parent list is the tighter, lower-friction loop ("work should flow"). An *additive* "← Back to Today's Work" link now appears alongside it, but only when the page was reached from a Today's Work item (see "Origin-aware return path" below) — never replacing the list link, never appearing on a plain deep link. |
| Relationship detail (`app/relationships/[id]`) | **Preserve context** (implemented) | Same pattern as Resident detail. |
| Recruiting detail (`app/recruiting/[id]`) | **Preserve context** (implemented) | Same pattern. |
| Assessments | No dedicated page | Assessment is a `relationships.stage` value rendered inside Relationship detail — already covered by that row above. |
| Community Outlook / Settings | Unchanged | Top-level sidebar destinations with no parent list to return *from* — a back-link isn't applicable either way. |

## Origin-aware return path (implemented)

When a user opens a record from a Today's Work `WorkItemRow`
(`components/workspace/WorkItemRow.tsx`), the link carries a stable origin marker
(`lib/workspace/originMarker.ts`: `withTodaysWorkOrigin`/`hasTodaysWorkOrigin`,
`?from=todays-work`). The three destination pages reachable from any `WorkItem.sourceRoute`
today — Resident, Relationship, and Recruiting detail — read that marker and, only when
present, render an additive `components/workspace/BackToTodaysWorkLink.tsx` next to their
existing local back-link. A plain deep link (no marker) renders exactly as it did before
this phase — nothing about existing deep-link behavior changes.

This is deliberately narrow: no persistence, no scroll restoration, no automatic
post-completion redirect, and no generalized breadcrumb infrastructure. It's the first
concrete workflow expression of "Today's Work is the operational home," not the whole
future architecture below.

## Workflow completion patterns

Confirmed by inspection: every mutating action in this app today (`ActionBoard.tsx`'s
complete/dismiss handlers, wellness follow-up complete/dismiss, resident-identity merge
actions, etc.) calls `router.refresh()` and stays on the current page. Nothing anywhere
auto-redirects, including never to Today's Work. This is the right default and is
unchanged this phase — per "do not automatically redirect every completion," some
workflows should stay (the Action Board itself: completing one item and immediately
seeing the next is already "work should flow"; a resident's wellness follow-up completed
from that resident's own detail page, where the user is likely handling several things for
that one person) and none should be forced back to Today's Work automatically. The
origin-aware return path above is the intentionally lighter-weight answer: when the user's
own path back matters, they get a visible, optional way to retrace it — never an
involuntary redirect.

## Workspace launchers

`workspaceSections` in `app/workspace/page.tsx` (Resident Operations, Care Delivery,
Recruiting & Hiring, Communications, Intelligence) are a mix of real internal navigation
(Open Recruiting Pipeline, Community Intelligence) and external tool launchers (Apploi,
Viventium, Dialpad, Gmail, Serve Intake) — genuinely **applications/tools**, not
continuity work. They are already positioned *below* the Operational Summary, the
continuity layer, and Today's Schedule on the page, which is the correct placement: the
continuity layer stays visually primary. No reordering was needed. The one fix made this
phase: the Intelligence section's launcher still said "Dashboard" instead of "How We're
Doing" (stale from before the earlier navigation-redesign phase) — relabeled.

## Branding

"Workspace" and "Dashboard" as competing labels for what are now "Today's Work" and "How
We're Doing" were mostly already cleaned up in the navigation-redesign phase. Two
survivors found and fixed this phase: the Intelligence launcher card (above), and
`app/residents/wellness/new/page.tsx`'s "Back to Workspace" link (same `/workspace` route,
now reads "Back to Today's Work"). No other competing terminology was found in a repo-wide
check.

## Notification philosophy (future)

Notifications should not exist independently. Every notification should ultimately lead
the user back into Today's Work, to the specific highlighted work item — never to a
random detail page directly:

```
"Relationship follow-up overdue"
  -> Today's Work
  -> highlighted work item
```

not directly to a detail page. `WorkItem.id`/`sourceRoute` (`lib/workspace/workItem.ts`,
already built) are already sufficient to support a future `?highlight=<workItemId>` deep
link into Today's Work — no new field is needed when notifications are actually built.
Today's Work should become the operational inbox for Serve. `TopNav`'s notification bell
is decorative today (no unread state, no click handler) — wiring it is Near-term.

## Ask Serve on Today's Work

Already wired: `today_work` Knowledge Profile, `TODAY_WORK_CONTEXT`
(`lib/askServe/areaContexts.ts`), and the Workspace page's contextual trigger (see
`ASK_SERVE_ARCHITECTURE.md`). Future example questions to fold into
`lib/askServe/knowledgeProfiles.ts`'s `today_work` copy once real answers exist — recorded
here as documentation only, not merged into the live copy this phase: "What changed since
yesterday?", "What can I finish in 30 minutes?", "What am I waiting on?", "What can safely
wait?"

## Completion Assistant

Unchanged from `TODAYS_WORK_CONTINUITY.md`: Completion Assistant is a **capability of**
Today's Work, never a separate product or navigation destination —

```
Today's Work
  -> Continuity
  -> Completion Assistant
```

It should always operate within Today's Work.

## Success criteria

Today's Work should ultimately become the answer to:

- Where do I begin?
- Where do I go after finishing something?
- Where do I understand today's priorities?
- Where do I continue interrupted work?
- Where do I see what changed?
- Where do I ask Serve what deserves my attention?

If the answer to each is naturally Today's Work, the operational home has been
established.

## Deliverables summary

### Immediate (implemented this phase)
- Sidebar Logo → real link to `/workspace` (`components/Sidebar.tsx`).
- "Dashboard" → "How We're Doing" launcher relabel (`app/workspace/page.tsx`).
- "Back to Workspace" → "Back to Today's Work" relabel (`app/residents/wellness/new/page.tsx`).
- Origin-aware, additive "Back to Today's Work" affordance on the three detail pages
  reachable from a Work Item (`lib/workspace/originMarker.ts`,
  `components/workspace/BackToTodaysWorkLink.tsx`, and the three detail pages), fully
  covered by unit tests.
- This document.

### Near-term
- A real breadcrumb component, if richer trail-of-navigation is wanted beyond Logo-as-Home
  plus the sidebar.
- Wiring `TopNav`'s notification bell to real, Today's-Work-anchored notifications.
- A keyboard shortcut resolving to Home.

### Future architecture
- Preserving active filter/tab/scroll/expanded-section state when returning to Today's
  Work.
- Mobile navigation's Home concept.
- Push notifications.
- Deep-link "Home" resolution semantics.
- Full Completion Assistant implementation (detect → explain → prepare → review →
  complete).
