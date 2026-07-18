# Serve Intake Intelligence Engine — Conceptual Model

Status: Phase 1 (website foundation) implemented — canonical envelope,
deterministic classification/confidence, Resident matching, transactional
processing, idempotency, Intake Queue, Dashboard indicators. No
geocoding, mapping, mileage, scheduling, billing, or AI/LLM
classification. See "Non-goals" below.

> **The Serve Intake Intelligence Engine is the only component permitted
> to translate external intake submissions into operational Serve OS
> records.**

> **The original intake submission is immutable provenance.**

> **Operational records may evolve; original customer-submitted truth
> does not.**

> **The engine must upsert or reuse operational records when
> deterministic duplicate rules identify an existing active
> Relationship.**

> **The engine must not create placeholder identities when
> classification is uncertain.**

> **The purpose of the engine is to eliminate translation between
> customer conversations and operational execution.**

## Purpose

A website inquiry should arrive in Serve OS as structured, actionable
work — a Relationship (or Recruiting Lead), a Service Opportunity, an
expected service location, a first Next Action, an owner, a priority, and
a Timeline entry — without requiring staff to re-type information the
website form already collected. When the engine cannot determine that
translation confidently and deterministically, it never guesses: the
submission goes to the Intake Queue's Needs Review view, with every known
field prepopulated, and staff resolve it with a few clicks rather than a
blank form.

## Canonical responsibility

No other module, import process, form handler, integration, API, or
future automation may independently map an intake payload into a
Relationship, Resident, External Client, Relationship Action, Working
Note, Service Opportunity, Service Location, Relationship Timeline,
Resident Timeline, Professional Relationship, or Recruiting record.
`lib/actions/intake.ts` — serve-os's own pre-existing internal `/get-started`
intake wizard, which writes directly to the legacy `prospects` table — is
the one known exception, and it predates this engine (see "Known parallel
systems" below); it is not modified by this phase and is explicitly noted
as a future consolidation candidate, not a second sanctioned mapping
path.

## Source-of-truth hierarchy

```
Website or External Intake Submission   (Original Customer Truth)
        |
Relationship                            (Operational Relationship Truth)
        |
Assessment                              (Clinical Assessment Truth)
        |
Scheduling                              (Operational Delivery Truth)
        |
Care Documentation                      (Clinical Service Truth)
```

Every layer below the top is derived from — and never silently overwrites
— the layer above it. This phase only builds the first transition
(submission → Relationship); the rest of the hierarchy already exists
elsewhere in this app (Relationships, Wellness/Current Needs) or is
future work.

## Immutable provenance

`website_intake_submissions` (`20260703000000_create_website_intake_submissions.sql`
— see "Current architecture findings" below for its actual deployment
status) is never written to by this engine beyond its original insert
(which happens outside serve-os entirely, by the website's own intake
function). The engine only *reads* it. Every correction, enrichment, or
reclassification happens on the downstream operational record
(`relationships`, `residents`, `external_clients`, `recruiting_leads`) or
on the mutable `intake_processing_records` row — never by rewriting the
original submission.

## Current architecture findings

Inspected directly (live Supabase queries + full read of the
`serve-website` and `serve-os` git histories) rather than assumed:

- **Nothing is live in production today.** `main` (production) has zero
  serverless functions and zero Supabase writes. All public-facing forms
  are plain `data-netlify="true"` HTML forms — submissions go to
  Netlify's own forms inbox, never touching Supabase.
- Three separate, **all unmerged**, prototype pipelines exist on feature
  branches:
  - `feature/intake-optimization` → `website_intake_submissions`
    (`netlify/functions/submit-intake.js`) — the newest, most general
    design (`intake_type` discriminator: `family_care_inquiry`,
    `professional_referral`, `employment_interest`, `outside_service_area`;
    one `form_payload` JSON preserving every raw field).
  - `feature/progressive-homepage-intake` (descends from
    `feature/conversational-get-started`) → `prospects` and
    `recruiting_leads`, via a homepage conversational widget.
  - serve-os's own `lib/actions/intake.ts` (`/get-started`) → `prospects`,
    briefly iframed into the public site (2026-07-01 → 2026-07-03), then
    explicitly rolled back (`serve-website` commit `73d58bb "Rollback
    Serve OS intake connection"`).
- **This engine targets `website_intake_submissions`** — its
  `intake_type` vocabulary matches this scope's own classification
  categories almost verbatim, its RLS convention (service-role only, no
  policies) already matches every other table in this app, and unlike
  `prospects` it doesn't predate serve-os's own migration history. It is
  ready to consume real submissions the moment `feature/intake-optimization`
  (or an equivalent) merges and starts writing real rows — nothing about
  this engine depends on that branch actually shipping first.
- The 5 rows present in `website_intake_submissions` today are all
  synthetic smoke-test data from that branch's Netlify deploy-preview
  (`submitted_page` points at a `deploy-preview-3--...` URL; every `name`
  value is literally `"TEST ..."` or `"Test ..."`) — see
  `docs/maintenance/WEBSITE_INTAKE_BACKFILL_REVIEW.md`.

### Known parallel systems (not touched by this phase)

- `prospects` — predates this repo's tracked migration history (see
  `docs/design/RELATIONSHIPS.md`, "The `prospects` table"). Still written
  to by `lib/actions/intake.ts`'s `/get-started` wizard. Not modified,
  not consumed by this engine.
