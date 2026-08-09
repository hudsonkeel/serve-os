# Today's Work — Continuity Foundation

Today's Work is the continuity layer of Serve OS. It exists to reduce the burden of
remembering administrative work while preserving human responsibility for judgment and
completion. Its purpose is to help people continue delivering meaningful work — not
merely to display tasks.

This document describes the Work Item model, the sources it aggregates today, the
ranking rules, and the architectural principles that keep this layer honest as it grows.

## Operational Summary and the continuity layer are complementary

`/workspace` has two distinct sections that answer two different questions:

- **Operational Summary** (the original six-tile grid: Assessments, Follow-ups, Wellness
  Follow-ups, Proposals, Recruiting, Payroll) answers **"where should I look?"** — raw,
  aggregate counts per domain.
- **The continuity layer** (Needs Attention, Resume Work, Due Today, Upcoming, Waiting On,
  Recently Completed) answers **"what exactly should I do?"** — real, individually-
  addressable Work Items, each with provable evidence of incompleteness.

Both stay on the page indefinitely. The continuity layer is additive, never a
replacement — unless a future phase finds a concrete reason they can't coexist.

## Aggregation layer, not a system of record

Today's Work aggregates operational work from multiple systems (resident wellness,
relationships, recruiting) but never becomes authoritative for any of it. The underlying
resident, relationship, recruiting, assessment, or proposal record remains the source of
truth; every surfaced `WorkItem.sourceRoute` (`lib/workspace/workItem.ts`) links back to
it. Today's Work elevates work, it never owns it — there is no local "mark complete" here;
completing a wellness follow-up or relationship action still happens on its own source
page, through the same mutations those pages already use.

## The Work Item model

`lib/workspace/workItem.ts` defines `WorkItem` — the shared shape every source is mapped
into (`lib/workspace/mapping.ts`). Fields worth calling out:

- `evidenceType: "explicit" | "deterministic"` — only these two exist today.
  - **Explicit**: the source record directly says it's open, overdue, on hold, or
    unresolved (wellness follow-ups, relationship actions, on-hold relationships).
  - **Deterministic**: a defined rule proves a required step is missing (no-next-action
    prospects, and the Continuity-Rule-gated assessments/proposals/recruiting items below).
  - `"likely_interruption"` and `"recommendation"` are future-only evidence classes — see
    "Future continuity states" below. No mapper produces them today.
- `explanation` is required, not optional — every item must answer "why is this here?"
  Never a vague, evidence-free warning.
- `ownerId`/`ownerLabel` are free-text match keys (email or full name), never a real
  uuid — see "Ownership matching" below.

## Attention should be earned

A Work Item appears in Needs Attention only when there is explicit or deterministic
evidence that immediate human attention is warranted — never because a generic status
value merely exists. Today's Work must never become a notification center: keep
information in its source workflow, elevate only work that genuinely requires a decision
or next step, and avoid duplicating informational records the Operational Summary already
shows as a count. If everything qualified as Needs Attention, nothing would truly be.

### Continuity Rules

Continuity Rules are the mechanism behind that principle: a per-source, evidence-based
test for whether a given piece of work has earned a place in the continuity layer yet.
Wellness follow-ups and relationship actions already have rock-solid evidence (a real
`due_at` in the past, or due today) and need no additional rule. Two sources needed one:

- **Assessments/Proposals** (`relationships.stage`): a relationship in
  `assessment_scheduled`/`proposal_in_progress`/`proposal_sent` only becomes a Work Item
  once `last_meaningful_touch_at` (or `updated_at`, if never touched) is more than
  `ASSESSMENT_PROPOSAL_STALE_DAYS` (5, `lib/workspace/mapping.ts`) days old.
- **Recruiting** (`recruiting_leads`): a lead in `new`/`in_review` only becomes a Work Item
  once `created_at` is more than `RECRUITING_LEAD_STALE_DAYS` (3, same file) days old.

This phase implements exactly one kind of Continuity Rule — elapsed time since last
contact. A Continuity Rule is not inherently time-based, though. Future rules (documented
here for whoever builds them, not implemented now): "awaiting family response," "unsigned
paperwork," "documentation incomplete," "missing visit verification," "pending payroll
approval." Every source's Continuity Rule(s) should be named and justified in this
document as they're added, not left implicit in code.

## Supported vs. unsupported sources

| Source | Table | Evidence | Continuity Rule needed? |
|---|---|---|---|
| Wellness follow-ups | `resident_wellness_follow_ups` | `due_at` vs. now, or `status='in_progress'` | No — due date is already explicit |
| Relationship actions | `relationship_actions` | `due_at` vs. now | No |
| Assessments/Proposals | `relationships.stage` | stage value | Yes — staleness (5 days) |
| Recruiting | `recruiting_leads` | `status in (new, in_review)` | Yes — staleness (3 days) |
| Waiting On | `relationships.status = 'on_hold'` | status value | No |
| No next action | active prospect-type relationship, zero open actions | reuses `getRelationshipAttentionStatus`'s existing `"no_next_action"` bucket verbatim (`lib/relationships/attention.ts`) | No — already a defined rule |

