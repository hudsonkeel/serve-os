begin;

-- Serve Intelligence Kernel — first persistence layer for the shared
-- Phase A types defined in lib/intelligence/core/ (see
-- docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md and
-- docs/architecture/decisions/0001-governance-knowledge-engine-phase-0.md).
-- Generic, domain-agnostic tables — NOT specific to Background Eligibility
-- or to Governance. Background Eligibility (Governance Knowledge Engine
-- Phase 1) is the first tenant of this schema, not its owner; any future
-- decision type (Scheduling, Relationships, a later Financial domain)
-- reuses these same tables rather than duplicating them.
--
-- Minimized deliberately: only what one complete, explainable decision
-- workflow needs. Action, Outcome, RuleRun, and LearningObservation are
-- real kernel primitives with no persisted table yet — see
-- docs/architecture/decisions/0002-governance-decision-vertical-slice.md
-- for why they're deferred rather than built speculatively.

-- ─── Subject ────────────────────────────────────────────────────────────
-- The first real use of the Subject-registry pattern in this codebase —
-- deliberate: Subject exists precisely so a decision-evaluation primitive
-- never needs a one-off FK per domain the way every other table here does.
create table if not exists intelligence_subjects (
  id                uuid primary key default gen_random_uuid(),
  subject_type      text not null,
  subject_id        text not null,
  canonical_table   text,
  canonical_id      text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint intelligence_subjects_unique unique (subject_type, subject_id)
);

comment on table intelligence_subjects is
  'Persistence for lib/intelligence/core Subject. Generic identity pointer — subject_id is opaque text, not assumed to be a uuid, so it can reference a fixture id, a future vendor id, or an existing Serve OS record id.';

alter table intelligence_subjects enable row level security;
-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this app.

create or replace function intelligence_subjects_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on intelligence_subjects;
create trigger set_updated_at
  before update on intelligence_subjects
  for each row execute function intelligence_subjects_set_updated_at();

-- ─── Historical Fact ────────────────────────────────────────────────────
create table if not exists intelligence_historical_facts (
  id                            uuid primary key default gen_random_uuid(),
  domain                        text not null,
  fact_type                     text not null,
  subject_type                  text not null,
  subject_id                    text not null,
  occurred_at                   timestamptz not null,
  recorded_at                   timestamptz not null default now(),
  -- Minimal, normalized fields only — never a raw vendor payload, never a
  -- full sensitive background report. See lib/intelligence/domains/
  -- compliance/backgroundEligibility/sourceCapability.ts for the retrieval-
  -- metadata shape this payload carries for Background Eligibility findings.
  payload                       jsonb not null default '{}'::jsonb,
  provenance_source_system      text not null,
  provenance_source_record_id   text,
  provenance_confidence         text not null,
  supersedes_fact_id            uuid references intelligence_historical_facts(id),
  created_at                    timestamptz not null default now(),

  constraint intelligence_historical_facts_confidence_check
    check (provenance_confidence in ('confirmed', 'inferred', 'unknown')),

  foreign key (subject_type, subject_id) references intelligence_subjects (subject_type, subject_id)
);

comment on table intelligence_historical_facts is
  'Persistence for lib/intelligence/core HistoricalFact. Immutable once written — a correction is a new row with supersedes_fact_id set, never an update.';

create index if not exists intelligence_historical_facts_subject_idx
  on intelligence_historical_facts (subject_type, subject_id);

alter table intelligence_historical_facts enable row level security;

-- ─── Rule / Rule Version ────────────────────────────────────────────────
create table if not exists intelligence_rules (
  id            uuid primary key default gen_random_uuid(),
  domain        text not null,
  slug          text not null,
  title         text not null,
  description   text not null,
  created_at    timestamptz not null default now(),

  constraint intelligence_rules_slug_unique unique (slug)
);

comment on table intelligence_rules is
  'Persistence for lib/intelligence/core Rule — a name and a purpose only, no logic or parameters of its own.';

alter table intelligence_rules enable row level security;

