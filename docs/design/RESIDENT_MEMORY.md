# Resident Memory — Conceptual Model

Status: Current Needs, Working Notes, Timeline, and Getting to Know implemented. Resident Intelligence is a placeholder — not built.

## Product principle

**Every information-capture surface should make its purpose and correct use obvious through the interface.** Users should not need training, an SOP, or tribal knowledge to determine where a piece of resident information belongs. The UI teaches the distinction every time it's used: a short functional label, a one-sentence purpose, and concise "belongs here / not here" guidance sit directly on each surface, not in a separate help document.

## The complete resident-information model

- **Current Needs** — current truth about care and support.
- **Getting to Know** — human and relationship context.
- **Working Notes** — temporary operational items.
- **Timeline** — permanent chronological history.
- **Resident Intelligence** — future derived-insight layer; not implemented.

## The four implemented layers

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

### Getting to Know
**Question answered:** "What helps us know and connect with this person?"
**Purpose:** Relationship memory that helps Serve know and connect with the resident — interests, preferences, family context, conversation cues, small observed details, and meaningful dates. Not care guidance and not an operational task list.
**Lifecycle:** Remains useful unless corrected, disproven, or no longer relevant — not versioned like Current Needs and not resolved/archived on a timer like Working Notes; entries simply stay until someone archives one that's wrong or outdated.

Renamed from "Connections" (no schema change — still `resident_relationship_profiles`, `resident_interests`, `resident_milestones`, `resident_touches`; see `supabase/migrations/20260711000000_create_resident_connections.sql`). "Connections" tested as ambiguous — a normal reader could take it as contacts, networking, or linked accounts. Organized into:

- **Personal Details** — preferred name, relationship stage, meaningful-touch dates (`resident_relationship_profiles`, via `RelationshipDetailsCard`).
- **Things They Enjoy / Family & Important People / Conversation Cues / Preferences & Little Details** — four display groupings of `resident_interests`, computed by `getDisplayGroupForInterestType()` (`lib/gettingToKnow/mapping.ts`) from the table's existing 16-value `interest_type` enum. A resident with no interests recorded sees one unified "What We've Learned" empty state rather than four separate empty subsections — a zero-entry group is hidden rather than shown empty, the same pattern used for zero-match groups in the Residents search results.
- **Important Dates** — unchanged, still `resident_milestones`.
- **Recent Touches** — intentionally **not rendered**. `resident_touches` has a complete schema and a data-layer read/write path (`getRecentTouches`/`createTouch`) but no server action or UI anywhere ever calls the write path — it has always rendered its empty state. Its concept (chronological interaction history) already belongs to Timeline. Removing the display avoids that section teaching staff the wrong lesson about what's actually being recorded; the table and data functions are untouched in case a future phase wires up real touch-logging.

The entry form ("Add Something We Learned") presents a simplified 7-value `TYPE`, 6-value `SOURCE`, and 3-value `CONFIDENCE` (`lib/gettingToKnow/mapping.ts`) that map down onto the existing schema's fuller enums — the schema keeps its original granularity, only the data-entry UI is simplified. Archiving an entry flips the existing `active` boolean (present in the schema since the original migration but never exposed in any UI until this phase) — no new column, no deletion, still readable via a direct query for full historical traceability.

## Why these four and not one generic "notes" field

Every piece of resident information has exactly one intended home:
- Recurring, durable, care-relevant → **Current Needs**
- Temporary, in motion, expected to resolve or get promoted → **Working Notes**
- Already happened, factual, system-observed → **Timeline**
- Human, relational, helps staff connect → **Getting to Know**

If a user is unsure which layer applies, the editors point at each other directly rather than describing the distinction in the abstract: the Current Needs editor says "Use Working Notes for temporary or pending items" / "Timeline records important events and completed actions," each linking straight to that section on the same page, plus its own lifecycle line, "Update this when the resident's needs or care expectations change." The Working Notes editor's lifecycle hint closes the loop: "When finished, resolve the note. If it becomes lasting resident guidance, update Current Needs." The Getting to Know entry form carries the same four-way guidance explicitly — "Use Current Needs for…", "Use Working Notes for…", "Timeline records…", "Use Getting to Know for…" — with real anchor links to the other three sections on the same page.

## Shared UI pattern

Current Needs, Working Notes, and Timeline live together in one `ResidentMemory` card and share one header component, `MemorySectionHeader` (`components/residents/MemorySectionHeader.tsx`):

- **Title** — the layer's name (e.g. "Working Notes")
- **Functional label** *(optional)* — a `Badge` restating its role in plain language ("In Progress" / "History") — real text, not color-only. Current Needs intentionally omits one; see above.
- **Purpose** — one sentence
- **Belongs here / Not here** — compact, inline `·`-separated examples, shown only in the read state (hidden while actively editing, where the more specific destination guidance takes over instead, so the two don't stack)
- **Primary action** — top-right, consistent with every other edit affordance already in the Resident Profile page (Timeline has none — it has no manual-entry path)

This keeps those three layers visually and structurally one subsystem — internal dividers, not three separate stacked cards — while letting each layer's actual content (a single summary, a list of notes, a day-grouped event log) differ underneath.

Getting to Know is a separate card (right-hand column of the resident detail page, not inside `ResidentMemory`) — it predates `MemorySectionHeader` and existed as its own card before this phase, so it keeps its own simpler title/purpose header rather than being moved into the memory container. It follows the same information-affordance principle through its own means: a purpose sentence under the section title, and the destination-guidance links described above inside its entry form.

## Non-goals

**Prior UX-language pass:** automatic promotion of a Working Note into Current Needs, AI-assisted note routing/classification, manual Timeline entries, and new database models.

**This phase (Getting to Know rename + verification + cleanup):** Resident Intelligence, the operational whiteboard, Serve Intelligence Constitution amendments, assessment import, Cinch/AxisCare synchronization changes, a broader resident-page redesign, and any promotion workflow between layers (an archived Getting to Know entry is not automatically copied anywhere — a person decides where the corrected information goes, the same way a resolved Working Note isn't automatically copied into Current Needs).

## Backlog

Consider codifying the Information Affordance Principle ("every information-capture surface should make its purpose and correct use obvious through the interface") in the Serve Intelligence Constitution during a future documentation governance review. Not done here — this file is the working design note, not a constitutional document, and no constitutional document was modified as part of any Resident Memory phase to date.
