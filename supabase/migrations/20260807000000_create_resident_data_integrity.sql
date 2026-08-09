begin;

-- Resident Data Integrity — Phase 3. A resident data-integrity issue is a
-- source, parsing, normalization, or import-write defect (bad DATA
-- HANDLING), answered separately from:
--   - Resident Identity Resolution (resident_identity_candidates): "do
--     these records represent the same human?"
--   - Household Detection (resident_household_links): "do these different
--     residents share a household?"
-- A strong import-integrity explanation for a pair takes precedence over
-- both of those — see lib/residents/dataIntegrity/precedence.ts, which
-- excludes any pair claimed here from identity/household candidate
-- generation entirely, not just from identity. Detection is deterministic
-- (never AI-fabricated); every resolution requires an explicit human
-- action; nothing here ever auto-merges a resident — "Confirm Duplicate
-- Import Record" reuses the existing merge_residents() entry point from
-- supabase/migrations/20260805000000_create_resident_identity_resolution.sql
-- rather than creating a second merge path.

-- ─── resident_data_integrity_issues ──────────────────────────────────────
create table if not exists resident_data_integrity_issues (
  id                          uuid primary key default gen_random_uuid(),
  issue_type                  text not null,
  status                      text not null default 'open',
  severity                    text not null,
  source_system               text,
  source_file                 text,
  import_batch                text,
  import_run_id               uuid references public.roster_import_runs(id),
  detection_run_id            uuid,
  evidence                    jsonb not null default '[]'::jsonb,
  recommended_action          text,
  detector_rule               text not null,
  detector_version            text not null,
  fingerprint                 text not null,
  linked_identity_candidate_id uuid references public.resident_identity_candidates(id),
  created_at                  timestamptz not null default now(),
  reviewed_by                 text,
  reviewed_at                 timestamptz,
  resolution                  text,
  resolution_notes            text,
  remediation_log             jsonb not null default '[]'::jsonb,

  constraint resident_data_integrity_issues_issue_type_check
    check (issue_type in ('same_import_duplicate', 'duplicate_source_row', 'malformed_phone', 'malformed_name')),
  constraint resident_data_integrity_issues_status_check
    check (status in (
      'open', 'investigating', 'resolved_merged', 'resolved_corrected',
      'resolved_returned_to_identity_review', 'dismissed_not_an_issue'
    )),
  constraint resident_data_integrity_issues_severity_check
    check (severity in ('low', 'medium', 'high')),
  constraint resident_data_integrity_issues_evidence_is_array_check
    check (jsonb_typeof(evidence) = 'array'),
  constraint resident_data_integrity_issues_remediation_log_is_array_check
    check (jsonb_typeof(remediation_log) = 'array'),

  constraint resident_data_integrity_issues_reviewed_fields_check
    check (
      (status in ('open', 'investigating') and reviewed_at is null and reviewed_by is null)
      or (status not in ('open', 'investigating') and reviewed_at is not null and reviewed_by is not null)
    )
);

create index if not exists resident_data_integrity_issues_status_idx
  on resident_data_integrity_issues (status, severity, created_at desc);
create index if not exists resident_data_integrity_issues_fingerprint_idx
  on resident_data_integrity_issues (issue_type, fingerprint);

alter table resident_data_integrity_issues enable row level security;
-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this app.

comment on table resident_data_integrity_issues is
  'A source/parsing/normalization/import-write defect — "was this record handled correctly?", never "is this the same human?" (that question belongs to resident_identity_candidates). Detection is deterministic and automatic; every resolution requires an explicit human action; nothing here ever auto-merges a resident.';
comment on column resident_data_integrity_issues.evidence is
  'jsonb array of {signalType, description, rawValue?, normalizedValue?, ...} — human-readable evidence, never an opaque numeric score.';
comment on column resident_data_integrity_issues.fingerprint is
  'Deterministic per (issue_type, member resident ids, key evidence fields) — see lib/residents/dataIntegrity/fingerprint.ts. Used for detection idempotency (create_resident_data_integrity_issues skips an existing open/investigating match) and suppression matching (resident_data_integrity_suppressions).';
