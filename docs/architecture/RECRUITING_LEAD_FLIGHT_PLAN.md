# Recruiting Lead Flight — Minimum Implementation Plan

**Document Type:** Implementation Plan — not yet built, not yet applied, not yet run
**Status:** Draft — Awaiting Confirmation to Begin Implementation
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-20

*One explicitly approved, already-existing recruiting lead. Real Apploi and Viventium evidence, collected by Hud through a visible, human-driven browser session. Normalized, persisted, deterministically synthesized, shown on a new recruiting-lead detail page. No permanent vendor-auth infrastructure (deferred per [`VENDOR_COLLECTOR_AUTHENTICATION.md`](./VENDOR_COLLECTOR_AUTHENTICATION.md)), no unattended login, no writes to any vendor.*

---

## 0. Inspection Findings

| Area | Finding |
|---|---|
| **Recruiting Pipeline UI** | `app/recruiting/page.tsx` → `RecruitingInbox.tsx` (167 lines) — a single flat table with status-filter tabs and inline per-row actions (`RecruitingWorkflowActions`). **There is no per-lead detail page or expand panel today.** "Recruiting lead detail experience" does not yet exist as a distinct screen — it must be added. |
| **Recruiting lead data model** | `recruiting_leads` (migration `20260629000000`, status vocabulary superseded by `20260629000001`). Real current status enum: `new \| contacted \| in_review \| applied \| not_a_fit \| hired \| archived` (`lib/supabase/types.ts`'s `RecruitingLeadStatus` — this, not the original migration's check constraint text, is authoritative). Fields: `role_interest`, `source`, `first_name`/`last_name`/`phone`/`email`, `zip_code`/`city_state`, `availability`/`experience_level`/`certification_license`, `linkedin_url`/`resume_url`, `raw_submission`, `apploi_redirected_at`. **No `test_marker` column exists on this table** — it was never brought into this codebase's test-hygiene convention, because leads are always real inquiries, never synthetic. This flight must not add one for this table (out of scope, and the target record is real, not synthetic) — isolation instead lives entirely in the *new* tables this plan adds (§9). |
| **Operational Intelligence Architecture / Phase A** | Already fully specified in [`SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md`](../intelligence/SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md). This flight is a real instance of that architecture's Collector → Evidence → Requirement → Rule → Recommendation chain, deliberately narrowed: **no Case/Workflow/ReviewGate machinery is built for this flight** — those are Phase 1b concerns. This is the "Wright Flyer," now with real (not fictional) evidence, per that document's own §36. |
| **`package.json` / Playwright** | Unchanged from the prior finding: `@playwright/test` present as a devDependency, no `playwright.config.ts`, no browser installed. The real `playwright` package and `npx playwright install chromium` are still required before any browser can launch. |

---

## 1. Visible Supervised Browser Runner

One script, run **by Hud, in Hud's own terminal** (see §10 — this is not something I execute through a tool call; see the blocker note at the end of this document):

```
npm run flight:recruiting-lead -- --recruiting-lead-id=<uuid>
```

