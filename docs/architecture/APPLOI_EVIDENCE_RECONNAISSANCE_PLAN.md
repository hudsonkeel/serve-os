# Apploi Evidence Reconnaissance & Three-Class Evidence Model — Implementation Plan

**Document Type:** Implementation Plan — not code, not a migration, not run yet
**Status:** Draft — Awaiting Confirmation to Begin Implementation
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-21

*Builds directly on [`RECRUITING_LEAD_FLIGHT_PLAN.md`](./RECRUITING_LEAD_FLIGHT_PLAN.md) and reuses the Rule/RuleVersion/Signal/Evidence primitives already specified in [`SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md`](../intelligence/SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md) — this is the first real, concrete implementation of that platform's reasoning layer, domain-scoped under `lib/recruiting/`, shaped so it can migrate to `lib/intelligence/domains/recruiting/` later without a redesign, per that document's own Phase 1a/1b guidance.*

**Nothing described here is built. No migration, extractor, rule, or UI change exists yet. No vendor has been contacted beyond the read-only reconnaissance already authorized in prior turns.**

---

## 1. Exact Files to Add or Modify

### New migration
`supabase/migrations/20260728000000_create_recruiting_lead_evidence_classes.sql` — additive only, no change to `recruiting_leads`:

- **Extends `recruiting_lead_observations`** (new columns): `source_system`, `source_record_id`, `collected_at`, `source_location`, `extractor_version`, `extraction_confidence`, `match_method`, `failure_reason`, `sensitivity`, `collection_method` (`'automatic_dom' | 'guided_manual'`). Extends the `visibility` check constraint to add a fourth value, `'ambiguous'` — "we found more than one candidate match and cannot safely pick one" is a materially different situation from "we looked and found nothing," and collapsing them loses exactly the information Phase 3 requires.
- **New table `recruiting_lead_rules`** — `id, domain, slug, title, description` (this domain's instance of the platform's `Rule` primitive).
- **New table `recruiting_lead_rule_versions`** — `id, rule_id, version, trigger_type, parameters jsonb, logic_reference, effective_from, effective_to, changelog_note` (this domain's `RuleVersion`).
- **New table `recruiting_lead_inferences`** — `id, recruiting_lead_id, rule_version_id, signal_key, explanation, strength, unresolved_alternatives jsonb, evidence_needed_to_resolve jsonb, computed_at` (this domain's `Signal`, deliberately without an `Explanation.narrative` split yet — nothing here is AI-assisted, so there's no narrative half to separate; that split gets added if/when AI summarization is ever introduced for this domain, not speculatively now).
- **New join table `recruiting_lead_inference_evidence`** — `inference_id, observation_id` (this domain's `Signal` → `Evidence` link — a real join table, not a jsonb array of ids, so "which inference cites which observation" stays a first-class, queryable relationship).
- **New table `recruiting_lead_human_confirmations`** — `id, recruiting_lead_id, confirmation_key, confirmed_value, rationale, actor, confirmed_at`. `rationale` is required and not free-form-optional — it's the field that enforces "must not be used unless entered as authorized evidence or confirmed from a governed source": a confirmation with no stated source is not a valid row.
- **New table `recruiting_lead_vendor_identities`** — `id, recruiting_lead_id, source_system, vendor_record_id, vendor_display_name, match_method, match_confidence, is_human_confirmed boolean default false, linked_by, linked_at` (Phase 4's identity ladder, persisted).

All new tables: `NO ACTION` foreign keys back to `recruiting_leads`/`recruiting_lead_observations`/`recruiting_lead_rule_versions` (same provenance-protection pattern as every prior migration this session), RLS enabled, `revoke all from public, anon, authenticated; grant all to service_role`.

### New extractor code
```
lib/recruiting/extractors/apploi/
  cdpAttach.ts              CDP-attach, tab enumeration, tab confirmation, origin/candidate verification
  types.ts                  ExtractedField, ExtractionResult shared types
  rowScan.ts                Level A extractor (apploi.rowScan@1)
  detail/
    applicationSummary.ts   apploi.detail.applicationSummary@1
    activityTimeline.ts     apploi.detail.activityTimeline@1
    interviewTab.ts         apploi.detail.interviewTab@1
    communications.ts       apploi.detail.communications@1 — the minimization-critical one, see §8
    documents.ts            apploi.detail.documents@1
```

### New rules
```
lib/recruiting/rules/
  interviewActivityPresent.ts
  positiveCandidateAssessmentPresent.ts
  interviewScheduledOrRescheduled.ts
  interviewCompletionUnconfirmed.ts
  possiblePipelineStageInconsistency.ts
  crossSystemStageInconsistency.ts
  evaluateRecruitingLeadRules.ts   — orchestrator: runs every rule version against a lead's
                                     current observations, writes recruiting_lead_inferences
```

### New/modified data layer
- `lib/data/recruitingLeadEvidence.ts` (new) — CRUD for inferences, human confirmations, vendor identities.
- `lib/data/recruitingLeadCollector.ts` (modify) — extend `ObservationInput`/`insertObservations` for the new columns; `buildVendorEvidenceInputs` gains a sibling that also assembles inferences + human confirmations for the synthesis layer.

### Modified synthesis
- `lib/recruiting/deriveHiringSynthesis.ts` (modify) — this is now genuinely in scope, per your Phase 5/6/7. It currently folds everything into `requirements`/`unknowns`/`exceptions`/`recommendation`. It needs to consume observations + inferences + human confirmations as three structurally separate inputs and produce three structurally separate outputs — not a bigger version of the same flat shape.

### Modified script
- `scripts/collectors/recruitingLeadFlight.ts` (modify) — add an Apploi live-extraction path (CDP-attach → Level A → conditional Level B) that runs *before* falling back to the existing guided prompts for anything the extractor didn't get. Every automatic observation is tagged `collection_method: 'automatic_dom'`; every prompt-derived one is tagged `'guided_manual'`. Viventium stays 100% guided-manual in this phase — this plan is scoped to Apploi reconnaissance only, per your own Phase 1 title.

### Modified UI
- `components/recruiting/HiringSynthesisCard.tsx` (modify — substantially) — split into:
  - `components/recruiting/DirectObservationsPanel.tsx` (extends the existing `VendorEvidencePanel`, unchanged in spirit)
  - `components/recruiting/InferredSignalsPanel.tsx` (new)
  - `components/recruiting/HumanConfirmationsPanel.tsx` (new)
  - `HiringSynthesisCard.tsx` becomes the composing shell: current state, unknowns, exceptions/inconsistencies, requirements, next action, why, evidence-needed, source freshness.

### New tests
- `lib/recruiting/rules/__tests__/rules.test.ts` — one suite covering all six rules.
- `lib/recruiting/extractors/apploi/__tests__/rowScan.test.ts`, `.../detail/*.test.ts` — sanitized DOM fixtures, see §9.
- `lib/recruiting/__tests__/deriveHiringSynthesis.test.ts` (extend) — new cases for the three-class separation.

---

## 2. Exact Browser/CDP Workflow

**Windows launch command — Chrome, dedicated profile, localhost-only debugging:**
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Users\hudso\ServeFlightProfiles\apploi-chrome" --no-first-run --no-default-browser-check
```
**Edge equivalent:**
```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="C:\Users\hudso\ServeFlightProfiles\apploi-edge" --no-first-run --no-default-browser-check
```

- `--user-data-dir` points at a **dedicated** profile directory, never your default/daily-driver profile — Chrome/Edge refuse to run two processes against the same profile simultaneously, and this keeps the reconnaissance session isolated (same "one profile per vendor" principle from [`VENDOR_COLLECTOR_AUTHENTICATION.md`](./VENDOR_COLLECTOR_AUTHENTICATION.md)).
- `--remote-debugging-port=9222` binds to `127.0.0.1` by default. **Never** add `--remote-debugging-address=0.0.0.0` or anything that exposes it beyond localhost.
- You log into Apploi, complete MFA, and pass Cloudflare **entirely manually** — nothing automated touches any of it. You then manually navigate to and open the approved Alma candidate record before running the collector.

**Tab-confirmation procedure:**
1. Collector runs `chromium.connectOverCDP('http://localhost:9222')` — it attaches, it does not launch anything.
2. It enumerates every open tab across every context and prints title + URL for each, numbered.
3. It asks you, explicitly: *"Which numbered tab is the approved Alma Dhora Owolabi record?"* — it never assumes the active/focused tab is the right one.
4. It verifies the selected tab's origin matches the approved Apploi origin (from `NEXT_PUBLIC_APPLOI_URL`) — a mismatch hard-stops before anything is read.
5. Only then does it perform a **candidate-identity check** (Phase 3/4 — reads the on-page candidate name and confirms it matches the approved lead before any further extraction) — a mismatch here also hard-stops, before any persistence, per your explicit requirement.

**Security boundaries, restated as implementation constraints:**
- No `page.goto()`, `page.click()`, `page.fill()`, `page.type()`, `page.setInputFiles()`, or any mutating Playwright call anywhere in this code path — extraction uses only read methods (`.textContent()`, `.getAttribute()`, `.isVisible()`, `.locator(...).count()`).
- No new tab/window is opened by the script; no download handling.
- All extraction is scoped to the one confirmed tab/origin/candidate — there is no code path that could wander to a different candidate or a different Apploi page.
- Still, and always: no stealth plugins, no fingerprint patching, no Cloudflare/CAPTCHA handling of any kind. If Cloudflare interferes with your *own* manual login, that's yours to resolve exactly as you always would — the collector never sees it.

---

## 3. Row-Level Selector Strategy

I have never inspected Apploi's real DOM, so I cannot give you working selectors today — only a strategy, in priority order, most to least resilient:

1. **`data-testid`/`data-test`/`data-qa` attributes**, if Apploi's frontend exposes them (common in modern SPAs) — most stable against redesigns.
2. **ARIA role + accessible name**, via Playwright's semantic locators (`getByRole`, `getByLabel`) — resilient to class/markup churn.
3. **Scoped text anchors** (`getByText`, scoped to a known row/card container) — used only within a landmark already established by (1) or (2), never a bare page-wide text search.
4. **Positional/structural CSS** — last resort, explicitly flagged: any observation extracted this way gets `extraction_confidence: 'low'` and `match_method: 'positional'`.

Every extractor catches its own selector failure locally and returns `visibility: 'not_visible'` with a `failure_reason` — never throws, never guesses. **Phase 1's actual first deliverable is a supervised selector-discovery session**, not pre-written selectors: with your CDP-attached session open on the real Alma record, we inspect the real DOM together (you, using browser devtools, or a bounded read-only "structural outline" dump the script can produce) and write the row-scan extractor against what's actually there — "reconnaissance" in your own framing, taken literally.

## 4. Detail-Drawer/Timeline Selector Strategy

Same priority order as §3, applied per sub-area, each its own small versioned extractor (§1's file list) so a selector break in one area (say, Documents) never disables the others. Each detail extractor is scoped to open **only** the tab/section it needs, read it, and not touch anything else — no "expand everything and scrape the whole drawer" pattern, which would work against the minimization requirement in §8 as much as against selector resilience.

---

## 5. Normalized Observation Vocabulary

Extending `recruiting_lead_observations` with exactly the fields your Phase 3 lists — mapped to the schema in §1:

| Phase 3 requirement | Column |
|---|---|
| subject/case identifier | `recruiting_lead_id` (existing) |
| source system | `source_system` (new — denormalized onto the row, same reasoning as the existing `recruiting_lead_id` denormalization) |
| source record identifier | `source_record_id` (new) |
| observation key | `observation_key` (existing) |
| raw source label / bounded source text | `raw_label` (existing — semantics tightened: must always already be bounded/short, never a raw page dump; enforced by the extractor, not the column) |
| normalized value | `normalized_value` (existing) |
| observation class = directly_observed | **Implicit in the table itself** — see below |
| observed_at | `observed_at` (existing) |
| collected_at | `collected_at` (new — when the collector actually wrote this row; distinct from `observed_at`, which is when the underlying vendor state was read) |
| source location / DOM landmark | `source_location` (new — a human-readable description, e.g. `"detail drawer > Interview tab"`, never a raw selector string) |
| extractor version | `extractor_version` (new — e.g. `"apploi.detail.interviewTab@1"`) |
| confidence in extraction accuracy | `extraction_confidence` (new — `'high' | 'medium' | 'low'`, about extraction mechanics, not about the underlying fact's truth — that's `visibility`) |
| visibility | `visibility` (existing, extended with `'ambiguous'`) |
| match method | `match_method` (new — `'data_attribute' | 'aria_role' | 'text_content' | 'positional'`) |
| collector run ID | `collector_run_id` (existing) |
| failure/ambiguity reason | `failure_reason` (new, populated only when `visibility ≠ 'directly_observed'`) |
| sensitivity classification | `sensitivity` (new — `'standard' | 'sensitive'`, see §8) |

**Why "observation class" has no dedicated column:** a row in `recruiting_lead_observations` *is* the directly-observed class, structurally — `recruiting_lead_inferences` and `recruiting_lead_human_confirmations` are separate tables with their own shapes. This is the literal implementation of "never collapse these into one generic fact presentation" — it's not possible to collapse them if they were never in the same table to begin with.

**Hard exclusion, stated explicitly per Phase 4:** `observation_key` must never be `apploi.ssn`, `apploi.birth_date`, `apploi.dob`, or any equivalent — extractors never read these fields even when visible.

---

## 6. Initial Versioned Inference Rules

Each rule below is `rule_version = 1`, `trigger_type = 'event'` (re-evaluated whenever new observations land for a lead), domain `recruiting`. Full [Rule Engineering Standard](../intelligence/SERVE_INTELLIGENCE_ENGINEERING_STANDARDS.md) template sign-off happens at actual implementation review — this is the condensed version sufficient for this plan.

**A. `interview_activity_present`**
- **Inputs:** any observation whose key is namespaced under `apploi.detail.activityTimeline.*` or `apploi.detail.communications.*` with a value indicating an interview-related event.
- **Logic:** fires if ≥1 such observation exists with `visibility = 'directly_observed'`.
- **Strength:** strong (direct evidence of *an* interview-related event; says nothing about outcome).
- **Unresolved alternatives:** the event could be scheduling-only, a reschedule, or a cancellation — this rule doesn't distinguish those; Rule C does.
- **Evidence that would resolve further uncertainty:** the specific event type/outcome.

**B. `positive_candidate_assessment_present`**
- **Inputs:** `apploi.rating` (or equivalent) = "Good Match" or equivalent vendor rating value, `visibility = 'directly_observed'`.
- **Logic:** fires on presence alone.
- **Strength:** strong, but narrowly scoped — the explanation text must say only *"a positive rating is present"*, never imply what produced it.
- **Unresolved alternatives:** who set it, when, and whether it followed a completed interview are all explicitly unknown — this rule must never be combined with Rule A to synthesize `interview_completed`. That composition is the one your message names as unsafe, and no rule here performs it.
- **Evidence that would resolve uncertainty:** verified vendor documentation of what triggers this rating, or a timestamped audit trail entry.

**C. `interview_scheduled_or_rescheduled`**
- **Inputs:** `apploi.detail.interviewTab.*` observations showing a scheduled time, a reschedule event, or an explicit candidate confirmation of a proposed time.
- **Logic:** fires if any such observation is `directly_observed`.
- **Strength:** strong.
- **Unresolved alternatives:** none for *scheduling* itself; says nothing about whether the interview occurred.

**D. `interview_completion_unconfirmed`**
- **Inputs:** Rule A and/or C fired, **and** no `directly_observed` observation exists whose key/value directly asserts completion.
- **Logic:** a *negative-space* rule — fires specifically because activity exists but completion evidence doesn't. This is the rule that structurally prevents "interview completed" from ever being asserted by inference alone.
- **Strength:** moderate (it's asserting an absence, which is inherently softer than asserting a presence).
- **Evidence that would resolve uncertainty:** a directly observed completion indicator, if Apploi exposes one.

**E. `possible_pipeline_stage_inconsistency`**
- **Inputs:** current headline stage observation (e.g., `apploi.current_status = "Requested Interview"`) plus timeline/communication observations with `observed_at` later than the stage's own last-updated signal, if one is directly observable.
- **Logic:** fires if later-timestamped activity exists than the stage label's own evidence.
- **Strength:** moderate — explicitly framed as "may be stale," never "is stale."
- **Unresolved alternatives:** the stage could be accurate and the later activity administrative/non-substantive.

**F. `cross_system_stage_inconsistency`**
- **Inputs:** Apploi's current stage observation + Viventium's onboarding-stage observation for the same linked lead (requires a confirmed `recruiting_lead_vendor_identities` link for both systems, per Phase 4).
- **Logic:** fires when the two systems' lifecycle evidence is materially different (e.g., Apploi still pre-hire, Viventium shows a new-hire/onboarding record) — **without asserting which is correct.**
- **Strength:** strong (the inconsistency itself is directly evidenced, even though its resolution isn't).
- **Evidence that would resolve uncertainty:** a human-confirmed hiring decision or reconciliation of Apploi's stage.

**Explicitly not implemented, per your instruction:** any rule producing `interview_completed`, `offer_accepted`, `candidate_hired`, `onboarding_complete`, or `ready_to_schedule`. These remain either directly-observed-only (if a vendor ever exposes unambiguous direct evidence) or human-confirmed-only.

---

## 7. Storage and Display of the Three Evidence Classes

| Class | Table | UI Component |
|---|---|---|
| Directly Observed | `recruiting_lead_observations` | `DirectObservationsPanel` (per vendor, source-attributed, exactly the existing `VendorEvidencePanel` pattern) |
| Deterministically Inferred | `recruiting_lead_inferences` + `recruiting_lead_inference_evidence` | `InferredSignalsPanel` — each entry shows explanation, strength, the specific observations it cites (clickable/traceable), unresolved alternatives, and what evidence would resolve the uncertainty |
| Human Confirmed | `recruiting_lead_human_confirmations` | `HumanConfirmationsPanel` — actor, timestamp, rationale always visible, never abbreviated away |

Visual/semantic separation (your explicit requirement): inferred entries carry a distinct badge/color from direct observations (extending the existing "Vendor observation" vs "Derived" badge pattern already in `HiringSynthesisCard`/`VendorEvidencePanel` — inferred gets its own third visual treatment, not reused from either). `recruiting_leads.status` continues to render in its own separate header area, as today, and is never written to by any part of this system — confirmed unchanged in §1's file list.

---

## 8. Sensitive Communication Content Minimization

The `communications.ts` extractor never reads a message's full body container. It:
1. Scopes to a bounded "activity feed item" / "message summary" landmark, never the full thread/email view.
2. Extracts only: `type`, `sender/recipient role` (if the vendor UI itself labels this — never inferred from an email address), `timestamp`, `subject`, and a **short, bounded event statement** — capped (e.g., ~200 characters) and, where the vendor UI exposes a structured status/icon (confirmed / declined / proposed-new-time), prefers that structured signal over any free text at all.
3. Never touches signature blocks, disclaimers, social links, or any content outside the scoped landmark — structurally impossible, not just avoided by convention, because the extractor's locator never targets those regions to begin with.
4. Anything extracted from free text rather than a structured vendor signal is marked `sensitivity: 'sensitive'` — flagging it for narrower future access control even though no access-control system is being built in this phase.

For Alma specifically: this lets the system record *"an interview-related message was sent; the candidate's response confirmed a proposed time"* as a short, bounded, structured observation — never Brian's full email, signature, or any content unrelated to that one operational fact.

---

## 9. Testing

New DOM fixtures are static, sanitized HTML strings — no real Apploi markup, no real candidate data, checked into the repo like any other test fixture. They're exercised via **`chromium.launch({ headless: true })` + `page.setContent(fixtureHtml)`** — a fully offline, local, throwaway browser rendering static text I wrote, never contacting Apploi or any network. This is categorically different from the automated-browser-against-a-vendor pattern removed in the prior turn; I'm flagging the distinction explicitly since it's the same library (Playwright) but not the same risk category at all.

Coverage, per your list: row-level extraction; detail-drawer extraction; Good Match as direct evidence only (asserted via a test that fails if any rule ever derives `interview_completed` from it); reschedule communication classified as interview activity, not completion; message-content minimization (asserts signature/disclaimer fixture text never appears in any persisted observation); stage/activity inconsistency (Rule E); Apploi/Viventium cross-system inconsistency (Rule F); direct-vs-inferred-vs-confirmed structural separation; selector failure → `not_visible`; duplicate matches → `ambiguous`, never a silently-picked value; candidate mismatch → hard stop before any persistence; stable vendor-ID linkage reuse on a second run; **an assertion that no extractor or rule module imports or calls any Playwright mutating method** (`click`/`fill`/`type`/`goto` etc.) — a structural boundary test in the same spirit as `lib/intelligence/core`'s own vendor-type-leak scan; guided-manual fallback still reachable when an extractor is deliberately forced to fail; deterministic explanation/provenance surviving a page refresh (i.e., re-fetched from the DB, not held in component state).

Then, exactly as requested:
```
npm run typecheck
npm run lint
npm run test:recruiting
npm run build
```
plus the new rule/extractor test files.

---

## 10. What Remains Manual After This Phase

- **All of Viventium** — this phase is scoped to Apploi reconnaissance only; Viventium stays on the existing guided-manual prompts from `RECRUITING_LEAD_FLIGHT_PLAN.md`.
- **Identity linkage confirmation** — Phase 4's tiers 1–6 can populate `recruiting_lead_vendor_identities` automatically when evidence is strong enough, but `is_human_confirmed` only ever becomes `true` via an explicit human action; tier 7 (name-only) is never auto-applied.
- **Any hiring decision or outcome** — `recruiting_leads.status`, and any eventual "hired" determination, remain entirely human, entirely manual, exactly as already enforced.
- **Any field an extractor can't yet reach reliably** — falls back to the existing guided prompts, tagged `collection_method: 'guided_manual'`, permanently distinguishable from `'automatic_dom'` evidence in the record, never silently blended.
- **Row-scan-triggered automatic recurring collection** (Phase 8's stated end goal — "eventually run row scans automatically") — explicitly out of scope for this phase; this phase is one supervised, CDP-attached run at a time, same operating model as the existing flight.

## Technical Blockers

**None that prevent proceeding**, with one honest caveat stated plainly: I cannot guarantee selector stability without first seeing Apploi's real DOM, which is why §3/§4 propose a supervised discovery session as the actual first step rather than pre-written selectors I'd otherwise be fabricating. CDP-attaching to your own already-authenticated Chrome/Edge session is a well-supported Playwright capability (`chromium.connectOverCDP`) and carries none of the fresh-automated-browser signals that triggered Cloudflare last time — but I can't promise Cloudflare will never re-challenge a CDP-attached session either; if it does, the correct response is the same as before: stop, don't attempt a workaround, and report back.

---

*Nothing here has been implemented. No migration applied, no extractor written, no vendor contacted beyond what was already authorized. Ready to begin on your confirmation.*
