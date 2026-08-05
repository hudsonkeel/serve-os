begin;

-- Watermere Official Roster Reconciliation. First code path in this
-- repository that legitimately creates/updates real `residents` rows
-- (every prior import — e.g. scripts/importResidentSourceNotes.ts —
-- explicitly never touches residents). Fully additive: no column is
-- added to `residents` itself, and no existing constraint is changed.
--
-- Scope boundary (see the governing plan): the actual CHECK constraint,
-- if any, on residents.status/is_active/relationship_status could not be
-- confirmed in this session (no information_schema access via PostgREST,
-- no raw SQL access). No RPC here ever writes to those three columns for
-- an existing resident, even when a human explicitly provides a
-- disposition (moved_out/deceased/transferred) via the review-resolution
-- file — the disposition is recorded durably and attributably on
-- roster_absence_reviews, never auto-applied to the resident's canonical
-- status. Applying a confirmed disposition to residents.status is an
-- explicit next step once the constraint is confirmed and an
-- authorization model exists.

-- ─── roster_import_runs: one row per script execution (dry or apply) ────
create table if not exists roster_import_runs (
  id                       uuid primary key default gen_random_uuid(),
  community_code           text not null,
  source_type              text not null default 'watermere_official_roster',
  source_filename          text not null,
  source_hash              text not null,
  source_effective_date    date,
  imported_at              timestamptz not null default now(),
  imported_by              text not null,
  mode                     text not null,
  status                   text not null default 'completed',
  total_source_rows        integer,
  matched_count            integer,
  apartment_change_count   integer,
  new_resident_count       integer,
  ambiguous_count          integer,
  duplicate_source_count   integer,
  absent_existing_count    integer,
  no_op_count              integer,
  applied_at               timestamptz,
  implementation_version   text not null default '1',

  constraint roster_import_runs_mode_check check (mode in ('dry_run', 'apply')),
  constraint roster_import_runs_status_check check (status in ('completed', 'failed'))
);

create index if not exists roster_import_runs_community_idx
  on roster_import_runs (community_code, imported_at desc);

alter table roster_import_runs enable row level security;
-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this app.

comment on table roster_import_runs is
  'One row per Watermere roster reconciliation execution (dry run or apply) — run-level audit trail and idempotency anchor (source_hash detects a byte-identical rerun).';

-- ─── roster_source_rows: one row per Building-sheet person, per run ─────
create table if not exists roster_source_rows (
  id                    uuid primary key default gen_random_uuid(),
  import_run_id         uuid not null references public.roster_import_runs(id) on delete cascade,

  source_sheet          text not null,
  source_row_number     integer not null,
  raw_payload           jsonb not null,
  normalized_payload    jsonb not null,

  resolution_status     text not null,
  matched_resident_id   uuid references public.residents(id),
  match_method          text,
  match_confidence      text,
  review_notes          text,

  created_at            timestamptz not null default now(),

  constraint roster_source_rows_resolution_status_check
    check (resolution_status in (
      'exact_match', 'apartment_change', 'new_resident', 'ambiguous', 'possible_duplicate', 'conflict', 'skipped'
    ))
);

create index if not exists roster_source_rows_run_idx on roster_source_rows (import_run_id);
create index if not exists roster_source_rows_resident_idx on roster_source_rows (matched_resident_id);

alter table roster_source_rows enable row level security;

comment on table roster_source_rows is
  'One row per source person per reconciliation run — raw + normalized payload, resolution outcome, and match reasoning. The durable "why" behind every roster-driven decision.';

-- ─── resident_apartment_history: durable occupancy history ──────────────
-- No existing occupancy/apartment-history model exists anywhere in this
-- codebase (confirmed by inspection) — residents.unit_number/building are
-- single current-value fields with no history. This table is additive and
-- new; it never replaces or restructures those columns, only supplements
-- them with a durable, queryable history any time this reconciliation (or
-- a future one) changes them.
create table if not exists resident_apartment_history (
  id                uuid primary key default gen_random_uuid(),
  resident_id       uuid not null references public.residents(id),
  community_code    text,
  unit_number       text,
  building          text,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  status            text not null default 'current',
  source_type       text not null default 'watermere_official_roster',
  import_run_id     uuid references public.roster_import_runs(id),
  recorded_at       timestamptz not null default now(),
  recorded_by       text not null,

  constraint resident_apartment_history_status_check check (status in ('current', 'former')),

  constraint resident_apartment_history_ended_fields_check
    check (
      (status = 'current' and ended_at is null)
      or (status = 'former' and ended_at is not null)
    )
);

