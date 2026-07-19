# Relationship Intelligence — Phase 1 Implementation

Branch: `feature/relationship-intelligence-interaction-capture`. The central data-model decision this phase makes is recorded in ADR 0003 (`docs/architecture/decisions/0003-interaction-extends-touch.md`) — read that first for *why*; this document is *what* was built and *where*.

## What this phase proves

One unified **Log Interaction** capture flow: a person records what happened once, and that single submission can atomically produce a Touch-equivalent Interaction record plus optional Insights (durable learned context), Commitments (who agreed to do what), Open Loops (unresolved questions), and a Next Action. The Relationship page then renders a deterministic, source-grounded **Relationship Brief** and **Recommended Follow-Up** from those structured records — never inventing a fact the records don't contain.

## Interaction architecture

Interaction **extends** `relationship_touches` in place (ADR 0003) rather than being a new table. Layering:

```
Pure validation          lib/relationships/validation.ts (normalize*, validateParticipants)
        ↓
Server Action             lib/actions/relationships.ts#logRelationshipInteraction — validates,
                          resolves actor, delegates. No decision logic of its own.
        ↓
Data layer                lib/data/relationships.ts#logRelationshipInteraction — one RPC call.
        ↓
Atomic RPC                log_relationship_interaction() — supabase/migrations/
                          20260725000000_create_relationship_interaction_intelligence.sql
```

`log_relationship_interaction` is one `plpgsql` function body (one transaction): validates its inputs (required fields, JSON-array shape on every collection parameter, participant shape), checks an optional idempotency key first (a retried/double-clicked submission returns the original row rather than duplicating it), inserts the Interaction row, conditionally advances `relationships.last_meaningful_touch_at` (only when the interaction result indicates real engagement — see "Conditional last_meaningful_touch_at" below), loops three jsonb array parameters inserting Insights/Commitments/Open Loops, and — only if a Next Action was explicitly submitted — composes the existing `create_relationship_action()` RPC, exactly matching the composition pattern `process_website_intake_submission` already established in this codebase. A partial submission never leaves an Interaction recorded without its explicitly-submitted accountability records, because nothing commits until the whole function returns. Revised in full before its first commit — see ADR 0003's "Revision" section for the complete list of what changed and why.

## Persistence mapping

| Table | Status | Notes |
|---|---|---|
| `relationship_touches` | Extended | +`interaction_result`, +`participants` jsonb, +`idempotency_key` (unique, nullable), +2 `touch_type` values. Every existing row is already a valid Interaction. |
| `relationship_insights` | New | Lifecycle: `active` → `resolved`/`outdated`, bidirectional closure-metadata constraint. Attributable to a source Interaction; optionally linked to a Resident (real FK, never a duplicate identity) or a free-text contact name. `updated_at`/`updated_by` via trigger. |
| `relationship_commitments` | New | Lifecycle: `open` → `completed`/`cancelled` (`superseded` deferred — no real supersede workflow exists). Consistent closure fields regardless of terminal status: `closed_at`, `closed_by`, `closure_note`. `updated_at`/`updated_by` via trigger. |
| `relationship_open_loops` | New | Lifecycle: `open` → `resolved`/`no_longer_relevant` (`superseded` deferred, same rationale). `resolved_at`, `resolved_by`, `resolution`. `updated_at`/`updated_by` via trigger. |
| `relationship_actions` | Extended | +1 nullable FK (`source_interaction_id`) tracing a Next Action back to the Interaction that spawned it. (`source_commitment_id`/`source_open_loop_id` were deferred — nothing in this phase sets them.) |
| `relationship_working_notes` | Extended | +`relevant_until` date, +`resident_id` (real FK), +`contact_name`, +`source_description` — fields the original scope asked for that a first pass of this migration missed. Status vocabulary (`open`/`resolved`/`archived`) unchanged. |
| `relationship_timeline` | Extended | +3 `event_type` values (`interaction_logged`, `commitment_resolved`, `open_loop_resolved`). Existing values (including `touch_logged`, still used by the Action Board's lightweight quick-touch path) unchanged. No per-child-record event on initial capture — see "Timeline noise" below. |

No new table for the Relationship Brief — see "Brief generation" below.

## Idempotency

`relationship_touches.idempotency_key` is a nullable, uniquely-indexed column. The Log Interaction form (`RelationshipInteractionsSection.tsx`) generates one key (`crypto.randomUUID()`) per form session, regenerated whenever the form resets (after a successful save or on cancel) — never reused across genuinely different submissions. `log_relationship_interaction` checks this key first, before any insert: if a row with that key already exists, it returns that row immediately rather than creating a duplicate Interaction and re-running the Insights/Commitments/Open Loops/Next-Action logic. A retry after a real validation error reuses the same key, which is intentional — if the first attempt had actually succeeded server-side despite an error being reported client-side (e.g. a dropped response), the retry safely returns the original result instead of duplicating it.

## Conditional `last_meaningful_touch_at`

Only an `interaction_result` indicating real engagement advances `relationships.last_meaningful_touch_at` — `left_voicemail` and `no_response` do not, matching the field's own name. A voicemail is a real, worth-recording interaction, but it isn't contact, and shouldn't reset the "how long since we actually reached someone" clock the rest of the app (attention/overdue derivation) relies on. This only affects the new `log_relationship_interaction` RPC; the pre-existing `log_relationship_touch` RPC (still used by the Action Board's lightweight quick-touch path) has no `interaction_result` concept and is unchanged.