- `recruiting_leads` — already exists
  (`20260629000000_create_recruiting_leads.sql`). This engine writes to
  it for the `recruiting` classification (dedup by email/phone + role,
  reusing that table's own existing indexes) but does not otherwise
  change its schema or its other write paths
  (`submit-caregiver-interest.js`, also unmerged).

## The canonical Intake Envelope

`lib/intake/types.ts#IntakeEnvelope` — the one normalized shape every
adapter must produce before the core processor ever sees it:

```
IntakeEnvelope
  source, sourceSubmissionId, sourceFormType, sourceSchemaVersion,
  intakeType, receivedAt, rawSubmissionReference
  prospectiveClient   { firstName, lastName, fullName, phone, email }
  primaryContact      { ...same + relationshipToProspectiveClient, isProspectiveClient }
  careContext         { careFor, message }
  serviceLocation     { zip, city, state, addressLine1, communityOrLocationLabel, outsideServiceArea }
  serviceNeeds        { supportType, careNeeds }
  timing              { startTiming }
  referralContext     { organization, title, reason, referralDetails }
  employmentContext   { roleInterest, linkedin, cityState, resumeFilename, leadershipInterest }
  metadata            { formPayloadKeys, honeypotTriggered }
```

`lib/intake/envelope.ts#normalizeWebsiteIntakeSubmission()` is the
website adapter — the **only** place website-specific field names
(`care-for`, hyphenated form keys, `full-name` vs `name`) may appear.
Classification, confidence, matching, and mapping downstream never see a
raw website field name.

## Field-mapping inventory (as actually observed, not assumed)

| Website field (`form_payload` key) | Forms it appears on | Envelope destination |
|---|---|---|
| `name` / `full-name` | family-consultation, professional-referral / employment | `primaryContact.fullName` (split via `lib/intake/nameUtils.ts#splitFullName`) |
| `care-for` | family-consultation | `careContext.careFor`; `"myself"` deterministically makes `primaryContact.isProspectiveClient = true` and copies identity into `prospectiveClient` |
| `location` (→ `community` column) | family-consultation | `serviceLocation.communityOrLocationLabel` — the primary Watermere-vs-external signal (keyword-matched, never fuzzy) |
| `message` | family-consultation | `careContext.message` and `serviceNeeds.careNeeds` (same free text serves both — there is no separate structured field yet) |
| `zip` | family-consultation | `serviceLocation.zip` — **note: this is the only location field the current form collects; there is no street address field**, so External Prospect creation (which requires a full postal address — see `docs/design/RELATIONSHIPS.md`) routes to Needs Review via `SERVICE_LOCATION_INCOMPLETE` today, not automatically |
| `organization` | professional-referral | `referralContext.organization` |
| `title` | professional-referral | `referralContext.title` |
| `reason` | professional-referral | `referralContext.reason` |
| `referral-details` | professional-referral | `referralContext.referralDetails` |
| `role_interest` | employment (`caregiver-application` / `managing-director-application`) | `employmentContext.roleInterest` |
| `linkedin` | employment | `employmentContext.linkedin` |
| `city-state` | employment | `employmentContext.cityState` |
| `resume.filename` | employment | `employmentContext.resumeFilename` (only the filename/size/type are ever stored — never the file itself) |
| `leadership-interest` | employment | `employmentContext.leadershipInterest` |
| `bot-field` | every form (Netlify honeypot) | `metadata.honeypotTriggered` — a non-empty value routes straight to `not_qualified` |
| `form-name` / `form_name` | every form | `sourceFormType` — provenance only, never used for classification |
| `user_agent`, `submitted_page`, `original_intake_type` | every form | preserved in `metadata.formPayloadKeys` (the key list) and in the immutable source row itself; not projected into any dedicated envelope field |

Fields the scope's own worked examples referenced (`resident_first_name`,
`resident_last_name`, `support_type` as a structured multi-select,
`start_timing`) **do not exist on the current live/preview form** — the
mapping functions (`lib/intake/priority.ts#categorizeTiming`,
`lib/intake/serviceOpportunityMapping.ts`) are still built against that
richer, documented vocabulary so they activate automatically the moment a
future form version adds those fields, without any engine change.