- Requires `--recruiting-lead-id` explicitly — **no default, no "first lead," no name-only fuzzy search that could resolve to the wrong person.**
- First action, before any browser opens: print the lead's name, role, and id, and require an interactive `y` confirmation — the structural enforcement of "search only for the explicitly approved... recruiting lead" (constraint 3).
- Launches a **visible** (headed) Chromium context for Apploi, isolated `userDataDir`, no stored credentials, no pre-loaded session (permanent session storage is explicitly deferred).
- Pauses (prints the exact prompt in §10, waits on stdin) for Hud to log in and complete MFA **inside that visible window**, using Hud's own hands.
- On confirmation, performs the read-only Apploi search + field reads (§3), visibly, so Hud can watch every action the script takes.
- Closes the Apploi context, opens a second, separately isolated Chromium context for Viventium, repeats the pause/login/MFA/confirm/read sequence.
- Background-provider step is **conditional and off by default** — only attempted if a `--background-provider=<name>` flag is explicitly passed, which the script refuses to accept unless a corresponding `BACKGROUND_PROVIDER_ACCESS_CONFIRMED=true` env var is also set locally (constraint 8's "only if access is available and Hud explicitly authorizes it," enforced as two independent, deliberately redundant gates rather than one).
- Prints the full set of observations it's about to persist and requires one more `y` confirmation before writing anything to Supabase.

---

## 2. Exact Extraction Fields

Directly the "Initial evidence questions" list, each mapped to one `observation_key`:

| Vendor | `observation_key` | What "directly observed" means here |
|---|---|---|
| Apploi | `apploi.candidate_found` | Search executed; match status recorded regardless of outcome |
| Apploi | `apploi.application_started` | A draft/started application is visible on the matched record |
| Apploi | `apploi.application_submitted` | A submitted application is visible |
| Apploi | `apploi.current_status` | The literal on-screen status label — Apploi's own vocabulary, passed through verbatim, never re-interpreted into Serve's status names |
| Apploi | `apploi.selected_position` | The role/position text shown on the record |
| Apploi | `apploi.interview_scheduled` | A scheduled interview entry is visible |
| Apploi | `apploi.interview_completed` | Only set `true` if a completion indicator is *directly* visible — otherwise `visibility: not_visible`, **never** inferred false |
| Apploi | `apploi.incomplete_tasks` | Only if a tasks/documents checklist is directly visible on the record — omitted (not defaulted to empty) if no such checklist is shown |
| Apploi | `apploi.pipeline_disposition` | Withdrawn / rejected / advanced, if directly shown |
| Viventium | `viventium.employee_found` | Search executed; match status recorded regardless of outcome |
| Viventium | `viventium.onboarding_stage` | The literal on-screen stage label |
| Viventium | `viventium.i9_status` | As shown |
| Viventium | `viventium.w4_status` | As shown |
| Viventium | `viventium.direct_deposit_status` | As shown |
| Viventium | `viventium.required_forms_tasks` | Only if directly visible |
| Viventium | `viventium.record_status` | Active / pending / not found |

Every field is read via Playwright's normal DOM read APIs (`textContent`, `isVisible`) against the vendor's rendered page — never an internal API call, never a vendor export/report endpoint (that would be a different collector mechanism, not in scope here).

---

## 3. Normalized Observation Contract

```typescript
// A search-level fact: did we find the person at all in this vendor.
interface CollectorMatchResult {
  collectorRunId: string;
  sourceSystem: "apploi" | "viventium";
  matchStatus: "found" | "not_found" | "ambiguous_multiple_matches" | "search_incomplete";
  sourceRecordId: string | null;   // vendor's own record identifier/URL fragment, if found
  observedAt: string;
}

// One field-level fact.
interface CollectorFieldObservation {
  collectorRunId: string;
  sourceSystem: "apploi" | "viventium";
  observationKey: string;          // e.g. "apploi.application_submitted"
  rawLabel: string | null;         // literal on-screen text, kept for audit — never re-derived later
  normalizedValue: string | boolean | null;
  visibility: "directly_observed" | "not_visible" | "not_applicable";
  observedAt: string;
}
```

`visibility` is the field-level confidence axis, deliberately narrower than the platform's general `ProvenanceConfidence` — a live browse only ever produces `"directly_observed"` or `"not_visible"` (never `"inferred"`, since nothing here is derived from a partial signal; either the page showed it or it didn't). **`"not_visible"` is not a value — it is the explicit absence of one**, and every consumer downstream must treat it as "unknown," never as `false`.

---

## 4. Persisted Evidence

Two new, additive tables — no change to `recruiting_leads` itself:

