-- Canonical Important People / Contact foundation (Slice C.2, 2026-09-19).
--
-- Purpose: one real person (e.g. a resident's daughter) can hold multiple roles
-- (Primary Contact, Decision Maker, later Medical POA, later Document Recipient)
-- without becoming several unrelated flat strings. See the Slice C.1 investigation
-- report for the full survey of the FOUR existing, independent, non-cross-referencing
-- flat contact representations this does NOT replace or touch:
--   residents.family_contact_*, residents.physician_*, residents.legal_guardian_*,
--   relationships.primary_contact_*, assessment important_people.* field paths,
--   axiscare_client_canonical_snapshot.responsible_party_*.
-- None of those are modified, backfilled, or projected into by this migration.
--
-- ARCHITECTURAL NOTE (per explicit instruction for this slice): this schema does NOT
-- encode an assumption that every contact must pass through human confirmation before
-- becoming canonical. It only distinguishes four separable concepts -- knowledge
-- projection (a contact/role exists), identity reconciliation (is this the same
-- person as an existing contact), authority/evidence (is a role merely claimed or
-- actually documented), and business action (unrelated, untouched by this migration)
-- -- and gives each its own governed shape. WHEN/whether a given contact creation
-- requires a human click is a policy decision for the caller (Slice C.3+), never
-- baked into this schema as a hard constraint.
--
-- No wiring to assessment approval, no UI, no new Client Readiness requirements, and
-- no changes to any existing table are introduced here.

-- ============================================================================
-- contacts — one row per real person who is not a resident/caregiver/agency.
-- Deliberately narrow: identity/contact fields only, no address, no
-- PandaDoc/AxisCare-specific fields (see the investigation's explicit scope note).
-- Holds the CURRENT understanding of each field; contact_field_provenance below
-- is the append-only record of how each value came to be and what it replaced.
-- ============================================================================

create table if not exists public.contacts (
  id                uuid not null primary key default gen_random_uuid(),

  first_name        text,
  last_name         text,

  email             text,
  normalized_email  text,

  phone             text,
  normalized_phone  text,

  created_by        text not null,
  created_at        timestamptz not null default now(),
  updated_by        text,
  updated_at        timestamptz not null default now(),

  constraint contacts_created_by_not_blank check (length(trim(created_by)) > 0)
);

create index if not exists contacts_normalized_email_idx on public.contacts (normalized_email);
create index if not exists contacts_normalized_phone_idx on public.contacts (normalized_phone);

alter table public.contacts enable row level security;

-- ============================================================================
-- contact_field_provenance — append-only record of every assertion of a
-- contact field's value. Never updated in place; a new value is always a NEW
-- row whose supersedes_id points at the row it replaces. "Current" is derived
-- exactly like assessment_approved_facts already is elsewhere in this repo
-- (lib/data/assessmentIntelligence.ts's getApprovedFactsForResident(): a row is
-- current unless some other row's supersedes_id points at it) — see
-- lib/contacts/provenance.ts's currentProvenanceRecords(). This is the smallest
-- provenance mechanism that satisfies "Susan phone = X, then later Susan
-- phone = Y, supersedes X, without silently rewriting history" without
-- building a general event-sourcing framework.
-- ============================================================================

create table if not exists public.contact_field_provenance (
  id              uuid not null primary key default gen_random_uuid(),

  contact_id      uuid not null references public.contacts(id) on delete cascade,
  field_name      text not null,
  value           text,

  source          text not null,
  source_reference text,

  asserted_by     text not null,
  asserted_at     timestamptz not null default now(),

  -- NO ACTION — same provenance-preserving convention already used by
  -- person_evidence.supersedes_evidence_id / person_documents.supersedes_document_id:
  -- a superseded row is never deleted or cascaded away.
  supersedes_id   uuid references public.contact_field_provenance(id) on delete no action,

  created_at      timestamptz not null default now(),

  constraint contact_field_provenance_field_name_check
    check (field_name in ('first_name', 'last_name', 'email', 'phone')),

  constraint contact_field_provenance_source_check
    check (source in ('assessment', 'manual', 'document', 'axiscare', 'other')),

  constraint contact_field_provenance_asserted_by_not_blank
    check (length(trim(asserted_by)) > 0)
);

create index if not exists contact_field_provenance_contact_field_idx
  on public.contact_field_provenance (contact_id, field_name);

alter table public.contact_field_provenance enable row level security;

-- ============================================================================
-- contact_roles — one contact may hold MANY roles for the same resident;
-- one role may legitimately be held by MULTIPLE contacts for the same
-- resident (co-POAs, more than one emergency contact). No uniqueness
-- constraint restricts either of these on purpose.
--
-- role_type is plain text, NOT a closed CHECK enum — a new role type (e.g.
-- something PandaDoc eventually needs) is a new value written by application
-- code, never a schema migration. See lib/contacts/roleTypes.ts for the
-- currently-known, documented, extensible list this schema does not enforce.
--
-- status distinguishes a REPORTED/CLAIMED role (e.g. "the assessment says
-- Susan is Medical POA") from a role whose authority has actually been
-- EVIDENCED (e.g. a signed POA document was reviewed) — role existence is
-- never equivalent to verified authority. evidence_id is reserved for that
-- verified case: it points at the existing governed person_evidence
-- platform (never a second, competing evidence mechanism), but is NOT
-- populated by this slice (C.2 creates no new person_requirements row for
-- any contact role to attach evidence to — that is explicitly deferred to a
-- later slice). The column exists now so the eventual wiring needs no
-- further schema change.
-- ============================================================================

create table if not exists public.contact_roles (
  id                uuid not null primary key default gen_random_uuid(),

  contact_id        uuid not null references public.contacts(id) on delete cascade,
  resident_id       uuid not null references public.residents(id) on delete cascade,

  role_type         text not null,
  status            text not null default 'claimed',

  source            text not null,
  source_reference  text,

  -- Reserved for future evidence-platform wiring (see this table's own
  -- header comment) — always null in this slice.
  evidence_id       uuid references public.person_evidence(id) on delete no action,

  effective_start   date not null default current_date,
  effective_end     date,

  created_by        text not null,
  created_at        timestamptz not null default now(),
  updated_by        text,
  updated_at        timestamptz not null default now(),

  constraint contact_roles_role_type_not_blank check (length(trim(role_type)) > 0),

  constraint contact_roles_status_check
    check (status in ('claimed', 'verified', 'revoked')),

  constraint contact_roles_source_check
    check (source in ('assessment', 'manual', 'document', 'axiscare', 'other')),

  constraint contact_roles_created_by_not_blank check (length(trim(created_by)) > 0),

  constraint contact_roles_effective_dates_check
    check (effective_end is null or effective_end >= effective_start)
);

create index if not exists contact_roles_resident_idx on public.contact_roles (resident_id);
create index if not exists contact_roles_contact_idx on public.contact_roles (contact_id);

alter table public.contact_roles enable row level security;

-- ============================================================================
-- contact_identity_candidates — ambiguous contact-identity matches awaiting
-- human reconciliation. Modeled on resident_identity_candidates' own evidence
-- shape (20260805000000_create_resident_identity_resolution.sql): evidence is
-- always a human-readable array of {signalType, description, strength}
-- objects, never an opaque numeric score. A row is only ever created for a
-- genuine tier from lib/contacts/identityMatch.ts's classifyContactMatch() —
-- exact_strong_match, proposed_match_requires_review, or
-- conflicting_identity_requires_review. name_only_no_merge and no_match never
-- produce a row here at all: there is nothing to reconcile when the only
-- signal is a shared name, or when there is no real overlap signal.
--
-- Ordered pair (contact_id_a < contact_id_b) so a lookup never needs both
-- orderings — same convention as resident_identity_suppressions below and its
-- resident-identity-resolution precedent.
-- ============================================================================

create table if not exists public.contact_identity_candidates (
  id                    uuid not null primary key default gen_random_uuid(),

  contact_id_a          uuid not null references public.contacts(id) on delete cascade,
  contact_id_b          uuid not null references public.contacts(id) on delete cascade,

  match_tier            text not null,

  -- Array of {signalType, description, strength} objects — never an opaque score.
  evidence              jsonb not null default '[]'::jsonb,

  status                text not null default 'open',
  resolved_by           text,
  resolved_at           timestamptz,
  resolution_rationale  text,

  created_at            timestamptz not null default now(),

  constraint contact_identity_candidates_distinct_contacts check (contact_id_a <> contact_id_b),
  constraint contact_identity_candidates_ordered_pair check (contact_id_a < contact_id_b),

  constraint contact_identity_candidates_match_tier_check
    check (match_tier in (
      'exact_strong_match', 'proposed_match_requires_review', 'conflicting_identity_requires_review'
    )),

  constraint contact_identity_candidates_status_check
    check (status in ('open', 'resolved_same', 'resolved_not_same', 'dismissed')),

  -- A filename-shaped "we resolved this" is never proof — resolved_by/resolved_at
  -- are only ever set together with a genuinely resolved/dismissed status. Same
  -- discipline as person_evidence_verification_fields_check.
  constraint contact_identity_candidates_resolution_fields_check
    check (
      (status = 'open' and resolved_by is null and resolved_at is null)
      or (status <> 'open' and resolved_by is not null and resolved_at is not null)
    )
);

create unique index if not exists contact_identity_candidates_unique_pair
  on public.contact_identity_candidates (contact_id_a, contact_id_b);

alter table public.contact_identity_candidates enable row level security;

-- ============================================================================
-- contact_identity_suppressions — permanent "these are confirmed NOT the same
-- person" memory. Hard-excludes a pair from ever being proposed as a match
-- again, regardless of future evidence — directly mirrors
-- resident_identity_suppressions' own purpose and ordered-pair shape.
-- ============================================================================

create table if not exists public.contact_identity_suppressions (
  contact_id_a  uuid not null references public.contacts(id) on delete cascade,
  contact_id_b  uuid not null references public.contacts(id) on delete cascade,

  reason        text,

  created_by    text not null,
  created_at    timestamptz not null default now(),

  constraint contact_identity_suppressions_distinct_contacts check (contact_id_a <> contact_id_b),
  constraint contact_identity_suppressions_ordered_pair check (contact_id_a < contact_id_b),
  constraint contact_identity_suppressions_created_by_not_blank check (length(trim(created_by)) > 0),

  primary key (contact_id_a, contact_id_b)
);

alter table public.contact_identity_suppressions enable row level security;

-- ============================================================================
-- Access — same governed, service-role-only posture as the rest of the
-- person_requirements/person_evidence platform this table family sits
-- alongside. No anon/authenticated access; every write goes through a server
-- action using the service-role client, same as every other governed table
-- in this repo.
-- ============================================================================

revoke all on public.contacts from public, anon, authenticated;
grant all on public.contacts to service_role;

revoke all on public.contact_field_provenance from public, anon, authenticated;
grant all on public.contact_field_provenance to service_role;

revoke all on public.contact_roles from public, anon, authenticated;
grant all on public.contact_roles to service_role;

revoke all on public.contact_identity_candidates from public, anon, authenticated;
grant all on public.contact_identity_candidates to service_role;

revoke all on public.contact_identity_suppressions from public, anon, authenticated;
grant all on public.contact_identity_suppressions to service_role;