-- At most one current occupancy per resident.
create unique index if not exists resident_apartment_history_one_current_idx
  on resident_apartment_history (resident_id)
  where status = 'current';

create index if not exists resident_apartment_history_resident_idx
  on resident_apartment_history (resident_id, started_at desc);

alter table resident_apartment_history enable row level security;

comment on table resident_apartment_history is
  'Durable apartment-occupancy history per resident — an apartment change updates residents.unit_number/building AND closes the prior row here, so a change is never a silent overwrite.';

-- ─── roster_absence_reviews: durable, human-decided review queue ────────
-- An existing resident not matched by any row in a roster run is NEVER
-- assumed dead, moved out, or inactive (see the governing plan's "never
-- infer death"/"never infer move-out" rules). This table is the durable
-- queue that holds that observation until a human explicitly records a
-- disposition — and even then, applying the disposition to the
-- resident's own status is intentionally deferred (see the module
-- comment above).
create table if not exists roster_absence_reviews (
  id                          uuid primary key default gen_random_uuid(),
  resident_id                 uuid not null references public.residents(id),
  import_run_id               uuid not null references public.roster_import_runs(id),
  community_code              text,
  last_known_unit_number      text,

  observed_at                 timestamptz not null default now(),
  status                      text not null default 'requires_review',

  disposition                 text,
  disposition_reason          text,
  disposition_effective_date  date,
  decided_by                  text,
  decided_at                  timestamptz,
  notes                       text,

  constraint roster_absence_reviews_status_check check (status in ('requires_review', 'resolved')),
  constraint roster_absence_reviews_disposition_check
    check (disposition is null or disposition in ('moved_out', 'deceased', 'transferred', 'still_active', 'unknown')),

  constraint roster_absence_reviews_resolution_fields_check
    check (
      (status = 'requires_review' and disposition is null and decided_at is null and decided_by is null)
      or (status = 'resolved' and disposition is not null and decided_at is not null and decided_by is not null)
    )
);

-- At most one OPEN review per resident — re-observing an already-open
-- absence updates it in place (see record_roster_absence below) rather
-- than creating a duplicate.
create unique index if not exists roster_absence_reviews_one_open_idx
  on roster_absence_reviews (resident_id)
  where status = 'requires_review';

create index if not exists roster_absence_reviews_resident_idx on roster_absence_reviews (resident_id);

alter table roster_absence_reviews enable row level security;

comment on table roster_absence_reviews is
  'Durable review queue for existing residents not found on the latest official roster. Observing an absence never changes the resident record itself; resolving one records an explicit, attributed human disposition, which this phase intentionally does not auto-apply to residents.status/is_active — see the module comment at the top of this migration.';

