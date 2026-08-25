# Assessment Intelligence → AxisCare End-to-End — Dry-Run Architecture

Branch: `feature/bedrock-claude-provider-abstraction`. This document covers the work built on
top of `docs/architecture/BEDROCK_CLAUDE_PROVIDER.md` (extraction/provider layer, already live-
proven) to reach toward the two target workflows (new prospect → AxisCare create; existing
client → AxisCare update), stopping deliberately at the write-transport boundary — see
`docs/integrations/AXISCARE_WRITE_POLICY_PROPOSAL.md` for what crossing that boundary would
require and why it wasn't done here. `docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md`
remains the authoritative standing policy throughout this document.

## 1. What was built

```
lib/assessmentIntelligence/
  reassessmentComparison.ts     — NEW. Existing approved facts vs. new draft facts -> classified
                                   change rows (UNCHANGED/NEW_FACT/CHANGED_FACT/CONFLICTING_FACT/
                                   NOT_DISCUSSED/REQUIRES_REVIEW). Serve-domain only, no AxisCare
                                   knowledge. Fills a real gap: detectAndRecordConflicts()
                                   (existing code) only ever compared facts within one session.
  domainRegistry.ts             — +2 fields: important_people.hipaa_disclosure_authorization,
                                   important_people.medical_decision_authority (explicit-only,
                                   never inferred — see extractionPrompt.ts's new rule 7).
  __fixtures__/
    syntheticAssessments.ts     — Phase 2 fixtures: Fixture A (new prospect, "Eleanor Voss") and
                                   Fixture B (reassessment, "Walter Higby"), fully synthetic.

lib/integrations/axiscare/
  clientClasses.ts              — NEW, read-only. GET /api/classes/client — resolves a real
                                   configured class (e.g. "WAF Prospect") instead of a hardcoded
                                   code.
  adls.ts                       — +getAllConfiguredAdls(), read-only, bounded pagination — the
                                   agency's real configured ADL catalog (existing getAdlSample()
                                   untouched, still a 1-record discovery probe).
  clientWritePayloadTypes.ts    — NEW. TypeScript types for the AxisCare Client/ResponsibleParty/
                                   ADL/Note WRITE bodies, sourced directly from AxisCare's real
                                   OpenAPI 3.1.0 spec (version 2025-06-25) — candidate-generation
                                   types only, nothing sends an HTTP request.
  clientCandidateMapping.ts     — NEW. Approved facts (+ resident identity) -> AxisCare client
                                   create/update candidate, with per-field FieldMappingState
                                   (READY/MISSING_OPTIONAL/BLOCKING/UNSUPPORTED/MANUAL/UNCHANGED/
                                   REQUIRES_REVIEW) and duplicate-refusal (resolveCreateEligibility,
                                   reusing the existing person_vendor_identity_links state machine).
  responsiblePartyMapping.ts    — NEW. Approved facts -> responsible-party PUT candidate (slot 1/
                                   Primary only). Authority fields (HIPAA/medical-decision) are
                                   populated ONLY from the two new explicit-only domain fields.
  adlMapping.ts                 — NEW. Approved facts -> real, active, agency-configured ADL
                                   assignments. Never invents an ADL id; ambiguous/unconfigured
                                   cases are REQUIRES_REVIEW / UNMAPPED_REQUIRES_CONFIGURATION.
  fullWritePreview.ts            — NEW. Composes the three mappers above into one structured,
                                   human-reviewable preview object (Phase 7's "write-safety gate"
                                   data shape) — no I/O, callers supply already-fetched data.

supabase/migrations/
  20260901010000_add_assessment_type_to_intake_sessions.sql
                                 — NEW, additive-only, NOT YET APPLIED to any database (see §11).
                                   Nullable assessment_type label on intake_assessment_sessions.
```

Nothing above adds an HTTP write method anywhere. `lib/integrations/axiscare/client.ts`'s
`axisCareGet()` is unchanged — still GET-only by construction.

## 2. Real reference data used (not guessed)