create table if not exists intelligence_rule_versions (
  id                      uuid primary key default gen_random_uuid(),
  rule_id                 uuid not null references intelligence_rules (id) on delete cascade,
  version                 integer not null,
  trigger_type            text not null,
  parameters              jsonb not null default '{}'::jsonb,
  logic_reference         text not null,
  effective_from          timestamptz not null default now(),
  effective_to            timestamptz,
  changelog_note          text,
  -- The rule version's documentation basis — fixed per version, not per
  -- decision (a given RuleVersion is always justified by the same policy
  -- sections regardless of which subject it classifies). Repo-relative
  -- document paths + section identifiers only; no external legal citation
  -- is asserted here — see docs/architecture/decisions/
  -- 0002-governance-decision-vertical-slice.md.
  policy_references       jsonb not null default '[]'::jsonb,
  authority_references    jsonb not null default '[]'::jsonb,
  created_at              timestamptz not null default now(),

  constraint intelligence_rule_versions_trigger_check
    check (trigger_type in ('event', 'state', 'time')),

  constraint intelligence_rule_versions_unique unique (rule_id, version)
);

comment on table intelligence_rule_versions is
  'Persistence for lib/intelligence/core RuleVersion. Immutable once effective — a threshold or logic change is a new row, never an edit to an existing one.';

alter table intelligence_rule_versions enable row level security;

-- ─── Signal / Evidence ──────────────────────────────────────────────────
create table if not exists intelligence_signals (
  id                uuid primary key default gen_random_uuid(),
  domain            text not null,
  signal_type       text not null,
  subject_type      text not null,
  subject_id        text not null,
  detected_at       timestamptz not null default now(),
  rule_version_id   uuid not null references intelligence_rule_versions (id),
  severity          text not null,
  status            text not null default 'active',
  created_at        timestamptz not null default now(),

  constraint intelligence_signals_severity_check
    check (severity in ('routine', 'monitor', 'important', 'urgent')),
  constraint intelligence_signals_status_check
    check (status in ('active', 'resolved', 'expired')),

  foreign key (subject_type, subject_id) references intelligence_subjects (subject_type, subject_id)
);

comment on table intelligence_signals is
  'Persistence for lib/intelligence/core Signal. Created only by a Rule Engine evaluation, never directly.';

create index if not exists intelligence_signals_subject_idx
  on intelligence_signals (subject_type, subject_id);

alter table intelligence_signals enable row level security;

create table if not exists intelligence_evidence (
  id                        uuid primary key default gen_random_uuid(),
  signal_id                 uuid not null references intelligence_signals (id) on delete cascade,
  reference_kind            text not null,
  reference_fact_id         uuid references intelligence_historical_facts (id),
  -- Reserved for Phase E (docs/architecture/decisions/0001-...md) — never
  -- populated in Phase 1. No FK target exists yet by design.
  reference_knowledge_id    uuid,
  reference_signal_id       uuid references intelligence_signals (id),
  role                      text,
  created_at                timestamptz not null default now(),

  constraint intelligence_evidence_kind_check
    check (reference_kind in ('historical_fact', 'reference_knowledge', 'signal')),
  constraint intelligence_evidence_reference_shape_check check (
    (reference_kind = 'historical_fact' and reference_fact_id is not null and reference_knowledge_id is null and reference_signal_id is null)
    or (reference_kind = 'reference_knowledge' and reference_knowledge_id is not null and reference_fact_id is null and reference_signal_id is null)
    or (reference_kind = 'signal' and reference_signal_id is not null and reference_fact_id is null and reference_knowledge_id is null)
  )
);

comment on table intelligence_evidence is
  'Persistence for lib/intelligence/core Evidence/EvidenceReference. Phase 1 only ever uses reference_kind = historical_fact.';

create index if not exists intelligence_evidence_signal_idx
  on intelligence_evidence (signal_id);

alter table intelligence_evidence enable row level security;

-- ─── Recommendation / Explanation ───────────────────────────────────────
create table if not exists intelligence_recommendations (
  id                              uuid primary key default gen_random_uuid(),
  domain                          text not null,
  recommendation_type             text not null,
  subject_type                    text not null,
  subject_id                      text not null,
  title                           text not null,
  description                     text not null,
  suggested_priority              text not null,
  signal_ids                      uuid[] not null default '{}',
  rule_version_id                 uuid not null references intelligence_rule_versions (id),
  status                          text not null default 'pending',
  -- Persistence-only lineage column, NOT part of the shared TS Recommendation
  -- type — how "new evidence changes the result without erasing the prior
  -- one" is represented. See docs/architecture/decisions/
  -- 0002-governance-decision-vertical-slice.md.
  supersedes_recommendation_id    uuid references intelligence_recommendations (id),
  created_at                      timestamptz not null default now(),

  constraint intelligence_recommendations_priority_check
    check (suggested_priority in ('routine', 'monitor', 'important', 'urgent')),
  constraint intelligence_recommendations_status_check
    check (status in ('pending', 'actioned', 'dismissed', 'expired')),

  foreign key (subject_type, subject_id) references intelligence_subjects (subject_type, subject_id)
);

