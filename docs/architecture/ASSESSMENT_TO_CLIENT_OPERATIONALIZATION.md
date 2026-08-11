# Assessment-to-Client Operationalization — Discovery & Architecture/Gap Report

Branch: `feature/assessment-to-client-operationalization`, based on `main` @ `0e0bfc4`.
Status: **discovery and architecture complete; implementation not yet started.** Per the
required sequence, this is the checkpoint before touching the domain model, migrations, or UI.

---

## 1. Discovery summary (fresh evidence, not assumed)

This codebase moved substantially since the last time I researched it, and the four
"status" docs (`ARCHITECTURE.md`, `CURRENT_STATUS.md`, `PRODUCTION_READINESS.md`) are
**stale as of this task** — last touched 2026-07-13, roughly 50 commits and 35 migrations
behind HEAD. `DECISION_LOG.md` is more current (2026-08-04) but still misses everything from
2026-08-05 onward. None of the four mention Workforce, Reconciliation, the AxisCare
disposition model, or resident identity resolution — all of which now exist and matter here.
I'm treating direct code/migration inspection as ground truth, not these docs.

**Current navigation** (`components/Sidebar.tsx`): three sections — Today (`/workspace`),
Serve (The People We Serve → `/residents`, Workforce → `/workforce`), Understand (`/dashboard`,
`/community-intelligence`). Prospects, Clients, Reconciliation, External Clients, and
Relationships are **not top-level nav** — they're reached from within "The People We Serve,"
via a shared `PeopleWeServeTabs` hub.

**"Serve Client" is now AxisCare-match-driven, not relationships-table-driven.**
`app/clients/page.tsx` reads from `getAxisCareClientOperationalSummary()` — a real,
already-built AxisCare read pipeline. `lib/residents/serveRelationshipProjection.ts` is the
authoritative combinator: AxisCare match wins outright when present (`operationalBucket` from
`lib/integrations/axiscare/clientLifecycle.ts`'s `classifyAxisCareClientLifecycle()` — status
flag + class-code heuristics, not a naive "active = client" check); else an active CRM
`relationships` row; else a prospect-type `relationships` row; else the legacy
`residents.serve_relationship_status` column as a last-resort fallback. This function is the
existing template for "deterministic projection over multiple signals, human corrections layer
on top" — directly reusable as the model for how assessment/operationalization state should be
computed and displayed, not stored as a second source of truth.

**Existing conversion machinery I will reuse, not reinvent**:
`supabase/migrations/20260719000000_create_external_clients_and_conversions.sql` already
defines `convert_resident_prospect_to_active_client(relationship_id, effective_start_date,
conversion_note, open_action_disposition, onboarding_action_title/type/due_at, actor)` — a
governed RPC that flips a `resident_prospect` relationship to `active_client`, resolves open
actions, writes conversion/timeline/resident-timeline rows, all attributed. This is exactly
"operationalize the person as a Serve Client" (§6 of the task) — I will call it, not duplicate
its logic.

**AxisCare remains structurally read-only.** `axisCareGet()` hardcodes `method: "GET"` — no
write function exists anywhere in `lib/integrations/axiscare/`, confirmed by a repo-wide grep.
`person_vendor_identity_links` (subject types now `"workforce_member" | "resident"` — residents
were added 2026-08-06, after my last research pass) and `axiscare_client_dispositions` are the
live identity-resolution/disposition mechanism — this is exactly the "existing governed
identity-resolution logic" §7 of the task requires me to reuse, and it already does everything
asked: proposed/confirmed/rejected/deferred lifecycle, never-silently-duplicate, a human
correction layer.

**Cinch: confirmed zero live integration**, unchanged from before — every reference is either
an outbound launch link (`lib/workflows/serveWorkflows.ts`) or a documented future-integration
placeholder (`app/settings/integrations.ts`). Nothing to build against; §8's job is a
projection, never a write.

**Pricing: Serve OS has none today.** A repo-wide grep for "pricing" returns exactly one hit —
a description string. This needs to be built fresh, informed by (not copy-pasted from) the old
Intake MVP's `pricingRules.js`.

**A real naming-collision risk, flagged by research, worth acting on now**: there are already
*two* systems using an `intake_` prefix — the website-form **Intake Intelligence Engine**
(`intake_submissions`, `intake_processing_records`, fully wired, classifies inbound inquiries
into Relationships) and my own recent **voice-capture foundation**
(`intake_assessment_sessions`, `intake_sources`, `intake_handoff_codes`, capture/upload only,
no extraction). They are genuinely unrelated pipelines that happen to share a word. Everything
new in this task will use an **`assessment_`** prefix, never `intake_`, to avoid a third
collision.