## Classification rules

`lib/intake/classification.ts#classifyIntakeSubmission()` — pure, no
database access. Always returns exactly one classification, plus
`confidenceScore`, `confidenceBand`, `reasonCodes`, `explanation`, and
`requiredReviewActions`.

1. Honeypot triggered → `not_qualified`.
2. Unsupported `intakeType` → `needs_review` (never silently dropped).
3. No phone and no email at all → `not_qualified` (cannot be followed up
   on).
4. `employment_interest` → `recruiting` (never `not_qualified` — Part 9).
5. `professional_referral` → `professional_relationship` when the
   referrer's identity is complete.
6. `family_care_inquiry` / `outside_service_area`, routed by the
   `communityOrLocationLabel` keyword match:
   - Community/facility language → attempt Resident matching (below);
     `resident_prospect` only on an unambiguous match.
   - Private-home/residence language → `external_prospect`, only when
     the prospective client's name **and** a complete postal address are
     both present.
   - Neither → `needs_review` with both reclassification actions offered.

A confidence-driven safety net (see below) can additionally demote any of
the above to `needs_review` even when every individual check passed, if
the combined picture still isn't confident enough to act on
automatically.

## Confidence model

`lib/intake/confidence.ts` — a documented completeness/rule-certainty
score, **not** machine-learning probability. Base score 50; fixed
additions (e.g. `RESIDENT_EXACT_MATCH` +40, `SERVICE_LOCATION_COMPLETE`
+15, `CONTACT_METHOD_PRESENT` +10) and deductions (e.g.
`CONTACT_METHOD_MISSING` −50, `UNSUPPORTED_INTAKE_TYPE` −60,
`MULTIPLE_RESIDENT_MATCHES` −30), clamped to [0, 100]. Bands: 100 →
Automatically Processed; 90-99 → High Confidence; 70-89 → Review
Recommended; below 70 → Needs Review. The same reason codes always
produce the same score — no randomness, no model inference.

## Resident matching

`lib/intake/residentMatching.ts#matchResident()` — pure, never fuzzy.
Hierarchy: exact external source key → exact resident ID → name + unit →
name + community → unique name alone → Needs Review
(`RESIDENT_MATCH_REQUIRED` / `MULTIPLE_RESIDENT_MATCHES` /
`INSUFFICIENT_RESIDENT_IDENTITY`). `lib/data/intakeEngine.ts#findResidentMatchCandidates()`
supplies a bounded, last-name-containment candidate set (never a fuzzy
ranked search) — the pure function above is what actually decides among
them. Never auto-creates a Resident on a failed match.

## External Prospect processing

Uses the corrected External Prospect domain model
(`docs/design/RELATIONSHIPS.md`, "External Prospect domain model"): a
complete postal address (not just a ZIP) is required, and the
prospective client's structured identity is required. Both being absent
today for most real family-consultation submissions (see the
field-mapping table above) is an honest reflection of the current form's
fields, not a gap in this engine's logic — `SERVICE_LOCATION_INCOMPLETE`
and `PROSPECTIVE_CLIENT_NAME_NOT_COLLECTED` exist specifically to make
that limitation visible and actionable rather than silently guessed
around.

## Professional Referral processing

Classified as `professional_relationship`, created as a `referral_source`
Relationship for the referring professional (organization, title, contact
identity). The current professional-referral form has no separate field
for the *referred* patient/client's identity — `referral-details` free
text often names them, but nothing is extractable deterministically. Per
Part 8 ("do not discard the referred care opportunity"), that text is
preserved verbatim as intake context (a Working Note) on the
referral-source Relationship, giving staff full context to manually
create a linked care-prospect Relationship when warranted — this engine
does not attempt to guess or split out a second Relationship from
unstructured text.

## Recruiting processing

