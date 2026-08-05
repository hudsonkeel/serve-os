begin;

-- Resident Identity Resolution. Detects, reviews, and safely consolidates
-- duplicate resident records (e.g. "Elliot Goldberg" / "Elliott Goldberg")
-- surfaced by the Watermere roster reconciliation. Fully additive — no
-- column is added to `residents` itself beyond reusing the existing
-- `is_active` flag (see below), and no existing constraint is changed.
--
-- Governing framing: `residents.id` should become an increasingly stable
-- representation of one human being; everything else (name spelling,
-- apartment, phone, email, source-specific spelling) is PROFILE data that
-- can evolve without implying a different identity. A full merge is the
-- HEAVIEST of several possible review outcomes, not the only one — but a
-- candidate confirmed as the same human must never leave two records both
-- looking like ordinary independent active residents. Every "same human"
-- resolution therefore ALWAYS immediately sets the non-canonical
-- resident's `is_active = false` and creates its redirect + alias, even
-- when the reviewer defers the heavier table-by-table reassignment to a
-- later `complete_resident_consolidation` call — the deferred state is
-- always durably recorded (`resident_merge_events.consolidation_status =
-- 'pending'`), never silently presented as complete.
--
-- Scope boundary carried over from the roster reconciliation phase: the
-- actual CHECK constraint, if any, on `residents.status`/
-- `relationship_status` could not be confirmed in this session (no
-- information_schema access via PostgREST, no raw SQL access). This
-- migration never writes to those two columns — only the already
-- well-understood `is_active` boolean, which every existing resident
-- list/search/roster-matching view already filters on.

-- ─── resident_identity_candidates ────────────────────────────────────────
create table if not exists resident_identity_candidates (
  id                     uuid primary key default gen_random_uuid(),
  status                 text not null default 'open',
  confidence_band        text not null,
  evidence               jsonb not null default '[]'::jsonb,
  matching_rule_version  text not null,
  detection_run_id       uuid,
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz,
  resolved_by            text,
  resolution_rationale   text,
  investigation_note     text,

  constraint resident_identity_candidates_status_check
    check (status in (
      'open', 'investigating', 'resolved_merged', 'resolved_not_duplicate',
      'resolved_profile_corrected', 'dismissed_bad_candidate'
    )),
  constraint resident_identity_candidates_confidence_band_check
    check (confidence_band in ('high', 'probable', 'needs_investigation')),
  constraint resident_identity_candidates_evidence_is_array_check
    check (jsonb_typeof(evidence) = 'array'),

  constraint resident_identity_candidates_resolved_fields_check
    check (
      (status in ('open', 'investigating') and resolved_at is null and resolved_by is null)
      or (status not in ('open', 'investigating') and resolved_at is not null and resolved_by is not null)
    )
);

create index if not exists resident_identity_candidates_status_idx
  on resident_identity_candidates (status, confidence_band, created_at desc);

alter table resident_identity_candidates enable row level security;
-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this app.

comment on table resident_identity_candidates is
  'A possible duplicate-identity group, generated deterministically (never AI-fabricated). Detection is automatic; every resolution requires an explicit human action.';
comment on column resident_identity_candidates.evidence is
  'jsonb array of {signalType, residentIdA, residentIdB, description, strength}. Human-readable evidence, never an opaque numeric score.';

-- ─── resident_identity_candidate_members ─────────────────────────────────
create table if not exists resident_identity_candidate_members (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.resident_identity_candidates(id) on delete cascade,
  resident_id   uuid not null references public.residents(id),

  constraint resident_identity_candidate_members_unique unique (candidate_id, resident_id)
);

create index if not exists resident_identity_candidate_members_resident_idx
  on resident_identity_candidate_members (resident_id);

alter table resident_identity_candidate_members enable row level security;

-- ─── resident_identity_aliases ────────────────────────────────────────────
create table if not exists resident_identity_aliases (
  id                    uuid primary key default gen_random_uuid(),
  canonical_resident_id uuid not null references public.residents(id),
  alias_type            text not null,
  alias_value           text not null,
  normalized_value      text not null,
  source_system         text,
  source_reference      text,
  confirmed             boolean not null default true,
  created_by            text not null,
  created_at            timestamptz not null default now(),

  constraint resident_identity_aliases_type_check
    check (alias_type in (
      'spelling_variant', 'nickname', 'source_specific_spelling', 'historical_spelling', 'preferred_name'
    )),
  constraint resident_identity_aliases_value_not_blank
    check (length(trim(alias_value)) > 0)
);

