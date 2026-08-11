# Assessment-to-Client Operationalization — Final Report

Branch: `feature/assessment-to-client-operationalization` — **not merged to `main`, per
instruction.** Delivered for review.

| | SHA |
|---|---|
| Starting | `0e0bfc4a2cbb663e508d7127284000b1f1885fc3` (main, "feat: add Capture Assessment entry point to resident profile") |
| Ending | `f8912d4060d11e8c8756ba0e5296beebc753c73a` |

**Commits created: 1** — `f8912d4 feat: assessment-to-client operationalization` (26 files
changed, 3390 insertions, 65 deletions). Kept as one commit deliberately: every piece
(migration, pure logic, data layer, actions, UI) is interdependent — the migration alone
doesn't typecheck against code that references its tables, and the UI doesn't work without
the actions/data layer beneath it. Splitting it would have produced intermediate commits that
don't build.

---

## 1. What was built (architecture summary)

Full design rationale: [`docs/architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md`](ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md)
(discovery + architecture, written before implementation, per the required sequence).

```
Resident/Prospect (existing) OR new-provisional Prospect (name only)
        ↓
intake_assessment_session (existing capture-layer table, reused as-is)
        ↓
intake_sources.transcript_text  ← pasted transcript today, live transcription later (§3A)
        ↓
Extraction (OpenAI, schema-constrained, Zod-validated)
        ↓
assessment_draft_facts  (assertion_state × collection_method axes; unknown never becomes false)
        ↓
Exception-oriented human review (only uncertain/conflicting/missing surfaced)
        ↓
approve_assessment_session()  — governed RPC, immutable append-only assessment_approved_facts
        ↓
   ┌────────────┬──────────────────┬───────────────────────┐
   ↓            ↓                  ↓                        ↓
Deterministic  AxisCare preview   Cinch projection    Make Active Client
pricing        (reuses existing   (draft, never sent)  (reuses existing
(never AI-     identity links,                          convert_resident_prospect_
invented)      never writes)                             to_active_client())
```

## 2. Reused legacy intake capabilities

- **Old Serve Intake MVP's pricing catalog** (`pricingRules.js`) — the published rates and
  service tiers (Touch Point $15, Essential $25, Comfort $35, Deluxe $45; the four packages)
  are ported directly into `lib/assessmentIntelligence/pricingCatalog.ts`, versioned.
- **Old MVP's evidence-required extraction discipline** — every confirmed fact must carry
  evidence, never invented — carried forward into the extraction prompt, but rebuilt around
  Serve OS's own assertion_state/collection_method model rather than the MVP's flatter
  `{value, evidence, confidence}` shape.
- **This repo's own recent Capture Assessment work** (`intake_assessment_sessions`,
  `intake_sources`, `intake_handoff_codes`, `create_provisional_resident_from_intake`) — used
  as-is throughout; not one column, constraint, or row on those tables was altered except the
  single additive CHECK-constraint widening described below.
- **`convert_resident_prospect_to_active_client()`** (existing, from the External Clients/
  Conversions migration) — called directly for client operationalization; no new conversion
  logic was written.
- **`person_vendor_identity_links` / `axiscare_client_dispositions` / `classifyAxisCareClientLifecycle()`** — reused as-is for AxisCare readiness; specifically reused
  `getPersonVendorIdentityLinksForSubject()` from the existing data layer rather than writing a
  new query.
- **`serveRelationshipProjection.ts`'s combinator pattern** — informed the design of
  `computeAxisCareReadiness()`/`recommendPricing()` (deterministic, explainable, pure functions
  over structured input) rather than mutable stored state.

## 3. Capabilities intentionally NOT reused, and why

- **Old MVP's keyword-matching pricing logic** (flattening output to one string and
  regex-scanning it) — replaced with field-based reasoning over structured
  `assertion_state`/`field_path` facts. More robust, and the old MVP's fallback behavior
  (default to Essential Service when nothing matched; invent a "custom scheduled visit" rate
  for long durations) directly contradicted this task's explicit "return pricing review
  required rather than manufacturing a rate" instruction, so it was deliberately not carried
  forward.
- **Old MVP's flat `schema.js` field tree** — replaced with the domain-registry pattern
  (`field_path` strings validated against a versioned TS registry) so adding coverage later is
  a code change, not a migration.