## Timeline noise

Only one `interaction_logged` Timeline event is produced per Log Interaction submission, regardless of how many Insights/Commitments/Open Loops it also creates — its `event_description` summarizes counts (e.g. "...(2 insights, 1 commitment)") instead of one event per child row. A distinct event fires only when something is later **closed** (`commitment_resolved`, `open_loop_resolved`).

## Interaction-to-Next-Action workflow

The Log Interaction form's "Follow-up needed?" (Yes / No / Unsure) is submitted as part of the same interaction payload:
- **Yes** reveals Next Action fields (title, type, owner, due date, priority); on submit, `log_relationship_interaction` composes `create_relationship_action()` and stamps `source_interaction_id` on the result.
- **Unsure** offers an optional free-text field that, if filled, becomes an Open Loop instead — never a silently auto-created Next Action (per the scope's explicit "no silent background automation" instruction, this requires the user to actually type something, rather than fabricating a generic placeholder Open Loop from the Unsure selection alone).
- **No** creates neither.

## Working Note lifecycle (narrowed, extended with the scope's fields)

Working Notes are now scoped to "temporary or contextual information that did not arise from a formal Interaction or does not yet justify a durable Insight" — a purpose statement, not a status-vocabulary change. The category *values* (`operational, family, scheduling, sales, clinical, general`) and status vocabulary (`open`/`resolved`/`archived`) are unchanged: retyping existing rows' categories, or renaming a working status column to the scope's literal "active/resolved/outdated" wording, are content decisions that risk mischaracterizing real prototype data, flagged below as a Phase 2 follow-up rather than guessed at here.

What *did* change (added in the pre-commit revision — see ADR 0003 point 13, missed in the first draft): `relevant_until` (optional review/expiration date — exposed in the Log Working Note form as "Review by"), `resident_id` (real FK, for linking a note to a resident), `contact_name` (free text, matching the codebase's existing no-Contact-master-record convention), `source_description` (free text — deliberately not a formal Interaction FK, since Working Notes are specifically for information that did *not* arise from one). Only `relevant_until` has UI exposure in this phase; `resident_id`/`contact_name`/`source_description` are supported by the data layer and RPC but not yet collected by the create form — flagged below.

## Brief generation rules (grounding)

`lib/relationships/brief.ts#generateRelationshipBrief()` is a pure, deterministic, template-based function — no AI call, no persistence. It's computed fresh on every Relationship page load from exactly the records the page already fetches (recent Interactions, active Insights, open Commitments, open Open Loops, current Next Action). This decision was reconsidered during review and reaffirmed: **no Relationship Brief table exists in Phase 1, and none is added.**

**Explicit limitation this creates**: because no generation snapshot is ever stored, Phase 1 cannot compare a current Brief against a prior generation, and cannot show "source data changed since generation" — there is nothing to diff against. "Regenerate" and "last generated timestamp" both collapse to trivial cases (every page load *is* a regeneration; the timestamp is always "now") specifically because staleness detection doesn't exist yet, not because it was solved another way. The `updated_at` columns added to Insights/Commitments/Open Loops in this migration exist so a *future* persisted/staleness-tracked version has something to fingerprint against — but nothing computes or stores that fingerprint today. See "Known limitations" below.

**The one rule every section obeys**: never state something the input data doesn't contain. Every section carries a `basedOn: SourceReference[]` list; when a section has no grounding data, it states an explicit uncertainty sentence (e.g. "No durable context has been recorded yet...") instead of omitting the section or inventing plausible-sounding content. Verified in `lib/relationships/__tests__/brief.test.ts` — sparse-input tests assert the exact uncertainty phrasing and an empty `basedOn` list; full-input tests assert every section's `basedOn` is non-empty and the interaction's exact recorded text appears verbatim (not a paraphrase).

`generateRelationshipBrief` accepts an optional `narrativeRefiner` — a documented, currently-unused extension seam (`(draft: RelationshipBrief) => RelationshipBrief`). No approved AI/language-generation provider exists in Serve OS yet; when one is approved, it can wrap this function's deterministic output to improve phrasing without this file's data contract changing at all. Not called anywhere in Phase 1.

## Source-grounding and traceability

Every `SourceReference` (`{kind, id, label}`) points at a real row: `interaction` → `relationship_touches.id`, `insight` → `relationship_insights.id`, `commitment` → `relationship_commitments.id`, `open_loop` → `relationship_open_loops.id`, `next_action` → `relationship_actions.id`, `relationship` → `relationships.id` (used only for the stage-derived Current Goal section, which has no more specific source). The Relationship Brief's "Based On" list is the deduplicated union of every section's references. **Users correct facts at the source** — resolving/editing an Insight, Commitment, or Open Loop, or logging a new Interaction — never by editing generated Brief text, because there is no generated text to edit; it's regenerated fresh every time.

## Relationship page reorganization

`app/relationships/[id]/page.tsx`: identity/stage → Overview → (Service Location / Convert / External Client panels, unchanged) → **Relationship Brief** → **Next Action** (a read-only highlighted preview of the single primary open action, linking down to the full editable list — not a second place to edit it) → **Open Commitments** → **Open Loops** → **Recent Interactions** (Log Interaction lives here) → **Active Insights** → **Working Notes** → full **Next Actions** list (editable, unchanged component) → **Original / Intake Summary** (moved out of the Overview card, relabeled, explicitly framed as historical — see ADR 0003) → **Full Timeline** (right column, unchanged).

## Known limitations

- **No persisted Brief snapshot exists, and no Relationship Brief table was added in this phase (reaffirmed on review).** Concretely: Phase 1 cannot compare a current Brief against a prior generation, and cannot show "source data changed since generation," because no generation snapshot exists to compare against or diff. `updated_at`/`updated_by` were added to Insights/Commitments/Open Loops specifically so a future persisted/staleness-tracked version has something to fingerprint against, without requiring another migration — but nothing computes or stores that fingerprint yet. Fine at today's data volume; revisit if a Relationship ever accumulates enough Interactions/Insights to make regeneration expensive, or a genuine point-in-time-frozen Brief is needed.
- `narrativeRefiner` is unused — Recommended Follow-Up phrasing is template text, not natural-language-generated prose.
- Working Note categories and status vocabulary were reviewed but not changed — see above.
- `resident_id`/`contact_name`/`source_description` on Working Notes are supported by the schema and RPC but not yet collected by the create form.
- The Action Board's quick-touch path (`QuickLogTouchForm`, relabeled "Log Interaction") still only writes a plain Interaction row — no Insights/Commitments/Open Loops/Next Action capture there. The full workflow lives on the Relationship detail page only.
- "People involved" (`participants` jsonb) has no dedicated UI for browsing/filtering by participant yet — captured and stored, not yet surfaced beyond the raw interaction record.
- No resident-linked Insight has been promoted into an authoritative Resident record — Resident-linked Insights remain relationship context only, per the scope's explicit instruction.
- `superseded` is not an available status for Commitments or Open Loops — deferred until a real supersede workflow (linking a record to the one that replaces it) is designed.

## Recommended next phase

1. Extend the demonstration/production experience with participant-aware filtering or display, if staff feedback shows it's needed.
2. Revisit Working Note category/status values with real usage data, not a guess made during this migration; collect `resident_id`/`contact_name`/`source_description` in the create form.
3. Persisted Brief snapshots with source-change/staleness detection, using the `updated_at` fields added in this revision, if/when volume or point-in-time-freezing needs arise.
4. An approved AI/language-generation provider, wired through the existing `narrativeRefiner` seam — no data model change required when that happens.
5. Promote select resident-linked Insights into authoritative Resident records, through an explicit, approved workflow — not automatically.
6. A real supersede workflow for Commitments/Open Loops, if repeated re-negotiation (rather than simple completion/cancellation) turns out to be common in practice.