**The lifecycle states this task needs already exist, unused.**
`intake_assessment_sessions.status` already has the CHECK constraint
`'recording' | 'processing' | 'draft' | 'needs_review' | 'approved' | 'amended'` — written in
anticipation of exactly this work, per that migration's own comment ("Extraction, draft/
approved facts, conflicts, decisions, outputs... are Phase 2 §17's proposed migrations for a
LATER slice — deliberately not created here"). No code today ever moves a session past
`'recording'`. This task is that later slice.

**No live transcription exists anywhere** — `intake_sources.transcript_text` is always null
today; nothing produces it. This bounds what "extraction" can mean in this task (§3 below).

---

## 2. Reuse / Replace / Migrate / Leave-alone

| Capability | Disposition | Why |
|---|---|---|
| `intake_assessment_sessions` / `intake_sources` / `intake_handoff_codes` (capture layer) | **REUSE as-is** | Already live, already the entry point; this task builds strictly on top, never modifies the capture tables |
| `intake_assessment_sessions.status` lifecycle values | **REUSE as-is** | Already anticipates this exact workflow; no new status column needed |
| Old MVP's evidence/confidence field shape | **REPLACE with the refined axes** | I already designed and validated a stricter version of this (separating `assertion_state` from `collection_method`/`reporter`, removing the `not_discussed`-as-a-fact bug) in the separate app's Phase 2 work — building the cruder original here would be a regression, not a reuse |
| Old MVP's `pricingRules.js` deterministic catalog | **PORT, modernized** | The *principle* (deterministic, versioned, never AI-invented) and the *catalog shape* (à la carte + package tiers) are sound and directly reusable; ported as Serve-OS-native versioned data, not copy-pasted as-is |
| `person_vendor_identity_links` / `axiscare_client_dispositions` / `clientLifecycle.ts` | **REUSE as-is** | Exactly what §7 requires; duplicating it would create two disagreeing sources of AxisCare-match truth |
| `convert_resident_prospect_to_active_client()` and sibling conversion RPCs | **REUSE as-is** | Exactly "operationalize as Serve Client"; already governed, audited, attributed |
| `serveRelationshipProjection.ts`'s combinator pattern | **REUSE the pattern** | Template for how assessment/operationalization status should be computed, not stored redundantly |
| `resident_current_needs` (versioned, `sourceType` already includes `"assessment"`) | **REUSE as the downstream landing zone** | Approved assessment output projects here, not into a new competing "current needs" table |
| Website Intake Intelligence Engine (`intake_submissions`/`intake_processing_records`) | **LEAVE ALONE** | Genuinely different pipeline (inbound-lead classification); not touched, not merged |
| `lib/auth/constants.ts` / `permissions.ts` | **REUSE as-is** | Same 4 roles, same `admin/manager/executive` governance boundary already used for resident-profile edits and reconciliation — this task's approval/override actions use the identical boundary |
| Old MVP's whole application (Express server, Vercel deploy, desktop UI) | **NOT reused** | Superseded; the useful *logic* (pricing, evidence shape) is ported, the *application* is not |
| Live transcription | **NOT built in this task** | No vendor decision exists, wasn't asked for here, and isn't required to deliver a real, testable, safe workflow (§3) |

---

## 3. Scope decision: what "extraction" means here, given no live transcription exists

The task's step 5 ("extraction normalization and unknown-state correction") presumes facts to
normalize. Since nothing produces a transcript yet, I'm resolving this as: **build a
pasted-transcript entry point** (`intake_sources.source_type = 'pasted_transcript'`, already a
valid value in the existing CHECK constraint) that a Serve user can use directly from a
resident/prospect profile, running the same OpenAI-extraction *principle* as the old MVP
(schema-constrained, evidence-required) but producing rows in the refined
`assessment_draft_facts` model (§4) instead of a flat JSON blob.

This gets every downstream capability — review, correction, approval, pricing, client
conversion, AxisCare preview, Cinch projection — genuinely exercisable end-to-end with real
extracted facts, without building a live-voice transcription pipeline (a real vendor/cost
decision that wasn't asked for and shouldn't be smuggled into this task). Voice-captured
sessions (`source_type = 'live_audio_stream'`) remain fully representable in the model and will
show as `'recording'`/`'processing'` with no draft facts yet — accurate, not broken — until a
transcription vendor is chosen in a future task.

