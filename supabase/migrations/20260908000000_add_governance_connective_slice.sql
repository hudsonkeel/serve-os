begin;

-- Governance Connective Slice v0.1 — wires the already-canonical Incident,
-- Infection, and EPRP Annual Review records into compliance_activity and
-- compliance_corrective_actions, per the "Slice One" build plan. Adds no
-- new canonical tables — every domain record this touches already existed
-- (incidents, infections, emergency_preparedness_review_items) and remains
-- the sole source of truth. This migration only adds connective tissue:
-- lightweight event pointers and source-linked corrective-action
-- provenance.
--
-- Three independent pieces, all purely additive (new nullable columns,
-- new constraint values, new indexes) — no existing row, column, or
-- constraint is narrowed or removed:
--
--   1. compliance_activity gains a genuine structured source pointer
--      (source_type/source_record_id) distinct from its existing free-text
--      `source` column (confirmed populated today with the fixed literal
--      "Serve OS" — a label, not a reference — so it is left untouched),
--      plus 6 new event_type values for Incident/Infection lifecycle
--      events, plus a structural uniqueness guarantee so a lifecycle event
--      can never be duplicated for the same source record regardless of
--      write path (the original write, a retry, or a future backfill).
--      compliance_activity is reconstructible derived history — every
--      fact it records is independently recoverable from the canonical
--      incidents/infections rows (created_at/reviewed_at/resolved_at) —
--      so this uniqueness constraint is what makes a future backfill job
--      safe to write as a plain re-run, without one being built here.
--
--      No foreign key on source_record_id: this table is explicitly
--      "platform infrastructure, available to any audit-native domain"
--      (see lib/data/complianceActivity.ts) — an open-ended, growing set
--      of future writers, the same condition under which this schema
--      already prefers a generic polymorphic pointer over a per-type FK
--      (see resident_wellness_follow_ups.source_id in
--      20260712010000_create_resident_wellness_follow_ups.sql).
--
--   2. compliance_corrective_actions gains three new narrow, enumerable,
--      FK-backed source columns — source_incident_id, source_infection_id,
--      source_review_item_id — following the exact shape already
--      established by this same table's own audit_session_item_id: a
--      typed nullable FK per source type, not a generic source_type/
--      source_id pair, because this source set is small and enumerable
--      (four values total), unlike compliance_activity's open-ended one
--      above. A new CHECK guarantees provenance stays unambiguous: at
--      most one of the four source columns is ever set per row.
--
--      IMPORTANT correction made during implementation, not anticipated
--      in the build plan: the existing
--      compliance_corrective_actions_one_open_per_issue_idx uniqueness
--      rule (one open action per subject+requirement+action_type) is
--      WRONG for source-linked actions. Two different incidents for the
--      same resident, both needing follow-up, would incorrectly collide
--      under that rule, since both would carry the same subject_id, a
--      null requirement_id, and the same action_type
--      ('incident_follow_up_required'). The old index is narrowed to
--      apply only to actions with no source record (its original,
--      correct use case — one open gap per evidence/requirement pair);
--      three new dedicated partial unique indexes enforce "at most one
--      open action per specific source record" instead, which is the
--      right semantic once many source records can share a resident and
--      an action_type.
--
--      sync_compliance_corrective_action() is widened (via drop+recreate,
--      since Postgres cannot add trailing parameters to an existing
--      function signature via CREATE OR REPLACE without either changing
--      call-site arity or creating a confusing second overload) to accept
--      the three new source ids and to look up "is there already an open
--      action for this exact source record" instead of "for this
--      subject+requirement+action_type" whenever a source id is supplied
--      — one idempotent upsert entry point still serves every caller,
--      matching this schema's "the guarantee holds regardless of write
--      path" philosophy.
--
--      Two new action_type values — incident_follow_up_required,
--      infection_follow_up_required — since none of the six existing
--      evidence/audit-finding-shaped values fit a follow-up identified
--      during an incident/infection review. EPRP's own corrective actions
--      continue to use the existing evidence_missing/evidence_requires_review
--      values; no new action_type was needed for EPRP.
--
--   3. emergency_preparedness_review_items itself is untouched — it
--      already has its own real primary key, which is all
--      source_review_item_id needs to reference.
--
-- SAFETY REVIEW: no existing table is dropped or renamed; no existing
-- column is dropped, renamed, or narrowed; no existing row's data is
-- modified; the one existing index that is redefined
-- (…one_open_per_issue_idx) only narrows the set of rows it applies to
-- (adding "and no source id is set" to its WHERE clause) — every row that
-- satisfied it before still satisfies it now, since no pre-existing row
-- can have a non-null source_incident_id/source_infection_id/
-- source_review_item_id (the columns didn't exist until this migration).

-- ─── 1. compliance_activity: structured source pointer + new event types ──

alter table compliance_activity add column if not exists source_type text;
alter table compliance_activity add column if not exists source_record_id uuid;

drop index if exists compliance_activity_source_record_idx;
create unique index compliance_activity_source_record_idx
  on compliance_activity (source_type, source_record_id, event_type)
  where source_record_id is not null;

-- Idempotent drop/add-constraint replay — same pattern already used to
-- widen this exact CHECK for EPRP's own operational events (see
-- 20260902090000_create_emergency_preparedness_reviews.sql).
alter table compliance_activity drop constraint if exists compliance_activity_event_type_check;
alter table compliance_activity add constraint compliance_activity_event_type_check
  check (event_type in (
    'corrective_action_created',
    'corrective_action_resolved',
    'corrective_action_dismissed',
    'requirement_evidence_link_created',
    'audit_session_started',
    'audit_session_item_recorded',
    'audit_session_completed',
    'agency_temporary_relocation',
    'agency_service_area_expansion',
    'incident_created',
    'incident_reviewed',
    'incident_resolved',
    'infection_created',
    'infection_reviewed',
    'infection_resolved'
  ));