comment on column resident_data_integrity_issues.remediation_log is
  'jsonb array of {action, field?, before?, after?, actor, at} — full audit trail of what actually changed as a result of resolving this issue.';

-- ─── resident_data_integrity_issue_members ───────────────────────────────
create table if not exists resident_data_integrity_issue_members (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid not null references public.resident_data_integrity_issues(id) on delete cascade,
  resident_id  uuid not null references public.residents(id),
  role         text,

  constraint resident_data_integrity_issue_members_unique unique (issue_id, resident_id)
);

create index if not exists resident_data_integrity_issue_members_resident_idx
  on resident_data_integrity_issue_members (resident_id);

alter table resident_data_integrity_issue_members enable row level security;

-- ─── resident_data_integrity_suppressions ────────────────────────────────
create table if not exists resident_data_integrity_suppressions (
  id           uuid primary key default gen_random_uuid(),
  issue_type   text not null,
  fingerprint  text not null,
  reason       text,
  decided_by   text not null,
  decided_at   timestamptz not null default now(),

  constraint resident_data_integrity_suppressions_unique unique (issue_type, fingerprint)
);

alter table resident_data_integrity_suppressions enable row level security;

comment on table resident_data_integrity_suppressions is
  'Permanent "not an issue" memory, keyed by the same deterministic fingerprint as resident_data_integrity_issues — the detector hard-excludes any matching fingerprint from re-creation, UNLESS the underlying evidence changes (which changes the fingerprint itself).';

-- ─── create_resident_data_integrity_issues: idempotent bulk insert ──────
-- Detection/scoring happens in TypeScript (lib/residents/dataIntegrity/) —
-- this RPC only persists already-computed issues. Idempotent per exact
-- (issue_type, fingerprint): skips (rather than duplicating) any issue
-- already suppressed, or already open/investigating with the same
-- fingerprint.
create or replace function create_resident_data_integrity_issues(
  p_detection_run_id uuid,
  p_issues jsonb,
  p_actor text
)
returns setof resident_data_integrity_issues
language plpgsql
set search_path = public
as $$
declare
  v_issue jsonb;
  v_member jsonb;
  v_resident_ids uuid[];
  v_suppressed boolean;
  v_existing_id uuid;
  v_new_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to record data integrity issues';
  end if;
  if jsonb_typeof(coalesce(p_issues, '[]'::jsonb)) <> 'array' then
    raise exception 'issues must be a JSON array';
  end if;

  for v_issue in select * from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb))
  loop
    if v_issue->>'issueType' is null or v_issue->>'fingerprint' is null then
      raise exception 'Each issue requires issueType and fingerprint';
    end if;

    select exists(
      select 1 from resident_data_integrity_suppressions
      where issue_type = v_issue->>'issueType' and fingerprint = v_issue->>'fingerprint'
    ) into v_suppressed;

    if v_suppressed then
      continue;
    end if;

    select id into v_existing_id
    from resident_data_integrity_issues
    where issue_type = v_issue->>'issueType'
      and fingerprint = v_issue->>'fingerprint'
      and status in ('open', 'investigating')
    limit 1;

    if v_existing_id is not null then
      continue;
    end if;

    -- Most issue types reference at least one existing resident, but
    -- duplicate_source_row issues are detected BEFORE any resident is
    -- created from the offending rows — an empty members array is
    -- expected and valid for that issue type, never an error.
    select array_agg((elem->>'residentId')::uuid)
    into v_resident_ids
    from jsonb_array_elements(coalesce(v_issue->'members', '[]'::jsonb)) as elem;

    insert into resident_data_integrity_issues (
      issue_type, severity, source_system, source_file, import_batch, import_run_id, detection_run_id,
      evidence, recommended_action, detector_rule, detector_version, fingerprint
    ) values (
      v_issue->>'issueType', v_issue->>'severity', v_issue->>'sourceSystem', v_issue->>'sourceFile',
      v_issue->>'importBatch', nullif(v_issue->>'importRunId', '')::uuid, p_detection_run_id,
      coalesce(v_issue->'evidence', '[]'::jsonb), v_issue->>'recommendedAction',
      v_issue->>'detectorRule', v_issue->>'detectorVersion', v_issue->>'fingerprint'
    )
    returning id into v_new_id;

    for v_member in select * from jsonb_array_elements(coalesce(v_issue->'members', '[]'::jsonb))
    loop
      insert into resident_data_integrity_issue_members (issue_id, resident_id, role)
      values (v_new_id, (v_member->>'residentId')::uuid, v_member->>'role');
    end loop;
  end loop;

  return query
  select * from resident_data_integrity_issues
  where detection_run_id = p_detection_run_id
  order by created_at asc;