**Explicitly not wired this phase:**

- **Schedule exceptions (AxisCare)** — already fully served by
  `components/scheduling/TodaysSchedulePanel.tsx`'s own "Attention Needed" unassigned-visit
  view, which stays as-is. Duplicating them here would show the same information twice on
  one page, and there's no per-visit detail route to link a Work Item to.
- **True nearly-complete / percent-complete** — no table has a completion-percentage
  concept. Not approximated beyond `status = 'in_progress'` on wellness follow-ups.
- **True safety-relevant exception flag** — doesn't exist. Not approximated beyond
  `priority = 'urgent'`.
- **Per-user assignment for recruiting, assessments/proposals, current needs, wellness
  notes** — no assignee field exists on any of these.
- **Compliance items** — no compliance data model exists anywhere in the app yet.

No schema change was required for anything wired this phase — every needed field already
existed; the gap was entirely in the read layer (`lib/data/todaysWork.ts`,
`lib/data/wellnessFollowUps.ts`'s two new bulk-list functions).

## Ranking

`lib/workspace/ranking.ts#rankWorkItems` orders items within a section (never across
sections — which section an item lands in already reflects its urgency tier). Tie-break
chain, mirroring `lib/relationships/sorting.ts`'s style exactly: priority (urgent > high >
normal > low > unset) → `dueAt` ascending (undated last) → `id` (stable, fully
deterministic). No LLM ranking.

## Sections are configuration

`lib/workspace/sections.ts#WORK_SECTION_CONFIG` is a plain array (`{status, label,
emptyStateDescription, alwaysRender?}`), not a hardcoded switch. Adding a future section
(e.g. "Ready for Review," "Waiting on Family," "Blocked") is a config-array edit plus one
new `WorkItemStatus` value — never a rendering-logic rewrite.

## Ownership matching

No per-user uuid identity exists anywhere in this app — `assigned_to`/`owner_label` are
free-text fields, matched (`lib/workspace/ownership.ts`) against the current user's email
or full name, case-insensitively. This is a best-effort string match, not a real identity
system, and is documented as a limitation rather than silently worked around. Sources with
no assignee concept at all (recruiting, assessments/proposals beyond `owner_label`) are
always treated as unassigned/team work — never hidden, since the default filter is "All."

## Work Sources (future architectural principle — not implemented this phase)

Today's Work should remain extensible through independently-owned Work Sources
(Relationships, Wellness, Recruiting, Scheduling, Payroll, Quality, Compliance, Community,
and future domains). Each Work Source owns *what constitutes unfinished work*, *what
evidence/Continuity Rule is required*, and *how its continuity items are produced* —
Today's Work only aggregates their outputs; it never becomes the place every domain's
business logic accumulates. This phase's `lib/workspace/mapping.ts` co-locates all current
mapper functions in one file because there are only a handful and the domain is young; as
more Work Sources are added, each should move to living beside its own domain (e.g. a
future `lib/recruiting/workSource.ts`, `lib/payroll/workSource.ts`) rather than growing one
aggregator file indefinitely.

## Completion Assistant is a capability of Today's Work, not a separate product

The long-term progression is:

```
Today's Work
  -> Needs Attention
  -> Resume Work
  -> Completion Assistant
```

**Completion Assistant** helps a user finish work they've already started: detect
unfinished work → explain the evidence → prepare the remaining work → ask for review →
complete only after explicit approval. It never becomes its own module or navigation
destination. This flow is explicitly the same **Read → Explain → Recommend → Prepare
actions → Execute approved actions** progression already documented in
[`ASK_SERVE_ARCHITECTURE.md`](./ASK_SERVE_ARCHITECTURE.md), applied specifically to
finishing started work — cross-linked from both docs, not treated as an unrelated new
concept. Potential future examples: an unsent email draft, a proposal missing final
review, an assessment missing required fields, a follow-up started but unresolved, an
interaction containing an unrecorded commitment, documentation prepared but not submitted.
None of this is implemented this phase — no Gmail access, no auto-editing, no sending, no
action execution.

## Future continuity states

Documented, not implemented — only `Explicit` and `Deterministic` evidence (see above) may
produce real surfaced items this phase:

**Continuity states:** `Assigned`, `Incomplete`, `Interrupted`, `Waiting`, `Suggested`,
`Prepared for Review`, `Completed`, `Dismissed`, `Deferred`.

**Evidence classes:** `Explicit`, `Deterministic`, `Likely interruption`, `Recommendation`.

No speculative interruption detection, user activity surveillance, or LLM-generated task
inference exists anywhere in this phase.