-- ─── apply_roster_apartment_change ───────────────────────────────────────
-- Preserves resident identity (residents.id never changes) — updates
-- current occupancy in place and closes/opens the corresponding
-- apartment-history rows atomically.
create or replace function apply_roster_apartment_change(
  p_resident_id uuid,
  p_new_unit_number text,
  p_new_building text,
  p_community_code text,
  p_import_run_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to apply an apartment change';
  end if;

  update residents
  set unit_number = p_new_unit_number,
      building = p_new_building,
      updated_at = now()
  where id = p_resident_id;

  update resident_apartment_history
  set status = 'former', ended_at = now()
  where resident_id = p_resident_id and status = 'current';

  insert into resident_apartment_history (
    resident_id, community_code, unit_number, building, status, source_type, import_run_id, recorded_by
  ) values (
    p_resident_id, p_community_code, p_new_unit_number, p_new_building, 'current', 'watermere_official_roster', p_import_run_id, p_actor
  );
end;
$$;

revoke execute on function apply_roster_apartment_change(uuid, text, text, text, uuid, text) from public;
grant execute on function apply_roster_apartment_change(uuid, text, text, text, uuid, text) to service_role;

-- ─── apply_roster_new_resident ───────────────────────────────────────────
-- Matches the existing bulk-CSV-import convention exactly: status =
-- 'active', is_active = true, relationship_status = 'resident' — the
-- only values ever observed in this table, since no other write path for
-- residents exists to establish a different convention.
create or replace function apply_roster_new_resident(
  p_first_name text,
  p_last_name text,
  p_display_name text,
  p_full_name text,
  p_community_name text,
  p_community_code text,
  p_unit_number text,
  p_building text,
  p_phone text,
  p_source_system text,
  p_source_file text,
  p_import_batch text,
  p_import_run_id uuid,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_resident_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to create a resident';
  end if;
  if p_last_name is null or length(trim(p_last_name)) = 0 then
    raise exception 'A last name is required to create a resident';
  end if;

  insert into residents (
    first_name, last_name, display_name, full_name,
    community_name, community_code, unit_number, building,
    phone, phone_raw, status, relationship_status, resident_type, is_active,
    source_system, source_file, source_status, import_batch
  ) values (
    p_first_name, p_last_name, p_display_name, p_full_name,
    p_community_name, p_community_code, p_unit_number, p_building,
    p_phone, p_phone, 'active', 'resident', 'il', true,
    p_source_system, p_source_file, 'active', p_import_batch
  )
  returning id into v_resident_id;

  insert into resident_apartment_history (
    resident_id, community_code, unit_number, building, status, source_type, import_run_id, recorded_by
  ) values (
    v_resident_id, p_community_code, p_unit_number, p_building, 'current', 'watermere_official_roster', p_import_run_id, p_actor
  );

  return v_resident_id;
end;
$$;

revoke execute on function apply_roster_new_resident(text, text, text, text, text, text, text, text, text, text, text, text, uuid, text) from public;
grant execute on function apply_roster_new_resident(text, text, text, text, text, text, text, text, text, text, text, text, uuid, text) to service_role;

-- ─── record_roster_absence: idempotent upsert-by-resident ───────────────
create or replace function record_roster_absence(
  p_resident_id uuid,
  p_import_run_id uuid,
  p_community_code text,
  p_last_known_unit_number text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_review_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to record a roster absence';
  end if;

  select id into v_review_id
  from roster_absence_reviews
  where resident_id = p_resident_id and status = 'requires_review'
  for update;

  if found then
    update roster_absence_reviews
    set observed_at = now(), import_run_id = p_import_run_id, last_known_unit_number = p_last_known_unit_number
    where id = v_review_id;
    return v_review_id;
  end if;

  insert into roster_absence_reviews (
    resident_id, import_run_id, community_code, last_known_unit_number
  ) values (
    p_resident_id, p_import_run_id, p_community_code, p_last_known_unit_number
  )
  returning id into v_review_id;

  return v_review_id;
end;
$$;

revoke execute on function record_roster_absence(uuid, uuid, text, text, text) from public;
grant execute on function record_roster_absence(uuid, uuid, text, text, text) to service_role;

-- ─── resolve_roster_absence: records a human disposition, never touches residents ──
create or replace function resolve_roster_absence(
  p_review_id uuid,
  p_disposition text,
  p_disposition_reason text,
  p_disposition_effective_date date,
  p_decided_by text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_decided_by is null or length(trim(p_decided_by)) = 0 then
    raise exception 'A decision maker is required to resolve a roster absence review';
  end if;
  if p_disposition not in ('moved_out', 'deceased', 'transferred', 'still_active', 'unknown') then
    raise exception 'Invalid disposition';
  end if;

  update roster_absence_reviews
  set status = 'resolved',
      disposition = p_disposition,
      disposition_reason = p_disposition_reason,
      disposition_effective_date = p_disposition_effective_date,
      decided_by = p_decided_by,
      decided_at = now()
  where id = p_review_id and status = 'requires_review';
end;
$$;

revoke execute on function resolve_roster_absence(uuid, text, text, date, text) from public;
grant execute on function resolve_roster_absence(uuid, text, text, date, text) to service_role;

commit;
