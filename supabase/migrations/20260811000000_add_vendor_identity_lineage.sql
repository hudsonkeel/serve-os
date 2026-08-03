begin;

-- Vendor Identity Lineage — multiple AxisCare records per workforce
-- member, a primary designation, and a full identity-decision correction
-- workflow (reopen / promote / demote / reassign).
--
-- Additive only. Builds on three migrations already applied to the live
-- database — none is touched here:
--   20260808000000_create_workforce_intelligence_platform.sql   (original)
--   20260809000000_correct_workforce_evidence_invariants.sql    (corrective)
--   20260810000000_add_workforce_evidence_management.sql        (evidence mgmt)
--
-- Prompted by a real case: two AxisCare caregiver records for the same
-- human (one active, one inactive), where the old "at most one confirmed
-- link per subject+source" constraint forced a reviewer to confirm one and
-- reject the other — permanently discarding the fact that they're the same
-- person, with no way to correct it. This migration replaces that
-- constraint with "at most one *primary* link per subject+source," adds a
-- role for every other confirmed record (duplicate/retired/historical),
-- and adds the correction actions (reopen, promote, demote, reassign) with
-- a full append-only decision history — none of which requires deleting or
-- merging any AxisCare record, and none of which creates a second
-- canonical workforce_members row for a known duplicate.

