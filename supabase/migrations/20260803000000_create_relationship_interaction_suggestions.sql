begin;

-- Relationship Intelligence — Unified Interaction Capture, Suggestion
-- Review. Extends Phase 1 (20260725000000_create_relationship_interaction_
-- intelligence.sql, ADR 0003) rather than replacing anything in it.
--
-- Phase 1 already lets a staff member type Insights/Commitments/Open
-- Loops/a Next Action directly into the capture form, saved atomically via
-- log_relationship_interaction(). What's missing is a review step: Serve
-- reading the narrative and proposing candidate updates the user then
-- approves, edits, or dismisses — never writing a downstream record
-- without a human approval action. This migration adds exactly that:
-- one new table (relationship_interaction_suggestions) holding
-- deterministically-generated candidates (generated in TypeScript — see
-- lib/relationships/suggestionEngine.ts — never fabricated AI output),
-- and one new nullable column (relationship_touches.structured_summary)
-- so an approved "summary" suggestion has somewhere to land without ever
-- overwriting the immutable raw narrative in relationship_touches.summary.
--
-- Approving a suggestion composes the EXISTING single-purpose RPCs
-- (create_relationship_action, create_relationship_working_note,
-- upsert_relationship_service_opportunity, change_relationship_stage,
-- save_resident_current_needs) or does a direct insert matching the exact
-- shape log_relationship_interaction already inserts for Insights/
-- Commitments/Open Loops — never a second, competing write path.

-- ─── relationship_touches: structured summary, distinct from the raw narrative ──
alter table relationship_touches add column if not exists structured_summary text;
comment on column relationship_touches.structured_summary is
  'Optional, staff-approved short summary distinct from the immutable raw narrative in `summary`. Null until a generated "summary" suggestion is approved. Never auto-populated or overwritten without an approval action.';

-- ─── relationship_interaction_suggestions ────────────────────────────────
-- Deletion/provenance policy matches relationship_insights/commitments/
-- open_loops exactly (see ADR 0003, Revision point 9): source_interaction_id
-- has no "on delete" clause (defaults to NO ACTION) so a future Interaction
-- hard-delete cannot silently orphan a suggestion's provenance.
create table if not exists relationship_interaction_suggestions (
  id                      uuid primary key default gen_random_uuid(),
  relationship_id         uuid not null references public.relationships(id) on delete cascade,
  source_interaction_id   uuid not null references public.relationship_touches(id),

  suggestion_type         text not null,
  payload                 jsonb not null,
  rationale               text,

  status                  text not null default 'pending',
  edited_payload          jsonb,
  resulting_record_table  text,
  resulting_record_id     uuid,

  created_by              text not null,
  created_at              timestamptz not null default now(),
  resolved_at             timestamptz,
  resolved_by             text,

  constraint relationship_interaction_suggestions_type_check
    check (suggestion_type in (
      'summary', 'commitment', 'open_loop', 'next_action',
      'working_note', 'service_opportunity', 'stage_change', 'resident_need'
    )),

  constraint relationship_interaction_suggestions_payload_is_object_check
    check (jsonb_typeof(payload) = 'object'),

  constraint relationship_interaction_suggestions_status_check
    check (status in ('pending', 'approved', 'dismissed')),

  -- Bidirectional: pending requires no resolution metadata; approved/
  -- dismissed require resolved_at/resolved_by. Same pattern as
  -- relationship_insights_resolved_fields_check and siblings.
  constraint relationship_interaction_suggestions_resolved_fields_check
    check (
      (status = 'pending' and resolved_at is null and resolved_by is null)
      or (status in ('approved', 'dismissed') and resolved_at is not null and resolved_by is not null)
    ),

  -- A dismissed suggestion never produced a downstream record; only
  -- 'approved' may carry resulting_record_table/resulting_record_id, and an
  -- approved one always must (defense in depth alongside the RPC's own
  -- branch-per-type logic below, which always sets both together).
  constraint relationship_interaction_suggestions_resulting_record_check
    check (
      (status <> 'approved' and resulting_record_table is null and resulting_record_id is null)
      or (status = 'approved' and resulting_record_table is not null and resulting_record_id is not null)
    )
);

create index if not exists relationship_interaction_suggestions_source_idx
  on relationship_interaction_suggestions (source_interaction_id);

create index if not exists relationship_interaction_suggestions_relationship_idx
  on relationship_interaction_suggestions (relationship_id, status, created_at desc);

alter table relationship_interaction_suggestions enable row level security;
-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this app.

comment on table relationship_interaction_suggestions is
  'Deterministically-generated (never AI-fabricated) candidate downstream updates from a logged Interaction — commitments, open questions, a working note, a service opportunity, a resident need, a stage change, or a short summary. Nothing here is authoritative until a human approves it; approving composes the existing single-purpose write RPCs, it never duplicates them.';
