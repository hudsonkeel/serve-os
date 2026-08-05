begin;

-- Recruiting Lead Flight — supervised, real-data evidence collection from
-- Apploi and Viventium for one explicitly approved recruiting lead. See
-- docs/architecture/RECRUITING_LEAD_FLIGHT_PLAN.md for the full design.
--
-- This migration is deliberately narrow: two new, additive tables. It does
-- NOT modify recruiting_leads in any way — no new column, no new
-- constraint, no trigger. Vendor observations, derived hiring state, and
-- the existing recruiting_leads.status remain three separate things; this
-- schema only ever stores the first of those. Nothing here ever writes to
-- recruiting_leads.status — see lib/data/recruitingLeadCollector.ts, which
-- has no function capable of it.

-- ─── Collector Runs ────────────────────────────────────────────────────────
-- One row per (vendor, attempt). Append-only in practice: a re-run creates
-- a new row rather than updating a prior one, so every attempt — including
-- failed ones — remains part of the permanent record.
create table if not exists recruiting_lead_collector_runs (
  id                  uuid primary key default gen_random_uuid(),
  recruiting_lead_id  uuid not null references public.recruiting_leads(id),

  source_system       text not null,
  initiated_by        text not null,

  started_at          timestamptz not null default now(),
  completed_at        timestamptz,

  status               text not null default 'in_progress',
  match_status         text,
  error_category       text,

  -- This flight's isolation tag — see lib/recruiting/flightMarker.ts.
  -- Distinct from relationships' test_marker convention on purpose: this is
  -- real evidence about a real, explicitly approved person, not synthetic
  -- test data. The tag exists so it can be identified and removed later
  -- (scripts/cleanup-test-data.ts --flight-marker=<value>) without a
  -- retention decision being made here.
  flight_marker        text not null,

  created_at           timestamptz not null default now(),

  constraint recruiting_lead_collector_runs_source_system_check
    check (source_system in ('apploi', 'viventium')),

  constraint recruiting_lead_collector_runs_status_check
    check (status in ('in_progress', 'success', 'failed', 'partial')),

  constraint recruiting_lead_collector_runs_match_status_check
    check (match_status is null or match_status in (
      'found', 'not_found', 'ambiguous_multiple_matches', 'search_incomplete'
    )),

  -- error_category is populated only when status = 'failed' — mirrors the
  -- AxisCareError category discipline (lib/integrations/axiscare/errors.ts):
  -- always a safe, closed category, never a raw vendor error message.
  constraint recruiting_lead_collector_runs_error_fields_check
    check (
      (status <> 'failed' and error_category is null)
      or (status = 'failed')
    )
);

create index if not exists recruiting_lead_collector_runs_lead_idx
  on recruiting_lead_collector_runs (recruiting_lead_id, source_system, created_at desc);

create index if not exists recruiting_lead_collector_runs_flight_marker_idx
  on recruiting_lead_collector_runs (flight_marker);

alter table recruiting_lead_collector_runs enable row level security;
-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this app.

-- ─── Observations ──────────────────────────────────────────────────────────
-- One row per field read during a Collector Run. Never updated — a re-read
-- produces new rows under a new collector_run_id, exactly like a Historical
-- Fact. recruiting_lead_id is denormalized here (also reachable via
-- collector_run_id) purely to make "every observation for this lead"
-- queryable without a join, matching this codebase's existing convention of
-- denormalizing a stable parent reference onto a child table.
create table if not exists recruiting_lead_observations (
  id                  uuid primary key default gen_random_uuid(),
  collector_run_id    uuid not null references public.recruiting_lead_collector_runs(id),
  recruiting_lead_id  uuid not null references public.recruiting_leads(id),

  observation_key     text not null,
  raw_label           text,
  normalized_value    text,

  -- 'directly_observed' | 'not_visible' | 'not_applicable' — never a fourth
  -- value meaning "false"/"did not happen". 'not_visible' is the explicit
  -- absence of a fact, not a negative fact. See
  -- lib/recruiting/deriveHiringSynthesis.ts, which is structurally unable
  -- to treat 'not_visible' as a negative requirement status.
  visibility           text not null,

  observed_at          timestamptz not null,
  created_at           timestamptz not null default now(),

  constraint recruiting_lead_observations_key_not_blank
    check (length(trim(observation_key)) > 0),

  constraint recruiting_lead_observations_visibility_check
    check (visibility in ('directly_observed', 'not_visible', 'not_applicable'))
);

create index if not exists recruiting_lead_observations_lead_idx
  on recruiting_lead_observations (recruiting_lead_id, observation_key, observed_at desc);

create index if not exists recruiting_lead_observations_run_idx
  on recruiting_lead_observations (collector_run_id);

alter table recruiting_lead_observations enable row level security;

revoke all on recruiting_lead_collector_runs from public, anon, authenticated;
grant all on recruiting_lead_collector_runs to service_role;

revoke all on recruiting_lead_observations from public, anon, authenticated;
grant all on recruiting_lead_observations to service_role;

commit;
