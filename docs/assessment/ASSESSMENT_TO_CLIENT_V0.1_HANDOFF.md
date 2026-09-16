# Assessment → Client Enrollment → AxisCare v0.1 — Handoff

Status: investigation + Slice 1 implemented but **uncommitted**. This file plus `git diff`/`git status` in this worktree is the full continuity record — do not reconstruct from conversation history.

---

## 1. Repository State (verified at handoff time)

- Path: `c:\Users\hudso\Development\Serve\serve-os\wt-assessment-axiscare` (a git worktree, not the primary checkout)
- Branch: `feature/assessment-to-axiscare-v0.1`
- HEAD: `37045573070656e6f75badb912fd63e5868dca27` — matches `origin/main`
- `git status --short` is **not clean** and must not be made clean by reflex — see §2.
- No `node_modules` and no `.env.local` in this worktree: tests run fine (Node's native TS stripping resolves local files; the tests that matter here have zero npm-package runtime imports), but there is no live Supabase/OpenAI/AxisCare connection and no `tsc` available here.

## 2. Existing Uncommitted Slice 1 Work — PRESERVE EXACTLY

**These are intentional, reviewed changes from this workstream, not stray or accidental edits.** Do not reset/restore/stash/clean/discard/recreate them because the tree is dirty. Inspect `git diff` before touching any of these files.

| File | Status | What / why |
|---|---|---|
| `supabase/migrations/20260915000000_add_service_agreement_client_enrollment.sql` | new | **File only — never applied to any database.** Widens `relationships_type_check` to add `inactive_client`; widens `relationship_conversions_path_check` to add `resident_prospect_to_inactive_client`; adds `convert_resident_prospect_to_inactive_client()`, modeled on the existing `convert_resident_prospect_to_active_client()` for its guard clauses and timeline/conversion bookkeeping — deliberately has no parameter or path that can produce `active_client`. Two intentional differences from the Active-client RPC (not omissions): it does not call `resolve_relationship_open_actions()` (enrollment isn't "winning" the relationship the way Activation is — open actions stay open), and it does not create an onboarding/service-start follow-up action (Activation, not enrollment, owns service-start behavior). |
| `lib/residents/serveRelationshipProjection.ts` | modified | Adds `hasInactiveClientRelationship()` and a new branch in `projectServeRelationship()` (checked after `active_client`, before `prospect`) so a CRM `relationships` row of type `inactive_client` deterministically projects `ServeRelationship = "inactive_client"`, `relationshipSource = "crm_relationship"` — no correction row involved. |
| `lib/relationships/enrollment.ts` | new | Pure, I/O-free `decideClientEnrollmentAction()`: no-ops if the resident is already `active_client` or `inactive_client` (re-recording a Service Agreement never downgrades or duplicates), converts an existing non-closed `resident_prospect` relationship if one exists, else signals create-then-convert. |
| `lib/actions/clientEnrollment.ts` | new | I/O wrapper: reads existing relationships, calls `decideClientEnrollmentAction()`, finds/creates the `resident_prospect` relationship if needed, calls the new RPC. Depends on `lib/relationships/enrollment.ts` and the migration's RPC (not yet applied). |
| `lib/actions/clientReadiness.ts` | modified | `recordServiceAgreementEvidenceAction()` now calls `enrollResidentAsInactiveClient()` right after Service Agreement evidence is recorded — the signed agreement **is** the enrollment event, no separate "Enroll" action. Enrollment failure surfaces as a `warning` on the return value; it never masks or blocks the evidence write, which already succeeded. |
| `components/assessment/AssessmentReviewPanel.tsx` | modified | Removed the "Make Active Client" button, its handler, and the `makeActiveClientFromAssessment` import — assessment approval can no longer directly activate or enroll anyone. Replaced with a one-line note pointing enrollment to the resident's Service Agreement upload instead. |
| `lib/actions/assessmentClientOperationalization.ts` | **deleted** | Its only export (`makeActiveClientFromAssessment`) was the removed affordance above; confirmed via repo-wide grep that nothing else imported it. |
| `lib/supabase/types.ts` | modified | Adds `"inactive_client"` to the `RelationshipType` union. |
| `lib/relationships/constants.ts` | modified | Adds `"inactive_client"` to `RELATIONSHIP_TYPES` and `RELATIONSHIP_TYPE_LABELS` — required because `RELATIONSHIP_TYPE_LABELS` is typed `Record<RelationshipType, string>`; without this the type addition above would fail to compile. |
| `lib/residents/__tests__/serveRelationshipProjection.test.ts` | modified | +6 tests, see §3. |
| `lib/relationships/__tests__/enrollment.test.ts` | new | +7 tests for `decideClientEnrollmentAction()`, see §3. |
| `package.json` | modified | Wires the new `enrollment.test.ts` into the `test:relationships` script. |

**Dependency chain**: migration (RPC) ← `clientEnrollment.ts` ← `clientReadiness.ts`'s `recordServiceAgreementEvidenceAction()`. The projection change is independent of the RPC — it only requires a `relationships` row to *exist* with `relationship_type='inactive_client'`, however that row got there.

## 3. Slice 1 Validation Status

Run and passing, this worktree, this session:

- `lib/relationships/__tests__/enrollment.test.ts` — 7/7
- `lib/residents/__tests__/serveRelationshipProjection.test.ts` — 33/33 (27 pre-existing + 6 new)
- `npm run test:relationships` — 0 failures (9 files)
- `npm run test:residents` — 0 failures (3 files: 22/22, 33/33, 13/13)
- `npm run test:clientReadiness` — 0 failures
- `npm run test:assessmentIntelligence` — 0 failures (10 files)
- `npm run test:auditReadiness` — 0 failures (12 files)
- `npm run test:externalClients` — 0 failures
- `npm run test:intake` — 0 failures

**Outstanding, explicitly not done**: `npx tsc --noEmit` has never been run against this diff — no `node_modules` in this worktree. One manual check was done (the `Record<RelationshipType, string>` exhaustiveness issue in `constants.ts` was found and fixed by inspection), but a full typecheck in an environment with dependencies installed is required before this is merge-ready. Do not install dependencies as part of a documentation-only task — that's a separate, explicit step.

## 4. Canonical Lifecycle — Authoritative

```
Known Person / Prospect
   → Assessment (creates knowledge only)
   → still Prospect / Known Person
   → Signed Service Agreement received (human action)
   → Enrolled INACTIVE Client                      ← Slice 1, implemented above
   → human "Send to AxisCare"                       ← not yet built
   → AxisCare INACTIVE Client
   → actual service requested
   → human "Activate Client"                        ← not yet built
   → AxisCare ACTIVE
   → scheduling / service delivery
```

- **Assessment creates knowledge only.** Approval never enrolls, never activates, never touches AxisCare. `desired_start_timing` and any discussed schedule are knowledge, never a trigger.
- **Signed Service Agreement is the enrollment event**, default state `inactive_client` — authoritative lifecycle evidence, not a human correction. `resident_serve_relationship_corrections` stays reserved for genuine overrides of an incorrectly-computed value, never the ordinary path to `inactive_client`.
- **Send to AxisCare and Activate Client are human business actions**, not yet implemented. Assessment intelligence may populate a payload, flag missing fields, flag possible duplicates — it does not authorize or deny the action.
- **Financial constraint**: Serve is billed by AxisCare per Active client. Accidental activation has a real recurring cost. The write pattern for both future actions must be create/patch → read-back → verify, and must not report success until the intended status is confirmed live.
- Assessment workflow state (`recording/processing/draft/needs_review/approved/operationalized`) and client relationship state (`prospect/inactive_client/active_client/...`) are separate concepts and must stay separate.

## 5. Assessment Intelligence — Existing Architecture (do not treat as green-field)

Already on `main`, substantial and working: capture → transcription → schema-constrained extraction (`lib/assessmentIntelligence/`) → `assessment_draft_facts` (assertion_state × collection_method × confidence × evidence) → conflict detection → exception-oriented human review (`AssessmentReviewPanel.tsx`) → immutable, supersede-chained `assessment_approved_facts` → deterministic pricing, AxisCare payload preview, Cinch projection (all preview-only). AxisCare integration is structurally read-only (`axisCareGet()` hardcodes `GET`, no write function exists anywhere). Core epistemic guarantee, enforced in code (`normalizeExtractedFacts()`), not just convention: an affirmative/negative claim with no evidence or confidence is rejected before it's ever written — silence is never fabricated into "No."

## 6–7. Revised Assessment Contract — Current Direction

Assessment intelligence answers **"what does Serve know from this assessment?"** — it does not decide **"is this human allowed to enroll/send/activate?"** Algorithmic readiness gates (Ready-to-Enroll, Ready-to-Send-to-AxisCare, Ready-for-Activation) are **superseded** — see §13.

Topics are classified, not gated:

- **Core** — normally established in a high-quality assessment: DOB, basic contact, primary contact, physician name/phone, primary goals, all ADLs/IADLs, medication-reminder need, recent falls, gait/mobility, mobility devices in use, environmental concerns, vision/hearing impairment, basic cognition/orientation, care-relevant health conditions, allergies, recent hospitalization, dietary restrictions, desired timing/frequency/duration.
- **Conditional** — established when an earlier finding makes it relevant: cognition concern → wandering + behavior concerns; medication reminders needed → medication timing + setup; transfers + reduced mobility → transfer/lift equipment; meal-related or cognition concern → swallowing; any real safety finding → precautions; POA mentioned → structured decision-maker (name/relationship/phone); not a recognized partner community → full address (city/state/postal code).
- **Supplemental** — captured if naturally mentioned, never chased: preferred name, nonessential email, why-now/what-changed/acceptance-of-care, granular equipment detail, repeated-questions/missed-appointments detail, explicit-only cognitive diagnosis, blood thinners, oxygen, advance-planning details, preferred days/windows, payer/billing responsibility, all `serve_relationship_intelligence.*` fields, routines/social context.

This is **current approved design direction, not final code or schema** — refine before implementing.

## 8. High-Priority Contract Gaps (from the field-level audit)

Physician name/phone, swallowing/dysphagia, medication timing, medication setup, behavior concerns, transfer/lift equipment, general precautions/restrictions, full address components (only where operationally necessary — see the community-resident conditional above), better-structured decision-maker/contact info. **Not every field the old Cinch/Serve form had needs to be added** — avoid recreating a giant digital form for its own sake.

## 9. Coverage UX

Conversational, not a checklist: *"Based on the assessment conversation, 3 important topics still need clarification: swallowing risk, medication setup, transfer assistance."* Never *"72 of 83 fields complete."* Shows missing Core topics plus Conditional topics **only when their trigger actually fired** — an un-fired Conditional topic is invisible, not counted as missing. Purely informational, read-time-computed, never blocks approval or any downstream action, never writes a fact. Silence still means "not established," never "No."

## 10. Conflicting-Facts Bug (confirmed, unfixed, priority)

`assertion_state = "conflicting"` is a real value the extraction prompt instructs the model to emit when two people disagree — but `computeReviewExceptions()` only checks a DB table (`assessment_fact_conflicts`) populated exclusively by `detectAndRecordConflicts()`'s `confirmed_yes`+`confirmed_no` pairing. A model-self-flagged conflict, and any disagreement between two `confirmed_yes` values on a non-boolean field (most identity/people fields), currently falls through to auto-accepted `clearFacts` with no review. Proposed fix (reuses the existing table, no new one): `computeReviewExceptions()` checks `assertionState === "conflicting"` directly; `detectAndRecordConflicts()` also persists model-self-flagged conflicting pairs and detects disagreeing `confirmed_yes` values on non-boolean fields. Not yet implemented — prioritize before broad Watermere rollout.

## 10a. Known Issue: Concurrent Enrollment Race (acknowledged, deferred — not Slice 1)

`enrollResidentAsInactiveClient()` (`lib/actions/clientEnrollment.ts`) has no locking around its "check for an existing relationship, else create one" path (`decideClientEnrollmentAction()`'s `create_then_convert` outcome). Two genuinely concurrent enrollment attempts for the same resident with no existing `resident_prospect` row yet (e.g. two browser tabs, or a retried request) could each independently create a separate `resident_prospect` relationship and each convert it, producing two `inactive_client` relationships for one resident. The `convert_existing` path is safe against this — `convert_resident_prospect_to_inactive_client()`'s `select ... for update` row lock serializes concurrent conversions of the *same* relationship row, so the second caller reliably hits `RELATIONSHIP_NOT_ELIGIBLE` rather than silently duplicating. The UI (`ServiceAgreementEvidenceForm.tsx`) disables its submit button while a request is pending, which covers the common accidental-double-click case, but nothing prevents this at the data layer. This risk pattern already exists in the pre-existing `convert_resident_prospect_to_active_client()` path this Slice reused as a model — not a regression introduced by Slice 1. **Acknowledged, explicitly deferred — do not redesign relationship-creation concurrency as part of Slice 1.** Revisit if it manifests in practice or before this path sees materially higher concurrent traffic.

## 11. AxisCare Findings

**Today**: extensive read capability; zero write capability, structurally enforced (`axisCareGet()` hardcodes `GET`); credentials/scopes are read-only; a prior governance decision (`DECISION_LOG.md`) explicitly requires separate approval before any AxisCare mutation.

**Platform**: the vendored OpenAPI spec documents real write support (Client create/update, etc.) — the current lack of write capability is a Serve OS policy choice, not a platform limitation.

**Intended future authorization is narrow**: eventually, Serve OS may create/update an AxisCare *Client* from an authorized human-triggered workflow. This does **not** imply authorization for schedules, visits, ADLs, contacts, or any autonomous mutation of anything.

**Financial-safety pattern for any future write** (not implemented): `POST Client` → `PATCH status → Inactive` → `GET` read-back → only report "Send to AxisCare" success once Inactive is confirmed live. If creation succeeds but Inactive can't be verified, treat as an urgent exception — an accidentally Active client has a real recurring cost. The symmetric pattern applies to future Activation (`PATCH → Active` → read-back → verify before reflecting Active anywhere in Serve OS).

## 12. Old AWS / Native-Capture Branch

`feature/assessment-aws-transcription-pipeline` — preserve as reference (native in-app recording, IndexedDB durability, AWS Transcribe, async dispatcher/background worker, several real reliability fixes). **Not current priority, do not merge wholesale.** Revisit after the canonical assessment/client workflow is operational. The existing external capture/transcription path is sufficient for the immediate workflow, provided PHI-processing authorization is confirmed before using real PHI (not yet confirmed as of this handoff).

## 13. Superseded — Do Not Revive Without a New Leadership Decision

- Assessment approval automatically making someone Active
- Assessment approval automatically enrolling someone
- AI deciding Active vs. Inactive
- `desired_start_timing` (or any discussed schedule) automatically activating a client
- Assessment completeness determining whether enrollment is allowed
- Algorithmic Ready-to-Enroll gate
- Algorithmic Ready-to-Activate / Ready-to-Send-to-AxisCare gate
- Generalized assessment-based business authorization of any kind
- Normal `inactive_client` state stored as a human correction (`resident_serve_relationship_corrections`)
- Canonical Serve assessment designed around Cinch fields
- Canonical Serve assessment designed around AxisCare fields
- Merging the old AWS assessment branch wholesale
- Native/AWS capture blocking the immediate assessment workflow
- Giant "83 fields required" digital-form review UX

## 14. Recommended Implementation Sequence

1. **Finish/validate Slice 1**: full `tsc --noEmit` in an environment with dependencies, final diff review, migration review/application planning, commit only after explicit approval.
2. **Assessment Contract / Coverage slice**: finalize Core/Conditional/Supplemental, add only the high-priority missing fields (§8), fix the conflicting-facts bug (§10), implement the informational coverage computation/UX (§9) — no business gates.
3. **Explicit Activate Client workflow**: human-triggered, separate from assessment, eventually tied to verified AxisCare Active state.
4. **Narrow Send to AxisCare workflow**: human-triggered, reuses existing duplicate/identity/readiness checks as warnings/technical validation only, create/update Client, force + verify Inactive, no success claim before read-back confirms it.
5. **Pilot one real Watermere at McKinney assessment end-to-end**, once PHI-processing authorization is confirmed.
6. **Scale to the remaining Watermere cohort.**
7. **Later**: native recording / AWS Transcribe / async processing improvements, from the reference branch in §12.

---

**Continuity note for the next session**: baseline HEAD `3704557` + the uncommitted Slice 1 changes in §2 + this file are the complete state. Do not reset, restore, stash, clean, discard, or recreate the Slice 1 changes because `git status` is dirty — inspect `git diff` first. This file was the only change introduced by the handoff task that created it; verify that against `git status --short` before doing anything else.