end;
$$;

revoke execute on function create_resident_data_integrity_issues(uuid, jsonb, text) from public;
grant execute on function create_resident_data_integrity_issues(uuid, jsonb, text) to service_role;

-- ─── mark_resident_data_integrity_issue_investigating ────────────────────
create or replace function mark_resident_data_integrity_issue_investigating(
  p_issue_id uuid,
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
    raise exception 'An authenticated actor is required to update an issue';
  end if;

  select status into v_status from resident_data_integrity_issues where id = p_issue_id for update;
  if not found then
    raise exception 'Issue not found';
  end if;
  if v_status not in ('open', 'investigating') then
    return;
  end if;

  update resident_data_integrity_issues
  set status = 'investigating', resolution_notes = p_note
  where id = p_issue_id;
end;
$$;

revoke execute on function mark_resident_data_integrity_issue_investigating(uuid, text, text) from public;
grant execute on function mark_resident_data_integrity_issue_investigating(uuid, text, text) to service_role;

-- ─── dismiss_resident_data_integrity_issue_not_an_issue ──────────────────
create or replace function dismiss_resident_data_integrity_issue_not_an_issue(
  p_issue_id uuid,
  p_actor text,
  p_reason text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_issue resident_data_integrity_issues%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to dismiss an issue';
  end if;

  select * into v_issue from resident_data_integrity_issues where id = p_issue_id for update;
  if not found then
    raise exception 'Issue not found';
  end if;
  if v_issue.status not in ('open', 'investigating') then
    return;
  end if;

  insert into resident_data_integrity_suppressions (issue_type, fingerprint, reason, decided_by)
  values (v_issue.issue_type, v_issue.fingerprint, p_reason, p_actor)
  on conflict (issue_type, fingerprint) do nothing;

  update resident_data_integrity_issues
  set status = 'dismissed_not_an_issue', reviewed_at = now(), reviewed_by = p_actor, resolution = p_reason
  where id = p_issue_id;
end;
$$;

revoke execute on function dismiss_resident_data_integrity_issue_not_an_issue(uuid, text, text) from public;
grant execute on function dismiss_resident_data_integrity_issue_not_an_issue(uuid, text, text) to service_role;

-- ─── resolve_resident_data_integrity_issue_merged ────────────────────────
-- Called AFTER the caller has already invoked the existing merge_residents()
-- RPC (see 20260805000000_create_resident_identity_resolution.sql) — this
-- function never merges anything itself, it only links the resulting merge
-- event and closes the issue. Reuses the merge infrastructure rather than
-- duplicating it, per the governing product spec.
create or replace function resolve_resident_data_integrity_issue_merged(
  p_issue_id uuid,
  p_merge_event_id uuid,
  p_actor text,
  p_rationale text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve an issue';
  end if;

  select status into v_status from resident_data_integrity_issues where id = p_issue_id for update;
  if not found then
    raise exception 'Issue not found';
  end if;
  if v_status not in ('open', 'investigating') then
    return;
  end if;

  update resident_data_integrity_issues
  set status = 'resolved_merged', reviewed_at = now(), reviewed_by = p_actor, resolution = p_rationale,
      remediation_log = remediation_log || jsonb_build_array(jsonb_build_object(
        'action', 'confirmed_duplicate_import_record',
        'mergeEventId', p_merge_event_id,
        'actor', p_actor,
        'at', now()
      ))
  where id = p_issue_id;
end;
$$;

revoke execute on function resolve_resident_data_integrity_issue_merged(uuid, uuid, text, text) from public;
grant execute on function resolve_resident_data_integrity_issue_merged(uuid, uuid, text, text) to service_role;

-- ─── correct_resident_data_integrity_malformed_field ─────────────────────
-- p_field is validated against an explicit allow-list via if/elsif — never
-- built as dynamic SQL from caller-provided column names.
create or replace function correct_resident_data_integrity_malformed_field(
  p_issue_id uuid,
  p_resident_id uuid,
  p_field text,
  p_new_value text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_before text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to correct a field';
  end if;
  if p_field not in ('phone', 'first_name', 'last_name', 'middle_name') then
    raise exception 'Field % is not allow-listed for correction', p_field;
  end if;

  select status into v_status from resident_data_integrity_issues where id = p_issue_id for update;
  if not found then
    raise exception 'Issue not found';
  end if;
  if v_status not in ('open', 'investigating') then
    return;
  end if;

  if p_field = 'phone' then
    select phone into v_before from residents where id = p_resident_id;
    update residents set phone = p_new_value, updated_at = now() where id = p_resident_id;
  elsif p_field = 'first_name' then
    select first_name into v_before from residents where id = p_resident_id;
    update residents set first_name = p_new_value, updated_at = now() where id = p_resident_id;
  elsif p_field = 'last_name' then
    select last_name into v_before from residents where id = p_resident_id;
    update residents set last_name = p_new_value, updated_at = now() where id = p_resident_id;
  elsif p_field = 'middle_name' then
    select middle_name into v_before from residents where id = p_resident_id;
    update residents set middle_name = p_new_value, updated_at = now() where id = p_resident_id;
  end if;

  update resident_data_integrity_issues
  set status = 'resolved_corrected', reviewed_at = now(), reviewed_by = p_actor,
      remediation_log = remediation_log || jsonb_build_array(jsonb_build_object(
        'action', 'corrected_malformed_field',
        'residentId', p_resident_id,
        'field', p_field,
        'before', v_before,
        'after', p_new_value,
        'actor', p_actor,
        'at', now()
      ))
  where id = p_issue_id;
end;
$$;

revoke execute on function correct_resident_data_integrity_malformed_field(uuid, uuid, text, text, text) from public;
grant execute on function correct_resident_data_integrity_malformed_field(uuid, uuid, text, text, text) to service_role;

-- ─── return_resident_data_integrity_issue_to_identity_review ─────────────
-- Use when an issue is actually a "same human?" question. Inserts a
-- resident_identity_candidates row for the issue's members (same shape
-- create_resident_identity_candidates produces), links it, and closes the
-- issue. Confidence band / evidence are computed in TypeScript by the same
-- identity engine used everywhere else (lib/residents/identity/) —
-- this RPC only persists.
create or replace function return_resident_data_integrity_issue_to_identity_review(
  p_issue_id uuid,
  p_confidence_band text,
  p_evidence jsonb,
  p_household_context jsonb,
  p_matching_rule_version text,
  p_actor text,
  p_note text
)
returns resident_identity_candidates
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_new_candidate_id uuid;
  v_member record;
  v_candidate resident_identity_candidates%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to return an issue to identity review';
  end if;

  select status into v_status from resident_data_integrity_issues where id = p_issue_id for update;
  if not found then
    raise exception 'Issue not found';
  end if;
  if v_status not in ('open', 'investigating') then
    raise exception 'Only open/investigating issues can be returned to identity review';
  end if;

  insert into resident_identity_candidates (
    status, confidence_band, evidence, household_context, matching_rule_version
  ) values (
    'open', p_confidence_band, coalesce(p_evidence, '[]'::jsonb),
    coalesce(p_household_context, '[]'::jsonb), p_matching_rule_version
  )
  returning id into v_new_candidate_id;

  for v_member in select resident_id from resident_data_integrity_issue_members where issue_id = p_issue_id
  loop
    insert into resident_identity_candidate_members (candidate_id, resident_id)
    values (v_new_candidate_id, v_member.resident_id);
  end loop;

  update resident_data_integrity_issues
  set status = 'resolved_returned_to_identity_review', reviewed_at = now(), reviewed_by = p_actor,
      resolution = p_note, linked_identity_candidate_id = v_new_candidate_id,
      remediation_log = remediation_log || jsonb_build_array(jsonb_build_object(
        'action', 'returned_to_identity_review',
        'identityCandidateId', v_new_candidate_id,
        'actor', p_actor,
        'at', now()
      ))
  where id = p_issue_id;

  select * into v_candidate from resident_identity_candidates where id = v_new_candidate_id;
  return v_candidate;
end;
$$;

revoke execute on function return_resident_data_integrity_issue_to_identity_review(uuid, text, jsonb, jsonb, text, text, text) from public;
grant execute on function return_resident_data_integrity_issue_to_identity_review(uuid, text, jsonb, jsonb, text, text, text) to service_role;

-- ─── phone_raw fix: apply_roster_new_resident, convert_external_prospect_to_new_resident ──
-- Both previously wrote the SAME (already-normalized) value into both
-- `phone` and `phone_raw`, so `phone_raw` never actually held the true raw
-- source string. Each gets a new p_phone_raw parameter — the old signature
-- is dropped first since Postgres treats a changed parameter list as a new
-- overload rather than a replacement.
drop function if exists apply_roster_new_resident(text, text, text, text, text, text, text, text, text, text, text, text, uuid, text);

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
  p_phone_raw text,
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
    p_phone, p_phone_raw, 'active', 'resident', 'il', true,
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

revoke execute on function apply_roster_new_resident(text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, text) from public;
grant execute on function apply_roster_new_resident(text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, text) to service_role;

drop function if exists convert_external_prospect_to_new_resident(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text);

create or replace function convert_external_prospect_to_new_resident(
  p_relationship_id uuid,
  p_first_name text,
  p_last_name text,
  p_preferred_name text,
  p_community_name text,
  p_unit_number text,
  p_phone text,
  p_phone_raw text,
  p_email text,
  p_family_contact_name text,
  p_family_contact_relationship text,
  p_family_contact_phone text,
  p_family_contact_email text,
  p_conversion_note text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_current relationships%rowtype;
  v_resident_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to convert a relationship';
  end if;

  if length(trim(coalesce(p_first_name, ''))) = 0 or length(trim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'First and last name are required to create a resident';
  end if;

  select * into v_current from relationships where id = p_relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  if v_current.relationship_type <> 'external_prospect' then
    raise exception 'RELATIONSHIP_NOT_ELIGIBLE';
  end if;

  if v_current.resident_id is not null then
    raise exception 'This relationship is already linked to a resident';
  end if;

  insert into residents (
    first_name, last_name, preferred_name, community_name, unit_number,
    phone, phone_raw, email, family_contact_name, family_contact_relationship,
    family_contact_phone, family_contact_email, source_system, is_active, status
  ) values (
    trim(p_first_name), trim(p_last_name), p_preferred_name, p_community_name, p_unit_number,
    p_phone, p_phone_raw, p_email, p_family_contact_name, p_family_contact_relationship,
    p_family_contact_phone, p_family_contact_email, 'serve_os_manual', true, 'active'
  )
  returning id into v_resident_id;

  update relationships
  set relationship_type = 'resident_prospect',
      resident_id = v_resident_id,
      updated_by = p_actor
  where id = p_relationship_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'relationship_converted',
    v_current.display_name || ' converted to a new Resident Prospect.',
    p_conversion_note, 'residents', v_resident_id, p_actor, true
  );

  insert into relationship_conversions (
    relationship_id, from_relationship_type, to_relationship_type, conversion_path,
    resident_id, effective_date, conversion_note, converted_by
  ) values (
    p_relationship_id, 'external_prospect', 'resident_prospect', 'external_prospect_to_new_resident',
    v_resident_id, current_date, p_conversion_note, p_actor
  );

  return v_resident_id;
end;
$$;

revoke execute on function convert_external_prospect_to_new_resident(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function convert_external_prospect_to_new_resident(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

commit;
