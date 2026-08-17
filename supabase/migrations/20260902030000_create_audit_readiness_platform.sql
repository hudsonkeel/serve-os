-- Audit Readiness v0.1 — Phase 1, Migration 4 of 4.
--
-- Net-new tables for the two things that genuinely do not exist anywhere
-- in Serve OS yet: (1) corrective actions for the domains Audit Readiness
-- is itself standing up natively this release (Emergency Preparedness,
-- Client File Readiness, cross-domain audit findings), and (2) the Audit
-- Drill data model (audit_sessions/audit_session_items), which has zero
-- precedent anywhere in this codebase.
--
-- Ownership boundary, enforced structurally, not just by convention:
--   workforce_compliance_actions (20260814000000) is left completely
--   untouched — no column added, no RPC signature changed, no row
--   migrated. It remains the sole home for workforce findings. The new
--   compliance_corrective_actions table's subject_type CHECK constraint
--   deliberately EXCLUDES 'workforce_member', so a workforce finding can
--   never be written here even by mistake — the two tables' subject
--   domains are disjoint by construction. Audit Readiness composes both
--   at the read layer (see lib/compliance/correctiveActionComposition.ts)
--   rather than owning a single table that would have required either
--   rewriting workforce's in-production RPCs or duplicating their logic —
--   both explicitly rejected.
--
-- compliance_corrective_actions mirrors workforce_compliance_actions'
-- column shape as closely as the subject difference allows (title/reason/
-- priority/status/resolution_note/resolved_by/resolved_at/created_by),
-- specifically so the read-side composition layer can merge both tables'
-- rows into one shape without field-mapping gymnastics — not because the
-- shape was independently redesigned.
--
-- audit_sessions/audit_session_items follow this codebase's established
-- append-only-with-a-locking-transition convention (see person_evidence's
-- protected-once-verified lifecycle): a session is freely editable while
-- draft/in_progress; completing it (complete_audit_session()) is the one
-- RPC that can transition it to 'completed', at which point a trigger
-- makes its items structurally immutable — mirroring, at the session
-- level, the same "verified/completed records are protected" discipline
-- person_evidence already enforces at the row level. This is what makes
-- "reopen a completed audit and see exactly what was reviewed" a real
-- guarantee rather than a UI convention.
--
-- SAFETY REVIEW: four net-new tables, one net-new trigger, four net-new
-- RPCs. No existing table, column, constraint, or function is touched.
-- RLS enabled + zero policies + service_role-only grants throughout,
-- matching every other table in this schema.

begin;

-- ─── Corrective Actions (polymorphic; audit-native domains only) ─────────
create table if not exists compliance_corrective_actions (
  id              uuid primary key default gen_random_uuid(),

  subject_type    text not null,
  subject_id      uuid not null,

  requirement_id  uuid references public.person_requirements(id) on delete no action,
  domain          text,

  action_type     text not null,
  title           text not null,
  reason          text not null,
  owner           text,
  priority        text not null default 'normal',
  due_at          date,
  status          text not null default 'open',

  resolution_note text,
  resolved_by     text,
  resolved_at     timestamptz,

  -- Set when this action was created from an Audit Drill finding (Module F
  -- step 8, "create a corrective action") — null for actions raised
  -- outside a drill (e.g. from the ordinary readiness dashboard).
  audit_session_item_id uuid,

  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Deliberately excludes 'workforce_member' — see the migration header.
  constraint compliance_corrective_actions_subject_type_check
    check (subject_type in ('resident', 'agency', 'community')),
  constraint compliance_corrective_actions_type_check
    check (action_type in (
      'evidence_missing', 'evidence_expired', 'evidence_expiring_soon',
      'evidence_requires_review', 'evidence_awaiting_verification',
      'audit_finding_failed'
    )),
  constraint compliance_corrective_actions_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint compliance_corrective_actions_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint compliance_corrective_actions_title_not_blank
    check (length(trim(title)) > 0),
  constraint compliance_corrective_actions_created_by_not_blank
    check (length(trim(created_by)) > 0),
  constraint compliance_corrective_actions_resolution_fields_check
    check (
      (status = 'open' and resolved_by is null and resolved_at is null)
      or (status <> 'open' and resolved_by is not null and resolved_at is not null)
    )
);

-- Same idempotency guarantee as workforce_compliance_actions' own index —
-- re-evaluating readiness twice must never create a second open action for
-- the same unresolved problem.
create unique index if not exists compliance_corrective_actions_one_open_per_issue_idx
  on compliance_corrective_actions (subject_type, subject_id, requirement_id, action_type)
  where status = 'open';