- **Old MVP's Cinch field-mapping intent** — it was never a live integration (Phase 1
  archaeology on that project confirmed the "Push to Cinch" button was always a stub), so there
  was nothing functioning to port; the new Cinch projection was built fresh against Cinch's
  known General/Client Status/Environment structure per this task's own instructions.
- **The website-form Intake Intelligence Engine** (`intake_submissions`/
  `intake_processing_records`) — confirmed via research to be a genuinely different pipeline
  (inbound lead classification, not assessment intelligence); left completely untouched.

## 4. Assessment lifecycle implemented

`recording → processing → draft/needs_review → approved → operationalized`, all values on the
**existing** `intake_assessment_sessions.status` column — only `'operationalized'` was added
(additively; the drop/recreate uses dynamic constraint-name lookup via `pg_constraint`, not a
guessed name, after an earlier session in this project got burned by exactly that guess going
wrong). `amended` (for future re-assessment-supersedes-prior-approved-fact flows) exists in the
constraint but isn't produced by any code path yet — reserved, not fabricated.

## 5. Pricing source of truth

`lib/assessmentIntelligence/pricingEngine.ts` + `pricingCatalog.ts`
(`PRICING_CATALOG_VERSION`/`PRICING_RULES_VERSION`, both `"2026-09-01.1"`). Every pricing
decision writes an `assessment_decisions` row carrying both version strings — a price is always
traceable to the exact catalog+rules version that produced it. Consumes **only**
`assessment_approved_facts`, never draft facts or AI free text; returns
`pricing_review_required` (not a number) when nothing maps safely. Locked in by test:
`pricingEngine.test.ts`'s "no parameter for an AI suggestion" case documents that the function
signature itself makes it structurally impossible for an AI recommendation to influence the
computed price.

## 6. AxisCare integration status

**Preview only — confirmed no write capability exists anywhere in this codebase (unchanged),
and none was added.** `generateAxisCarePreview()` computes readiness (reusing the existing
identity-link mechanism), builds a payload preview object, and writes it to
`assessment_outputs` — nothing is sent anywhere. An ambiguous/non-high-confidence match always
routes to `possible_duplicate_requires_reconciliation`, never auto-resolved.

## 7. Cinch projection status

**Draft-only, never claimed sent.** `buildCinchProjection()` maps approved facts into General/
Client Status/Environment; written to `assessment_outputs` with `status='draft'`. No Cinch API
client exists in this codebase to send it through even if a "send" button existed — none was
built.

## 8. Tests

**29/29 new tests passing** (`npm run test:assessmentIntelligence`):
`factTypes.test.ts` (8 — including the explicit unknown≠false enforcement case),
`pricingEngine.test.ts` (6 — including the "conflicting AI suggestion" architectural-guarantee
case), `axiscareReadiness.test.ts` (6 — existing match, ambiguous match, attempted-duplicate
rejection, missing fields), `reviewExceptions.test.ts` (6 — clear vs. uncertain vs. conflicting
vs. missing), `cinchProjection.test.ts` (3).

Two real test bugs were found and fixed *in the tests themselves* during this pass (not the
implementation) — a regex typo, and three assertions that didn't account for the domain
registry's `requiredForReview` fields always contributing `missing_required` exceptions. Both
are visible in the file history if you want to see exactly what was wrong and how it was
diagnosed.

**Existing regression suites, unaffected**: `test:residents` (42/42), `test:auth` (4/4),
`test:relationships` (10/10), `test:axiscare` (18/18 + 6/6) — all still passing.

**Not tested**: anything requiring a live database (this environment has no Supabase
CLI/connection, same limitation as prior work in this project) or a browser (no automation
tool here) — see Blockers.

## 9. Build / lint / typecheck results

- `npx tsc --noEmit`: **0 errors**, full repo, after every code addition
- `npm run build` (full Next.js production build): **exit 0**, `/residents/[id]/assessment/
  [sessionId]` correctly registered as a dynamic route alongside everything else
- `npm run lint`: 2 real errors found and fixed in **my own new file**
  (`AssessmentReviewPanel.tsx`, unescaped quote characters); re-linted clean afterward. Lint
  also surfaced one pre-existing error and one pre-existing warning in
  `components/auth/ResetPasswordForm.tsx` and `components/intake/steps/RecruitingPanel.tsx` —
  **neither file was touched by this work and neither was fixed**, per the explicit
  instruction not to make unrelated changes.