Two pieces of ground truth were pulled live against the actual configured AxisCare site during
this work (read-only calls, using the existing, already-live `axisCareGet()` — no new write
capability was needed to get them):

- **`GET /api/classes/client`**: confirmed real class codes, including `WAF Prospect` (label
  "WAF Prospect") and `WAF - Active No Visits` (label "WAF Signed Agreement / No Visits" — an
  exact match to Serve's own documented operating rule), and `CINCH`.
- **`GET /api/adls`** (full catalog, via the new `getAllConfiguredAdls()`): 99 real configured
  ADL definitions, each with a real `id`, `name`, `adlKey`, `categoryId`, and `active` flag.
  `adlMapping.ts`'s mapping table was built against this real data, filtered to `active: true`
  only — several plausible-looking ADLs (e.g. "Fall Risk", id 67) are real but **inactive**,
  correctly surfaced as `UNMAPPED_REQUIRES_CONFIGURATION` rather than silently used.

The AxisCare OpenAPI 3.1.0 specification itself (version `2025-06-25`) was read directly from
the local file supplied outside this repository, per instruction — not re-derived from the
original request's assumed endpoint list. One correction found: the notes endpoint is
`POST /api/notes/{entityType}/{entityId}` (e.g. `/api/notes/client/{clientId}`), not
`/api/notes/client/{clientId}` as a literal fixed path — `entityType` is a real path parameter,
not a hardcoded segment.

## 3. Two spec ambiguities flagged, not silently resolved

1. **`preferredCaregiver` (POST) vs `referredCaregiver` (PATCH)** — same shape, different key
   name between AxisCare's create and update bodies in the spec text. Likely a spec typo; kept
   as two distinct, separately-named fields in `clientWritePayloadTypes.ts` rather than merged
   into a guess.
2. **`telephonyPhone` casing** — request example is lowercase, response schema enforces
   capitalized. Not resolved here (this field isn't mapped from any Serve fact today anyway).

## 4. Field mapping contract — what's really automatable today

### New client create (`clientCandidateMapping.ts` / `buildNewClientCandidate`)

| AxisCare field | State | Source |
|---|---|---|
| `firstName` / `lastName` | READY (BLOCKING if empty) | Resident's own canonical Serve record — **never** an assessment fact |
| `status` | READY, fixed | Hardcoded `"Inactive"` — a Serve operating rule, never left to an API default |
| `classes` | READY if resolvable, else BLOCKING | Live `GET /api/classes/client`, matched against `"WAF Prospect"` — never a hardcoded code |
| `dateOfBirth` | READY / MISSING_OPTIONAL | `identity.date_of_birth` |
| `goesBy` | READY / MISSING_OPTIONAL | `identity.preferred_name` — **not** firstName/lastName |
| `personalEmail` | READY / MISSING_OPTIONAL | `identity.email` |
| `homePhone` | READY / MISSING_OPTIONAL | `identity.phone` (Serve has one phone field; mapped to `homePhone` by documented convention) |
| `mobilePhone` | UNSUPPORTED | No corresponding Serve field |
| `residentialAddress` / `billingAddress` | **MANUAL** | AxisCare requires the *entire* address object (city/state/postalCode included) if sent at all; Serve's domain registry has no city/state/postalCode fields — sending a partial object isn't possible, and inventing the missing parts is exactly what this system forbids |
| `externalId` | READY, fixed | Resident's own Serve ID (vendor-side traceability) |
| `assessmentDate` | READY, fixed | The session's own date |
| `ssn` | UNSUPPORTED, deliberately | Never mapped, per explicit instruction |
| `medicaidNumber`, `region`, `referredBy`, `preferredCaregiver`, `billingEmail`, `otherPhone`, `priorityNote`, `startDate` | UNSUPPORTED | No corresponding Serve assessment field exists today |

### Responsible party (`responsiblePartyMapping.ts`, targets slot 1/Primary only)

| AxisCare field | State | Source |
|---|---|---|
| `name` | READY / MISSING_OPTIONAL | `important_people.primary_contact_name` |
| `relationship` | READY / MISSING_OPTIONAL | `important_people.primary_contact_relationship` |
| `phones` | READY / MISSING_OPTIONAL | `important_people.primary_contact_phone` (type sent as `null` — Serve doesn't capture Home vs. Mobile for a contact) |
| `hipaaDisclosureAuthorization` | READY only if **explicitly** confirmed, else MISSING_OPTIONAL | `important_people.hipaa_disclosure_authorization` — **never** derived from `decision_maker` or any general-involvement language |
| `canMakeMedicalDecisions` | same discipline | `important_people.medical_decision_authority` |
| `email`, `address`, `dateOfBirth` | UNSUPPORTED | No corresponding Serve responsible-party field exists at all |

Slots 2/3 (Secondary/Tertiary) are never populated — Serve's domain model has exactly one
"primary contact" concept today. Supporting a second/third responsible party would need a new
domain-registry field group, not built in this pass.

### ADLs (`adlMapping.ts`, against the real 99-entry catalog)

8 of Serve's `daily_life.*` boolean fields resolve cleanly to a single real active ADL
(`bathing`, `dressing`, `medication_reminders`, `housekeeping`, `grooming`, `laundry`,
`meal_preparation`, `toileting`). `companionship_social` is genuinely ambiguous (two real active
ADLs — "Companionship" and "Conversation" — both plausible) and correctly surfaces as
`REQUIRES_REVIEW` rather than picking one. `transportation_errands` maps to **both** "Client
Errands" and "Client Transportation" (both apply, not a choice). Mobility equipment fields
(walker/cane/wheelchair), free-text fields (`gait_steadiness`), and diagnostic signals
(`recent_falls`) are explicitly out of ADL-mapping scope (`NOT_APPLICABLE`) — they aren't
caregiving tasks. `daily_life.transfers`/`.continence` have no confidently-identified single
active-ADL match and are left `UNMAPPED_REQUIRES_CONFIGURATION` pending a deliberate review, not
guessed.

## 5. Reassessment change detection (`reassessmentComparison.ts`)

Implements all 10 of Phase 5's critical rules (see the file's own header comment for the mapping
from rule number to enforcement point). The most important behavioral finding, discovered by the
tests, not asserted in advance: **a plain boolean field cannot represent a severity change.**
Fixture B's `daily_life.bathing` is `confirmed_yes`/`true` both before and after a reassessment
that clearly describes materially more assistance being needed — the comparator correctly
classifies this `UNCHANGED` at the field's actual grain, because nothing about the *boolean*
changed. This is a genuine domain-model limitation, not a bug: **Serve's current care-need
fields can detect "started" and "stopped," but not "got worse while staying the same yes/no."**
Closing this gap (e.g. a severity/degree sub-field, or a free-text delta note per reassessed
field) is real future work, not attempted here.

Identity-sensitive fields (`identity.preferred_name`, `identity.date_of_birth`,
`important_people.primary_contact_name`, `.decision_maker`, and the two new authority fields)
never auto-classify as a plain `CHANGED_FACT` even with clean single-reporter evidence — always
`REQUIRES_REVIEW`, per Phase 5 rules 4-7.

## 6. Phase 12 — minimum human entry analysis

| Field group | Conversation capture | AI extracted | Human review | Canonical Serve | AxisCare API | Auto-mapped after approval | Manual entry remaining | Reason |
|---|---|---|---|---|---|---|---|---|
| Legal name (first/last) | No (assumed pre-existing) | No | N/A | Yes (resident record) | Yes (`firstName`/`lastName`) | Yes | None | Sourced from Serve's own resident record, established at intake before assessment |
| Preferred name | Yes | Yes | Yes | Yes | Yes (`goesBy`) | Yes | None | |
| Date of birth | Yes | Yes | Yes | Yes | Yes (`dateOfBirth`) | Yes | None | |
| Email / phone | Yes | Yes | Yes | Yes | Yes (`personalEmail`/`homePhone`) | Yes | None | Single-phone-field caveat noted above |
| Residential/billing address | Yes (partial: address line only) | Yes (partial) | Yes | Yes (partial) | **No** | **No — MANUAL** | Full address entry in AxisCare | Serve's domain registry has no city/state/postalCode fields; AxisCare requires the complete object |
| Primary contact (name/relationship/phone) | Yes | Yes | Yes | Yes | Yes (responsible party slot 1) | Yes | None | |
| HIPAA / medical decision authority | Only if explicitly stated | Only if explicitly stated | Yes | Yes | Yes | Yes, when present | Manual entry whenever not explicitly discussed (the common case) | Deliberately conservative — unknown stays unknown |
| Secondary/tertiary responsible party | No | No | No | No | Supported by API | **No** | Full manual entry | Serve's domain model has no 2nd/3rd contact concept |
| Daily-life ADLs (8 mapped fields) | Yes | Yes | Yes | Yes | Yes | Yes | None, when an active ADL exists | |
| `companionship_social` | Yes | Yes | Yes | Yes | Ambiguous (2 real ADLs) | **Requires a pick** | One-click disambiguation | Genuine ambiguity, not a gap |
| `transfers` / `continence` | Yes | Yes | Yes | Yes | No confident match yet | **No** | Manual ADL assignment or catalog review | Real gap, not yet reviewed against the full 99-entry catalog |
| Fall risk / mobility equipment | Yes | Yes | Yes | Yes | No *active* configured ADL (Fall Risk exists but inactive) | **No** | Manual, or activate the ADL agency-side | Configuration gap on AxisCare's side, not Serve's |
| SSN | N/A | N/A | N/A | N/A | Supported by API | **Never** | Always manual, by design | Explicit instruction — never mapped |
| Client class beyond "WAF Prospect" (PP/CINCH/etc.) | No | No | No | No | Supported by API | **No** | Manual class assignment as the relationship evolves | Out of scope — this pass only handles the prospect-creation class |
| Care-plan scheduling (days/times/frequency) | Partially (`when.*` fields exist) | Yes | Yes | Yes | Not mapped in this pass | **No** | Manual scheduling entry | AxisCare's scheduling write surface wasn't in scope for this build |

## 7. Phase 11 — assessment history / longitudinal record

**Architecture confirmed to already support this, with one small additive gap now closed.**
`assessment_approved_facts` was already resident-scoped, append-only/immutable, and carries
`supersedes_fact_id` (its own table comment already said "designed to support... repeat
assessments," per `BEDROCK_CLAUDE_PROVIDER.md`'s earlier design work) — the chronological record
itself needed no schema change. `reassessmentComparison.ts` (§5) is exactly the missing
*consumer* of that chronological chain — it didn't exist before this pass; `intake_assessment_
sessions` already models one row per dated assessment event with its own `status` lifecycle.

**What was actually missing**: nothing to *label* a session's purpose. Migration
`20260901010000_add_assessment_type_to_intake_sessions.sql` (additive, nullable, **not yet
applied to any database** — see §11's caveat) adds `assessment_type` with a fixed vocabulary
matching the originating scope's own list (`initial`, `30_day_review`, `60_day_review`,
`90_day_review`, `annual_review`, `post_hospital`, `change_in_condition`, `family_requested`,
`internal_care_plan_review`, `other`). This is purely descriptive — `reassessmentComparison.ts`
does not read it; comparison works identically regardless of session type.

The client profile ("current approved truth") vs. history ("what changed between assessments")
distinction the spec asked about is answered directly: `assessment_approved_facts` filtered to
the latest row per `field_path` (already how the existing review UI implicitly works, since
draft facts flow from the most recent session) is "current truth"; the full table, ordered by
`created_at` and walked via `supersedes_fact_id`, is the history. No new query capability was
built to walk that chain in this pass (the UI to browse "what changed on 2026-05-02 vs.
2026-08-10" doesn't exist yet) — `reassessmentComparison.ts` proves the underlying comparison is
computable, not that a browsing UI exists.

## 8. Phase 14 — security / PHI readiness update

No new PHI exposure surface was introduced. Everything built in this pass:

- Runs entirely server-side (`import "server-only"` throughout every new file).
- Operates on already-governed data (`assessment_approved_facts`, real AxisCare read responses
  via the existing, already-credentialed `axisCareGet()`) — no new credential type, no new
  logging call anywhere (grepped every new file — zero `console.*` calls carrying payload
  content; the one live probe run during this work printed real AxisCare reference data — class
  codes and ADL definitions — to a local terminal only, never persisted, and contains no PHI:
  classes/ADLs are agency configuration, not resident data).
- Introduces **no new write capability** — the single biggest PHI-risk vector (accidentally
  sending real resident data to a third party) remains structurally impossible, exactly as
  before this pass.
- The two new domain-registry fields (HIPAA/medical-decision authority) are boolean flags with
  an explicit-only extraction rule (prompt rule 7) — no new sensitive-value category is
  introduced beyond what `important_people.*` already handled.
- Confirmed (checklist below) that nothing built here weakens `BEDROCK_CLAUDE_PROVIDER.md`'s
  existing PHI-readiness posture.

| Item | Status |
|---|---|
| No production PHI used anywhere in this pass | Confirmed — Fixtures A/B are fully fabricated; the one live network activity (class/ADL catalog fetch) touched only AxisCare's own agency configuration, never a client record |
| Bedrock retention remains `none` | Unchanged by this pass — no Bedrock code touched |
| Bedrock invocation logging remains OFF | Unchanged |
| Approved US Sonnet 4.6 profile only | Unchanged (`us.anthropic.claude-sonnet-4-6`, `us-east-1`, still pinned as constants) |
| AWS credentials server-side only | Unchanged |
| AxisCare token server-side only | Confirmed unchanged — `getAxisCareConfig()` remains the only reader, `server-only` throughout |
| No raw transcript logging | Confirmed — no new code path logs transcript or fact content |
| No AI direct-write capability | Confirmed structurally — see §8 of the policy proposal, item 8 |
| Explicit human downstream-write authorization | Designed into every new mapper's contract (`buildUpdateClientCandidate` throws on an unapproved row); the actual UI action to click "authorize" doesn't exist yet since there's nothing to authorize (no transport) |
| Draft/approved fact separation preserved | Unchanged — every new mapper reads only approved-shaped input |
| Longitudinal assessment history | Addressed in §7 |
| Audit trail for external writes | **Gap, explicitly flagged** — see write-policy proposal §7; does not exist yet, required before any real write ships |
| Production credential strategy identified | Unchanged from `BEDROCK_CLAUDE_PROVIDER.md` §4 — still a design question, not resolved here |
| Recording/transcription vendor path reviewed separately | Unchanged — out of scope for this pass, already covered in `AUDIO_TRANSCRIPTION_PIPELINE.md` |
| Reassessment logic cannot silently erase existing facts | **Verified by test** — `reassessmentComparison.test.ts`'s `NOT_DISCUSSED` and `CONFLICTING_FACT` cases both assert the existing baseline is preserved, not cleared |
| Write failures remain visible | Designed into the proposal (§9); nothing to fail yet since no transport exists |

**PHI READINESS RECOMMENDATION: NOT READY.** Unchanged from `BEDROCK_CLAUDE_PROVIDER.md`'s
existing conclusion for the underlying Bedrock provider (still blocked on a production credential
path and recorded human approval, per that document's own §10/§15). This pass adds a second,
independent reason specific to the AxisCare side: **no write capability exists, so there is
nothing to be "ready" for yet** — this isn't a blocker in the sense of something broken, it's
simply the deliberate current state. Once a write adapter is built (following the authorized
policy amendment, whenever that happens), a fresh PHI-readiness pass specific to that adapter
will be needed — this document does not pre-approve it.
