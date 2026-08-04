# Serve Canonical Data Flow

Status: reflects the architecture established through Scope J (Production
Intake Unification). Reference only — see
`docs/integrations/WEBSITE_TO_SERVE_INTAKE_CONTRACT.md` for the full
contract and rationale, and `docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md`
for the engine's internal rules.

## The pipeline

```
Interactive Intake Experience                (optional — not every source has one)
        ↓
Optional Conversation Layer                  conversation_sessions + conversation_events
        ↓
Canonical Intake Gateway                     Supabase Edge Function (intake-submit)
        ↓
intake_submissions                           immutable source of truth
        ↓
Serve Intake Intelligence Engine             deterministic classification + decision
        ↓
intake_processing_records                    processing / audit truth
        ↓
Relationships  /  Recruiting Leads           operational objects
        ↓
Residents  /  External Clients               durable identity, on conversion
        ↓
Downstream operational systems               Action Board, Dashboard, notifications
```

## Layer by layer

### Optional Conversation Layer — `conversation_sessions`, `conversation_events`
- **Responsibility**: capture product-experience truth for interactive intake journeys (today: Serve OS's `/get-started` care and careers wizards).
- **Owns**: how a person moved through an intake experience — steps viewed/completed, validation failures, abandonment, and (only after an explicit consent signal) a recoverable partial-contact draft.
- **Not responsible for**: deciding anything operational. Never creates a Relationship, Recruiting Lead, or `intake_submissions` row by itself. Not every source has one — a hospital API or a single-step form calls the Gateway directly.

### Canonical Intake Gateway — Supabase Edge Function (`intake-submit`)
- **Responsibility**: the one public entry point every intake source calls. Validates shape, enforces idempotency, and writes exactly one row.
- **Owns**: nothing durable — it is a stateless boundary, not a store of truth.
- **Not responsible for**: classification, business rules, or deciding what an inquiry means. Deliberately holds zero intake logic, so there is nothing to duplicate or keep in sync with the engine. Decoupled from Serve OS's own deployment and availability.

### `intake_submissions` — immutable source of truth
- **Responsibility**: durable, unaltered record of exactly what a source submitted.
- **Owns**: the original submission — raw fields, timestamp, source identity. Once written, never edited.
- **Not responsible for**: representing current operational reality. A submission row never changes even after the engine acts on it; corrections and enrichment happen downstream, never here.

### Serve Intake Intelligence Engine
- **Responsibility**: the single, deterministic translator from submission to operational decision — classification, confidence, resident matching, duplicate detection, priority.
- **Owns**: the decision logic itself. Same input always produces the same output; no randomness, no model inference.
- **Not responsible for**: storage of the decision (that's the next layer) or the submission itself (the layer before). Never invents information the submission didn't contain.

### `intake_processing_records` — processing / audit truth
- **Responsibility**: the ledger of what the engine decided and did — classification, confidence, reason codes, status, idempotency key, links to whatever operational object resulted.
- **Owns**: the auditable record of *why* an inquiry became what it became, and *whether* it was ever processed.
- **Not responsible for**: being the operational record itself — it links to Relationships/Recruiting Leads, it isn't one.

### Relationships / Recruiting Leads — operational objects
- **Responsibility**: the working, evolving record of Serve's actual engagement with a prospect, referral source, or job applicant.
- **Owns**: stage, actions, notes, timeline, status — everything that changes as staff do their jobs.
- **Not responsible for**: preserving original submission evidence (already immutable upstream) or re-deciding classification (already decided upstream). Created or reused by the engine, never by a raw intake write.

### Residents / External Clients — durable identity, on conversion
- **Responsibility**: the durable identity record once Serve formally converts an operational relationship into a client.
- **Owns**: the client's lasting identity and service record.
- **Not responsible for**: intake history — that lineage is reachable through the Relationship that produced the conversion, not duplicated here.

### Downstream operational systems
- **Responsibility**: surfacing operational objects to staff — Action Board, Dashboard counts, notification emails.
- **Owns**: presentation and alerting only.
- **Not responsible for**: creating or altering any of the truth layers above; these systems only read.

## Architectural principles established

1. **One canonical intake pipeline.** Every source — website, `/get-started`, and any future source — enters through the same Gateway. No source gets a privileged bypass, including Serve OS's own UI.
2. **Immutable intake truth.** `intake_submissions` is never edited after creation. Corrections happen on operational objects downstream, never by rewriting what was actually submitted.
3. **Deterministic processing.** The engine's classification is a pure function of its input — same submission, same result, always. No hidden state, no randomness.
4. **Idempotent processing.** Retrying a submission (same `client_submission_id`) or reprocessing an already-settled record never creates a duplicate — enforced at both the Gateway (insert-or-return) and the engine (settled-record short-circuit).
5. **Operational objects are derived from intake, not vice versa.** Relationships and Recruiting Leads exist because a submission was processed; a submission is never inferred or reconstructed from an operational object.
6. **No duplicated business logic across intake sources.** Classification logic lives in exactly one place (the engine). The Gateway, the website's Netlify Functions, and `/get-started` all defer to it rather than re-implementing any part of it.
7. **Every intake source ultimately enters through the same pipeline.** The Conversation Layer is optional and source-specific; the Gateway, `intake_submissions`, and the engine are not — they are the one shared path everything converges on.
