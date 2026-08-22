begin;

-- Community Roster Import + Reconciliation phase — extends the existing
-- Watermere roster reconciliation tables (20260804000000) rather than
-- building parallel ones. That system predates communities.community_id
-- and person_vendor_identity_links entirely (community_code text only,
-- no identity-link writes) and is CLI-only, never run against production
-- (confirmed: no data/imports/ directory, no committed resolve-file,
-- single commit in git history). Its pure matching/reconciliation logic
-- (lib/residents/roster/matching.ts, reconcile.ts) is genuinely good and
-- stays completely unmodified; this migration only widens the tables so
-- a new, parallel, web-based, identity-integrated import path can use
-- them too. scripts/importWatermereRoster.ts's own writes are fully
-- backward compatible: it never sets roster_import_runs.status itself
-- (always the table default 'completed', which remains a valid value
-- below), and never touches any of the new columns.

-- ─── roster_import_runs ─────────────────────────────────────────────────
alter table public.roster_import_runs
  add column if not exists community_id uuid references public.communities(id);
alter table public.roster_import_runs
  add column if not exists storage_path text;
alter table public.roster_import_runs
  add column if not exists matching_rule_version text not null default '1';

create index if not exists roster_import_runs_community_id_idx
  on public.roster_import_runs (community_id, imported_at desc);

-- Idempotent widen, same pattern already used repeatedly in this project.
-- community_code stays not-null (the legacy CLI still writes only that);
-- community_id is populated and required by the new web upload path at
-- the application layer, never inferred, never defaulted, never null for
-- a new run created through that path.
alter table public.roster_import_runs
  drop constraint if exists roster_import_runs_status_check;
alter table public.roster_import_runs
  add constraint roster_import_runs_status_check
  check (status in ('completed', 'failed', 'analyzing', 'pending_review', 'partially_committed', 'committed', 'cancelled'));

comment on column public.roster_import_runs.community_id is
  'Canonical community this import belongs to (Community Roster Import + Reconciliation phase). Required and immutable once set by the new web upload path -- never touched by scripts/importWatermereRoster.ts, which only ever wrote community_code.';

-- ─── roster_source_rows ─────────────────────────────────────────────────
-- resolution_status (existing) is what the deterministic matcher found.
-- review_state (new) is the separate, persisted OPERATIONAL lifecycle a
-- human/commit action moves a row through -- what makes an import
-- resumable across sessions and gives two concurrent operators a real
-- "already resolved" answer instead of a race. The legacy CLI never reads
-- or writes this column, so it defaults harmlessly to 'pending' on any
-- (nonexistent, in practice) legacy row.
alter table public.roster_source_rows
  add column if not exists review_state text not null default 'pending';
alter table public.roster_source_rows
  add constraint roster_source_rows_review_state_check
  check (review_state in ('pending', 'approved_match', 'approved_new', 'deferred', 'invalid', 'committed', 'failed'));

-- The roster OBSERVATION identity ("this row, in this run") -- explicitly
-- not a durable person identity across later rosters (no stable per-
-- person ID exists in the Watermere Building-sheet format). Format:
-- '{import_run_id}:{source_row_number}'. Used as person_vendor_identity_links.vendor_record_id
-- for this row's proposed/confirmed link.
alter table public.roster_source_rows
  add column if not exists source_record_id text;
alter table public.roster_source_rows
  add column if not exists decided_by text;
alter table public.roster_source_rows
  add column if not exists decided_at timestamptz;

-- Guards against a double-submit resolving the same row twice within one
-- run (section 63's concurrency requirement) -- partial, so legacy rows
-- (source_record_id always null) are entirely unaffected.
create unique index if not exists roster_source_rows_run_source_record_idx
  on public.roster_source_rows (import_run_id, source_record_id)
  where source_record_id is not null;

comment on column public.roster_source_rows.review_state is
  'Operational review/commit lifecycle for this row (Community Roster Import + Reconciliation phase) -- distinct from resolution_status, which is the matcher''s own classification. Never written by scripts/importWatermereRoster.ts.';
comment on column public.roster_source_rows.source_record_id is
  'This roster OBSERVATION''s identity ("{import_run_id}:{source_row_number}"), used as person_vendor_identity_links.vendor_record_id -- not a durable person identity across later roster uploads. Resident-level idempotency across re-uploads comes from re-running canonical matching, not from this id being stable.';

commit;