**Flagging this explicitly for confirmation before I build it**, since it's the one place I'm
making a real scope call rather than following an unambiguous instruction.

---

## 3A. Source-agnostic extraction boundary (revised per 2026-08-11 direction)

Pasted transcript is a **temporary development/validation input adapter**, not the canonical
architecture. To keep the pipeline genuinely source-agnostic:

- **The input boundary is `intake_sources.transcript_text`** (existing column, existing table).
  A "paste transcript" server action does nothing but create/attach an `intake_sources` row
  with `source_type = 'pasted_transcript'`, `raw_text = transcript_text = <pasted text>`,
  `status = 'uploaded'` — the exact same shape a future transcription pipeline would write for
  a `source_type = 'live_audio_stream'` row. No UI textarea is ever passed directly to
  extraction logic.
- **`intake_transcript_segments` (new, added to this migration, unused by the paste path)** —
  the literal `AssessmentTranscriptSegment` contract already anticipated by the capture layer's
  own design docs (`id, source_id, speaker, start_time, end_time, text, is_final`). Empty today.
  When live transcription ships later, it populates this table; extraction should prefer
  segment-level evidence when present and fall back to `transcript_text` when not — one
  extraction function, two possible evidence granularities, no rewrite needed either way.
- **Extraction is triggered per `assessment_session_id`**, not per input — it aggregates every
  `intake_sources` row (and any segments) attached to that session, regardless of how many
  paste/upload/future-audio sources contributed. This is why `intake_sources` already supports
  multiple rows per session (a live recording plus a follow-up paste was always a
  first-class case).
- **Provenance survives**: `assessment_draft_facts.source_segment_id` (nullable, for future
  segment-level evidence) and a parallel `source_id` (FK into `intake_sources`, always
  populated) together let every extracted fact point back to exactly which input produced it —
  paste today, transcript/audio evidence later, no schema change required to add that
  granularity.
- **Nothing here duplicates or conflicts with the Intake Engine capture-layer architecture** —
  this section only *completes* it (the segments table it always anticipated) and adds the
  assessment-intelligence layer on top; the capture tables themselves are untouched.

## 4. Proposed canonical assessment model (new tables, `assessment_` prefix)

```
residents (existing)
  │
  └─< intake_assessment_sessions (existing — capture layer, untouched)
        │
        ├─< assessment_draft_facts        (new — machine-derived, session-scoped, never trusted)
        ├─< assessment_fact_conflicts     (new — two draft facts disagreeing; real FKs, not polymorphic)
        ├─< assessment_decisions          (new — pricing/service-recommendation/AxisCare-readiness reasoning)
        └─< assessment_outputs            (new — internal summary / family email / proposal / AxisCare preview / Cinch projection)

residents (existing)
  └─< assessment_approved_facts (new — append-only, resident-scoped not session-scoped,
                                  survives across repeat assessments, supersedes-chain for corrections)
```

**`assessment_draft_facts`**: `id, assessment_session_id (FK), domain, field_path, value jsonb,
assertion_state (confirmed_yes|confirmed_no|uncertain|conflicting|not_applicable),
collection_method (observed|reported), reporter, evidence, confidence, source_segment_id
(nullable — for a future transcript-segment link), created_at`. Same epistemic model I already
designed and stress-tested in the separate app's Phase 2 work (§2's refinement: no
`not_discussed`-as-a-fact, no `deferred`-as-assertion-state — a topic never raised simply has
no row).

**`assessment_approved_facts`**: adds `resident_id (FK, not assessment_session_id — a fact
survives repeat assessments), originating_assessment_session_id (FK, always populated),
source_draft_fact_id (nullable), supersedes_fact_id (self-FK, nullable, backward-pointing —
genuinely immutable, a correction never updates the old row), approved_by, approved_at`.