-- ─── 2. compliance_corrective_actions: source-linked provenance ───────────

alter table compliance_corrective_actions add column if not exists source_incident_id uuid;
alter table compliance_corrective_actions add column if not exists source_infection_id uuid;
alter table compliance_corrective_actions add column if not exists source_review_item_id uuid;

alter table compliance_corrective_actions
  drop constraint if exists compliance_corrective_actions_source_incident_fk;
alter table compliance_corrective_actions
  add constraint compliance_corrective_actions_source_incident_fk
  foreign key (source_incident_id) references public.incidents(id) on delete no action;

alter table compliance_corrective_actions
  drop constraint if exists compliance_corrective_actions_source_infection_fk;
alter table compliance_corrective_actions
  add constraint compliance_corrective_actions_source_infection_fk
  foreign key (source_infection_id) references public.infections(id) on delete no action;

alter table compliance_corrective_actions
  drop constraint if exists compliance_corrective_actions_source_review_item_fk;
alter table compliance_corrective_actions
  add constraint compliance_corrective_actions_source_review_item_fk
  foreign key (source_review_item_id) references public.emergency_preparedness_review_items(id) on delete no action;

-- Provenance stays unambiguous: at most one of the four possible source
-- columns (the pre-existing audit_session_item_id plus the three added
-- here) is ever set per row.
alter table compliance_corrective_actions
  drop constraint if exists compliance_corrective_actions_source_exclusivity_check;
alter table compliance_corrective_actions
  add constraint compliance_corrective_actions_source_exclusivity_check
  check (
    (case when audit_session_item_id is not null then 1 else 0 end)
    + (case when source_incident_id is not null then 1 else 0 end)
    + (case when source_infection_id is not null then 1 else 0 end)
    + (case when source_review_item_id is not null then 1 else 0 end)
    <= 1
  );

alter table compliance_corrective_actions
  drop constraint if exists compliance_corrective_actions_type_check;
alter table compliance_corrective_actions
  add constraint compliance_corrective_actions_type_check
  check (action_type in (
    'evidence_missing', 'evidence_expired', 'evidence_expiring_soon',
    'evidence_requires_review', 'evidence_awaiting_verification',
    'audit_finding_failed', 'incident_follow_up_required', 'infection_follow_up_required'
  ));

