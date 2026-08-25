# AxisCare Write-Back Policy — Proposed Amendment (NOT YET AUTHORIZED)

**Status: proposal only.** `AXISCARE_READ_ONLY_INTEGRATION.md` remains the authoritative,
standing policy — nothing in this document changes it. No AxisCare write transport exists in
this codebase (`lib/integrations/axiscare/client.ts`'s `axisCareGet()` is still GET-only by
construction, unchanged) and none was added as part of this work. This document is the deliverable
requested at the end of the AxisCare end-to-end dry-run build: a concrete proposal for what a
future, explicitly authorized write capability should look like, written *after* proving the full
mapping/candidate/preview architecture up to (but not across) that boundary. See
`docs/architecture/AXISCARE_ASSESSMENT_INTEGRATION.md` for the architecture this proposal builds on.

## 1. Why write-back is now needed

The read-only integration (visits, schedules, clients, caregivers, ADLs, classes) was built to
answer "what does AxisCare already know" — reconciliation, operational reporting, identity
matching. This project adds a new, different need: Serve's own governed assessment pipeline
(conversation → AI-extracted draft facts → human-approved canonical facts) now produces
information that, once approved, has nowhere to go except manual re-entry into AxisCare. That
manual re-entry is exactly the toil this project exists to remove (see the Product Principle in
the originating scope: "The goal is not to remove human judgment. The goal is to remove human
re-entry."). The read-only policy was correct for what the integration was for at the time; it
is not a fit for what this new capability needs, which is a narrow, tightly governed exception —
not a reversal of the general posture.

## 2. Exactly which write operations would be permitted

Only these five, matching the exact endpoints confirmed against AxisCare's real OpenAPI 3.1.0
specification (version `2025-06-25`) during this work — nothing broader:

| Operation | Endpoint | Purpose |
|---|---|---|
| Create client | `POST /api/clients` | New prospect, Inactive + WAF Prospect class only |
| Update client | `PATCH /api/clients/{clientId}` | Approved reassessment changes only, true partial update |
| Update responsible party | `PUT /api/clients/{clientId}/responsibleParties/{listNumber}` | Slot 1 (Primary) only, per Serve's current one-contact domain model |
| Assign/update client ADL | `POST` / `PATCH /api/clients/{clientId}/adls[/{adlId}]` | Only against real, active, agency-configured ADL definitions — never an invented ID |
| Create client note | `POST /api/notes/client/{clientId}` | Optional — not built in this pass; would carry an audit-trail note, never raw transcript text |

Explicitly **not** proposed: any DELETE, any write to leads/caregivers/applicants/organizations/
schedules/visits, any field this project's mapping layer marked `UNSUPPORTED` (e.g. SSN — never
mapped, by explicit instruction), and any endpoint not listed above.

## 3. Which authenticated Serve roles can authorize them

Not yet decided by this session — this repository's `lib/auth/permissions.ts` already has a role
model (e.g. `canEditResidentProfile`); a future implementation should add a narrowly-scoped
permission (e.g. `canAuthorizeAxisCareWrite`) rather than reusing a broader existing one, and
should require it independently of `canEditResidentProfile` — reviewing an assessment and
authorizing an external vendor write are different levels of consequence and should not be
implicitly bundled. Recommend: restricted to a small, explicitly named set of roles (e.g.
operations lead / agency admin), decided by Hud, not inferred here.

## 4. Required human approval before every external write

Non-negotiable, and already the shape this build's dry-run architecture assumes:

- **Create**: a human must view the full `NewClientWritePreview` (status, class, all `READY`
  fields, all `BLOCKING`/`MANUAL`/`UNSUPPORTED` fields with reasons, the duplicate-check result)
  and take an explicit "Create in AxisCare" action. No automatic POST after extraction or
  approval, ever.
