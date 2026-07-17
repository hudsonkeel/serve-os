# Resident Memory — Conceptual Model

Status: Current Needs, Working Notes, and Timeline implemented. Resident Intelligence is a placeholder — not built.

## Product principle

**Every information-capture surface should make its purpose and correct use obvious through the interface.** Users should not need training, an SOP, or tribal knowledge to determine where a piece of resident information belongs. The UI teaches the distinction every time it's used: a short functional label, a one-sentence purpose, and concise "belongs here / not here" guidance sit directly on each surface, not in a separate help document.

## The three layers

### Current Needs
**Question answered:** "What is currently true and relevant for this resident's care?"
**Purpose:** Current care guidance that remains active until the resident's ongoing needs or care expectations change.
**Lifecycle:** Durable — stays valid indefinitely, not tied to any particular visit or cadence. One active version at a time (see `resident_current_needs`, versioned/superseded on every save — never overwritten silently).

Deliberately has no functional-label badge (see "Shared UI pattern" below) — an earlier version of this section carried "EVERY VISIT," which implied every item applies on every single visit. That's not what Current Needs means: it means "true right now, until someone updates it." No single word summarizes that without either implying a frequency (misleading) or restating the section title (redundant), so the title plus purpose sentence carry the meaning on their own.

### Working Notes — *In Progress*
**Question answered:** "What is currently being worked on?"
**Purpose:** Temporary operational items that remain active until resolved or archived.
**Lifecycle:** Temporary — expected to change. Append-only (see `resident_working_notes`): resolving or archiving updates the row's status rather than creating a new row or deleting it. A resolved note that becomes durable guidance is expected to be manually copied into Current Needs — there is no automatic promotion workflow (non-goal across every Resident Memory phase so far).

### Timeline — *History*
**Question answered:** "What has already happened?"
**Purpose:** Permanent chronological resident history.
**Lifecycle:** Permanent — chronological, factual, system-generated only (see `resident_timeline`). No manual-entry path exists. Automatically logged today: a resident being created, a Current Needs save that actually changes content, a Working Note being added, and a Working Note being resolved. The UI's "Automatically records" guidance intentionally lists only these — not calls, emails, or assessments, since nothing in the codebase generates those events yet. When those integrations exist, this line and the event-type check constraint on `resident_timeline` both need updating together.

## Why these three and not one generic "notes" field

Every piece of resident information has exactly one intended home:
- Recurring, durable, care-relevant → **Current Needs**
- Temporary, in motion, expected to resolve or get promoted → **Working Notes**
- Already happened, factual, system-observed → **Timeline**

If a user is unsure which layer applies, the editors point at each other directly rather than describing the distinction in the abstract: the Current Needs editor says "Use Working Notes for temporary or pending items" / "Timeline records important events and completed actions," each linking straight to that section on the same page, plus its own lifecycle line, "Update this when the resident's needs or care expectations change." The Working Notes editor's lifecycle hint closes the loop: "When finished, resolve the note. If it becomes lasting resident guidance, update Current Needs."

## Shared UI pattern

All three layers use one shared header component, `MemorySectionHeader` (`components/residents/MemorySectionHeader.tsx`):

- **Title** — the layer's name (e.g. "Working Notes")
- **Functional label** *(optional)* — a `Badge` restating its role in plain language ("In Progress" / "History") — real text, not color-only. Current Needs intentionally omits one; see above.
- **Purpose** — one sentence
- **Belongs here / Not here** — compact, inline `·`-separated examples, shown only in the read state (hidden while actively editing, where the more specific destination guidance takes over instead, so the two don't stack)
- **Primary action** — top-right, consistent with every other edit affordance already in the Resident Profile page (Timeline has none — it has no manual-entry path)

This keeps the three layers visually and structurally the same subsystem — one `ResidentMemory` card with internal dividers, not three separate stacked cards — while letting each layer's actual content (a single summary, a list of notes, a day-grouped event log) differ underneath.

## Non-goals of this UX pass

Automatic promotion of a Working Note into Current Needs, AI-assisted note routing/classification, manual Timeline entries, and new database models were explicitly out of scope — this pass only changes how the existing three layers explain themselves.

## Backlog

Consider codifying the Information Affordance Principle ("every information-capture surface should make its purpose and correct use obvious through the interface") in the Serve Intelligence Constitution during a future documentation governance review. Not done here — this file is the working design note, not a constitutional document, and no constitutional document was modified as part of any Resident Memory phase to date.