create index if not exists resident_identity_aliases_normalized_idx
  on resident_identity_aliases (normalized_value);
create index if not exists resident_identity_aliases_canonical_idx
  on resident_identity_aliases (canonical_resident_id);

alter table resident_identity_aliases enable row level security;

comment on table resident_identity_aliases is
  'First-class identity knowledge, not just a merge artifact — every confirmed same-human resolution creates one, and the roster importer consults this table before ever proposing a new resident.';

-- ─── resident_merge_events ────────────────────────────────────────────────
create table if not exists resident_merge_events (
  id                        uuid primary key default gen_random_uuid(),
  candidate_id              uuid references public.resident_identity_candidates(id),
  canonical_resident_id     uuid not null references public.residents(id),
  duplicate_resident_id     uuid not null references public.residents(id),
  decided_by                text not null,
  decided_at                timestamptz not null default now(),
  rationale                 text,
  consolidation_status      text not null default 'pending',
  field_resolutions         jsonb not null default '{}'::jsonb,
  reassignment_log          jsonb not null default '[]'::jsonb,
  records_deduplicated      jsonb not null default '[]'::jsonb,
  conflicts_retained        jsonb not null default '[]'::jsonb,
  aliases_created           jsonb not null default '[]'::jsonb,
  implementation_version    text not null default '1',
  consolidated_at           timestamptz,

  constraint resident_merge_events_consolidation_status_check
    check (consolidation_status in ('pending', 'completed')),
  constraint resident_merge_events_not_self
    check (canonical_resident_id <> duplicate_resident_id)
);

create index if not exists resident_merge_events_duplicate_idx on resident_merge_events (duplicate_resident_id);
create index if not exists resident_merge_events_canonical_idx on resident_merge_events (canonical_resident_id);

alter table resident_merge_events enable row level security;

comment on column resident_merge_events.reassignment_log is
  'jsonb array of {table, ids: [uuid...]} — which rows moved from the duplicate to the canonical resident, per table. Combined with canonical_resident_id/duplicate_resident_id, sufficient for a documented MANUAL rollback (re-running update <table> set resident_id = duplicate where id = any(ids)) — there is no automated one-click rollback in this phase.';

-- ─── resident_identity_redirects ─────────────────────────────────────────
create table if not exists resident_identity_redirects (
  id                     uuid primary key default gen_random_uuid(),
  duplicate_resident_id  uuid not null unique references public.residents(id),
  canonical_resident_id  uuid not null references public.residents(id),
  merge_event_id         uuid not null references public.resident_merge_events(id),
  created_at             timestamptz not null default now(),

  constraint resident_identity_redirects_not_self check (canonical_resident_id <> duplicate_resident_id)
);

create index if not exists resident_identity_redirects_canonical_idx
  on resident_identity_redirects (canonical_resident_id);

alter table resident_identity_redirects enable row level security;

comment on table resident_identity_redirects is
  'Created immediately by ANY confirmed same-human resolution, whether or not the heavier record consolidation has run yet — direct references to the duplicate must resolve to canonical the moment same-human is confirmed, not only after reassignment completes.';

-- ─── resident_identity_suppressions ───────────────────────────────────────
create table if not exists resident_identity_suppressions (
  id              uuid primary key default gen_random_uuid(),
  resident_id_a   uuid not null references public.residents(id),
  resident_id_b   uuid not null references public.residents(id),
  reason          text,
  decided_by      text not null,
  decided_at      timestamptz not null default now(),
  candidate_id    uuid references public.resident_identity_candidates(id),

  constraint resident_identity_suppressions_not_self check (resident_id_a <> resident_id_b),
  -- Always stored smaller-uuid-first (enforced by the resolving RPC, not
  -- just convention) so a lookup never has to check both orderings.
  constraint resident_identity_suppressions_ordered check (resident_id_a < resident_id_b),
  constraint resident_identity_suppressions_unique unique (resident_id_a, resident_id_b)
);

alter table resident_identity_suppressions enable row level security;

comment on table resident_identity_suppressions is
  'Permanent "these are different people" memory — the detection engine hard-excludes any pair found here, regardless of how strong future evidence looks.';