```sql
create table if not exists recruiting_lead_collector_runs (
  id                uuid primary key default gen_random_uuid(),
  recruiting_lead_id uuid not null references public.recruiting_leads(id),
  source_system     text not null check (source_system in ('apploi', 'viventium')),
  initiated_by      text not null,   -- Hud's identity, never null, never an AI/system identity
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  status            text not null check (status in ('success', 'failed', 'partial')),
  match_status      text check (match_status in ('found', 'not_found', 'ambiguous_multiple_matches', 'search_incomplete')),
  error_category    text,            -- populated only when status = 'failed'
  flight_marker     text not null,   -- this flight's isolation tag, see §9
  created_at        timestamptz not null default now()
);

create table if not exists recruiting_lead_observations (
  id                 uuid primary key default gen_random_uuid(),
  collector_run_id   uuid not null references public.recruiting_lead_collector_runs(id),
  recruiting_lead_id uuid not null references public.recruiting_leads(id),
  observation_key    text not null,
  raw_label          text,
  normalized_value   text,
  visibility         text not null check (visibility in ('directly_observed', 'not_visible', 'not_applicable')),
  observed_at        timestamptz not null,
  created_at         timestamptz not null default now()
);
```

- Append-only in practice — nothing here is ever `UPDATE`d; a re-run produces new rows under a new `collector_run_id`, preserving every prior observation exactly as this codebase already treats Historical Facts.
- `recruiting_lead_id` references remain `NO ACTION` (no explicit `on delete` clause), matching this codebase's now-established provenance-protection pattern.
- `revoke ... from public, anon, authenticated; grant ... to service_role`, same as every write RPC in this codebase.

---

## 5. Deterministic Rules

One pure function, `deriveHiringSynthesis(leadStatus, observations) → HiringSynthesis`, computed **on read** (no persisted derived-state table) — the same precedent this codebase already established with the Relationship Brief: always fresh, never stale, nothing to invalidate.

```typescript
interface HiringSynthesis {
  currentState: string;              // plain-language, grounded synthesis
  requirements: RequirementLine[];   // met / unmet / unknown, each with its basedOn observation
  unknowns: string[];                // explicit "we don't know X" statements
  exceptions: string[];              // e.g. "not found in either vendor system"
  recommendation: string;
  why: SourceReference[];            // exact observation(s) this synthesis is grounded in
}
```

Representative logic (illustrative, not exhaustive — the actual function is written against every observation key in §2):

| Observed Pattern | `currentState` | `recommendation` |
|---|---|---|
| Not found in Apploi, not found in Viventium | "No Apploi or Viventium record found for this lead." | "Confirm identifying details (name/email) and search again — this is not evidence the applicant never applied." |
| Apploi found, `application_submitted = directly_observed(true)`, `interview_scheduled = not_visible` | "Application submitted in Apploi; interview status not yet known." | "Check Apploi directly for interview scheduling, or follow up with the applicant." |
| Apploi shows `interview_scheduled = true`, `interview_completed = not_visible` | "Interview scheduled; completion not confirmed." | "Confirm interview outcome — do not assume it did or didn't happen." |
| Apploi shows an advanced/positive disposition, Viventium `not_found` | "Advancing well in Apploi; onboarding has not yet started in Viventium." | "No action needed on Viventium yet — this is expected at this stage, not a gap." |

**Hard rule, structurally enforced in the function's own tests (§8):** no branch of this function may ever produce a `currentState` or `requirements` entry asserting something *didn't happen* purely because an observation is `not_visible` or a `matchStatus` is `not_found`/`search_incomplete`. Those always route to `unknowns`/`exceptions`, never to a negative requirement status.

---

## 6. Recruiting Lead UI Integration

- New page, `/recruiting/[id]`, mirroring the established `/relationships/[id]` shape: identity header (existing `recruiting_leads` fields, read-only, unchanged), a **Hiring Synthesis** card (Where are we / Where should we be / What's unknown / What's next / Why — reads exactly like `RelationshipBriefSection`'s established pattern), an **Apploi Evidence** panel and a **Viventium Evidence** panel (each listing this lead's `recruiting_lead_observations`, source-attributed, most-recent `collector_run_id` first), and a **Collector Run History** section (append-only, timestamps, who initiated).
- `RecruitingInbox.tsx` gains one small, additive change: a "View" link per row to `/recruiting/[id]` — the smallest possible change to the existing table, no restructuring of it.
- No UI anywhere lets a person hand-edit an observation or the synthesis — exactly the same "read-only, computed, never hand-editable" rule already established for `RelationshipBriefSection`.