`employment_interest` never enters Residents, External Clients, or the
care-Relationship pipeline. Reuses the pre-existing `recruiting_leads`
table (dedup by email/phone within the same `role_interest`, matching
that table's own existing indexes) rather than creating a parallel
recruiting concept.

## Not Qualified behavior

Only two deterministic triggers: the Netlify honeypot field, and the
complete absence of any contact method. Ambiguity is never routed here —
it goes to Needs Review, per Core Principle 5.

## Processing record design

`intake_processing_records` — one row per `(intake_source,
source_submission_id)`, enforced by a unique constraint (Part 12). Not a
copy of the submission; a mutable operational-metadata layer: status
(`needs_review` / `processed` / `failed` / `not_qualified` — "New" is
deliberately *not* a stored value, it's the absence of any row, computed
by a left-anti-join in `getUnprocessedWebsiteIntakeSubmissions()`),
classification, confidence, reason codes, the full computed envelope (for
audit), and foreign keys to whatever operational record resulted
(`relationship_id` / `resident_id` / `recruiting_lead_id` /
`first_action_id`).

## Idempotency

The `(intake_source, source_submission_id)` unique constraint is the
enforcement mechanism. `process_website_intake_submission()` looks up any
existing **settled** record (`processed` / `needs_review` /
`not_qualified` — everything except `failed`, which is retryable by
design) before doing any operational write; if one exists, it's returned
unchanged and nothing new is created. `p_force` bypasses this
short-circuit — set only by an explicit staff resolution action (Part
24), never by automatic (re)processing.

## Relationship upsert behavior

`lib/data/intakeEngine.ts#findPossibleDuplicateRelationship()` — an exact
phone/email match against any non-closed Relationship (never a fuzzy name
match; a common name is not evidence of the same person). When found, the
existing Relationship is reused: one `website_inquiry_received`
("Additional website inquiry received.") Timeline event, a new intake
context Working Note only if there's materially new text, and a new
action created only if no equivalent action is already open.

## Transactional creation

`process_website_intake_submission()` is a single `plpgsql` function that
internally calls `create_relationship()`, `create_relationship_action()`,
`upsert_relationship_service_opportunity()`,
`upsert_relationship_service_location()`, and
`create_relationship_working_note()` via nested calls that share the
outer transaction — either the full operational graph for a submission
commits, or none of it does. Failure recording
(`record_intake_processing_failure()`) is a deliberately **separate**,
tiny transaction — if it lived inside the same transaction as the failed
write, the processing-record insert would roll back too, leaving nothing
in the Failed queue to retry.

## Initial operational context

No AI summarization. `careContext.message` and `referralContext.referralDetails`
are preserved verbatim as a Relationship Working Note — submitted meaning
only, no embellishment, no unsupported clinical interpretation.

## Service Opportunity mapping

`lib/intake/serviceOpportunityMapping.ts#mapSupportTypeToServiceOpportunity()` —
a documented support-type → service-label table (Medication Assistance,
Transportation, Meal Assistance, Companionship, Personal Care, Household
Support, Respite / Family Support), with free text combined in rather
than discarded. The current form doesn't collect a structured
`support_type` at all yet (see the field-mapping table) — every
submission today falls through to the free-text-only path, which is the
honest, non-fabricated behavior this function is designed to produce.

## Expected service-location mapping

Per the corrected External Prospect domain model: External Prospects get
a `relationship_service_locations` row; Resident Prospects never have the
submission's ZIP/location copied into the matched Resident's own
community/unit fields (those come only from the Resident's own existing
record). No geocoding in this phase.

## Priority rules

`lib/intake/priority.ts` — Central time throughout. `immediate` timing →
`urgent` priority, due same business day if submitted before 5:00 PM
Central on a business day, otherwise the next business day (a weekend or
after-hours "ASAP" submission is never treated as due *that* calendar
day — office hours must actually have started). `within_days` → `high`,
next business day. `planning_ahead` / `unknown` → `normal`, next business
day (never silent — Part 19: unknown timing still gets a "Clarify needs
and timing" action). All 4 boundary cases (business-hours, after-hours,
weekend, deterministic repeatability) are unit tested.

## Next Action rules

Deterministic, classification-specific titles (`lib/actions/intakeEngine.ts#nextActionTitleFor()`):
"Contact {name}" for care inquiries, "Contact referred family (via
{org})" or "Follow up with referral source ({org})" for professional
referrals depending on whether a patient referral was mentioned — never
the generic "Review Website Inquiry" when a more specific title is
available. Never duplicated onto a reused Relationship that already has
an open action.

## Owner assignment

`SERVE_INTAKE_OWNER_LABEL` environment variable (unset by default →
`Unassigned`, surfaced plainly, never a guessed name). No hardcoded
personal name in the engine's logic.

## Timeline / provenance

One `website_inquiry_received` Relationship Timeline event per
processing attempt ("Website inquiry received." on first creation,
"Additional website inquiry received." on reuse) — never duplicated on
retry, since it's only ever inserted inside the same idempotent
transaction as the record it's paired with.

