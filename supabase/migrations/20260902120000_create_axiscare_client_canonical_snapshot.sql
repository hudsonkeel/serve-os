-- AxisCare → Serve canonical bootstrap: a governed, narrow snapshot of
-- ONLY the AxisCare Client fields live-confirmed (2026-08-17 discovery
-- pass, read-only, against 4 real identity-confirmed active clients:
-- Brenda Fritchen, Weldon SY Syler, Michele Helsley, Rubyetta Cain) to be
-- (a) real named fields on AxisCare's Client resource and (b) actually
-- populated in this Watermere account today — not a general-purpose
-- vendor-payload cache.
--
-- REVISED 2026-08-17 (leadership decisions, "Finalize AxisCare -> Serve
-- Canonical Bootstrap"): added triageLevel source columns and dedicated
-- triage-evidence tracking (leadership confirmed AxisCare's Client
-- Profile Triage Level IS the same triage classification
-- EP_CLIENT_TRIAGE_CLASSIFIED requires). This table has never been
-- applied, so it is revised in place rather than superseded by a second
-- migration.
--
-- This table is temporary transition infrastructure, not a second
-- canonical client record. AxisCare remains a read-only source; nothing
-- in this migration grants it write authority over Serve data.
--
-- SAFETY REVIEW: pure additive new table. No existing table/column
-- touched. No FK to `residents` (deliberately — see column comment on
-- axiscare_client_id) so this migration can never fail against existing
-- data. FK to `person_evidence` for triage_evidence_id is safe (evidence
-- rows are superseded, never deleted). Idempotent (create table if not
-- exists, matching this series' established discipline).
--
-- Discovery findings this schema reflects (do not re-litigate without a
-- new live check):
--   - date_of_birth, gender, admission_date (AxisCare startDate),
--     residential address fields: CONFIRMED real, named fields on the
--     Client resource, CONFIRMED populated for all 4 sampled clients.
--     Leadership-approved for permanent canonical-bootstrap use
--     (2026-08-17) — a narrower, explicit carve-out from the older
--     schedule-visibility Client Privacy Policy, not a repeal of it.
--   - triageLevel ({id, description}): CONFIRMED real, named field,
--     CONFIRMED populated for all 4 sampled clients. Leadership confirmed
--     (2026-08-17) this IS the same triage classification Serve's
--     EP_CLIENT_TRIAGE_CLASSIFIED requirement governs — not a
--     coincidentally-named different concept. A populated value is now
--     valid source evidence, applied as a governed person_evidence row
--     (never a live evaluator call — see
--     lib/clientReadiness/evidence.ts's recordAxisCareTriageEvidence()).
--   - Responsible party (name/relationship/phone/email): CONFIRMED to
--     exist and sometimes populated (2 of 4 sampled clients), but the
--     only two populated examples were both relationship='Daughter' —
--     the SAME archetype Serve already models as family_contact_*.
--     Leadership confirmed (2026-08-17) Responsible Parties are the
--     current operational source for Serve's family/emergency contact,
--     and approved deterministic mapping to residents.family_contact_* —
--     but explicitly NOT to legal_guardian_* (no field here establishes
--     legal/medical decision-making authority; canMakeMedicalDecisions/
--     hipaaDisclosureAuthorization were empty on every sampled party).
--     Still captured here regardless, since a future record COULD have
--     that authority field populated.
--   - Physician: re-investigated 2026-08-17 against the full OpenAPI
--     spec, not just the earlier live client-side check. The mechanism
--     (Contact.contactClass='Physician' + Contact.clients[] linkage) is
--     real, API-accessible, and matches the spec's own official example
--     (a "Dr. James Marshall" Physician contact shown with clients: []).
--     No `clientId` filter exists on GET /api/contacts, and no reverse
--     "linked contacts" field exists on the Client resource either — the
--     Contact's own clients[] array is confirmed to be the only linkage
--     path. All 19 real physician contacts in this account have an empty
--     clients[] array today. This is a DATA gap, not an API capability
--     gap — the mechanism would work the moment a physician contact is
--     actually linked to a client in AxisCare. No column added yet;
--     revisit once real linkage data exists for at least one client.
--   - ADLs: the endpoint exists but returned 0 records for all 4 sampled
--     clients — no ISP/current-care data to snapshot yet. No column
--     added; revisit once real ADL data is confirmed for some client.
--   - Documents/attachments: confirmed absent from the entire AxisCare
--     API surface — re-confirmed 2026-08-17 by an exhaustive grep of the
--     full local OpenAPI spec (docs/integrations/axiscare/AxisCare-Customer-API-OpenAPI.yaml)
--     for document/attachment/file/download terms; zero real hits. Not
--     modeled here at all, and never will be via this table.
--   - Explicitly NOT stored, ever, regardless of AxisCare exposing them:
--     ssn, medicaidNumber, billing/financial fields, free-text notes,
--     care-note narrative, medication contents, advanceDirective/dnr/
--     will/allergies/maritalStatus/spouseName/languages (none map to a
--     current Client Readiness requirement — not added merely because
--     AxisCare exposes them).

begin;

create table if not exists axiscare_client_canonical_snapshot (
  id uuid primary key default gen_random_uuid(),

  -- The AxisCare vendor id (matches person_vendor_identity_links.vendor_record_id
  -- where source_system='axiscare') — deliberately NOT a foreign key to
  -- residents, mirroring axiscare_client_dispositions' own established
  -- choice: identity resolution can change over time, and this table
  -- must remain writable even for a client with no resolved Serve match
  -- yet. The confirmed-identity gate is enforced by the sync/apply CODE,
  -- not the schema.
  axiscare_client_id text not null unique,

  -- ─── Confirmed-populated, deterministic core facts (Phase 1 apply target) ───
  date_of_birth date,
  gender text,
  admission_date date, -- AxisCare `startDate`
  street_address_1 text,
  street_address_2 text,
  city text,
  state text,
  postal_code text,

  -- ─── Triage — leadership-confirmed valid source for
  -- EP_CLIENT_TRIAGE_CLASSIFIED. Raw source value preserved for
  -- provenance even after evidence is created; triage_evidence_status/id
  -- track the SEPARATE evidence-creation step (this fact is
  -- evidence-based, not a residents column, so it isn't tracked by
  -- canonicalization_status/applied_to_serve_at below — those are scoped
  -- to residents-column facts only).
  triage_level_id text,
  triage_level_description text,
  triage_evidence_status text not null default 'not_reviewed'
    check (triage_evidence_status in (
      'not_reviewed',
      'evidence_created',
      'skipped_serve_already_owns',
      'skipped_no_source_value'
    )),
  triage_evidence_id uuid references person_evidence(id),

  -- ─── Responsible party — captured for family_contact_* bootstrap AND
  -- for human-reviewable provenance. Never auto-applied to
  -- residents.legal_guardian_* by this migration or any code this phase
  -- adds (see migration header). Position 1 only (AxisCare always
  -- returns 3 slots; only position 1 was ever populated in practice
  -- across all 4 sampled clients).
  responsible_party_name text,
  responsible_party_relationship text,
  responsible_party_phone text,
  responsible_party_email text,
  responsible_party_can_make_medical_decisions text, -- AxisCare returns this as a string, often empty; stored as-observed, never inferred

  -- ─── Provenance / reconciliation (residents-column facts only) ───
  fetched_at timestamptz not null default now(),
  source_response_hash text,

  canonicalization_status text not null default 'not_reviewed'
    check (canonicalization_status in (
      'not_reviewed',
      'applied_to_serve',
      'skipped_serve_already_owns',
      'conflict_unresolved'
    )),

  conflict_status text
    check (conflict_status is null or conflict_status in (
      'value_disagrees_with_serve',
      'ambiguous_source'
    )),
  conflict_notes text,

  applied_to_serve_at timestamptz,
  applied_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table axiscare_client_canonical_snapshot is
  'Temporary AxisCare -> Serve canonical bootstrap staging layer. Narrow, allowlisted fields only -- never a raw vendor payload cache, never a second canonical client record. AxisCare stays read-only; Serve is the only system this table ever writes into (via separate, explicitly-approved apply steps for residents-column facts and for triage evidence).';

commit;

-- NOT YET APPLIED — pending explicit approval, per standing instruction.
