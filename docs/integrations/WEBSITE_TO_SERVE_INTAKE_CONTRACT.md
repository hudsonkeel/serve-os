# Website (and Every Other Source) → Serve Intake Contract

Status: Scope J (Production Intake Unification) implemented — canonical
endpoint, envelope contract, security model, both repos' form wiring,
`/get-started` rewiring, conversation telemetry, Dashboard/`/prospects`
retirement, Migration A. Not deployed. `prospects` not dropped (Migration B
deferred — see "Legacy retirement status" below).

## The canonical flow

```
Optional Conversation Layer          conversation_sessions + conversation_events
        ↓
Canonical Intake Service              Supabase Edge Function `intake-submit`
        ↓
Canonical Intake Submission           intake_submissions  (immutable)
        ↓
Intake Processing                     intake_processing_records (Serve Intake
        ↓                             Intelligence Engine, unchanged from Scope H)
Relationship or Recruiting Lead
        ↓
Resident or External Client           (on conversion)
```

> **The website must never write directly to `prospects`, `relationships`,
> or `external_clients`.** Neither may any other source. The only canonical
> initial write, for every source, is the Canonical Intake Service.

## Destination

**`POST {SUPABASE_URL}/functions/v1/intake-submit`** — a Supabase Edge
Function, not a Serve OS route. Every intake source calls this same
endpoint, including Serve OS's own `/get-started` (no privileged bypass).
See "Why an independent service" below.

## Canonical payload

```jsonc
{
  "source": "serve_website_family_consultation",   // required — see "Source values"
  "sourceSubmissionId": "a client-generated UUID",  // optional but strongly recommended — idempotency key
  "intakeType": "family_care_inquiry",              // required — one of the 4 values below
  "contactName": "Jennifer Smith",                  // optional (Contact-Ready still needs it downstream)
  "contactPhone": "5551234567",                     // optional
  "contactEmail": "jen@example.com",                // optional
  "zip": "78735",                                   // optional
  "community": "Private home in Frisco or surrounding area", // optional — Watermere-vs-external signal
  "city": null,                                     // optional
  "outsideServiceArea": false,                      // optional, default false
  "formPayload": { /* raw, source-specific fields — see below */ }
}
```

`intakeType` is one of: `family_care_inquiry`, `professional_referral`,
`employment_interest`, `outside_service_area` (matches
`lib/intake/classification.ts`'s `KNOWN_INTAKE_TYPES` — unchanged from
Scope H).

**Do not require every field.** The minimum Contact-Ready care inquiry
remains a contact name and a phone or email (Scope H); this endpoint
accepts a submission with far less than that and lets the Serve Intake
Intelligence Engine decide readiness downstream — this endpoint's job is
capture, not validation of business rules.

### `formPayload` — raw, source-specific, never remapped

This is the one field every caller must get right: it must contain the
submitter's own raw field names and values, **not** a re-encoding of this
contract's own field names. `lib/intake/envelope.ts#normalizeIntakeSubmission()`
is the one place this shape is parsed, and it expects specific keys
(unchanged from Scope H, plus one Scope J addition):

| Key | Used for |
|---|---|
| `care-for` | Self-vs-other signal (`"myself"`/`"self"` ⇒ contact IS the prospective client) |
| `message` | Free-text message — becomes both care context and care needs |
| `support_type` | Support type selection |
| `start_timing` | Timing selection |
| `organization`, `title`, `reason`, `referral-details` | Professional referral fields |
| `role_interest`, `linkedin`, `city-state`, `resume.filename`, `leadership-interest` | Employment fields |
| `care_recipient_first_name`, `care_recipient_last_name` | **New in Scope J** — an explicitly-collected care-recipient name, when a source has one (e.g. `/get-started`'s richer wizard). Absent ⇒ null, exactly like every website-sourced row before this addition. |
| `bot-field` | Non-empty ⇒ honeypot triggered, routed to Not Qualified |
| `form-name` | Provenance only |

Never invent a value for one of these keys that the person didn't actually
provide — an absent key is read as `null` by the engine and treated as
"learn during follow-up," which is the correct, honest behavior.

### Source values

Stable, unambiguous identifiers — not the ambiguous `website_intake` /
`homepage_conversation` values Scope H's prototypes used (kept only as
historical values on old rows):

- `serve_website_family_consultation`
- `serve_website_professional_referral`
- `serve_website_partner_referral`
- `serve_website_homepage_conversation`
- `serve_website_homepage_caregiver_interest`
- `serve_os_get_started_care`
- `serve_os_get_started_careers`

(`serve_website_job_application` is reserved for the job-application static
form — not wired this scope; see "Known limitations.")

## Idempotency

