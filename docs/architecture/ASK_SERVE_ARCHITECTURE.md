# Ask Serve Architecture

Ask Serve is not a chatbot embedded inside Serve OS. Ask Serve is the contextual
reasoning layer of Serve OS. Every interaction should become more intelligent because Ask
Serve understands where the user is, what they are viewing, what they are trying to
accomplish, and which operational perspective should guide its reasoning. This is the
north star for every decision made about Ask Serve, now and in future phases.

This document describes the architecture behind Ask Serve v0.1 — the first real,
shippable version of this capability (a typed context contract, a knowledge-profile
architecture, and a working panel shell), not a disposable mock. It also records the
intended shape of future phases so nothing built now blocks them.

## Search vs. Ask Serve

These are two distinct capabilities and must never be merged into one:

- **Search finds something known.** Search retrieves.
- **Ask Serve helps understand something.** Ask Serve reasons.

Serve OS's existing global search bar (`components/TopNav.tsx`) stays search. It is never
renamed to Ask Serve, and Ask Serve's panel never becomes a record-lookup tool. Keeping
this distinction sharp is what keeps Ask Serve legible as it grows — a user should never
have to guess which tool to reach for.

## Knowledge Profiles

A Knowledge Profile is not simply a retrieval filter. It represents the **operational
perspective** from which Ask Serve should reason in a given area of the application. It
shapes two things at once:

1. **Which knowledge is preferred** — e.g. within the People We Serve perspective, current
   needs, wellness notes, and relationships are the natural sources; within How We're
   Doing, KPIs and operational trends are.
2. **What kinds of questions naturally emerge** — "What needs follow-up?" is a natural
   question inside People We Serve and a strange one inside How We're Doing, where
   "What's trending down this month?" is natural instead.

Six profiles exist today (`lib/askServe/types.ts`):

| Profile | Perspective |
|---|---|
| `today_work` | Getting today's operational work done |
| `people_we_serve` | Understanding and caring for the people Serve supports |
| `people_who_serve` | Understanding and supporting the workforce |
| `organization_performance` | Understanding how the organization is doing overall |
| `community_outlook` | Understanding emerging conditions across communities |
| `general` | No specific operational perspective — an organization-wide fallback |

`general` deliberately replaces the earlier idea of a "global" profile — "global" becomes
ambiguous as the system grows (global across communities? across the whole product?
across every possible knowledge source?). `general` names exactly what it is: the
fallback perspective when no more specific one applies, distinct from
`organization_performance`, which is a specific perspective about organizational KPIs.

## The Context Stack

Future Ask Serve reasoning should assemble context in this order, building outward from
the person asking to what they are actually trying to understand:

1. **User** — who is asking? (role, permissions)
2. **Location** — where are they? (route / surface)
3. **Subject/Object** — what are they viewing? (a resident, a candidate, a community, a
   collection of records, ...)
4. **Operational Perspective** — which area of Serve are they working within? (the
   Knowledge Profile)
5. **Preferred Knowledge Sources** — given 1–4, what should be consulted first?
6. **Conversation Intent** — what is the user actually trying to understand?

`AskServeContext` (`lib/askServe/types.ts`), the typed payload built in this phase,
structurally captures layers 1–4 (`userRole`; `route`/`surface`; `subjectType`/
`subjectId`/`subjectLabel`; `knowledgeProfile`). Layers 5–6 — retrieval source selection
and intent parsing — are explicitly future work; no retrieval or LLM orchestration exists
yet. This document exists so the next contributor knows exactly where v0.1 stops and what
it was built to extend into.

No `organizationId`/`communityId` field is carried in the User layer today — this app is
confirmed single-tenant (one community) with no such identifiers anywhere in its schema.
Adding one now would be a fabricated field with nothing real behind it, contradicting
"never fabricate a subject identifier." The day Serve OS supports more than one
organization or community, that identifier belongs here, sourced from real data — not
before.

## One assistant, everywhere

There is exactly one `AskServeProvider`, one `AskServeStateContext`, one `AskServePanel`,
and one `AskServeTrigger` component (`components/askServe/`). Every entry point —
the persistent sidebar utility and every contextual per-surface button — opens the same
panel through the same `useAskServe()` state. Nothing renders a second panel
implementation or a separate assistant; only the `AskServeContext` payload passed to
`open()` differs.