---

## 7. Test-Record Isolation

- `recruiting_leads` itself is never modified by this flight — the approved lead is real, pre-existing, and only ever read.
- Every row this flight produces (`recruiting_lead_collector_runs`, `recruiting_lead_observations`) carries a `flight_marker` (e.g. `__SERVE_FLIGHT__ recruiting-lead-<id> <run-timestamp>`) — not the `test_marker` convention (this isn't synthetic test data; it's real evidence about a real approved person, gathered during one bounded, supervised run), but the same *mechanism*: a distinct, greppable tag enabling later identification without touching anything else.
- The script only ever writes rows scoped to the one `--recruiting-lead-id` it was given — no code path in this flight can write a row for any other lead.

---

## 8. Cleanup

- A narrow addition to `scripts/cleanup-test-data.ts`'s existing marker-based convention: `--flight-marker=<value>` deletes only `recruiting_lead_observations` and `recruiting_lead_collector_runs` rows matching it — `recruiting_leads` is never touched by this cleanup path, by construction (it has no delete branch for that table at all).
- Whether this flight's evidence should be cleaned up afterward or kept as real operational data is **Hud's decision at the time**, not something this plan presupposes — the tooling to remove it exists, but nothing runs it automatically.

---

## 9. Tests

- `node:assert`-based tests for `deriveHiringSynthesis()` only — synthetic observation fixtures (not live-collected), following `lib/relationships/__tests__/brief.test.ts`'s exact pattern: a "sparse/not-found" fixture must produce explicit unknowns, never a fabricated negative; a "not_visible" fixture must never render as `false`; a fully-populated fixture must produce every `basedOn` reference correctly.
- **No test automates or mocks the live browser/MFA flow.** That sequence is inherently manual and supervised — there is nothing about it that should or could be exercised by an automated test suite, and building one would itself edge toward "unattended login," which is explicitly out of scope.

---

## 10. What Hud Does During the Run

Exactly these seven actions, in order:

1. Confirm the printed target lead (`y`) before any browser opens.
2. When the visible Apploi window opens: log in and complete MFA **personally, in that window** — the script does not touch this step at all.
3. Return to the terminal and press Enter to confirm Apploi is ready.
4. Watch the script perform the read-only Apploi search and field reads (visible, in the same window).
5. Repeat steps 2–4 for the Viventium window when it opens.
6. Review the full printed observation summary and confirm (`y`) before anything is persisted to Supabase — the last human checkpoint before any write.
7. Open `/recruiting/[id]` afterward to see the synthesized result.

---

## 11. The One Real Blocker — and How It's Resolved

Per your instruction to stop only if a real blocker exists: there is one, and it is not a policy or security blocker — it is a **tool-interactivity** one.

My Bash tool calls either run to completion and return their output, or run in the background where I can observe output but have **no mechanism to send new input into that process later** in response to something a human does outside my own tool loop. I cannot personally sit in the middle of the pause-for-MFA step described in §1/§10 — there is no way for me to "wait," see that Hud has finished logging in, and resume the script on Hud's behalf through my available tools.

**This does not block the flight — it fixes who runs it.** I build the script (§1–§9); **Hud runs it personally**, in Hud's own terminal, exactly as §10 describes. This is also, independently, the correct design regardless of my tooling: a script an AI agent could drive through a live MFA prompt would be a form of exactly the unattended/AI-mediated login this task explicitly prohibits. The human-in-the-loop requirement and my own tool limitation point at the same answer.

---

*Nothing described here has been built. No migration, script, or UI change exists yet. Ready to begin implementation on your confirmation.*