comment on column relationship_interaction_suggestions.payload is
  'The originally generated candidate. Shape depends on suggestion_type — mirrors the equivalent input shape log_relationship_interaction already accepts for Insights/Commitments/Open Loops/Next Action.';
comment on column relationship_interaction_suggestions.edited_payload is
  'What the user actually approved, if they changed anything before approving. Kept distinct from `payload` so the original suggestion and the final approved content are both auditable.';

-- ─── generate_interaction_suggestions: idempotent bulk insert ───────────
-- The extraction itself (which sentences look like a commitment, an open
-- question, a need, etc.) happens in TypeScript
-- (lib/relationships/suggestionEngine.ts) — this RPC only persists the
-- already-computed candidates, atomically, and only once per Interaction.
-- Generation is triggered automatically right after a successful Log
-- Interaction submission (never user-clickable), so a genuine concurrent
-- double-generation is not a realistic race — a simple existence guard is
-- sufficient, matching the level of rigor already used elsewhere in this
-- codebase for non-user-facing-button write paths.
create or replace function generate_interaction_suggestions(
  p_source_interaction_id uuid,
  p_relationship_id uuid,
  p_suggestions jsonb,
  p_actor text
)
returns setof relationship_interaction_suggestions
language plpgsql
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to generate suggestions';
  end if;

  if jsonb_typeof(coalesce(p_suggestions, '[]'::jsonb)) <> 'array' then
    raise exception 'suggestions must be a JSON array';
  end if;

  -- Idempotency: suggestions for this Interaction already exist — return
  -- them instead of generating a second, duplicate batch.
  if exists (
    select 1 from relationship_interaction_suggestions
    where source_interaction_id = p_source_interaction_id
  ) then
    return query
    select * from relationship_interaction_suggestions
    where source_interaction_id = p_source_interaction_id
    order by created_at asc;
    return;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_suggestions, '[]'::jsonb))
  loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(v_item->>'suggestionType', '') = ''
      or (v_item->'payload') is null
    then
      raise exception 'Each suggestion requires a suggestionType and a payload';
    end if;

    insert into relationship_interaction_suggestions (
      relationship_id, source_interaction_id, suggestion_type, payload, rationale, created_by
    ) values (
      p_relationship_id, p_source_interaction_id, v_item->>'suggestionType', v_item->'payload',
      nullif(v_item->>'rationale', ''), p_actor
    );
  end loop;

  return query
  select * from relationship_interaction_suggestions
  where source_interaction_id = p_source_interaction_id
  order by created_at asc;
end;
$$;

revoke execute on function generate_interaction_suggestions(uuid, uuid, jsonb, text) from public;
grant execute on function generate_interaction_suggestions(uuid, uuid, jsonb, text) to service_role;

