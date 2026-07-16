# Resident Memory — Conceptual Model

Status: Current Needs, Working Notes, and Timeline implemented. Resident Intelligence is a placeholder — not built.

## Product principle

**Every information-capture surface should make its purpose and correct use obvious through the interface.** Users should not need training, an SOP, or tribal knowledge to determine where a piece of resident information belongs. The UI teaches the distinction every time it's used: a short functional label, a one-sentence purpose, and concise "belongs here / not here" guidance sit directly on each surface, not in a separate help document.

## The three layers

### Current Needs — *Every Visit*
**Question answered:** "What should Serve staff know before interacting with this resident?"
Curated, durable resident guidance. One active version at a time (see `resident_current_needs`, versioned/superseded on every save — never overwritten silently).

### Working Notes — *In Progress*
**Question answered:** "What is currently being worked on?"
Temporary operational items expected to change. Append-only (see `resident_working_notes`): resolving or archiving updates the row's status rather than creating a new row or deleting it. A resolved note that becomes durable guidance is expected to be manually copied into Current Needs — there is no automatic promotion workflow (non-goal, both in the phase that built Working Notes and in this UX pass).

### Timeline — *History*
**Question answered:** "What has happened?"
Chronological, factual, system-generated only (see `resident_timeline`). No manual-entry path exists. Automatically logged today: a resident being created, a Current Needs save that actually changes content, a Working Note being added, and a Working Note being resolved. The UI's "Automatically records" guidance intentionally lists only these — not calls, emails, or assessments, since nothing in the codebase generates those events yet. When those integrations exist, this line and the event-type check constraint on `resident_timeline` both need updating together.

## Why these three and not one generic "notes" field

Every piece of resident information has exactly one intended home:
- Recurring, durable, care-relevant → **Current Needs**
- Temporary, in motion, expected to resolve or get promoted → **Working Notes**
- Already happened, factual, system-observed → **Timeline**

If a user is unsure which layer applies, the editors point at each other directly rather than describing the distinction in the abstract: the Current Needs editor asks "Temporary or pending item? Add it to Working Notes" / "Recording something that already happened? It belongs in Timeline," each linking straight to that section on the same page. The Working Notes editor's lifecycle hint closes the loop: "When finished, resolve the note. If it becomes lasting resident guidance, update Current Needs."

## Shared UI pattern

All three layers use one shared header component, `MemorySectionHeader` (`components/residents/MemorySectionHeader.tsx`):

- **Title** — the layer's name (e.g. "Working Notes")
- **Functional label** — a `Badge` restating its role in plain language ("Every Visit" / "In Progress" / "History") — real text, not color-only
- **Purpose** — one sentence
- **Belongs here / Not here** — compact, inline `·`-separated examples, shown only in the read state (hidden while actively editing, where the more specific destination guidance takes over instead, so the two don't stack)
- **Primary action** — top-right, consistent with every other edit affordance already in the Resident Profile page (Timeline has none — it has no manual-entry path)

This keeps the three layers visually and structurally the same subsystem — one `ResidentMemory` card with internal dividers, not three separate stacked cards — while letting each layer's actual content (a single summary, a list of notes, a day-grouped event log) differ underneath.

## Non-goals of this UX pass

Automatic promotion of a Working Note into Current Needs, AI-assisted note routing/classification, manual Timeline entries, and new database models were explicitly out of scope — this pass only changes how the existing three layers explain themselves.
