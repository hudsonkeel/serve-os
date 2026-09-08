begin;

-- Serve Intelligence Platform — first real persistence for the shared
-- HistoricalFact primitive (see lib/intelligence/core/facts.ts and
-- docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md Article VI/X).
--
-- One table shared by every intelligence domain, not a domain-owned copy.
-- The first writer is scheduling.visit_recorded.
--
-- Future financial.* Facts, once authoritative source data exists, should
-- use this same persistence layer rather than creating another Fact table.
--
-- Historical Facts are immutable:
--   - new source record      -> insert Fact
--   - unchanged source record -> no-op
--   - corrected source record -> insert new Fact that supersedes prior Fact
--
-- Never destructively update historical truth.

create table if not exists public.historical_facts (
  id uuid primary key default gen_random_uuid(),

  -- IntelligenceDomain, e.g. 'scheduling'.
  -- Intentionally open-ended to match the shared intelligence types.
  domain text not null,

  -- NamespacedIdentifier, e.g. 'scheduling.visit_recorded'.
  fact_type text not null,

  -- SubjectReference, flattened.
  --
  -- No FK is intentionally imposed because SubjectType is open-ended and
  -- different subject types resolve to different canonical Serve entities.
  subject_type text not null,
  subject_id uuid not null,

  -- When the underlying event occurred versus when Serve recorded this
  -- particular representation of it.
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),

  -- Minimal normalized Serve-owned fields only.
  -- Do not persist an unfiltered/raw vendor payload here.
  payload jsonb not null,

  -- SourceProvenance, flattened.
  source_system text not null,

  -- Persisted Historical Facts require a stable source identity because
  -- source_record_id participates in:
  --   - idempotent ingestion
  --   - supersession
  --   - current-version resolution
  --   - source provenance
  --   - drill-down
  --
  -- Even Serve-generated Facts should receive a stable Serve-owned source
  -- record identity rather than NULL.
  source_record_id text not null,

  provenance_confidence text not null
    check (
      provenance_confidence in (
        'confirmed',
        'inferred',
        'unknown'
      )
    ),

  -- A correction is represented as a NEW Fact pointing to the Fact it
  -- supersedes. The superseded Fact remains immutable.
  supersedes_fact_id uuid
    references public.historical_facts(id),

  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

-- Primary natural-key/current-version lookup used by ingestion.
--
-- This is intentionally not UNIQUE. Multiple rows with the same natural
-- source identity are expected when a source record changes over time.
-- Supersession + recorded_at determine historical versions.
create index if not exists historical_facts_natural_key_idx
  on public.historical_facts (
    source_system,
    source_record_id,
    fact_type,
    recorded_at desc
  );

-- Metric and historical queries by Fact type and occurrence period.
create index if not exists historical_facts_type_time_idx
  on public.historical_facts (
    fact_type,
    occurred_at
  );

-- Drill-down and per-subject queries.
create index if not exists historical_facts_subject_idx
  on public.historical_facts (
    subject_type,
    subject_id
  );

-- Supersession-chain inspection.
create index if not exists historical_facts_supersedes_idx
  on public.historical_facts (
    supersedes_fact_id
  );

-- ---------------------------------------------------------------------------
-- CURRENT FACT VIEW
-- ---------------------------------------------------------------------------

-- One current Fact per natural source identity:
--
--   source_system
--   + source_record_id
--   + fact_type
--
-- recorded_at is the primary chronological selector.
--
-- created_at provides a deterministic secondary selector if a future
-- ingestion path deliberately supplies recorded_at.
--
-- id is a final deterministic tie-breaker if both timestamps are identical.
--
-- security_invoker=true ensures queries against this view execute with the
-- permissions of the caller rather than unintentionally bypassing the
-- security posture of historical_facts.

create or replace view public.historical_facts_current
with (security_invoker = true)
as
select distinct on (
  source_system,
  source_record_id,
  fact_type
)
  *
from public.historical_facts
order by
  source_system,
  source_record_id,
  fact_type,
  recorded_at desc,
  created_at desc,
  id desc;

-- ---------------------------------------------------------------------------
-- SECURITY
-- ---------------------------------------------------------------------------

alter table public.historical_facts enable row level security;

-- Historical intelligence Facts are backend-only infrastructure.
--
-- No browser/client role receives direct access. Application access should
-- occur through trusted server-side code using service_role or through
-- deliberately designed future server-side interfaces.

revoke all on public.historical_facts
  from public, anon, authenticated;

grant all on public.historical_facts
  to service_role;

-- Explicitly secure the view as well.
--
-- Do not rely on implicit/default view privileges.

revoke all on public.historical_facts_current
  from public, anon, authenticated;

grant select on public.historical_facts_current
  to service_role;

-- ---------------------------------------------------------------------------
-- DOCUMENTATION
-- ---------------------------------------------------------------------------

comment on table public.historical_facts is
  'Shared immutable Historical Fact persistence for the Serve Intelligence Platform. One table serves all intelligence domains. Corrections create new rows linked through supersedes_fact_id; historical Facts are never destructively rewritten.';

comment on view public.historical_facts_current is
  'Current Historical Fact per (source_system, source_record_id, fact_type), selected deterministically by recorded_at DESC, created_at DESC, id DESC. Backend/service-role access only.';

comment on column public.historical_facts.domain is
  'Serve Intelligence domain that owns the Fact semantics, e.g. scheduling.';

comment on column public.historical_facts.fact_type is
  'Namespaced Serve Fact identifier, e.g. scheduling.visit_recorded.';

comment on column public.historical_facts.subject_type is
  'Canonical Serve subject type associated with the Fact.';

comment on column public.historical_facts.subject_id is
  'Canonical Serve identifier for the Fact subject.';

comment on column public.historical_facts.occurred_at is
  'Timestamp when the represented event occurred in reality.';

comment on column public.historical_facts.recorded_at is
  'Timestamp when this representation/version of the Fact was recorded by Serve.';

comment on column public.historical_facts.payload is
  'Minimal normalized Serve-owned Fact payload; never intended as an unfiltered raw vendor payload.';

comment on column public.historical_facts.source_system is
  'System from which the underlying evidence originated, e.g. axiscare or serve_os.';

comment on column public.historical_facts.source_record_id is
  'Stable source-system identity used for idempotency, supersession, current-version resolution, and provenance drill-down. Required for persisted Historical Facts.';

comment on column public.historical_facts.provenance_confidence is
  'Confidence classification for source provenance: confirmed, inferred, or unknown.';

comment on column public.historical_facts.supersedes_fact_id is
  'Prior Historical Fact corrected or replaced by this immutable Fact version.';

-- ---------------------------------------------------------------------------
-- ROLLBACK REFERENCE
-- ---------------------------------------------------------------------------
--
-- If this migration must be manually reversed before dependent objects exist:
--
--   drop view if exists public.historical_facts_current;
--   drop table if exists public.historical_facts;
--
-- Do not use this rollback casually after Historical Facts have begun
-- accumulating in production.

commit;