-- ─── create_resident_identity_candidates: idempotent bulk insert ────────
-- The signal generation and confidence-banding happen in TypeScript (see
-- lib/residents/identity/) — this RPC only persists already-computed
-- candidates. Idempotent per exact resident-id-set: skips (rather than
-- duplicating) any group where an OPEN or INVESTIGATING candidate already
-- covers the exact same members.
create or replace function create_resident_identity_candidates(
  p_detection_run_id uuid,
  p_candidates jsonb,
  p_actor text
)
returns setof resident_identity_candidates
language plpgsql
set search_path = public
as $$
declare
  v_candidate jsonb;
  v_resident_ids uuid[];
  v_existing_id uuid;
  v_new_id uuid;
  v_member uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to record identity candidates';
  end if;
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array' then
    raise exception 'candidates must be a JSON array';
  end if;

  for v_candidate in select * from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb))
  loop
    select array_agg(elem::text::uuid order by elem::text)
    into v_resident_ids
    from jsonb_array_elements_text(v_candidate->'residentIds') as elem;

    if v_resident_ids is null or array_length(v_resident_ids, 1) < 2 then
      raise exception 'Each candidate requires at least two residentIds';
    end if;

    -- Idempotency: an open/investigating candidate with the exact same
    -- member set already exists.
    select c.id into v_existing_id
    from resident_identity_candidates c
    where c.status in ('open', 'investigating')
      and (
        select array_agg(m.resident_id order by m.resident_id)
        from resident_identity_candidate_members m
        where m.candidate_id = c.id
      ) = (select array_agg(x order by x) from unnest(v_resident_ids) as x)
    limit 1;

    if v_existing_id is not null then
      continue;
    end if;

    insert into resident_identity_candidates (
      status, confidence_band, evidence, matching_rule_version, detection_run_id
    ) values (
      'open', v_candidate->>'confidenceBand', coalesce(v_candidate->'evidence', '[]'::jsonb),
      v_candidate->>'matchingRuleVersion', p_detection_run_id
    )
    returning id into v_new_id;

    foreach v_member in array v_resident_ids
    loop
      insert into resident_identity_candidate_members (candidate_id, resident_id) values (v_new_id, v_member);
    end loop;
  end loop;

  return query
  select * from resident_identity_candidates
  where detection_run_id = p_detection_run_id
  order by created_at asc;
end;
$$;

revoke execute on function create_resident_identity_candidates(uuid, jsonb, text) from public;
grant execute on function create_resident_identity_candidates(uuid, jsonb, text) to service_role;