-- Narrow the existing "one open issue per subject+requirement+action_type"
-- rule to non-source-linked actions only — see migration header for why.
drop index if exists compliance_corrective_actions_one_open_per_issue_idx;
create unique index compliance_corrective_actions_one_open_per_issue_idx
  on compliance_corrective_actions (subject_type, subject_id, requirement_id, action_type)
  where status = 'open'
    and source_incident_id is null
    and source_infection_id is null
    and source_review_item_id is null;

-- "At most one open action per specific source record" — the correct
-- dedup semantic once many source records can share a resident and an
-- action_type.
create unique index compliance_corrective_actions_one_open_per_incident_idx
  on compliance_corrective_actions (source_incident_id)
  where status = 'open' and source_incident_id is not null;

create unique index compliance_corrective_actions_one_open_per_infection_idx
  on compliance_corrective_actions (source_infection_id)
  where status = 'open' and source_infection_id is not null;

create unique index compliance_corrective_actions_one_open_per_review_item_idx
  on compliance_corrective_actions (source_review_item_id)
  where status = 'open' and source_review_item_id is not null;

-- sync_compliance_corrective_action(): widen to accept the three new
-- source ids and to key its idempotent lookup off the specific source
-- record when one is supplied, rather than off subject+requirement+
-- action_type (which is the correct lookup key only for the
-- non-source-linked case). Explicit drop+create rather than
-- create-or-replace, since Postgres treats a changed parameter list as a
-- distinct function unless the old one is removed first.
drop function if exists sync_compliance_corrective_action(text, uuid, uuid, text, text, text, text, text, date, text);

create or replace function sync_compliance_corrective_action(
  p_subject_type text,
  p_subject_id uuid,
  p_requirement_id uuid,
  p_domain text,
  p_action_type text,
  p_title text,
  p_reason text,
  p_priority text,
  p_due_at date,
  p_actor text,
  p_source_incident_id uuid default null,
  p_source_infection_id uuid default null,
  p_source_review_item_id uuid default null
)
returns public.compliance_corrective_actions
language plpgsql
set search_path = public
as $$
declare
  v_existing public.compliance_corrective_actions%rowtype;
  v_result public.compliance_corrective_actions%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An actor is required to sync a corrective action';
  end if;

  if p_source_incident_id is not null then
    select * into v_existing
    from public.compliance_corrective_actions
    where source_incident_id = p_source_incident_id and status = 'open'
    for update;
  elsif p_source_infection_id is not null then
    select * into v_existing
    from public.compliance_corrective_actions
    where source_infection_id = p_source_infection_id and status = 'open'
    for update;
  elsif p_source_review_item_id is not null then
    select * into v_existing
    from public.compliance_corrective_actions
    where source_review_item_id = p_source_review_item_id and status = 'open'
    for update;
  else
    select * into v_existing
    from public.compliance_corrective_actions
    where subject_type = p_subject_type
      and subject_id = p_subject_id
      and requirement_id is not distinct from p_requirement_id
      and action_type = p_action_type
      and status = 'open'
      and source_incident_id is null
      and source_infection_id is null
      and source_review_item_id is null
    for update;
  end if;

  if found then
    update public.compliance_corrective_actions
    set title = p_title, reason = p_reason, priority = p_priority, due_at = p_due_at,
        domain = p_domain, updated_at = now()
    where id = v_existing.id
    returning * into v_result;
  else
    insert into public.compliance_corrective_actions (
      subject_type, subject_id, requirement_id, domain, action_type, title, reason, priority, due_at, created_by,
      source_incident_id, source_infection_id, source_review_item_id
    ) values (
      p_subject_type, p_subject_id, p_requirement_id, p_domain, p_action_type, p_title, p_reason, p_priority, p_due_at, p_actor,
      p_source_incident_id, p_source_infection_id, p_source_review_item_id
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke execute on function sync_compliance_corrective_action(text, uuid, uuid, text, text, text, text, text, date, text, uuid, uuid, uuid) from public;
grant execute on function sync_compliance_corrective_action(text, uuid, uuid, text, text, text, text, text, date, text, uuid, uuid, uuid) to service_role;

commit;