-- ─── 1. New columns on person_vendor_identity_links ───────────────────────
-- link_role only ever applies once status = 'confirmed' — a proposed,
-- rejected, or deferred link has no role. Four values:
--   primary    — the current, profile/lifecycle-driving record for this
--                subject+source. At most one, enforced below.
--   duplicate  — confirmed to be the same person, kept in sync, but not
--                profile-driving (e.g. an inactive twin of an active
--                primary record).
--   retired    — explicitly retired from active tracking by a reviewer
--                (distinct from 'duplicate': no longer being actively
--                curated, without asserting anything about whether it's
--                still a live secondary record).
--   historical — reserved for future lineage use (e.g. a prior employment
--                stint's caregiver ID); no action in this migration
--                assigns it, but the schema supports it now rather than
--                requiring a later migration.
alter table public.person_vendor_identity_links
  add column if not exists link_role text;

alter table public.person_vendor_identity_links
  add column if not exists duplicate_of_link_id uuid references public.person_vendor_identity_links(id) on delete no action;

alter table public.person_vendor_identity_links
  drop constraint if exists person_vendor_identity_links_link_role_check;

alter table public.person_vendor_identity_links
  add constraint person_vendor_identity_links_link_role_check
  check (link_role is null or link_role in ('primary', 'duplicate', 'retired', 'historical'));

-- link_role (and duplicate_of_link_id) exist only alongside status =
-- 'confirmed' — a proposed/rejected/deferred link never has either.
alter table public.person_vendor_identity_links
  drop constraint if exists person_vendor_identity_links_link_role_status_check;

alter table public.person_vendor_identity_links
  add constraint person_vendor_identity_links_link_role_status_check
  check (
    (status = 'confirmed' and link_role is not null)
    or (status <> 'confirmed' and link_role is null and duplicate_of_link_id is null)
  );

-- A link cannot point at itself, and (via the trigger below) can only
-- point at another link belonging to the same subject.
alter table public.person_vendor_identity_links
  drop constraint if exists person_vendor_identity_links_duplicate_of_not_self;

alter table public.person_vendor_identity_links
  add constraint person_vendor_identity_links_duplicate_of_not_self
  check (duplicate_of_link_id is distinct from id);

create or replace function assert_duplicate_of_link_same_subject()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_subject_type text;
  target_subject_id uuid;
  target_source_system text;
begin
  if new.duplicate_of_link_id is not null then
    select subject_type, subject_id, source_system
      into target_subject_type, target_subject_id, target_source_system
    from public.person_vendor_identity_links
    where id = new.duplicate_of_link_id;

    if target_subject_type is null then
      raise exception 'duplicate_of_link_id % does not exist', new.duplicate_of_link_id;
    end if;

    if target_subject_type <> new.subject_type or target_subject_id <> new.subject_id then
      raise exception 'duplicate_of_link_id % belongs to a different subject (%, %) than this link (%, %)',
        new.duplicate_of_link_id, target_subject_type, target_subject_id, new.subject_type, new.subject_id;
    end if;

    if target_source_system <> new.source_system then
      raise exception 'duplicate_of_link_id % belongs to a different source_system (%) than this link (%)',
        new.duplicate_of_link_id, target_source_system, new.source_system;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_duplicate_of_link_subject on public.person_vendor_identity_links;
create trigger check_duplicate_of_link_subject
  before insert or update on public.person_vendor_identity_links
  for each row execute function assert_duplicate_of_link_same_subject();

-- ─── 2. Replace "one confirmed" with "one primary" ────────────────────────
-- The constraint this migration exists to fix: previously at most one
-- *confirmed* link was allowed per subject+source at all, which is exactly
-- what forced the Locardia case's reviewer to reject a record that was
-- actually the same person. Now: any number of confirmed links per
-- subject+source (duplicate/retired/historical), but still at most one
-- *primary*.
drop index if exists person_vendor_identity_links_one_confirmed_per_subject_idx;

create unique index person_vendor_identity_links_one_primary_per_subject_idx
  on public.person_vendor_identity_links (subject_type, subject_id, source_system)
  where status = 'confirmed' and link_role = 'primary' and subject_id is not null;

-- ─── 3. Decision history — append-only, every human decision on a link ───
-- Distinct from person_vendor_identity_links' own resolved_by/resolved_at/
-- resolution_rationale, which only ever reflect the *latest* decision —
-- this table preserves every one of them, including the original
-- confirm/reject/deferral, so "preserve the previous decision in audit
-- history" holds even after several corrections. System-generated
-- proposals (from the AxisCare sync) are not logged here — only human
-- decisions are; the sync run's own counters already account for those.
create table if not exists person_vendor_identity_link_decisions (
  id                    uuid primary key default gen_random_uuid(),
  link_id               uuid not null references public.person_vendor_identity_links(id) on delete no action,

  action                text not null,

  previous_status       text,
  new_status            text,
  previous_link_role    text,
  new_link_role         text,
  previous_subject_id   uuid,
  new_subject_id        uuid,

  actor                 text not null,
  rationale             text not null,

  created_at            timestamptz not null default now(),

  constraint person_vendor_identity_link_decisions_action_check
    check (action in (
      'confirmed', 'rejected', 'deferred', 'reopened',
      'role_changed', 'subject_reassigned'
    )),

  constraint person_vendor_identity_link_decisions_actor_not_blank
    check (length(trim(actor)) > 0),

  constraint person_vendor_identity_link_decisions_rationale_not_blank
    check (length(trim(rationale)) > 0)
);

create index if not exists person_vendor_identity_link_decisions_link_idx
  on public.person_vendor_identity_link_decisions (link_id, created_at desc);

alter table public.person_vendor_identity_link_decisions enable row level security;

revoke all on public.person_vendor_identity_link_decisions from public, anon, authenticated;
grant all on public.person_vendor_identity_link_decisions to service_role;

-- ─── 4. Confirm — extended with link_role, backward compatible ───────────
-- Existing 3-argument calls (p_link_id, p_subject_id, p_actor) keep working
-- unchanged — p_link_role defaults to 'primary' (today's only behavior)
-- and p_rationale defaults to null. A rationale is required only when
-- linking as anything other than primary (duplicate/retired/historical) —
-- that's the new, explicitly correction-adjacent path ("Link a second
-- AxisCare record ... as duplicate/retired"); the plain first-link-as-
-- primary flow keeps its existing, no-rationale-required contract.
create or replace function confirm_person_vendor_identity_link(
  p_link_id uuid,
  p_subject_id uuid,
  p_actor text,
  p_link_role text default 'primary',
  p_rationale text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_link public.person_vendor_identity_links%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to confirm an identity link';
  end if;

  if p_link_role not in ('primary', 'duplicate', 'retired', 'historical') then
    raise exception 'Invalid link_role: %', p_link_role;
  end if;

  if p_link_role <> 'primary' and (p_rationale is null or length(trim(p_rationale)) = 0) then
    raise exception 'A rationale is required to link a record as %', p_link_role;
  end if;

  perform assert_valid_person_subject('workforce_member', p_subject_id);

  select * into v_link from public.person_vendor_identity_links where id = p_link_id for update;
  if not found then
    raise exception 'Identity link % not found', p_link_id;
  end if;
  if v_link.status <> 'proposed' then
    raise exception 'Identity link % is not in a proposed state', p_link_id;
  end if;

  if p_link_role = 'primary' and exists (
    select 1 from public.person_vendor_identity_links
    where subject_type = 'workforce_member' and subject_id = p_subject_id
      and source_system = v_link.source_system and status = 'confirmed' and link_role = 'primary'
  ) then
    raise exception
      'Workforce member % already has a primary % identity — use promote_person_vendor_identity_link_to_primary to replace it, or link this record as duplicate/retired instead',
      p_subject_id, v_link.source_system;
  end if;

  update public.person_vendor_identity_links
  set subject_id = p_subject_id,
      status = 'confirmed',
      link_role = p_link_role,
      resolved_by = p_actor,
      resolved_at = now()
  where id = p_link_id;

  insert into public.person_vendor_identity_link_decisions (
    link_id, action, previous_status, new_status, previous_link_role, new_link_role,
    previous_subject_id, new_subject_id, actor, rationale
  ) values (
    p_link_id, 'confirmed', 'proposed', 'confirmed', null, p_link_role,
    v_link.subject_id, p_subject_id, p_actor, coalesce(p_rationale, 'Confirmed as ' || p_link_role)
  );
end;
$$;

revoke execute on function confirm_person_vendor_identity_link(uuid, uuid, text, text, text) from public;
grant execute on function confirm_person_vendor_identity_link(uuid, uuid, text, text, text) to service_role;

-- ─── 5. Reject / defer — unchanged behavior, now also logged to history ──
create or replace function reject_person_vendor_identity_link(
  p_link_id uuid,
  p_actor text,
  p_rationale text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to reject an identity link';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to reject an identity link';
  end if;

  update public.person_vendor_identity_links
  set status = 'rejected',
      resolved_by = p_actor,
      resolved_at = now(),
      resolution_rationale = p_rationale
  where id = p_link_id and status = 'proposed';

  if not found then
    raise exception 'Identity link % is not in a proposed state', p_link_id;
  end if;

  insert into public.person_vendor_identity_link_decisions (
    link_id, action, previous_status, new_status, actor, rationale
  ) values (
    p_link_id, 'rejected', 'proposed', 'rejected', p_actor, p_rationale
  );
end;
$$;

revoke execute on function reject_person_vendor_identity_link(uuid, text, text) from public;
grant execute on function reject_person_vendor_identity_link(uuid, text, text) to service_role;

create or replace function defer_person_vendor_identity_link(
  p_link_id uuid,
  p_actor text,
  p_rationale text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to defer an identity link';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to defer an identity link';
  end if;

  update public.person_vendor_identity_links
  set status = 'deferred',
      resolved_by = p_actor,
      resolved_at = now(),
      resolution_rationale = p_rationale
  where id = p_link_id and status = 'proposed';

  if not found then
    raise exception 'Identity link % is not in a proposed state', p_link_id;
  end if;

  insert into public.person_vendor_identity_link_decisions (
    link_id, action, previous_status, new_status, actor, rationale
  ) values (
    p_link_id, 'deferred', 'proposed', 'deferred', p_actor, p_rationale
  );
end;
$$;

revoke execute on function defer_person_vendor_identity_link(uuid, text, text) from public;
grant execute on function defer_person_vendor_identity_link(uuid, text, text) to service_role;

-- ─── 6. Reopen — the correction entry point for a rejected/deferred link ──
-- Returns the link to 'proposed', clearing the resolution fields (matching
-- the existing bidirectional check constraint for that status) — the
-- original decision is never lost, since it's already permanently in
-- person_vendor_identity_link_decisions from the reject/defer call above.
create or replace function reopen_person_vendor_identity_link(
  p_link_id uuid,
  p_actor text,
  p_rationale text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_link public.person_vendor_identity_links%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to reopen an identity link';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to reopen an identity link';
  end if;

  select * into v_link from public.person_vendor_identity_links where id = p_link_id for update;
  if not found then
    raise exception 'Identity link % not found', p_link_id;
  end if;
  if v_link.status not in ('rejected', 'deferred') then
    raise exception 'Identity link % is not rejected or deferred (status: %)', p_link_id, v_link.status;
  end if;

  update public.person_vendor_identity_links
  set status = 'proposed',
      resolved_by = null,
      resolved_at = null,
      resolution_rationale = null
  where id = p_link_id;

  insert into public.person_vendor_identity_link_decisions (
    link_id, action, previous_status, new_status, actor, rationale
  ) values (
    p_link_id, 'reopened', v_link.status, 'proposed', p_actor, p_rationale
  );
end;
$$;

revoke execute on function reopen_person_vendor_identity_link(uuid, text, text) from public;
grant execute on function reopen_person_vendor_identity_link(uuid, text, text) to service_role;

-- ─── 7. Demote / retire a confirmed link (single-row, no side effects) ───
-- Deliberately refuses 'primary' — promoting to primary has an atomic
-- side effect (demoting the sibling that was primary) that belongs in its
-- own function, not silently inside this one.
create or replace function set_person_vendor_identity_link_role(
  p_link_id uuid,
  p_new_role text,
  p_actor text,
  p_rationale text,
  p_duplicate_of_link_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_link public.person_vendor_identity_links%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to change an identity link role';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to change an identity link role';
  end if;
  if p_new_role not in ('duplicate', 'retired', 'historical') then
    raise exception 'set_person_vendor_identity_link_role does not accept %% — use promote_person_vendor_identity_link_to_primary for primary', p_new_role;
  end if;

  select * into v_link from public.person_vendor_identity_links where id = p_link_id for update;
  if not found then
    raise exception 'Identity link % not found', p_link_id;
  end if;
  if v_link.status <> 'confirmed' then
    raise exception 'Identity link % is not confirmed (status: %)', p_link_id, v_link.status;
  end if;

  update public.person_vendor_identity_links
  set link_role = p_new_role,
      duplicate_of_link_id = p_duplicate_of_link_id
  where id = p_link_id;

  insert into public.person_vendor_identity_link_decisions (
    link_id, action, previous_link_role, new_link_role, actor, rationale
  ) values (
    p_link_id, 'role_changed', v_link.link_role, p_new_role, p_actor, p_rationale
  );
end;
$$;

revoke execute on function set_person_vendor_identity_link_role(uuid, text, text, text, uuid) from public;
grant execute on function set_person_vendor_identity_link_role(uuid, text, text, text, uuid) to service_role;

-- ─── 8. Promote to primary — atomically demotes the current primary ──────
-- "Demoting the previous primary atomically": both updates happen inside
-- this one function call, so no other transaction can observe a moment
-- with zero or two primaries for the same subject+source.
create or replace function promote_person_vendor_identity_link_to_primary(
  p_link_id uuid,
  p_actor text,
  p_rationale text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_link public.person_vendor_identity_links%rowtype;
  v_prior_primary public.person_vendor_identity_links%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to promote an identity link';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to promote an identity link';
  end if;

  select * into v_link from public.person_vendor_identity_links where id = p_link_id for update;
  if not found then
    raise exception 'Identity link % not found', p_link_id;
  end if;
  if v_link.status <> 'confirmed' then
    raise exception 'Identity link % is not confirmed (status: %)', p_link_id, v_link.status;
  end if;
  if v_link.link_role = 'primary' then
    raise exception 'Identity link % is already primary', p_link_id;
  end if;

  select * into v_prior_primary
  from public.person_vendor_identity_links
  where subject_type = v_link.subject_type and subject_id = v_link.subject_id
    and source_system = v_link.source_system and status = 'confirmed' and link_role = 'primary'
  for update;

  if found then
    update public.person_vendor_identity_links
    set link_role = 'duplicate',
        duplicate_of_link_id = p_link_id
    where id = v_prior_primary.id;

    insert into public.person_vendor_identity_link_decisions (
      link_id, action, previous_link_role, new_link_role, actor, rationale
    ) values (
      v_prior_primary.id, 'role_changed', 'primary', 'duplicate', p_actor,
      'Automatically demoted — replaced as primary by ' || p_link_id || '. ' || p_rationale
    );
  end if;

  update public.person_vendor_identity_links
  set link_role = 'primary',
      duplicate_of_link_id = null
  where id = p_link_id;

  insert into public.person_vendor_identity_link_decisions (
    link_id, action, previous_link_role, new_link_role, actor, rationale
  ) values (
    p_link_id, 'role_changed', v_link.link_role, 'primary', p_actor, p_rationale
  );
end;
$$;

revoke execute on function promote_person_vendor_identity_link_to_primary(uuid, text, text) from public;
grant execute on function promote_person_vendor_identity_link_to_primary(uuid, text, text) to service_role;

-- ─── 9. Correct a confirmed link's subject ("wrong workforce member") ────
-- Unlike reassign_unverified_evidence_subject() (evidence domain,
-- unverified-only), this operates on a *confirmed* identity link — the
-- Locardia-shaped case where a reviewer's original decision pointed the
-- right AxisCare record at the wrong canonical person entirely. The old
-- subject_id is preserved in person_vendor_identity_link_decisions, never
-- silently lost.
create or replace function reassign_confirmed_vendor_identity_link_subject(
  p_link_id uuid,
  p_new_subject_id uuid,
  p_actor text,
  p_rationale text,
  p_new_link_role text default 'primary'
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_link public.person_vendor_identity_links%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to reassign an identity link';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to reassign an identity link';
  end if;
  if p_new_link_role not in ('primary', 'duplicate', 'retired', 'historical') then
    raise exception 'Invalid link_role: %', p_new_link_role;
  end if;

  select * into v_link from public.person_vendor_identity_links where id = p_link_id for update;
  if not found then
    raise exception 'Identity link % not found', p_link_id;
  end if;
  if v_link.status <> 'confirmed' then
    raise exception 'Identity link % is not confirmed (status: %)', p_link_id, v_link.status;
  end if;

  perform assert_valid_person_subject(v_link.subject_type, p_new_subject_id);

  if p_new_link_role = 'primary' and exists (
    select 1 from public.person_vendor_identity_links
    where subject_type = v_link.subject_type and subject_id = p_new_subject_id
      and source_system = v_link.source_system and status = 'confirmed' and link_role = 'primary'
      and id <> p_link_id
  ) then
    raise exception
      'Workforce member % already has a primary % identity — reassign this link as duplicate/retired instead, or promote it separately after demoting the existing primary',
      p_new_subject_id, v_link.source_system;
  end if;

  update public.person_vendor_identity_links
  set subject_id = p_new_subject_id,
      link_role = p_new_link_role,
      duplicate_of_link_id = null,
      resolved_by = p_actor,
      resolved_at = now(),
      resolution_rationale = p_rationale
  where id = p_link_id;

  insert into public.person_vendor_identity_link_decisions (
    link_id, action, previous_link_role, new_link_role, previous_subject_id, new_subject_id, actor, rationale
  ) values (
    p_link_id, 'subject_reassigned', v_link.link_role, p_new_link_role, v_link.subject_id, p_new_subject_id, p_actor, p_rationale
  );
end;
$$;

revoke execute on function reassign_confirmed_vendor_identity_link_subject(uuid, uuid, text, text, text) from public;
grant execute on function reassign_confirmed_vendor_identity_link_subject(uuid, uuid, text, text, text) to service_role;

-- ─── 10. Widen workforce_activity for the new identity-lineage events ────
-- Existing values (original 8 + Evidence Management's 7) are all kept
-- unchanged; these four are additive.
alter table public.workforce_activity
  drop constraint if exists workforce_activity_event_type_check;

alter table public.workforce_activity
  add constraint workforce_activity_event_type_check
  check (event_type in (
    'workforce_profile_created',
    'identity_link_confirmed',
    'axiscare_source_data_refreshed',
    'document_uploaded',
    'evidence_created',
    'evidence_verified',
    'evidence_rejected',
    'evidence_superseded',
    'document_metadata_corrected',
    'document_reassigned',
    'accidental_upload_removed',
    'evidence_corrected',
    'evidence_marked_entered_in_error',
    'evidence_replaced',
    'evidence_renewed',
    'identity_link_reopened',
    'identity_link_promoted_to_primary',
    'identity_link_role_changed',
    'identity_link_subject_reassigned'
  ));

commit;
