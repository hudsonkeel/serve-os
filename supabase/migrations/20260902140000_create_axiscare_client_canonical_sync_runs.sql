begin;

-- AxisCare Client Data Sync — run history. Organization-wide log, one row
-- per orchestrated run (manual "Sync Now," scheduled, or a single
-- post-identity-confirmation sync), never per-resident — mirrors
-- workforce_axiscare_sync_runs' exact shape and discipline
-- (20260808000000_create_workforce_intelligence_platform.sql): same
-- status vocabulary shape, same started_at/completed_at/initiated_by
-- fields, same jsonb errors array. Not the same table — that one's
-- counters (profiles_created/refreshed) are specific to the workforce
-- caregiver sync and don't describe this integration's own outcomes
-- (residents synced/conflicted/failed/skipped) — but the same, already-
-- proven pattern, not a new audit platform.
create table if not exists axiscare_client_canonical_sync_runs (
  id                    uuid primary key default gen_random_uuid(),

  status                text not null default 'in_progress',
  trigger               text not null,
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,

  residents_attempted   integer not null default 0,
  residents_succeeded   integer not null default 0,
  residents_conflicted  integer not null default 0,
  residents_failed      integer not null default 0,
  residents_skipped     integer not null default 0,
  errors                jsonb not null default '[]'::jsonb,

  initiated_by          text not null,

  constraint axiscare_client_canonical_sync_runs_status_check
    check (status in ('in_progress', 'success', 'failed', 'partial')),
  constraint axiscare_client_canonical_sync_runs_trigger_check
    check (trigger in ('manual', 'scheduled', 'identity_confirmation')),
  constraint axiscare_client_canonical_sync_runs_initiated_by_not_blank
    check (length(trim(initiated_by)) > 0)
);

create index if not exists axiscare_client_canonical_sync_runs_started_idx
  on axiscare_client_canonical_sync_runs (started_at desc);

alter table axiscare_client_canonical_sync_runs enable row level security;
-- RLS: service role bypasses this automatically, matching every other
-- table in this integration. No policies defined — the anon key has zero
-- access.

comment on table axiscare_client_canonical_sync_runs is
  'Run history for AxisCare Client Data Sync (product name) / the canonical bootstrap orchestrator (internal implementation name) — one row per manual/scheduled/post-identity-confirmation run.';

revoke all on axiscare_client_canonical_sync_runs from public, anon, authenticated;
grant all on axiscare_client_canonical_sync_runs to service_role;

commit;