`intake_submissions.client_submission_id` (nullable, partial unique index)
is the caller-supplied idempotency key — distinct from `id`, which is
server-generated and useless for a caller trying to safely retry. Generate
a UUID once per submission attempt (`crypto.randomUUID()` client-side,
persisted only for that attempt — never a long-lived tracking id) and
retry with the same value; `accept_intake_submission()` does an
insert-or-return-existing lookup keyed on it. Submitting without a
`sourceSubmissionId` is allowed (no idempotency protection for that
specific call) — every caller in this scope supplies one.

## Security model

```
Public caller (website, /get-started, future sources)
    ↓  HTTPS, no privileged credential — the anon key is safe here
Supabase Edge Function `intake-submit`           ← Canonical Intake Service
    (validates shape/honeypot-passthrough/idempotency; holds the
     service-role key as a Supabase Function secret — never in any git
     repo, never shipped to a browser or to serve-website)
    ↓  calls the RPC using its service-role credential
accept_intake_submission()  RPC                  ← private, narrowly scoped
    revoke execute from public/anon/authenticated; grant to service_role only
    ↓
intake_submissions
```

Granting `anon`/`authenticated` execute on the RPC directly would let
anyone with the public anon key call it over PostgREST
(`POST /rest/v1/rpc/accept_intake_submission`), bypassing the Edge
Function's own validation entirely — so, matching this codebase's existing
convention for every other write RPC (e.g. `process_website_intake_submission`),
it is `service_role`-only. Neither serve-website nor `/get-started` ever
holds the service-role key; both only need `SUPABASE_URL` and the
publishable anon key.

The Database Webhook receiver (`app/api/intake/process`) and the
reconciliation endpoint (`app/api/intake/reconcile`) both verify a shared
secret header (`x-intake-internal-secret`, env var `INTAKE_INTERNAL_SECRET`)
— neither is reachable by a browser session (both are listed in
`proxy.ts`'s `PUBLIC_PATHS`, which bypasses cookie auth, but each enforces
its own secret independently).

## Why an independent service, not a Serve OS route

Evaluated three options against: implementation simplicity, security,
operational reliability, idempotency, observability, independent
scalability, future-source integration, avoiding duplicated business
logic, and deployment/maintenance burden.

- **A Serve OS route handler** was rejected: every future source (hospital
  API, AI voice, partner portals, staff entry, mobile) would depend on
  Serve OS's own availability, auth conventions, and deploy schedule for
  the one write that must never be lost.
- **A dedicated Netlify Function** (living in serve-website) doesn't clear
  the bar either — it just moves the same coupling problem to a different
  repo's deploy lifecycle, and would still need the service-role key
  sitting in a third place.
- **A Supabase Edge Function** (chosen) is decoupled from both application
  repos' deploy lifecycles, sits next to the database it writes to, and —
  because it does zero classification — has no business logic to duplicate
  or keep in sync with `lib/intake/*.ts`. All real intake logic
  (classification, confidence, resident matching, priority) remains
  exactly where it already lived in Scope H, invoked the same way
  (`processIntakeSubmission()`), just triggered by a webhook instead of a
  same-request call.

## Processing trigger — webhook, with a reconciliation backstop

Insert-then-synchronously-classify (in the same request) was rejected
because it would re-couple submission capture to Serve OS's availability —
exactly what choosing an independent Edge Function was meant to avoid.
Instead:

1. **Fast path**: a Supabase Database Webhook fires on every `INSERT` into
   `intake_submissions`, calling `app/api/intake/process` (Serve OS),
   which calls the unchanged `processIntakeSubmission()`.