comment on table intelligence_recommendations is
  'Persistence for lib/intelligence/core Recommendation. Never executes anything itself — advisory only, per Constitution Article II/VIII.';

create index if not exists intelligence_recommendations_subject_idx
  on intelligence_recommendations (subject_type, subject_id, created_at desc);

alter table intelligence_recommendations enable row level security;

create table if not exists intelligence_explanations (
  id                                     uuid primary key default gen_random_uuid(),
  recommendation_id                      uuid not null references intelligence_recommendations (id) on delete cascade,
  deterministic_rule_version_id          uuid not null references intelligence_rule_versions (id),
  deterministic_evidence_ids             uuid[] not null default '{}',
  deterministic_what_happened            text not null,
  deterministic_why_flagged              text not null,
  narrative_summary                      text not null,
  narrative_recommended_consideration    text not null,
  narrative_ai_assisted                  boolean not null default false,
  context_snapshot_metadata              jsonb,
  generated_at                           timestamptz not null default now(),

  constraint intelligence_explanations_recommendation_unique unique (recommendation_id)
);

comment on table intelligence_explanations is
  'Persistence for lib/intelligence/core Explanation. A frozen snapshot, created atomically with its Recommendation and never regenerated.';

alter table intelligence_explanations enable row level security;

-- ─── Idempotent lookup helper ────────────────────────────────────────────
-- Mirrors intake_find_settled_record's pattern exactly (20260721000000).
create or replace function intelligence_find_settled_recommendation(
  p_subject_type text,
  p_subject_id text,
  p_rule_version_id uuid
)
returns intelligence_recommendations
language sql
stable
set search_path = public
as $$
  select * from intelligence_recommendations
  where subject_type = p_subject_type
    and subject_id = p_subject_id
    and rule_version_id = p_rule_version_id
    and status <> 'dismissed'
  order by created_at desc
  limit 1;
$$;

revoke execute on function intelligence_find_settled_recommendation(text, text, uuid) from public;
grant execute on function intelligence_find_settled_recommendation(text, text, uuid) to service_role;

