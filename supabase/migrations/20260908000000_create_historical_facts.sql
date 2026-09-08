begin;

-- Serve Intelligence Platform — first real persistence for the shared
-- HistoricalFact primitive (see lib/intelligence/core/facts.ts and
-- docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md Article VI/X).
--
-- One table shared by every intelligence domain, not a domain-owned copy —
-- this is the specific thing Article X warns against ("a domain that finds
-- itself designing its own version of a Fact table has drifted"). The first
-- writer is scheduling.visit_recorded (see lib/scheduling/visitFacts.ts);
-- a future financial.* Fact, once authoritative source data exists, would
-- insert into this same table rather than a new one.
--
-- Column names map directly to HistoricalFact's fields (facts.ts) plus its
-- SubjectReference and SourceProvenance components, flattened. Nothing here
-- was added without a corresponding field on the existing type.
create table if not exists public.historical_facts (
  id                     uuid primary key default gen_random_uuid(),

  -- IntelligenceDomain, e.g. 'scheduling' — open-ended, not a check
  -- constraint, matching shared.ts's deliberately open union.
  domain                 text not null,
  -- NamespacedIdentifier "<domain>.<event>", e.g. 'scheduling.visit_recorded'.
  fact_type              text not null,

  -- SubjectReference, flattened. subject_id intentionally has no foreign
  -- key here: SubjectType is open-ended (shared.ts) and this table must
  -- not hardcode which canonical table each subject_type points at.
  subject_type           text not null,
  subject_id             uuid not null,

  -- OccurrenceTimestamps: when it happened in reality vs. when Serve
  -- recorded it (facts.ts). recorded_at is what "current version" queries
  -- order by — see the historical_facts_current view below.
  occurred_at            timestamptz not null,
  recorded_at            timestamptz not null default now(),

  -- Minimal, normalized fields only — never a raw vendor blob (facts.ts's
  -- own doc comment). Enforced by code review / the normalizer, not by
  -- this table.
  payload                jsonb not null,

  -- SourceProvenance, flattened.
  source_system          text not null,
  source_record_id       text,
  provenance_confidence  text not null
    check (provenance_confidence in ('confirmed', 'inferred', 'unknown')),

  -- A correction is a NEW Fact whose supersedes_fact_id points at the Fact
  -- it corrects. The superseded Fact is never edited or deleted (facts.ts).
  supersedes_fact_id     uuid references public.historical_facts(id),

  created_at             timestamptz not null default now()
);

-- Supports the natural-key lookup ingestion uses to decide
-- unchanged/insert-new/insert-superseding (source_record_id is nullable —
-- see facts.ts's SourceProvenance — so this is a plain index, not a unique
-- constraint; "one current Fact per natural key" is an ingestion-time
-- discipline, matching Engineering Standards §3's dedup-key-as-documentation
-- stance, not a DB-enforced constraint).
create index if not exists historical_facts_natural_key_idx
  on public.historical_facts (source_system, source_record_id, fact_type, recorded_at desc);

-- Supports metric queries filtering by fact type over a time window.
create index if not exists historical_facts_type_time_idx
  on public.historical_facts (fact_type, occurred_at);

-- Supports drill-down and per-subject queries.
create index if not exists historical_facts_subject_idx
  on public.historical_facts (subject_type, subject_id);

create index if not exists historical_facts_supersedes_idx
  on public.historical_facts (supersedes_fact_id);

-- "Current" Fact per natural key = the row with the latest recorded_at for
-- that (source_system, source_record_id, fact_type) — true by construction,
-- since every correction is inserted with a later recorded_at than what it
-- supersedes. This is simpler and more robust than walking the
-- supersedes_fact_id chain, and gives every consumer one place to query
-- "current" without re-deriving this rule. See
-- lib/intelligence/persistence/historicalFacts.ts's selectCurrentFacts()
-- for the equivalent in-memory version used where a batch is already in
-- hand and a second round-trip would be wasteful.
--
-- recorded_at and created_at both default to now() at insert time, so in
-- the current ingestion path they're always equal — created_at is
-- included here anyway so this ordering stays correct if a future
-- ingestion path ever sets them differently (e.g. a backdated correction)
-- without needing this view revisited. id is the final, purely-for-
-- stability tiebreak: it carries no chronological meaning, but guarantees
-- the exact same row wins on every evaluation even in the (very unlikely,
-- but not impossible) case of two Facts sharing both timestamps —
-- "distinct on" is otherwise free to pick either arbitrarily.
create or replace view public.historical_facts_current as
select distinct on (source_system, source_record_id, fact_type)
  *
from public.historical_facts
order by source_system, source_record_id, fact_type, recorded_at desc, created_at desc, id desc;

alter table public.historical_facts enable row level security;
revoke all on public.historical_facts from public, anon, authenticated;
grant all on public.historical_facts to service_role;

comment on table public.historical_facts is
  'Shared, immutable Historical Fact persistence (Serve Intelligence Constitution Article VI/X) — one table for every domain. First writer: scheduling.visit_recorded. Corrections are new rows (supersedes_fact_id), never mutations. Query historical_facts_current for the latest version per natural key.';

-- ROLLBACK:
--
--   drop view if exists public.historical_facts_current;
--   drop table if exists public.historical_facts;

commit;