- **Update**: a human must view the full `UpdateClientWritePreview`'s Current → Proposed diff for
  every `CHANGED_FACT`/`NEW_FACT` row and explicitly approve which fields go into the PATCH —
  `buildUpdateClientCandidate()` already throws if handed anything other than a pre-filtered,
  approved set (see `clientCandidateMapping.ts`). A future write adapter must preserve that
  contract, not weaken it into "send everything classified changed."
- Approval must be a distinct, logged action — not implied by navigating away from the review
  page or by a prior, unrelated approval (e.g. approving the assessment facts themselves is not
  approval to write to AxisCare).

## 5. Duplicate/identity protections

Already built and tested in this pass (`resolveCreateEligibility()` in
`clientCandidateMapping.ts`), reusing the existing, already-governed
`person_vendor_identity_links` state machine rather than inventing a parallel one:

- A **confirmed** existing link refuses create outright (routes to update instead).
- A **proposed** link below high confidence, or a high-confidence proposed-but-unconfirmed link,
  refuses create pending explicit human reconciliation — never auto-resolved either direction.
- Only an absent, rejected, or deferred link is eligible to create.

A future write adapter must call `resolveCreateEligibility()` (or an equivalent gate) as a hard
precondition — never construct or send a create payload without it.

## 6. Server-only credential requirements

No change from the existing, already-correct pattern: `AXISCARE_API_TOKEN` (and the other
`AXISCARE_*` config values) are read only via `getAxisCareConfig()` in `config.ts`, server-side
only (`import "server-only"` throughout this integration), never exposed to client-side code,
never logged. A write-capable `axisCarePost`/`axisCarePatch`/`axisCarePut` function should follow
`axisCareGet()`'s exact existing pattern (timeout, `AbortController`, response body never logged
on error) — extended, not redesigned.

## 7. Audit requirements

**Currently missing, and required before any real write ships** (Phase 0's reconnaissance found
no AxisCare-specific write-log table anywhere in this codebase — see the gap report). A future
implementation needs, at minimum, a durable record of: who authorized the write, when, the exact
sanitized payload sent, the HTTP response status, the AxisCare-assigned ID returned (on create),
and success/failure — analogous to `workforce_axiscare_sync_runs` (which already exists for the
read-side caregiver sync) but for outbound writes specifically, and covering create/update/
responsible-party/ADL calls, not just clients. This is new schema work, not built in this pass.

## 8. Prohibited automatic AI writes

Structurally enforced already, not just a policy statement: `buildNewClientCandidate()` and
`buildUpdateClientCandidate()` both take only human-approved facts (`assessment_approved_facts`-
shaped input) or an explicitly pre-filtered, human-approved change set — neither function, nor
anything upstream of a human review action, has a code path from raw AI draft output to a write
payload. A future write adapter must preserve this: it should be structurally impossible to call
it with unapproved data, not just conventionally discouraged.

## 9. Failure behavior

Must match this codebase's existing fail-closed discipline exactly (same as
`extractFactsViaBedrockClaude()`'s error handling): a write failure throws a clear, prefixed
error and is surfaced to the operator — never retried silently, never treated as success, never
falls back to a different action. A partial multi-step operation (e.g. create client succeeds,
responsible-party PUT fails) must report exactly which steps succeeded and which failed — never
a single opaque "something went wrong."

## 10. Rollback/correction expectations

AxisCare's API offers no client DELETE (confirmed against the real spec — no such endpoint
exists for clients, only for ADL unassignment). A mistaken create cannot be cleanly undone via
this integration; the only corrections available are: (a) a further PATCH to correct field
values, or (b) marking the AxisCare-side record's status/disposition appropriately and noting
the error in Serve's own audit trail (see item 7). This is a real, structural limitation to
communicate to whoever authorizes writes — "create" is a higher-consequence action than "update"
for exactly this reason, and the write-safety preview should say so explicitly before every
create.

## Explicitly not resolved by this document

Role/permission assignment (item 3) and the audit-log schema (item 7) are the two concrete
pieces of new work identified but not built. Everything else above describes contracts this
session's dry-run code already implements and tests against, ready for a future write adapter to
consume without redesigning the domain model — per instruction, that adapter is not built here.