**The persistent sidebar trigger is route-aware**, not generic: it calls the same
`getKnowledgeProfileForRoute(pathname)` used everywhere else
(`components/Sidebar.tsx`), so its Knowledge Profile — and therefore the panel's heading,
description, and example questions — changes as the user navigates, even though the
button itself never moves.

## Ask Serve is attached to operational surfaces, not pages

An operational surface is any screen where a person is actively performing meaningful
work or making a decision — not every route automatically qualifies (see "What's
deliberately not wired yet" below). Every meaningful operational surface exposes a
contextual Ask Serve trigger in its heading/action area, and **context is inherited as the
user goes deeper** — a child surface never restates what its parent already established,
it only adds what's new at its depth. The deepest valid context always wins.

This inheritance is a real, tiny function, not a convention held together by copy-paste:
`buildAskServeContext(parent, overrides)` (`lib/askServe/buildContext.ts`) returns
`{ ...parent, ...overrides }`. `lib/askServe/areaContexts.ts` defines one base
`AskServeContext` per top-level area (`TODAY_WORK_CONTEXT`, `PEOPLE_WE_SERVE_CONTEXT`,
`PEOPLE_WHO_SERVE_CONTEXT`, `ORGANIZATION_PERFORMANCE_CONTEXT`,
`COMMUNITY_OUTLOOK_CONTEXT`), plus one intermediate level,
`RELATIONSHIPS_CONTEXT = buildAskServeContext(PEOPLE_WE_SERVE_CONTEXT, {...})`, making the
3-level chain real in code:

```
Serve OS -> The People We Serve -> Relationships -> Action Board
PEOPLE_WE_SERVE_CONTEXT -> RELATIONSHIPS_CONTEXT -> buildAskServeContext(RELATIONSHIPS_CONTEXT, { surface: "relationship_action_board", ... })
```

Every wired surface today:

| Surface | Route | Label | Knowledge Profile (inherited) | `surface` (this depth) | Subject |
|---|---|---|---|---|---|
| Today's Work | `/workspace` | "Ask Serve about today's work" | `today_work` | `today_work` | `today_work` |
| Residents (list) | `/residents` | "Ask Serve about these residents" | `people_we_serve` | `residents_list` | `resident_collection` |
| Resident detail | `/residents/[id]` | "Ask Serve about this person" | `people_we_serve` | `resident_detail` | `resident` (id + display name) |
| Relationships (list) | `/relationships` | "Ask Serve about these relationships" | `people_we_serve` | `relationships_list` | `relationship_collection` |
| Relationship detail | `/relationships/[id]` | "Ask Serve about this relationship" | `people_we_serve` | `relationship_detail` | `relationship` (id + display name) |
| Action Board | `/relationships/actions` | "Ask Serve about today's follow-ups" | `people_we_serve` | `relationship_action_board` | `relationship_collection` (inherited) |
| Whiteboard | `/relationships/whiteboard` | "Ask Serve about this pipeline" | `people_we_serve` | `relationship_whiteboard` | `relationship_collection` (inherited) |
| Website Intake | `/relationships/intake` | "Ask Serve about this intake queue" | `people_we_serve` | `relationship_intake` | `relationship_collection` (inherited) |
| External Clients (list) | `/external-clients` | "Ask Serve about these clients" | `people_we_serve` | `external_clients_list` | `external_client_collection` |
| The People Who Serve | `/recruiting` | "Ask Serve about our team" | `people_who_serve` | `candidates_list` | `candidate_collection` |
| How We're Doing | `/` | "Ask Serve about our performance" | `organization_performance` | `organization_performance` | `organization` |
| Community Outlook | `/community-intelligence` | "Ask Serve about this community" | `community_outlook` | `community_outlook` | `community` |

Notice `knowledgeProfile` never changes within a branch (every Relationships-family
surface stays `people_we_serve`) while `surface` gets progressively more specific — this is
exactly "Knowledge Profiles represent the operational perspective; the surface refines it
further without exploding the number of top-level profiles."

### What's deliberately not wired yet, and why

- **Resident Timeline** (a card inside Resident Detail) is still a `PlaceholderSection`
  with no real content or interactivity — not yet a meaningful operational surface by the
  test above ("is this screen where someone does meaningful work or makes a decision?").
  Adding a button to an inert placeholder would be decorative, not functional. The
  inheritance pattern (`buildAskServeContext(PEOPLE_WE_SERVE_CONTEXT, { surface:
  "resident_timeline", subjectId, subjectLabel, ... })`) is ready the day Timeline becomes
  real.
- **Employees, Training, Compliance** (The People Who Serve's future sub-areas) have no
  routes in this app yet — nothing to wire.
- **How We're Doing** and **Community Outlook** sub-pages (Performance/KPIs, community
  detail pages) don't exist as separate routes yet either — both areas are currently
  single pages, already wired at that one level.

Every trigger above is gated by `lib/askServe/featureFlag.ts` — non-flagged users see
nothing new (no button appears; the sidebar falls back to a plain `/ask-serve` link) —
never a broken or half-wired control.

## Future capability boundaries

Today's read-only, human-approved-write posture is v0.1 of an intended progression, not a
permanent ceiling:

**Read → Explain → Recommend → Prepare actions → Execute approved actions**

- **Read** — construct grounded context about what the user is looking at. *(v0.1: done —
  `AskServeContext` construction.)*
- **Explain** — answer questions using that context, showing its work. *(v0.1: UI shell
  only — the panel renders honest example questions and a not-yet-connected state; no
  answers are generated.)*
- **Recommend** — surface a specific suggested next step. *(Not built.)*
- **Prepare actions** — draft a concrete change for a human to review. *(Not built.)*
- **Execute approved actions** — perform a change a human has explicitly approved. *(Not
  built. When it exists, it must never execute without that explicit approval — see
  Permission and evidence boundaries below.)*

Nothing in `AskServeContext` or the panel/trigger component API should need to be
restructured to add Recommend/Prepare/Execute later. Equally, no speculative field for
those phases is added now — see "Avoid premature abstraction" below.

`AskServeContext.capabilityLevel` names which of the above is available for a given
context — every context built today sets it to `"explain"`. It is a statement of what's
actually wired, not a promise: `"recommend"`/`"prepare"`/`"execute"` are deliberately not
valid values yet, because nothing implements them. Add a value the day its capability is
real, not before.

**Completion Assistant** (documented in
[`TODAYS_WORK_CONTINUITY.md`](./TODAYS_WORK_CONTINUITY.md)) is this exact progression
applied specifically to finishing work a user already started, as a capability of Today's
Work — never its own module or navigation destination. Its "detect → explain → prepare →
review → complete" flow is the same Read → Explain → Recommend → Prepare → Execute chain
described above, not a second, unrelated progression.

## Permission and evidence boundaries

- Ask Serve context never grants permissions beyond the viewing user's own `role`
  (`lib/auth/constants.ts`'s `AuthRole`). Page context is metadata, not an access grant.
- Knowledge Profiles are retrieval-scope *preferences* — signals about what's likely
  relevant — never a mechanism that expands what a user is allowed to see.
- Hidden or restricted records must never be included in context merely because Ask Serve
  is available globally.
- Once real answers exist, they must distinguish: directly observed evidence,
  deterministic inference, human confirmation, and recommendation. No answer should ever
  be presented as fact without that grounding.
- Future writes (Prepare/Execute) require explicit human approval, always. No autonomous
  write behavior is ever acceptable for Ask Serve.

## Avoid premature abstraction

Build only the interfaces, contracts, and UI necessary to support this future
architecture. Avoid speculative frameworks or generalized retrieval infrastructure before
it is needed. Favor small, composable pieces over a single do-everything module — e.g.
`lib/askServe/knowledgeProfiles.ts`, `lib/askServe/state.ts`, and
`lib/askServe/featureFlag.ts` are deliberately separate, small, independently testable
files rather than one "AskServeEngine." The same applies to every future phase: build the
next capability when it's needed, shaped by what v0.1 actually teaches us, not in
anticipation of a design that hasn't been validated yet.