-- ─── resolve_resident_identity_candidate_not_duplicate ───────────────────
create or replace function resolve_resident_identity_candidate_not_duplicate(
  p_candidate_id uuid,
  p_actor text,
  p_reason text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_a uuid;
  v_b uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve a candidate';
  end if;

  select status into v_status from resident_identity_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_status not in ('open', 'investigating') then
    return;
  end if;

  -- Suppress every pair within the candidate group (in practice always
  -- exactly one pair — the schema is N-ary-capable for the future).
  for v_a, v_b in
    select m1.resident_id, m2.resident_id
    from resident_identity_candidate_members m1
    join resident_identity_candidate_members m2
      on m1.candidate_id = m2.candidate_id and m1.resident_id < m2.resident_id
    where m1.candidate_id = p_candidate_id
  loop
    insert into resident_identity_suppressions (resident_id_a, resident_id_b, reason, decided_by, candidate_id)
    values (v_a, v_b, p_reason, p_actor, p_candidate_id)
    on conflict (resident_id_a, resident_id_b) do nothing;
  end loop;

  update resident_identity_candidates
  set status = 'resolved_not_duplicate', resolved_at = now(), resolved_by = p_actor, resolution_rationale = p_reason
  where id = p_candidate_id;
end;
$$;

revoke execute on function resolve_resident_identity_candidate_not_duplicate(uuid, text, text) from public;
grant execute on function resolve_resident_identity_candidate_not_duplicate(uuid, text, text) to service_role;

-- ─── resolve_resident_identity_candidate_profile_corrected ───────────────
create or replace function resolve_resident_identity_candidate_profile_corrected(
  p_candidate_id uuid,
  p_actor text,
  p_note text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve a candidate';
  end if;

  select status into v_status from resident_identity_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_status not in ('open', 'investigating') then
    return;
  end if;

  update resident_identity_candidates
  set status = 'resolved_profile_corrected', resolved_at = now(), resolved_by = p_actor, resolution_rationale = p_note
  where id = p_candidate_id;
end;
$$;

revoke execute on function resolve_resident_identity_candidate_profile_corrected(uuid, text, text) from public;
grant execute on function resolve_resident_identity_candidate_profile_corrected(uuid, text, text) to service_role;

-- ─── resolve_resident_identity_candidate_investigate ─────────────────────
create or replace function resolve_resident_identity_candidate_investigate(
  p_candidate_id uuid,
  p_actor text,
  p_note text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update a candidate';
  end if;

  select status into v_status from resident_identity_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_status not in ('open', 'investigating') then
    return;
  end if;

  update resident_identity_candidates
  set status = 'investigating', investigation_note = p_note
  where id = p_candidate_id;
end;
$$;

revoke execute on function resolve_resident_identity_candidate_investigate(uuid, text, text) from public;
grant execute on function resolve_resident_identity_candidate_investigate(uuid, text, text) to service_role;

-- ─── dismiss_resident_identity_candidate ─────────────────────────────────
create or replace function dismiss_resident_identity_candidate(
  p_candidate_id uuid,
  p_actor text,
  p_reason text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to dismiss a candidate';
  end if;

  select status into v_status from resident_identity_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_status not in ('open', 'investigating') then
    return;
  end if;

  update resident_identity_candidates
  set status = 'dismissed_bad_candidate', resolved_at = now(), resolved_by = p_actor, resolution_rationale = p_reason
  where id = p_candidate_id;
end;
$$;

revoke execute on function dismiss_resident_identity_candidate(uuid, text, text) from public;
grant execute on function dismiss_resident_identity_candidate(uuid, text, text) to service_role;

-- ─── perform_resident_consolidation: the table-by-table reassignment ─────
-- Not a public entry point on its own — called by merge_residents
-- (immediately, when not deferred) and by complete_resident_consolidation
-- (later, when it was deferred). Idempotent: a merge event already
-- 'completed' is a no-op, so retrying either caller is always safe.
--
-- Uniform tables (no uniqueness constraint on resident_id) are reassigned
-- via a small data-driven loop rather than one repeated block per table —
-- every special case (a uniqueness constraint, a jsonb payload, a
-- deterministic tie-break) is handled explicitly below instead.
create or replace function perform_resident_consolidation(
  p_merge_event_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_event resident_merge_events%rowtype;
  v_canonical uuid;
  v_duplicate uuid;
  v_reassignment_log jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_dedup jsonb := '[]'::jsonb;
  v_row_ids uuid[];
  v_table record;
  v_canonical_profile resident_relationship_profiles%rowtype;
  v_duplicate_profile resident_relationship_profiles%rowtype;
  v_follow_up_conflict record;
  v_duplicate_current_need record;
  v_canonical_needs_content text;
  v_merged_needs_content text;
  v_relationship_type_conflict record;
  v_touch record;
  v_new_participants jsonb;
  v_participant jsonb;
  v_touch_changed boolean;
  v_touch_ids uuid[];
  v_canonical_current_apt resident_apartment_history%rowtype;
  v_duplicate_current_apt resident_apartment_history%rowtype;
  v_apt_loser_id uuid;
  v_canonical_open_absence uuid;
  v_duplicate_open_absence uuid;
begin
  select * into v_event from resident_merge_events where id = p_merge_event_id for update;
  if not found then
    raise exception 'Merge event not found';
  end if;
  if v_event.consolidation_status = 'completed' then
    return; -- idempotent: already done
  end if;

  v_canonical := v_event.canonical_resident_id;
  v_duplicate := v_event.duplicate_resident_id;

  -- ─── Uniform direct-reassignment tables ──────────────────────────────
  for v_table in
    select * from (values
      ('resident_interests', 'resident_id'),
      ('resident_milestones', 'resident_id'),
      ('resident_touches', 'resident_id'),
      ('resident_wellness_notes', 'resident_id'),
      ('resident_working_notes', 'resident_id'),
      ('resident_timeline', 'resident_id'),
      ('relationship_insights', 'resident_id'),
      ('relationship_working_notes', 'resident_id'),
      ('relationship_conversions', 'resident_id'),
      ('intake_processing_records', 'resident_id'),
      ('roster_source_rows', 'matched_resident_id')
    ) as t(table_name, column_name)
  loop
    execute format('select array_agg(id) from %I where %I = $1', v_table.table_name, v_table.column_name)
      into v_row_ids using v_duplicate;
    if v_row_ids is not null and array_length(v_row_ids, 1) > 0 then
      execute format('update %I set %I = $1 where %I = $2', v_table.table_name, v_table.column_name, v_table.column_name)
        using v_canonical, v_duplicate;
      v_reassignment_log := v_reassignment_log || jsonb_build_object('table', v_table.table_name, 'ids', to_jsonb(v_row_ids));
    end if;
  end loop;

  -- Pre-existing external staging tables with no local DDL in this repo —
  -- reassign defensively only if the table actually exists.
  for v_table in
    select * from (values
      ('resident_relationship_imports', 'resident_id'),
      ('resident_contact_imports', 'resident_id')
    ) as t(table_name, column_name)
  loop
    if to_regclass('public.' || v_table.table_name) is not null then
      execute format('select array_agg(id) from %I where %I = $1', v_table.table_name, v_table.column_name)
        into v_row_ids using v_duplicate;
      if v_row_ids is not null and array_length(v_row_ids, 1) > 0 then
        execute format('update %I set %I = $1 where %I = $2', v_table.table_name, v_table.column_name, v_table.column_name)
          using v_canonical, v_duplicate;
        v_reassignment_log := v_reassignment_log || jsonb_build_object('table', v_table.table_name, 'ids', to_jsonb(v_row_ids));
      end if;
    end if;
  end loop;

  -- ─── resident_relationship_profiles: unique(resident_id) — coalesce ───
  select * into v_canonical_profile from resident_relationship_profiles where resident_id = v_canonical;
  select * into v_duplicate_profile from resident_relationship_profiles where resident_id = v_duplicate;

  if v_duplicate_profile.id is not null then
    if v_canonical_profile.id is null then
      update resident_relationship_profiles set resident_id = v_canonical where id = v_duplicate_profile.id;
      v_reassignment_log := v_reassignment_log || jsonb_build_object('table', 'resident_relationship_profiles', 'ids', to_jsonb(array[v_duplicate_profile.id]));
    else
      update resident_relationship_profiles
      set preferred_name = coalesce(v_canonical_profile.preferred_name, v_duplicate_profile.preferred_name),
          conversation_style = coalesce(v_canonical_profile.conversation_style, v_duplicate_profile.conversation_style),
          communication_preference = coalesce(v_canonical_profile.communication_preference, v_duplicate_profile.communication_preference),
          preferred_contact_channel = coalesce(v_canonical_profile.preferred_contact_channel, v_duplicate_profile.preferred_contact_channel),
          best_time_to_contact = coalesce(v_canonical_profile.best_time_to_contact, v_duplicate_profile.best_time_to_contact),
          general_notes = coalesce(v_canonical_profile.general_notes, v_duplicate_profile.general_notes),
          updated_at = now()
      where resident_id = v_canonical;

      if v_duplicate_profile.preferred_name is not null
        and v_canonical_profile.preferred_name is not null
        and v_duplicate_profile.preferred_name <> v_canonical_profile.preferred_name then
        insert into resident_identity_aliases (
          canonical_resident_id, alias_type, alias_value, normalized_value, source_reference, created_by
        ) values (
          v_canonical, 'preferred_name', v_duplicate_profile.preferred_name,
          lower(trim(v_duplicate_profile.preferred_name)), p_merge_event_id::text, p_actor
        );
      end if;

      -- Nothing silently dropped: the full duplicate row is snapshotted
      -- before it's removed, even for fields with no dedicated alias slot.
      v_dedup := v_dedup || jsonb_build_object(
        'table', 'resident_relationship_profiles',
        'action', 'coalesced into canonical, duplicate row removed',
        'duplicateRowSnapshot', to_jsonb(v_duplicate_profile)
      );
      delete from resident_relationship_profiles where id = v_duplicate_profile.id;
    end if;
  end if;

  -- ─── resident_wellness_follow_ups: reassign + open-conflict detection ─
  for v_follow_up_conflict in
    select d.id as duplicate_follow_up_id, c.id as canonical_follow_up_id
    from resident_wellness_follow_ups d
    join resident_wellness_follow_ups c
      on c.resident_id = v_canonical and c.status = 'open'
      and c.follow_up_type = d.follow_up_type and lower(trim(c.title)) = lower(trim(d.title))
    where d.resident_id = v_duplicate and d.status = 'open'
  loop
    v_conflicts := v_conflicts || jsonb_build_object(
      'table', 'resident_wellness_follow_ups',
      'description', 'Both residents have an open follow-up of the same type and title — neither was auto-closed.',
      'duplicateRowId', v_follow_up_conflict.duplicate_follow_up_id,
      'canonicalRowId', v_follow_up_conflict.canonical_follow_up_id
    );
  end loop;

  select array_agg(id) into v_row_ids from resident_wellness_follow_ups where resident_id = v_duplicate;
  if v_row_ids is not null and array_length(v_row_ids, 1) > 0 then
    update resident_wellness_follow_ups set resident_id = v_canonical where resident_id = v_duplicate;
    v_reassignment_log := v_reassignment_log || jsonb_build_object('table', 'resident_wellness_follow_ups', 'ids', to_jsonb(v_row_ids));
  end if;

  -- ─── resident_current_needs: versioned, one is_current per resident ──
  select array_agg(id) into v_row_ids from resident_current_needs where resident_id = v_duplicate and is_current = false;
  if v_row_ids is not null and array_length(v_row_ids, 1) > 0 then
    update resident_current_needs set resident_id = v_canonical where resident_id = v_duplicate and is_current = false;
    v_reassignment_log := v_reassignment_log || jsonb_build_object('table', 'resident_current_needs (historical)', 'ids', to_jsonb(v_row_ids));
  end if;

  select * into v_duplicate_current_need from resident_current_needs where resident_id = v_duplicate and is_current = true;
  if v_duplicate_current_need.id is not null then
    select content into v_canonical_needs_content from resident_current_needs where resident_id = v_canonical and is_current = true;
    v_merged_needs_content := trim(both ' ' from coalesce(v_canonical_needs_content, '') || ' ' || v_duplicate_current_need.content);

    perform save_resident_current_needs(
      v_canonical, v_merged_needs_content, 'system',
      'Merged from duplicate resident during identity resolution (merge event ' || p_merge_event_id::text || ')', p_actor
    );

    -- The duplicate's old current row becomes historical under canonical
    -- — never left as a still-"current" row, which would collide with
    -- the new version just saved above.
    update resident_current_needs
    set resident_id = v_canonical, is_current = false,
        superseded_at = coalesce(superseded_at, now()), superseded_by = coalesce(superseded_by, p_actor)
    where id = v_duplicate_current_need.id;

    v_dedup := v_dedup || jsonb_build_object(
      'table', 'resident_current_needs (current)',
      'action', 'appended into canonical''s current version via save_resident_current_needs; duplicate''s row retained as historical',
      'duplicateRowId', v_duplicate_current_need.id
    );
  end if;

  -- ─── relationships.resident_id: reassign + active-duplicate-type conflict ─
  select array_agg(id) into v_row_ids from relationships where resident_id = v_duplicate;
  if v_row_ids is not null and array_length(v_row_ids, 1) > 0 then
    update relationships set resident_id = v_canonical where resident_id = v_duplicate;
    v_reassignment_log := v_reassignment_log || jsonb_build_object('table', 'relationships', 'ids', to_jsonb(v_row_ids));
  end if;

  for v_relationship_type_conflict in
    select relationship_type, count(*) as cnt, array_agg(id) as ids
    from relationships
    where resident_id = v_canonical and status <> 'closed'
    group by relationship_type
    having count(*) > 1
  loop
    v_conflicts := v_conflicts || jsonb_build_object(
      'table', 'relationships',
      'description', format(
        'Canonical resident now has %s active relationships of type %s after reassignment — not auto-resolved; existing relationship workflows decide which stays open.',
        v_relationship_type_conflict.cnt, v_relationship_type_conflict.relationship_type
      ),
      'relationshipIds', to_jsonb(v_relationship_type_conflict.ids)
    );
  end loop;

  -- ─── relationship_touches.participants: jsonb personId rewrite ───────
  v_touch_ids := array[]::uuid[];
  for v_touch in
    select id, participants from relationship_touches
    where exists (select 1 from jsonb_array_elements(participants) p where p->>'personId' = v_duplicate::text)
  loop
    v_new_participants := '[]'::jsonb;
    v_touch_changed := false;
    for v_participant in select * from jsonb_array_elements(v_touch.participants)
    loop
      if v_participant->>'personId' = v_duplicate::text then
        v_new_participants := v_new_participants || jsonb_build_array(jsonb_set(v_participant, '{personId}', to_jsonb(v_canonical::text)));
        v_touch_changed := true;
      else
        v_new_participants := v_new_participants || jsonb_build_array(v_participant);
      end if;
    end loop;
    if v_touch_changed then
      update relationship_touches set participants = v_new_participants where id = v_touch.id;
      v_touch_ids := v_touch_ids || v_touch.id;
    end if;
  end loop;
  if array_length(v_touch_ids, 1) > 0 then
    v_reassignment_log := v_reassignment_log || jsonb_build_object('table', 'relationship_touches.participants', 'ids', to_jsonb(v_touch_ids));
  end if;

  -- ─── resident_apartment_history: reassign + current-row tie-break ────
  select * into v_canonical_current_apt from resident_apartment_history where resident_id = v_canonical and status = 'current';
  select * into v_duplicate_current_apt from resident_apartment_history where resident_id = v_duplicate and status = 'current';

  if v_canonical_current_apt.id is not null and v_duplicate_current_apt.id is not null then
    if v_canonical_current_apt.source_type = 'watermere_official_roster' and v_duplicate_current_apt.source_type <> 'watermere_official_roster' then
      v_apt_loser_id := v_duplicate_current_apt.id;
    elsif v_duplicate_current_apt.source_type = 'watermere_official_roster' and v_canonical_current_apt.source_type <> 'watermere_official_roster' then
      v_apt_loser_id := v_canonical_current_apt.id;
    elsif v_duplicate_current_apt.started_at > v_canonical_current_apt.started_at then
      v_apt_loser_id := v_canonical_current_apt.id;
    else
      v_apt_loser_id := v_duplicate_current_apt.id;
    end if;

    update resident_apartment_history set status = 'former', ended_at = now() where id = v_apt_loser_id;

    v_conflicts := v_conflicts || jsonb_build_object(
      'table', 'resident_apartment_history',
      'description', 'Both residents had a current occupancy row — the older/non-official-roster-sourced one was marked former (deterministic tie-break: prefer watermere_official_roster, then most recent started_at) so exactly one current row survives the merge.',
      'formerRowId', v_apt_loser_id
    );
  end if;

  select array_agg(id) into v_row_ids from resident_apartment_history where resident_id = v_duplicate;
  if v_row_ids is not null and array_length(v_row_ids, 1) > 0 then
    update resident_apartment_history set resident_id = v_canonical where resident_id = v_duplicate;
    v_reassignment_log := v_reassignment_log || jsonb_build_object('table', 'resident_apartment_history', 'ids', to_jsonb(v_row_ids));
  end if;

  -- ─── roster_absence_reviews: one open review per resident — dedup ────
  select id into v_canonical_open_absence from roster_absence_reviews where resident_id = v_canonical and status = 'requires_review';
  select id into v_duplicate_open_absence from roster_absence_reviews where resident_id = v_duplicate and status = 'requires_review';

  if v_duplicate_open_absence is not null then
    if v_canonical_open_absence is not null then
      delete from roster_absence_reviews where id = v_duplicate_open_absence;
      v_dedup := v_dedup || jsonb_build_object(
        'table', 'roster_absence_reviews',
        'action', 'deleted duplicate''s redundant open review (canonical already had one for the same underlying concern)',
        'deletedRowId', v_duplicate_open_absence
      );
    else
      update roster_absence_reviews set resident_id = v_canonical where id = v_duplicate_open_absence;
      v_reassignment_log := v_reassignment_log || jsonb_build_object('table', 'roster_absence_reviews (open)', 'ids', to_jsonb(array[v_duplicate_open_absence]));
    end if;
  end if;

  select array_agg(id) into v_row_ids from roster_absence_reviews where resident_id = v_duplicate and status = 'resolved';
  if v_row_ids is not null and array_length(v_row_ids, 1) > 0 then
    update roster_absence_reviews set resident_id = v_canonical where resident_id = v_duplicate and status = 'resolved';
    v_reassignment_log := v_reassignment_log || jsonb_build_object('table', 'roster_absence_reviews (resolved)', 'ids', to_jsonb(v_row_ids));
  end if;

  -- ─── Done ──────────────────────────────────────────────────────────
  update resident_merge_events
  set consolidation_status = 'completed',
      reassignment_log = v_reassignment_log,
      conflicts_retained = v_conflicts,
      records_deduplicated = v_dedup,
      consolidated_at = now()
  where id = p_merge_event_id;
end;
$$;

revoke execute on function perform_resident_consolidation(uuid, text) from public;
grant execute on function perform_resident_consolidation(uuid, text) to service_role;

-- ─── merge_residents: the primary entry point ────────────────────────────
-- Always, immediately: deactivates the duplicate, creates the redirect,
-- creates a spelling-variant alias, and resolves the source candidate (if
-- any) to 'resolved_merged' — this is what guarantees a confirmed
-- same-human pair never both look like ordinary active residents, even
-- when the reviewer defers the heavier reassignment. Idempotent: retrying
-- with the same duplicate resident returns the existing merge event
-- untouched rather than erroring or duplicating anything.
create or replace function merge_residents(
  p_candidate_id uuid,
  p_canonical_resident_id uuid,
  p_duplicate_resident_id uuid,
  p_defer_consolidation boolean,
  p_field_resolutions jsonb,
  p_actor text,
  p_rationale text
)
returns resident_merge_events
language plpgsql
set search_path = public
as $$
declare
  v_event resident_merge_events%rowtype;
  v_existing_redirect resident_identity_redirects%rowtype;
  v_duplicate_row residents%rowtype;
  v_canonical_row residents%rowtype;
  v_canonical_name text;
  v_duplicate_name text;
  v_alias_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to merge residents';
  end if;
  if p_canonical_resident_id = p_duplicate_resident_id then
    raise exception 'Canonical and duplicate residents must be different';
  end if;
  if p_field_resolutions is not null and jsonb_typeof(p_field_resolutions) <> 'object' then
    raise exception 'field_resolutions must be a JSON object';
  end if;

  select * into v_existing_redirect from resident_identity_redirects where duplicate_resident_id = p_duplicate_resident_id;
  if found then
    select * into v_event from resident_merge_events where id = v_existing_redirect.merge_event_id;
    return v_event;
  end if;

  select * into v_duplicate_row from residents where id = p_duplicate_resident_id for update;
  if not found then
    raise exception 'Duplicate resident not found';
  end if;
  select * into v_canonical_row from residents where id = p_canonical_resident_id for update;
  if not found then
    raise exception 'Canonical resident not found';
  end if;

  insert into resident_merge_events (
    candidate_id, canonical_resident_id, duplicate_resident_id, decided_by, rationale, consolidation_status, field_resolutions
  ) values (
    p_candidate_id, p_canonical_resident_id, p_duplicate_resident_id, p_actor, p_rationale, 'pending', coalesce(p_field_resolutions, '{}'::jsonb)
  )
  returning * into v_event;

  update residents set is_active = false, updated_at = now() where id = p_duplicate_resident_id;

  insert into resident_identity_redirects (duplicate_resident_id, canonical_resident_id, merge_event_id)
  values (p_duplicate_resident_id, p_canonical_resident_id, v_event.id);

  v_canonical_name := lower(trim(coalesce(v_canonical_row.first_name, '') || ' ' || coalesce(v_canonical_row.last_name, '')));
  v_duplicate_name := lower(trim(coalesce(v_duplicate_row.first_name, '') || ' ' || coalesce(v_duplicate_row.last_name, '')));

  if v_duplicate_name <> '' and v_duplicate_name <> v_canonical_name then
    insert into resident_identity_aliases (
      canonical_resident_id, alias_type, alias_value, normalized_value, source_system, source_reference, created_by
    ) values (
      p_canonical_resident_id, 'spelling_variant',
      trim(coalesce(v_duplicate_row.first_name, '') || ' ' || coalesce(v_duplicate_row.last_name, '')),
      v_duplicate_name, v_duplicate_row.source_system, v_event.id::text, p_actor
    )
    returning id into v_alias_id;

    update resident_merge_events set aliases_created = aliases_created || jsonb_build_array(v_alias_id) where id = v_event.id;
  end if;

  if p_candidate_id is not null then
    update resident_identity_candidates
    set status = 'resolved_merged', resolved_at = now(), resolved_by = p_actor, resolution_rationale = p_rationale
    where id = p_candidate_id and status in ('open', 'investigating');
  end if;

  if not coalesce(p_defer_consolidation, false) then
    perform perform_resident_consolidation(v_event.id, p_actor);
  end if;

  select * into v_event from resident_merge_events where id = v_event.id;
  return v_event;
end;
$$;

revoke execute on function merge_residents(uuid, uuid, uuid, boolean, jsonb, text, text) from public;
grant execute on function merge_residents(uuid, uuid, uuid, boolean, jsonb, text, text) to service_role;

-- ─── complete_resident_consolidation: finish a deferred merge later ──────
create or replace function complete_resident_consolidation(
  p_merge_event_id uuid,
  p_actor text
)
returns resident_merge_events
language plpgsql
set search_path = public
as $$
declare
  v_event resident_merge_events%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to complete consolidation';
  end if;

  select * into v_event from resident_merge_events where id = p_merge_event_id;
  if not found then
    raise exception 'Merge event not found';
  end if;

  perform perform_resident_consolidation(p_merge_event_id, p_actor);

  select * into v_event from resident_merge_events where id = p_merge_event_id;
  return v_event;
end;
$$;

revoke execute on function complete_resident_consolidation(uuid, text) from public;
grant execute on function complete_resident_consolidation(uuid, text) to service_role;

commit;
