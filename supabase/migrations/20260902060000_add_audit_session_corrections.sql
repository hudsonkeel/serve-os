-- Audit Readiness v0.1 — Governed Correction Mode. NOT YET APPLIED — reported
-- here per the same explicit instruction as the two migrations already
-- pending from Phase 4 (20260902040000, 20260902050000), before running any
-- further production migration.
--
-- This file REPLACES an earlier, simpler design (a flat free-text
-- "audit_session_amendments" table) that was written but never applied.
-- Since it never reached a real database, it is revised here in place
-- rather than superseded by a second migration layered on top of a shape
-- already known to be wrong.
--
-- Two tables, append-only (no update/delete path is ever exposed), RLS
-- locked to service_role, same required-actor/rationale discipline as
-- resident_serve_relationship_corrections
-- (20260826000000_add_resident_serve_relationship_corrections.sql) — but
-- now parent/child, so ONE correction event (one actor, one rationale) can
-- cover several item-level changes reviewed together as a single diff, the
-- shape Correction Mode's edit -> review -> lock flow actually needs. No
-- "one event, many field-changes" grouping pattern existed anywhere in this
-- codebase before this file (workforce_profile_changes and
-- resident_serve_relationship_corrections are both flat/ungrouped) — this
-- is the first, and it is scoped narrowly to this one capability.
--
-- This does NOT touch audit_sessions or audit_session_items in any way,
-- and does not weaken the completion-lock trigger
-- (assert_audit_session_not_completed(), 20260902030000) — that trigger
-- fires only on insert/update to audit_session_items, which neither table
-- here is ever written to. The original recorded findings stay exactly as
-- recorded, forever; corrections are a separate, appended, structured log
-- laid on top for read-time overlay — never an edit in place.
--
-- CORRECTION INTEGRITY (enforced by the application layer, not by SQL,
-- since it's a matter of meaning, not a constraint the database can check):
-- change_type = 'removed' means the finding was entered in error and
-- should not have been part of the audit — never "the underlying problem
-- was later fixed" (that is corrective-action resolution, a completely
-- separate, unlinked mechanism in workforce_compliance_actions /
-- compliance_corrective_actions; nothing here reads or writes those
-- tables). change_type = 'added' means a finding the correction asserts
-- should additionally have existed, with audit_session_item_id left null
-- since there is no original row to point back to — the application layer
-- must always render this as "Added during correction," never as if it
-- were part of the original completed audit.
--
-- previous_finding/previous_notes are captured from what the correcting
-- user was actually shown at correction time (passed by the caller), not
-- recomputed afterward — the same "caller-supplied, not recomputed"
-- discipline correct_resident_serve_relationship already established for
-- previous_value.
--
-- SAFETY REVIEW: purely additive — two new tables, one new RPC, nothing
-- existing altered.

begin;

create table audit_session_corrections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references audit_sessions(id),
  actor text not null check (length(trim(actor)) > 0),
  rationale text not null check (length(trim(rationale)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists audit_session_corrections_session_idx
  on audit_session_corrections (session_id, created_at);

alter table audit_session_corrections enable row level security;
revoke all on audit_session_corrections from public, anon, authenticated;
grant all on audit_session_corrections to service_role;

create table audit_session_item_corrections (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references audit_session_corrections(id),
  -- Null only for change_type = 'added' — see the CORRECTION INTEGRITY note
  -- above.
  audit_session_item_id uuid references audit_session_items(id),
  change_type text not null check (change_type in ('edited', 'added', 'removed')),
  requirement_id uuid not null references person_requirements(id),
  subject_type text not null,
  subject_id uuid not null,
  previous_finding text,  -- null when change_type = 'added'
  previous_notes text,
  new_finding text,       -- null when change_type = 'removed'
  new_notes text,
  created_at timestamptz not null default now()
);

create index if not exists audit_session_item_corrections_correction_idx
  on audit_session_item_corrections (correction_id);

create index if not exists audit_session_item_corrections_item_idx
  on audit_session_item_corrections (audit_session_item_id);

alter table audit_session_item_corrections enable row level security;
revoke all on audit_session_item_corrections from public, anon, authenticated;
grant all on audit_session_item_corrections to service_role;

-- Governed, atomic, multi-item correction RPC — one call inserts the parent
-- correction event plus every item-level change under it in a single
-- transaction, since Correction Mode reviews and locks several field
-- changes under ONE rationale together. This is the one deliberate
-- departure from this codebase's usual one-row-per-RPC-call convention
-- (see e.g. correct_resident_serve_relationship, add_audit_session_amendment
-- before it) — there is no client-side multi-statement transaction
-- available to assemble this any other way while still guaranteeing
-- atomicity.
--
-- p_item_corrections is a jsonb array; each element:
--   { "audit_session_item_id": uuid|null, "change_type": "edited"|"added"|"removed",
--     "requirement_id": uuid, "subject_type": text, "subject_id": uuid,
--     "previous_finding": text|null, "previous_notes": text|null,
--     "new_finding": text|null, "new_notes": text|null }
create or replace function add_audit_session_correction(
  p_session_id uuid,
  p_actor text,
  p_rationale text,
  p_item_corrections jsonb
)
returns audit_session_corrections
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_correction audit_session_corrections;
  v_item jsonb;
  v_item_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to correct an audit session';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A correction rationale is required';
  end if;
  if p_item_corrections is null or jsonb_typeof(p_item_corrections) <> 'array' or jsonb_array_length(p_item_corrections) = 0 then
    raise exception 'At least one item correction is required';
  end if;

  select status into v_status from audit_sessions where id = p_session_id;
  if v_status is null then
    raise exception 'audit_session % not found', p_session_id;
  end if;
  if v_status <> 'completed' then
    raise exception 'audit_session % is not completed — correct it directly while it is still in progress', p_session_id;
  end if;

  insert into audit_session_corrections (session_id, actor, rationale)
  values (p_session_id, p_actor, p_rationale)
  returning * into v_correction;

  for v_item in select * from jsonb_array_elements(p_item_corrections)
  loop
    v_item_id := nullif(v_item->>'audit_session_item_id', '')::uuid;

    if v_item_id is not null
       and not exists (select 1 from audit_session_items where id = v_item_id and session_id = p_session_id) then
      raise exception 'audit_session_item % does not belong to audit_session %', v_item_id, p_session_id;
    end if;

    insert into audit_session_item_corrections (
      correction_id, audit_session_item_id, change_type, requirement_id, subject_type, subject_id,
      previous_finding, previous_notes, new_finding, new_notes
    ) values (
      v_correction.id,
      v_item_id,
      v_item->>'change_type',
      (v_item->>'requirement_id')::uuid,
      v_item->>'subject_type',
      (v_item->>'subject_id')::uuid,
      v_item->>'previous_finding',
      v_item->>'previous_notes',
      v_item->>'new_finding',
      v_item->>'new_notes'
    );
  end loop;

  return v_correction;
end;
$$;

revoke execute on function add_audit_session_correction(uuid, text, text, jsonb) from public;
grant execute on function add_audit_session_correction(uuid, text, text, jsonb) to service_role;

commit;

-- ROLLBACK:
--
--   revoke execute on function add_audit_session_correction(uuid, text, text, jsonb) from service_role;
--   drop function if exists add_audit_session_correction(uuid, text, text, jsonb);
--   drop table if exists audit_session_item_corrections;
--   drop table if exists audit_session_corrections;
