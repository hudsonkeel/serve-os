begin;

-- Serve Operational Evidence Collector — three-class evidence model. See
-- docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md and
-- docs/architecture/SERVE_OPERATIONAL_ARCHITECTURE_IMPLEMENTATION.md.
--
-- Preserves three structurally separate evidence classes — never collapsed
-- into one generic "fact" table:
--   1. DIRECTLY OBSERVED    — recruiting_lead_observations (extended below)
--   2. DETERMINISTICALLY INFERRED — recruiting_lead_inferences (+ evidence join)
--   3. HUMAN CONFIRMED      — recruiting_lead_human_confirmations
-- Plus recruiting_lead_vendor_identities for Phase 4's identity resolution
-- ladder, and recruiting_lead_rules / recruiting_lead_rule_versions as this
-- domain's instance of the platform's Rule / RuleVersion primitives
-- (lib/intelligence/core/rules.ts), persisted for the first time here.
--
-- Entirely additive. No change to recruiting_leads. Nothing here ever marks
-- recruiting_leads.status — no function in this migration is capable of it.

-- ─── Extend recruiting_lead_observations for the full normalized contract ──
alter table recruiting_lead_observations add column if not exists source_system text;
alter table recruiting_lead_observations add column if not exists source_record_id text;
alter table recruiting_lead_observations add column if not exists collected_at timestamptz;
alter table recruiting_lead_observations add column if not exists source_location text;
alter table recruiting_lead_observations add column if not exists extractor_version text;
alter table recruiting_lead_observations add column if not exists extraction_confidence text;
alter table recruiting_lead_observations add column if not exists match_method text;
alter table recruiting_lead_observations add column if not exists failure_reason text;
alter table recruiting_lead_observations add column if not exists sensitivity text not null default 'standard';
alter table recruiting_lead_observations add column if not exists collection_method text not null default 'guided_manual';