-- ─── Rule/RuleVersion upsert ─────────────────────────────────────────────
-- Rule identity is stable (one row per slug); RuleVersion is immutable once
-- created — this function creates both on first use and simply returns the
-- existing rule_version_id on every subsequent call for the same
-- (slug, version) pair.
create or replace function intelligence_ensure_rule_version(
  p_domain text,
  p_rule_slug text,
  p_rule_title text,
  p_rule_description text,
  p_version integer,
  p_trigger_type text,
  p_parameters jsonb,
  p_logic_reference text,
  p_policy_references jsonb,
  p_authority_references jsonb,
  p_changelog_note text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_rule_id uuid;
  v_rule_version_id uuid;
begin
  insert into intelligence_rules (domain, slug, title, description)
  values (p_domain, p_rule_slug, p_rule_title, p_rule_description)
  on conflict (slug) do update
    set title = excluded.title,
        description = excluded.description
  returning id into v_rule_id;

  select id into v_rule_version_id
  from intelligence_rule_versions
  where rule_id = v_rule_id and version = p_version;

  if v_rule_version_id is null then
    insert into intelligence_rule_versions (
      rule_id, version, trigger_type, parameters, logic_reference,
      policy_references, authority_references, changelog_note
    ) values (
      v_rule_id, p_version, p_trigger_type, p_parameters, p_logic_reference,
      p_policy_references, p_authority_references, p_changelog_note
    )
    returning id into v_rule_version_id;
  end if;

  return v_rule_version_id;
end;
$$;

revoke execute on function intelligence_ensure_rule_version(
  text, text, text, text, integer, text, jsonb, text, jsonb, jsonb, text
) from public;
grant execute on function intelligence_ensure_rule_version(
  text, text, text, text, integer, text, jsonb, text, jsonb, jsonb, text
) to service_role;

-- ─── Core atomic decision recorder ───────────────────────────────────────
-- Everything below is already decided by the pure TypeScript engine
-- (lib/intelligence/domains/compliance/backgroundEligibility/*.ts and
-- lib/intelligence/decisionEngine/evaluate.ts) before this function is
-- called. This function's only job is the atomic write: Subject (upsert),
-- one HistoricalFact, one Signal, one Evidence row linking them, one
-- Recommendation, and its Explanation — or nothing, on failure.
--
-- p_force: bypasses the idempotency short-circuit — set true only when the
-- caller has already resolved p_supersedes_recommendation_id via
-- intelligence_find_settled_recommendation (a genuine re-evaluation with
-- new evidence). Automatic/default evaluation always passes false.
create or replace function record_decision(
  p_subject_type text,
  p_subject_id text,
  p_subject_canonical_table text,
  p_subject_canonical_id text,
  p_domain text,
  p_fact_type text,
  p_fact_occurred_at timestamptz,
  p_fact_payload jsonb,
  p_fact_provenance_source_system text,
  p_fact_provenance_source_record_id text,
  p_fact_provenance_confidence text,
  p_rule_version_id uuid,
  p_signal_type text,
  p_signal_severity text,
  p_recommendation_type text,
  p_recommendation_title text,
  p_recommendation_description text,
  p_recommendation_priority text,
  p_explanation_what_happened text,
  p_explanation_why_flagged text,
  p_explanation_summary text,
  p_explanation_recommended_consideration text,
  p_supersedes_recommendation_id uuid default null,
  p_force boolean default false
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_existing intelligence_recommendations;
  v_fact_id uuid;
  v_signal_id uuid;
  v_evidence_id uuid;
  v_recommendation_id uuid;
begin
  if not p_force then
    -- FOUND is not set by a plain function-call assignment — check the
    -- returned row's id directly (the same gotcha documented in
    -- process_website_intake_submission, 20260721000000).
    v_existing := intelligence_find_settled_recommendation(p_subject_type, p_subject_id, p_rule_version_id);
    if v_existing.id is not null then
      return v_existing.id;
    end if;
  end if;

  insert into intelligence_subjects (subject_type, subject_id, canonical_table, canonical_id)
  values (p_subject_type, p_subject_id, p_subject_canonical_table, p_subject_canonical_id)
  on conflict (subject_type, subject_id) do update
    set canonical_table = coalesce(excluded.canonical_table, intelligence_subjects.canonical_table),
        canonical_id = coalesce(excluded.canonical_id, intelligence_subjects.canonical_id),
        updated_at = now();

  insert into intelligence_historical_facts (
    domain, fact_type, subject_type, subject_id, occurred_at, payload,
    provenance_source_system, provenance_source_record_id, provenance_confidence
  ) values (
    p_domain, p_fact_type, p_subject_type, p_subject_id, p_fact_occurred_at, p_fact_payload,
    p_fact_provenance_source_system, p_fact_provenance_source_record_id, p_fact_provenance_confidence
  )
  returning id into v_fact_id;

  insert into intelligence_signals (
    domain, signal_type, subject_type, subject_id, rule_version_id, severity
  ) values (
    p_domain, p_signal_type, p_subject_type, p_subject_id, p_rule_version_id, p_signal_severity
  )
  returning id into v_signal_id;

  insert into intelligence_evidence (signal_id, reference_kind, reference_fact_id, role)
  values (v_signal_id, 'historical_fact', v_fact_id, 'trigger')
  returning id into v_evidence_id;

  insert into intelligence_recommendations (
    domain, recommendation_type, subject_type, subject_id, title, description,
    suggested_priority, signal_ids, rule_version_id, supersedes_recommendation_id
  ) values (
    p_domain, p_recommendation_type, p_subject_type, p_subject_id, p_recommendation_title, p_recommendation_description,
    p_recommendation_priority, array[v_signal_id], p_rule_version_id, p_supersedes_recommendation_id
  )
  returning id into v_recommendation_id;

  insert into intelligence_explanations (
    recommendation_id, deterministic_rule_version_id, deterministic_evidence_ids,
    deterministic_what_happened, deterministic_why_flagged,
    narrative_summary, narrative_recommended_consideration, narrative_ai_assisted
  ) values (
    v_recommendation_id, p_rule_version_id, array[v_evidence_id],
    p_explanation_what_happened, p_explanation_why_flagged,
    p_explanation_summary, p_explanation_recommended_consideration, false
  );

  return v_recommendation_id;
end;
$$;

revoke execute on function record_decision(
  text, text, text, text, text, text, timestamptz, jsonb, text, text, text,
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, boolean
) from public;
grant execute on function record_decision(
  text, text, text, text, text, text, timestamptz, jsonb, text, text, text,
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, boolean
) to service_role;

commit;