-- ─── approve_interaction_suggestion: compose the existing write, once ───
-- Duplicate-approval prevention: locks the row, no-ops (returns the
-- existing resulting_record_id) if status is already something other than
-- 'pending' — the same "check status first under a row lock, no-op if
-- already resolved" pattern as resolve_relationship_insight/commitment/
-- open_loop. A retried or double-clicked Approve click is therefore always
-- safe.
create or replace function approve_interaction_suggestion(
  p_suggestion_id uuid,
  p_edited_payload jsonb default null,
  p_actor text default null
)
returns relationship_interaction_suggestions
language plpgsql
set search_path = public
as $$
declare
  v_row relationship_interaction_suggestions%rowtype;
  v_relationship relationships%rowtype;
  v_effective jsonb;
  v_result_table text;
  v_result_id uuid;
  v_action_id uuid;
  v_existing_needs text;
  v_merged_needs text;
  v_needs_row_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to approve a suggestion';
  end if;
  if p_edited_payload is not null and jsonb_typeof(p_edited_payload) <> 'object' then
    raise exception 'edited_payload must be a JSON object';
  end if;

  select * into v_row from relationship_interaction_suggestions where id = p_suggestion_id for update;
  if not found then
    raise exception 'Suggestion not found';
  end if;

  if v_row.status <> 'pending' then
    -- Already resolved (approved or dismissed) — idempotent no-op, return
    -- the row exactly as it stands rather than raising or re-applying.
    return v_row;
  end if;

  select * into v_relationship from relationships where id = v_row.relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  v_effective := coalesce(p_edited_payload, v_row.payload);

  if v_row.suggestion_type = 'summary' then
    update relationship_touches
    set structured_summary = v_effective->>'text'
    where id = v_row.source_interaction_id
    returning id into v_result_id;
    v_result_table := 'relationship_touches';

  elsif v_row.suggestion_type = 'commitment' then
    insert into relationship_commitments (
      relationship_id, description, responsible_party_type, responsible_party_reference,
      expected_date, source_interaction_id, created_by
    ) values (
      v_row.relationship_id,
      v_effective->>'description',
      v_effective->>'responsiblePartyType',
      nullif(v_effective->>'responsiblePartyReference', ''),
      nullif(v_effective->>'expectedDate', '')::date,
      v_row.source_interaction_id,
      p_actor
    )
    returning id into v_result_id;
    v_result_table := 'relationship_commitments';

  elsif v_row.suggestion_type = 'open_loop' then
    insert into relationship_open_loops (
      relationship_id, question, owner, target_resolution_date, source_interaction_id, created_by
    ) values (
      v_row.relationship_id,
      v_effective->>'question',
      nullif(v_effective->>'owner', ''),
      nullif(v_effective->>'targetResolutionDate', '')::date,
      v_row.source_interaction_id,
      p_actor
    )
    returning id into v_result_id;
    v_result_table := 'relationship_open_loops';

  elsif v_row.suggestion_type = 'next_action' then
    v_action_id := create_relationship_action(
      v_row.relationship_id,
      v_effective->>'actionType',
      v_effective->>'title',
      nullif(v_effective->>'description', ''),
      nullif(v_effective->>'dueAt', '')::timestamptz,
      nullif(v_effective->>'assignedTo', ''),
      coalesce(v_effective->>'priority', 'normal'),
      p_actor
    );
    update relationship_actions set source_interaction_id = v_row.source_interaction_id where id = v_action_id;
    v_result_id := v_action_id;
    v_result_table := 'relationship_actions';

  elsif v_row.suggestion_type = 'working_note' then
    v_result_id := create_relationship_working_note(
      v_row.relationship_id,
      v_effective->>'content',
      nullif(v_effective->>'category', ''),
      p_actor
    );
    v_result_table := 'relationship_working_notes';

  elsif v_row.suggestion_type = 'service_opportunity' then
    v_result_id := upsert_relationship_service_opportunity(
      v_row.relationship_id,
      v_effective->>'serviceSummary',
      nullif(v_effective->>'visitsPerWeek', '')::integer,
      nullif(v_effective->>'preferredDays', ''),
      nullif(v_effective->>'preferredTimeWindows', ''),
      nullif(v_effective->>'estimatedVisitMinutes', '')::integer,
      nullif(v_effective->>'anticipatedStartDate', '')::date,
      null,
      'draft',
      p_actor
    );
    v_result_table := 'relationship_service_opportunities';

  elsif v_row.suggestion_type = 'stage_change' then
    perform change_relationship_stage(
      v_row.relationship_id,
      v_effective->>'toStage',
      nullif(v_effective->>'changeReason', ''),
      p_actor
    );
    v_result_id := v_row.relationship_id;
    v_result_table := 'relationships';

  elsif v_row.suggestion_type = 'resident_need' then
    if v_relationship.resident_id is null then
      raise exception 'This relationship has no linked resident to record a need for';
    end if;

    select content into v_existing_needs
    from resident_current_needs
    where resident_id = v_relationship.resident_id and is_current = true;

    v_merged_needs := trim(both ' ' from coalesce(v_existing_needs, '') || ' ' || (v_effective->>'sentence'));

    select t.id into v_needs_row_id from save_resident_current_needs(
      v_relationship.resident_id, v_merged_needs, 'conversation',
      'Interaction ' || v_row.source_interaction_id::text, p_actor
    ) as t;

    v_result_id := v_needs_row_id;
    v_result_table := 'resident_current_needs';

  else
    raise exception 'Unknown suggestion type: %', v_row.suggestion_type;
  end if;

  update relationship_interaction_suggestions
  set status = 'approved',
      edited_payload = p_edited_payload,
      resulting_record_table = v_result_table,
      resulting_record_id = v_result_id,
      resolved_at = now(),
      resolved_by = p_actor
  where id = p_suggestion_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function approve_interaction_suggestion(uuid, jsonb, text) from public;
grant execute on function approve_interaction_suggestion(uuid, jsonb, text) to service_role;

-- ─── dismiss_interaction_suggestion ──────────────────────────────────────
-- Same idempotent no-op-if-already-resolved shape as approve above and as
-- resolve_relationship_insight/commitment/open_loop.
create or replace function dismiss_interaction_suggestion(
  p_suggestion_id uuid,
  p_actor text
)
returns relationship_interaction_suggestions
language plpgsql
set search_path = public
as $$
declare
  v_row relationship_interaction_suggestions%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to dismiss a suggestion';
  end if;

  select * into v_row from relationship_interaction_suggestions where id = p_suggestion_id for update;
  if not found then
    raise exception 'Suggestion not found';
  end if;

  if v_row.status <> 'pending' then
    return v_row;
  end if;

  update relationship_interaction_suggestions
  set status = 'dismissed', resolved_at = now(), resolved_by = p_actor
  where id = p_suggestion_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function dismiss_interaction_suggestion(uuid, text) from public;
grant execute on function dismiss_interaction_suggestion(uuid, text) to service_role;

commit;