-- Backfill collected_at for every pre-existing row (Bob's flight) from its
-- own created_at — the two are conceptually distinct going forward
-- (collected_at = when the collector actually captured it; created_at =
-- when the row was written) but were identical in practice before this
-- column existed.
update recruiting_lead_observations set collected_at = created_at where collected_at is null;
alter table recruiting_lead_observations alter column collected_at set not null;
alter table recruiting_lead_observations alter column collected_at set default now();

-- Extend visibility with 'ambiguous' and 'unknown' — four genuinely
-- distinct extraction outcomes, none collapsible into another:
--   directly_observed — a value was read with confidence
--   not_visible       — the targeted element/selector found nothing at all
--   unknown           — something was found but could not be confidently
--                       classified/normalized (distinct from not_visible:
--                       extraction found *something*, just couldn't read it)
--   ambiguous         — multiple candidate matches, none safely selectable
--   not_applicable    — retained for backward compatibility with existing
--                       rows; not one of the four canonical extractor
--                       outcomes going forward (see lib/collectors/types.ts)
alter table recruiting_lead_observations drop constraint if exists recruiting_lead_observations_visibility_check;
alter table recruiting_lead_observations add constraint recruiting_lead_observations_visibility_check
  check (visibility in ('directly_observed', 'not_visible', 'not_applicable', 'ambiguous', 'unknown'));

alter table recruiting_lead_observations drop constraint if exists recruiting_lead_observations_extraction_confidence_check;
alter table recruiting_lead_observations add constraint recruiting_lead_observations_extraction_confidence_check
  check (extraction_confidence is null or extraction_confidence in ('high', 'medium', 'low'));

alter table recruiting_lead_observations drop constraint if exists recruiting_lead_observations_match_method_check;
alter table recruiting_lead_observations add constraint recruiting_lead_observations_match_method_check
  check (match_method is null or match_method in ('data_attribute', 'aria_role', 'text_content', 'positional', 'manual'));

alter table recruiting_lead_observations drop constraint if exists recruiting_lead_observations_sensitivity_check;
alter table recruiting_lead_observations add constraint recruiting_lead_observations_sensitivity_check
  check (sensitivity in ('standard', 'sensitive'));

alter table recruiting_lead_observations drop constraint if exists recruiting_lead_observations_collection_method_check;
alter table recruiting_lead_observations add constraint recruiting_lead_observations_collection_method_check
  check (collection_method in ('automatic_dom', 'guided_manual'));

comment on column recruiting_lead_observations.failure_reason is
  'Populated only when visibility <> directly_observed — e.g. "selector_not_found", "multiple_candidates_matched", "identity_mismatch". Never populated for a successful observation.';

-- ─── Rules — this domain's persisted Rule / RuleVersion ───────────────────
create table if not exists recruiting_lead_rules (
  id          uuid primary key default gen_random_uuid(),
  domain      text not null default 'recruiting',
  slug        text not null unique,
  title       text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

create table if not exists recruiting_lead_rule_versions (
  id               uuid primary key default gen_random_uuid(),
  rule_id          uuid not null references public.recruiting_lead_rules(id),
  version          integer not null,
  trigger_type     text not null default 'event',
  parameters       jsonb not null default '{}'::jsonb,
  logic_reference  text not null,
  effective_from   timestamptz not null default now(),
  effective_to     timestamptz,
  changelog_note   text,

  constraint recruiting_lead_rule_versions_trigger_type_check
    check (trigger_type in ('event', 'state', 'time')),

  constraint recruiting_lead_rule_versions_unique_version
    unique (rule_id, version)
);

create index if not exists recruiting_lead_rule_versions_rule_idx
  on recruiting_lead_rule_versions (rule_id, version desc);

alter table recruiting_lead_rules enable row level security;
alter table recruiting_lead_rule_versions enable row level security;

-- ─── Deterministically Inferred — this domain's persisted Signal ──────────
create table if not exists recruiting_lead_inferences (
  id                        uuid primary key default gen_random_uuid(),
  recruiting_lead_id        uuid not null references public.recruiting_leads(id),
  rule_version_id           uuid not null references public.recruiting_lead_rule_versions(id),

  signal_key                text not null,
  explanation               text not null,
  strength                  text not null,
  unresolved_alternatives   jsonb not null default '[]'::jsonb,
  evidence_needed_to_resolve jsonb not null default '[]'::jsonb,

  computed_at               timestamptz not null default now(),
  created_at                timestamptz not null default now(),

  constraint recruiting_lead_inferences_strength_check
    check (strength in ('strong', 'moderate', 'weak'))
);

create index if not exists recruiting_lead_inferences_lead_idx
  on recruiting_lead_inferences (recruiting_lead_id, computed_at desc);

-- Signal -> Evidence link: which directly-observed rows produced this
-- inference. A real join table, not a jsonb array of ids, so the
-- relationship stays queryable and auditable on its own.
create table if not exists recruiting_lead_inference_evidence (
  inference_id   uuid not null references public.recruiting_lead_inferences(id),
  observation_id uuid not null references public.recruiting_lead_observations(id),
  primary key (inference_id, observation_id)
);

alter table recruiting_lead_inferences enable row level security;
alter table recruiting_lead_inference_evidence enable row level security;

-- ─── Human Confirmed ───────────────────────────────────────────────────────
-- rationale is required, not optional — a confirmation with no stated
-- source is not a valid row. This is the structural enforcement of "must
-- not be used unless entered as authorized evidence or confirmed from a
-- governed source."
create table if not exists recruiting_lead_human_confirmations (
  id                 uuid primary key default gen_random_uuid(),
  recruiting_lead_id uuid not null references public.recruiting_leads(id),

  confirmation_key   text not null,
  confirmed_value    text not null,
  rationale          text not null,
  actor              text not null,
  confirmed_at       timestamptz not null default now(),

  created_at         timestamptz not null default now(),

  constraint recruiting_lead_human_confirmations_rationale_not_blank
    check (length(trim(rationale)) > 0),

  constraint recruiting_lead_human_confirmations_actor_not_blank
    check (length(trim(actor)) > 0)
);

create index if not exists recruiting_lead_human_confirmations_lead_idx
  on recruiting_lead_human_confirmations (recruiting_lead_id, confirmed_at desc);

alter table recruiting_lead_human_confirmations enable row level security;

-- ─── Vendor Identity Resolution (Phase 4's match ladder, persisted) ───────
create table if not exists recruiting_lead_vendor_identities (
  id                 uuid primary key default gen_random_uuid(),
  recruiting_lead_id uuid not null references public.recruiting_leads(id),

  source_system      text not null,
  vendor_record_id   text not null,
  vendor_display_name text,

  -- The match ladder tier that produced this linkage — see
  -- docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md Phase 4.
  match_method        text not null,
  match_confidence     text not null,

  -- Only true once a human has explicitly confirmed the linkage. Tier 7
  -- (name-only similarity) must never be usable for automatic re-matching
  -- until this is true.
  is_human_confirmed  boolean not null default false,
  linked_by           text,
  linked_at           timestamptz not null default now(),

  constraint recruiting_lead_vendor_identities_source_system_check
    check (source_system in ('apploi', 'viventium')),

  constraint recruiting_lead_vendor_identities_match_method_check
    check (match_method in (
      'existing_linkage', 'vendor_id', 'verified_email', 'verified_phone',
      'verified_email_or_phone_plus_name', 'normalized_name_plus_attribute',
      'name_similarity_pending_review'
    )),

  constraint recruiting_lead_vendor_identities_match_confidence_check
    check (match_confidence in ('high', 'medium', 'low')),

  -- A human-confirmed link always has a named actor; an unconfirmed one
  -- never does — bidirectional, same discipline as every closure-field
  -- check this codebase already uses elsewhere.
  constraint recruiting_lead_vendor_identities_confirmation_fields_check
    check (
      (is_human_confirmed = false and linked_by is null)
      or (is_human_confirmed = true and linked_by is not null)
    ),

  constraint recruiting_lead_vendor_identities_unique_per_source
    unique (recruiting_lead_id, source_system)
);

alter table recruiting_lead_vendor_identities enable row level security;

-- ─── Grants ────────────────────────────────────────────────────────────────
revoke all on recruiting_lead_rules from public, anon, authenticated;
grant all on recruiting_lead_rules to service_role;

revoke all on recruiting_lead_rule_versions from public, anon, authenticated;
grant all on recruiting_lead_rule_versions to service_role;

revoke all on recruiting_lead_inferences from public, anon, authenticated;
grant all on recruiting_lead_inferences to service_role;

revoke all on recruiting_lead_inference_evidence from public, anon, authenticated;
grant all on recruiting_lead_inference_evidence to service_role;

revoke all on recruiting_lead_human_confirmations from public, anon, authenticated;
grant all on recruiting_lead_human_confirmations to service_role;

revoke all on recruiting_lead_vendor_identities from public, anon, authenticated;
grant all on recruiting_lead_vendor_identities to service_role;

commit;