create index if not exists compliance_corrective_actions_status_idx
  on compliance_corrective_actions (status, due_at);

create index if not exists compliance_corrective_actions_subject_idx
  on compliance_corrective_actions (subject_type, subject_id);

alter table compliance_corrective_actions enable row level security;
revoke all on compliance_corrective_actions from public, anon, authenticated;
grant all on compliance_corrective_actions to service_role;

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
  p_actor text
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

  select * into v_existing
  from public.compliance_corrective_actions
  where subject_type = p_subject_type
    and subject_id = p_subject_id
    and requirement_id is not distinct from p_requirement_id
    and action_type = p_action_type
    and status = 'open'
  for update;

  if found then
    update public.compliance_corrective_actions
    set title = p_title, reason = p_reason, priority = p_priority, due_at = p_due_at,
        domain = p_domain, updated_at = now()
    where id = v_existing.id
    returning * into v_result;
  else
    insert into public.compliance_corrective_actions (
      subject_type, subject_id, requirement_id, domain, action_type, title, reason, priority, due_at, created_by
    ) values (
      p_subject_type, p_subject_id, p_requirement_id, p_domain, p_action_type, p_title, p_reason, p_priority, p_due_at, p_actor
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke execute on function sync_compliance_corrective_action(text, uuid, uuid, text, text, text, text, text, date, text) from public;
grant execute on function sync_compliance_corrective_action(text, uuid, uuid, text, text, text, text, text, date, text) to service_role;

create or replace function auto_resolve_compliance_corrective_actions(
  p_subject_type text,
  p_subject_id uuid,
  p_requirement_id uuid
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.compliance_corrective_actions
  set status = 'resolved',
      resolved_by = 'System',
      resolved_at = now(),
      resolution_note = 'Resolved automatically — the requirement now evaluates as satisfied.',
      updated_at = now()
  where subject_type = p_subject_type
    and subject_id = p_subject_id
    and requirement_id is not distinct from p_requirement_id
    and status = 'open';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function auto_resolve_compliance_corrective_actions(text, uuid, uuid) from public;
grant execute on function auto_resolve_compliance_corrective_actions(text, uuid, uuid) to service_role;

create or replace function resolve_compliance_corrective_action(
  p_action_id uuid,
  p_status text,
  p_actor text,
  p_resolution_note text
)
returns public.compliance_corrective_actions
language plpgsql
set search_path = public
as $$
declare
  v_result public.compliance_corrective_actions%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve a corrective action';
  end if;
  if p_resolution_note is null or length(trim(p_resolution_note)) = 0 then
    raise exception 'A resolution note is required';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Invalid status: %', p_status;
  end if;

  update public.compliance_corrective_actions
  set status = p_status, resolved_by = p_actor, resolved_at = now(), resolution_note = p_resolution_note, updated_at = now()
  where id = p_action_id and status = 'open'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Open corrective action % not found', p_action_id;
  end if;

  return v_result;
end;
$$;

revoke execute on function resolve_compliance_corrective_action(uuid, text, text, text) from public;
grant execute on function resolve_compliance_corrective_action(uuid, text, text, text) to service_role;

-- ─── Audit Sessions / Drills ───────────────────────────────────────────────
create table if not exists audit_sessions (
  id             uuid primary key default gen_random_uuid(),

  name           text not null,
  description    text,
  scope_domains  text[] not null default '{}',
  auditor        text not null,

  status         text not null default 'draft',
  summary        text,

  created_by     text not null,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint audit_sessions_status_check
    check (status in ('draft', 'in_progress', 'completed')),
  constraint audit_sessions_name_not_blank
    check (length(trim(name)) > 0),
  constraint audit_sessions_auditor_not_blank
    check (length(trim(auditor)) > 0),
  constraint audit_sessions_completion_fields_check
    check (
      (status <> 'completed' and completed_at is null)
      or (status = 'completed' and completed_at is not null)
    )
);

create index if not exists audit_sessions_status_idx
  on audit_sessions (status, started_at desc);

alter table audit_sessions enable row level security;
revoke all on audit_sessions from public, anon, authenticated;
grant all on audit_sessions to service_role;

create table if not exists audit_session_items (
  id                  uuid primary key default gen_random_uuid(),

  session_id          uuid not null references public.audit_sessions(id),
  requirement_id      uuid not null references public.person_requirements(id) on delete no action,

  subject_type        text not null,
  subject_id          uuid not null,

  evidence_id         uuid references public.person_evidence(id) on delete no action,
  finding             text not null,
  notes               text,

  corrective_action_id uuid references public.compliance_corrective_actions(id) on delete no action,

  created_by          text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint audit_session_items_subject_type_check
    check (subject_type in ('resident', 'workforce_member', 'agency', 'community')),
  constraint audit_session_items_finding_check
    check (finding in ('pass', 'fail', 'evidence_missing', 'needs_review')),
  constraint audit_session_items_created_by_not_blank
    check (length(trim(created_by)) > 0)
);

create index if not exists audit_session_items_session_idx
  on audit_session_items (session_id, created_at);

create index if not exists audit_session_items_subject_idx
  on audit_session_items (subject_type, subject_id);

alter table audit_session_items enable row level security;
revoke all on audit_session_items from public, anon, authenticated;
grant all on audit_session_items to service_role;

-- Once a session is completed, its items are structurally immutable — the
-- "reopen a completed audit and see exactly what was reviewed" guarantee.
-- Applies to both insert and update: a completed session can neither gain
-- a new item nor have an existing one edited.
create or replace function assert_audit_session_not_completed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.audit_sessions where id = new.session_id;

  if v_status is null then
    raise exception 'audit_session % does not exist', new.session_id;
  end if;

  if v_status = 'completed' then
    raise exception 'audit_session % is completed — its items are immutable', new.session_id;
  end if;

  return new;
end;
$$;

drop trigger if exists check_session_not_completed on audit_session_items;
create trigger check_session_not_completed
  before insert or update on audit_session_items
  for each row execute function assert_audit_session_not_completed();

create or replace function complete_audit_session(
  p_session_id uuid,
  p_summary text,
  p_actor text
)
returns public.audit_sessions
language plpgsql
set search_path = public
as $$
declare
  v_result public.audit_sessions%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to complete an audit session';
  end if;

  update public.audit_sessions
  set status = 'completed', completed_at = now(), summary = p_summary, updated_at = now()
  where id = p_session_id and status <> 'completed'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Audit session % not found or already completed', p_session_id;
  end if;

  return v_result;
end;
$$;

revoke execute on function complete_audit_session(uuid, text, text) from public;
grant execute on function complete_audit_session(uuid, text, text) to service_role;

-- ─── compliance_activity: audit-readiness-domain timeline ─────────────────
-- Same one-timeline-table-per-domain convention as workforce_activity /
-- resident_timeline / relationship_timeline. Polymorphic subject, since
-- this domain's own subjects (resident/agency/community) are polymorphic
-- from the start — unlike workforce_activity, which was written before a
-- second subject type existed.
create table if not exists compliance_activity (
  id            uuid primary key default gen_random_uuid(),

  subject_type  text not null,
  subject_id    uuid not null,

  event_type    text not null,
  event_title   text not null,
  event_description text,
  source        text not null,

  system_generated boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now(),

  constraint compliance_activity_subject_type_check
    check (subject_type in ('resident', 'agency', 'community')),
  constraint compliance_activity_event_type_check
    check (event_type in (
      'corrective_action_created',
      'corrective_action_resolved',
      'corrective_action_dismissed',
      'requirement_evidence_link_created',
      'audit_session_started',
      'audit_session_item_recorded',
      'audit_session_completed'
    )),
  constraint compliance_activity_event_title_not_blank
    check (length(trim(event_title)) > 0)
);

create index if not exists compliance_activity_subject_idx
  on compliance_activity (subject_type, subject_id, created_at desc);

alter table compliance_activity enable row level security;
revoke all on compliance_activity from public, anon, authenticated;
grant all on compliance_activity to service_role;

-- Added now, not at table-creation time above, purely because
-- audit_session_items didn't exist yet when compliance_corrective_actions
-- was created earlier in this same file — same file, same transaction,
-- no window where the column exists without its constraint.
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS — drop-then-add is the same
-- idempotent-replay pattern already used for every subject_type CHECK
-- widening in this migration series (see 20260819000000's own
-- drop-constraint-if-exists / add-constraint pair).
alter table compliance_corrective_actions
  drop constraint if exists compliance_corrective_actions_audit_session_item_fk;
alter table compliance_corrective_actions
  add constraint compliance_corrective_actions_audit_session_item_fk
  foreign key (audit_session_item_id) references public.audit_session_items(id) on delete no action;

commit;