## Failure recovery

See "Transactional creation" above. `intake_processing_records.retry_count`
increments on each failure; `last_error` stores a safe (non-stack-trace)
message. The Intake Queue's Failed view exposes a Retry action that
simply re-invokes normal processing (idempotent by construction).

## Intake Queue

`/relationships/intake` (added to the existing `RelationshipViewTabs`
switcher shared with Action Board/Whiteboard/All Relationships — no new
top-level sidebar item). Five views: New (submissions with no processing
record yet), Needs Review, Processed, Failed, Not Qualified. Needs Review
rows offer context-specific resolution actions derived from the record's
own `reason_codes` (Link Existing Resident, Complete Expected Service
Location, Dismiss) — every known field is already on the record, staff
never re-enter it.

**Deferred resolution flows** (documented, not built this phase): "Open
Existing Relationship" / "Confirm New Relationship" / "Attach Submission
to Existing Relationship" for the possible-duplicate case, and explicit
reclassify-to-any-type buttons for the ambiguous-schema case. These are
lower-frequency paths given today's submission volume (5 total, all
synthetic) — a future phase can add them once real submission volume
reveals which are actually needed.

## Dashboard integration

Three cards under a new "Website Intake" section (New Website Inquiries,
Needs Review, Failed Intake Processing), each linking to the relevant
Intake Queue tab. No "Overdue First Responses" card was added separately
— intake-created actions are ordinary `relationship_actions` rows, so
they already appear in the existing Action Board's Overdue bucket without
any new code (Part 25: "Do not duplicate the Action Board").

## Security / privacy

Every read and write in this engine goes through `createServerClient()`
(service-role key, server-only) — the same convention as every other
subsystem in this app. `website_intake_submissions` and
`intake_processing_records` both have RLS enabled with zero policies
(service-role bypasses; anon key has zero access). No raw payload or
stack trace is ever surfaced to the UI — the Intake Queue only displays
`last_error` (a plain message set explicitly by
`record_intake_processing_failure()`, never a raw exception).

## Processing version

`processing_version` on every record defaults to `'website-intake-v1'`.
No bulk historical reprocessing exists in this phase (Part 27) — the 5
existing submissions are all synthetic test data (see
`docs/maintenance/WEBSITE_INTAKE_BACKFILL_REVIEW.md`), so there is
nothing real to reprocess yet.

## Files

**Migration**: `20260721000000_create_intake_intelligence_engine.sql` —
`intake_processing_records`; `process_website_intake_submission()`
(the atomic processor); `record_intake_processing_failure()`;
`intake_find_settled_record()`; the `website_inquiry_received` Relationship
Timeline event type.

**Pure logic** (`lib/intake/`, all independently unit tested —
`lib/intake/__tests__/*.test.ts`, 64 tests total): `types.ts`,
`nameUtils.ts`, `envelope.ts` (website adapter), `classification.ts`,
`confidence.ts`, `residentMatching.ts`, `priority.ts`,
`serviceOpportunityMapping.ts`.

**Data/actions**: `lib/data/intakeEngine.ts` (reads + the two RPC
wrappers), `lib/actions/intakeEngine.ts` (`processIntakeSubmission()` —
the one automatic-processing entry point; resolution actions).

**UI**: `app/relationships/intake/page.tsx` +
`components/relationships/IntakeQueueWorkspace.tsx`;
`RelationshipViewTabs.tsx` (new "Website Intake" tab); `app/page.tsx`
(Dashboard cards).

**Maintenance**: `docs/maintenance/WEBSITE_INTAKE_BACKFILL_REVIEW.md`.

## Non-goals of this phase

Proposal generation, assessment automation, AI summarization, LLM
classification, lead scoring, geocoding, mapping, service-radius/drive-time/
mileage calculation, scheduling, billing, care plans, caregiver
assignment, automated outbound email/SMS/phone calls, communication
ingestion, hospital integration, partner API integration, voice intake,
Resident Intelligence, delivery intelligence, Constitution changes.

## Future intake sources

The engine core (`lib/intake/classification.ts`, `confidence.ts`,
`residentMatching.ts`, `priority.ts`, `serviceOpportunityMapping.ts`, and
`process_website_intake_submission()`) depends only on the canonical
`IntakeEnvelope` — never on a website-specific field name. A future phone
intake, partner referral, hospital API, voice agent, or community portal
source needs only its own adapter (a new `normalize*()` function
producing the same envelope shape) to reuse every rule this phase built.