**`assessment_fact_conflicts`**: `fact_a_draft_id`/`fact_b_draft_id`, both real FKs into
`assessment_draft_facts` — learned from a real bug in the separate app's earlier design
(a polymorphic draft-or-approved reference isn't enforceable as a single Postgres FK); conflicts
are always draft-vs-draft, new evidence vs. an *approved* fact is handled by the ordinary
review-and-supersede flow instead.

**`assessment_decisions`**: `id, assessment_session_id (FK), decision_type
(service_recommendation|pricing|axiscare_readiness), input_fact_ids jsonb, output jsonb,
rationale, catalog_version, rules_version, human_override jsonb (nullable), created_at`. This
is where §4's "one authoritative pricing result" and "Pricing review required" fallback live —
never a bare number floating in `assessment_outputs`.

**`assessment_outputs`**: `output_type (internal_summary|client_email|proposal|
axiscare_payload_preview|cinch_projection), content jsonb, status (draft|approved — never
"sent"), generated_at, generated_by`. AxisCare/Cinch outputs here are always previews; nothing
in this model performs a vendor write.

**Session lifecycle** — reuses the existing column, no new one:
`recording → processing → draft → needs_review → approved → amended`, plus a new
**`operationalized`** value proposed as an addition to that CHECK constraint (the one schema
touch to the capture table this task needs — additive, widening a constraint, matching the
"loosen, never remove" discipline already used elsewhere in this repo's migration history) to
represent "approved AND the client-conversion/AxisCare-preview step has run."

---

## 5. Pricing consolidation

One `assessment_decisions` row, `decision_type = 'pricing'`, per assessment. Deterministic
engine (ported/modernized from `pricingRules.js`'s catalog shape) consumes approved facts only
— never draft facts, never AI free text. If no published rule maps safely, the decision's
`output` is `{ status: "pricing_review_required" }`, never a manufactured number. AI may
populate `assessment_outputs`' proposal/email text explaining *why* the deterministic result
fits, reading `assessment_decisions.rationale` — it never computes or overrides the number
itself. `catalog_version`/`rules_version` on every decision row makes every price traceable to
the exact rule that produced it.

---

## 6. Human review workflow

Session `status` moves `draft → needs_review → approved` (existing values). The review surface
is **exception-oriented, not a full-field checklist**: surface only fields with
`assertion_state in (uncertain, conflicting)`, open rows in `assessment_fact_conflicts`, and any
required-for-operationalization field still missing — everything `confirmed_yes`/`confirmed_no`
with reasonable confidence is not shown for individual sign-off. Approving writes
`assessment_approved_facts` rows (with `supersedes_fact_id` when correcting a prior approved
fact) and requires `actor`/`rationale` for any material override, matching the exact discipline
already used by `resident_serve_relationship_corrections` elsewhere in this repo.

---

## 7. Client operationalization

Approval offers "Make Active Client" only when the person already has (or the reviewer creates)
a `resident_prospect`-type `relationships` row — calling the **existing**
`convert_resident_prospect_to_active_client()` RPC, not a new one. No new person is ever
created here; this only changes a relationship's type, exactly matching "Resident and Client
are not mutually exclusive identities."

---

## 8. AxisCare adapter (preview only, per explicit instruction)

Approved facts → field mapping → readiness check against `person_vendor_identity_links`
(subject_type='resident'): no link → proposed CREATE preview; confirmed link → proposed UPDATE
preview; ambiguous → routed to the existing Reconciliation surface, never resolved
automatically. Active/Inactive/class determination reuses
`classifyAxisCareClientLifecycle()`'s existing rules, not a new heuristic. **No write adapter is
implemented** — the payload/validation/preview/audit-trail scaffolding is, so a real write can
be connected later without redesigning anything, per the explicit instruction not to fake a
capability that isn't there.

---

## 9. Cinch projection

One more `assessment_outputs` row, `output_type = 'cinch_projection'`, mapping approved facts
into Cinch's known General / Client Status / Environment structure. Always a candidate
projection pending human approval, never claimed as sent — there is no Cinch write path to
claim success from.

---

## 10. Testing approach

Synthetic pasted-transcript fixtures only (no real PHI) covering every case §12 lists — existing
Resident, existing Prospect, brand-new Prospect, repeated assessment (no duplicate person),
unknown-vs-false, deterministic pricing, pricing-review-required, AI-suggestion-vs-pricing-engine
conflict (proving the engine wins), approval, AxisCare match/ambiguous-match/duplicate-attempt,
AxisCare adapter unavailable, Cinch projection shape, authorization boundaries, audit-row
creation, retry states.

---

## Before I start building

This is a large, multi-table, multi-workflow build. Two things I'd like confirmed rather than
assume:

1. **§3's scope call** — pasted-transcript extraction as the "safest useful version" of
   extraction, with live-voice transcription explicitly deferred to a future task. Right
   approach, or do you want something different for how facts get into the system in the
   absence of transcription?
2. **Pacing** — given the size (new migration, a pricing engine, an extraction endpoint, a
   review UI, conversion wiring, an AxisCare preview adapter, a Cinch projection, and a full
   test suite), do you want this delivered as one continuous pass to the finish line as
   originally scoped, or checkpointed again after the domain model + migration lands (before
   UI work), matching how earlier phases of this project went?