## 10. Remaining blockers

1. **The migration has not been applied to any database.** Same environment limitation
   encountered throughout this project — no Supabase CLI auth or direct DB connection here.
   `supabase/migrations/20260901000000_create_assessment_intelligence_layer.sql` needs to be
   run (SQL editor, or `supabase db push` once linked) before any of this code can succeed
   against real data. It is additive-only and was written defensively (dynamic constraint
   lookup, `IF NOT EXISTS`/`OR REPLACE` throughout) — see the file's own header for the exact
   scope guarantee.
2. **`OPENAI_API_KEY` is not configured anywhere in `serve-os`** (confirmed by direct grep of
   `.env.local`/`.env.example`/`package.json` before building the extraction pipeline — this
   repo never had OpenAI wired in before). `openai` and `zod` were added as new npm
   dependencies (`npm install` already run, `package-lock.json` updated and committed).
   Extraction will fail cleanly with a clear "Missing OPENAI_API_KEY" error, not silently, until
   a real key is configured — not fabricated here.
3. **No live end-to-end test was possible** — no DB, no browser, no OpenAI key together mean
   the full pipeline (paste → extract → review → approve → price → preview) has only been
   verified at the unit-test level (pure logic) plus a clean production build (everything wires
   together correctly at compile time). See Manual QA below for what a human needs to do once
   the two blockers above are resolved.

None of these are code defects — they're the same class of "needs a credential/connection this
environment doesn't have" gap that showed up at every prior stage of this project, handled the
same way: build correctly, fail loudly and clearly rather than fake success, flag precisely
what's needed.

## 11. Manual QA instructions

Once the migration is applied and `OPENAI_API_KEY` is set:

1. Open an existing resident's profile (`/residents/[id]`) — confirm the "Assessment History"
   card renders (replacing the old placeholder text) with **Capture Assessment** and
   **Paste Transcript** actions, and no existing sessions listed yet.
2. Click **Paste Transcript**, paste a synthetic (non-PHI) assessment conversation covering a
   few daily-life/mobility/health topics, click **Extract Facts**. Should redirect to
   `/residents/[id]/assessment/[sessionId]`.
3. On the review screen: confirm only uncertain/conflicting/missing fields are shown
   individually (not every extracted fact) — resolve any exceptions shown, click
   **Approve Assessment**.
4. Confirm a pricing result appears (either a recommended option, or "Pricing review required"
   — both are correct outcomes depending on what was in the test transcript).
5. Click **Preview AxisCare Payload** — confirm a readiness state appears (most likely
   `missing_required_fields` unless the test transcript included DOB and a contact phone).
6. Click **Generate Cinch Projection** — confirm it completes without error.
7. Click **Make Active Client** — confirm a relationship is created/converted and the resident's
   `/prospects` or `/clients` surfaces reflect it appropriately.
8. Separately: start a **+ New Prospect** flow (name only) via the same paste-transcript path,
   and confirm exactly one new `residents` row is created, tagged `source_system='serve_intake'`.

## 12. Routes touched/added

- `/residents/[id]` — modified (Assessment History card now real, not a placeholder)
- `/residents/[id]/assessment/[sessionId]` — new

No screenshots — no browser available in this environment; routes above are precise and can be
opened directly once the blockers in §10 are resolved.

## 13. Explicit confirmation: unrelated Serve OS behavior was not intentionally changed

- No file outside the 26 listed in the single commit was modified.
- The one pre-existing-table change is additive only (`intake_assessment_sessions.status`
  CHECK constraint gains `'operationalized'` as a new allowed value; every previously-valid
  status value remains valid).
- `person_vendor_identity_links`, `axiscare_client_dispositions`, `relationships`,
  `residents`, and every other pre-existing table are untouched — confirmed by the migration
  file's own scope statement and by this report's author having written every line of SQL in
  it.
- The two pre-existing lint issues surfaced in unrelated files were left exactly as found.
- All pre-existing test suites (residents, auth, relationships, AxisCare) pass identically to
  before this work began.

---

## READY FOR REVIEW — not merged to `main`, per instruction.