2. **Backstop**: `app/api/intake/reconcile` reuses Scope H's own
   `getUnprocessedIntakeSubmissions()` / `processAllUnprocessedIntakeSubmissions()`
   (previously only wired to the Intake Queue's manual "Process All"
   button) — intended to run on a schedule (`pg_cron` + `pg_net`, or a
   Netlify Scheduled Function; not configured live this scope, since
   deployment is out of scope). Idempotent by construction
   (`intake_find_settled_record()`'s existing short-circuit), so running it
   on a timer is always safe.

No genuine submission can be permanently stuck on a missed or delayed
webhook delivery — worst case is a delay until the next reconciliation
sweep, and that delay is fully visible via the Intake Queue's existing
Failed tab.

## Conversation telemetry — optional, upstream, never operational

`conversation_sessions` / `conversation_events` capture product-experience
truth for interactive intake journeys (today: `/get-started`'s care and
careers wizards). Not every source has one — a hospital API or a
single-step form calls the Canonical Intake Service directly and never
creates a session row.

- **Product analytics** = `conversation_events` rows + aggregate session
  stats (funnel/completion/abandonment). Never operational, never actioned
  directly.
- **Partial recovery lead** = a `conversation_sessions` row with
  `contact_capture_status = 'consented_for_followup'` and
  `completed_at is null`. Visible only via
  `lib/data/conversationSessions.ts#getRecoverablePartialSessions()` (no
  UI built this scope — flagged as a deferred follow-up); a human decides
  whether to act — the engine never auto-creates a Relationship from it.
- **Completed intake submission** = exactly one `intake_submissions` row,
  created only when the person finishes the interactive experience (or
  submits a one-shot form), processed exactly once.

### Consent boundary

Entering a phone number or email never by itself authorizes follow-up.
`contact_capture_status` only reaches `consented_for_followup` — the one
status ever eligible for the recoverable-lead query — when a name **and**
a contact method **and** an explicit consent signal are all present.
Verified directly against the shipped UI: the care wizard's final "Connect
With Serve" step (`components/intake/ServeIntakeFlow.tsx`) has a required,
validated TCPA-style consent checkbox that blocks submission until
checked; contact information captured earlier in the wizard (the Contact
step) is preserved at `partial_contact_captured` only, never treated as
followable, until that checkbox is actually checked. The careers wizard
(`RecruitingPanel.tsx`) has no separate contact-capture step and no
consent checkbox — it is already single-shot, so its telemetry only ever
reaches `none` → `completed`.

Serve is allowed to follow up only after a completed submission (always)
or a `consented_for_followup` abandoned session (only because consent was
already given before abandonment) — never from `partial_contact_captured`
alone, and never from raw analytics events.

## Response codes

- `201` — submission accepted, `{ "submissionId": "<uuid>" }`.
- `400` — malformed JSON or missing required fields (`intakeType`, `source`).
- `405` — non-POST method.
- `502` — the RPC call itself failed (transient database issue) — callers
  should treat this as retryable with the same `sourceSubmissionId`.

The Edge Function never surfaces raw database error detail to a public
caller (logged server-side only).

## Spam / honeypot handling

The honeypot signal (`bot-field` in `formPayload`) is preserved verbatim,
not rejected at the door — the submission is still recorded (immutable
evidence), and the Serve Intake Intelligence Engine's existing
classification (`metadata.honeypotTriggered` → Not Qualified, unchanged
from Scope H) handles it downstream. Rejecting honeypot submissions at the
Edge Function layer would duplicate a decision that already belongs to the
engine.

## Retry behavior

Callers should retry a failed submission (`502`, or a network failure)
using the **same** `sourceSubmissionId` — the RPC's idempotency
lookup-or-insert guarantees a retry never creates a duplicate row.
`netlify/functions/submit-care-inquiry.js` and
`submit-caregiver-interest.js` do not currently implement automatic
client-side retry (matching their existing fire-and-forget,
never-block-the-visitor design) — a failed proxy call is logged
server-side and the visitor's primary path (Netlify Forms) is unaffected.

## Netlify Forms — deliberate backup, not the canonical path

`contact/index.html`, `community-partners/index.html`, and the homepage
conversation all still submit to Netlify Forms as their primary,
always-successful path — this is deliberate: it's the visitor-facing
success guarantee, and it remains Serve's backup evidence copy if the
Canonical Intake Service is ever unreachable. The dual-write into the
Canonical Intake Service is a second, independent, fire-and-forget call
(`fetch(..., {keepalive: true})`) that never blocks or replaces the native
form submission. Only the Canonical Intake Service path creates a
Relationship or Recruiting Lead — Netlify's own submission inbox is never
read by anything in Serve OS.

## Legacy retirement status

`prospects` is **not** dropped this scope (Migration B, per the plan, is
explicitly deferred). It is retained temporarily
(`comment on table prospects` documents this). Every active writer found
in the prior audit has been rewired or removed:

- `/get-started?mode=care` (`saveProspectDraft()`) — removed, replaced by
  conversation telemetry + the Canonical Intake Service.
- `/get-started?mode=careers` (`saveRecruitingLead()`) — removed, same
  replacement.
- The 3 Dashboard cards and `app/prospects` — rewired to
  `relationships`-based queries / redirected to `/relationships/intake`.
- `prospect.completed` notification rule — retired (was never finished).

What's left before `prospects` can actually be dropped: resolving the 2
unresolved + 3 ambiguous legacy rows identified in the prior audit, and
coordinating with `feature/care-inquiries-os` (an unmerged serve-os branch
built against the `prospects` table). Both are outside this scope's
boundary.

## Known limitations (this scope)

- The job-application static form (`join-our-team/index.html`) is not
  wired to the Canonical Intake Service — only `contact/index.html`,
  `community-partners/index.html`, and the homepage conversation are.
- No UI reads `getRecoverablePartialSessions()` yet.
- The conversation layer is not extended to the website's own homepage
  conversational widget (only `/get-started`'s two wizards).
- The Database Webhook and any reconciliation schedule are documented, not
  configured live (deployment is out of scope this session).
