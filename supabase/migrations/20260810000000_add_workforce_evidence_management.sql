begin;

-- Workforce Intelligence — Evidence Management workflow.
--
-- Additive only. Builds on two migrations already applied to the live
-- database — neither is touched here:
--   20260808000000_create_workforce_intelligence_platform.sql   (original)
--   20260809000000_correct_workforce_evidence_invariants.sql    (corrective)
--
-- After those two, person_evidence already has:
--   verification_status text check (in 'unverified','verified','rejected')
--   lifecycle_status     text check (in 'active','expired','superseded')
-- This migration:
--   1. widens lifecycle_status to add 'entered_in_error'
--   2. adds the reason/actor/timestamp trail for lifecycle transitions
--   3. adds two immutability triggers protecting settled (verified or
--      rejected) evidence and the documents they reference
--   4. adds two RPCs: atomic unverified-evidence reassignment, and the one
--      permitted hard-delete path (an unverified, never-relied-upon upload)
--   5. widens workforce_activity's event_type set for the new audit events
--   6. adds two supporting indexes for the "has this been relied upon"
--      lookups the new RPCs and application code perform
--
-- Every statement is written to be safe to (re-)run against the current
-- live schema: `add column if not exists`, `drop constraint if exists` /
-- `add constraint`, `create or replace function`, `drop trigger if exists`
-- / `create trigger`, `create index if not exists`. Nothing here recreates
-- requirement_sets, person_requirements, requirement_set_members,
-- person_vendor_identity_links, person_documents, person_evidence,
-- workforce_activity, or workforce_axiscare_sync_runs — only alters them.

-- ─── 1 & 2. lifecycle_status widened + reason/actor/timestamp trail ──────
-- Populated exactly when lifecycle_status transitions away from 'active'
-- (supersede, mark entered in error, expire) — never when
-- verification_status changes, so the original verification judgment is
-- never confused with a later currency decision.
alter table public.person_evidence
  add column if not exists lifecycle_status_reason text;

alter table public.person_evidence
  add column if not exists lifecycle_status_changed_by text;

alter table public.person_evidence
  add column if not exists lifecycle_status_changed_at timestamptz;

-- Backfill any evidence already sitting in a non-'active' lifecycle_status
-- (e.g. from prior testing) before the new bidirectional constraint below
-- goes on, so this migration applies cleanly regardless of current data.
-- Never touches verification_status, verified_by, or verified_at.
update public.person_evidence
set
  lifecycle_status_reason = 'Backfilled by the Evidence Management migration — original reason was not recorded prior to this migration.',
  lifecycle_status_changed_by = 'system_migration',
  lifecycle_status_changed_at = coalesce(updated_at, created_at, now())
where lifecycle_status <> 'active'
  and lifecycle_status_reason is null;

-- 'entered_in_error' added: a record that should never have existed for
-- this subject/requirement (wrong caregiver, wrong requirement, duplicate
-- entry) — distinct from 'superseded' (correct-at-the-time, replaced by
-- newer evidence) and 'expired' (correct-at-the-time, simply aged out).
alter table public.person_evidence
  drop constraint if exists person_evidence_lifecycle_status_check;

alter table public.person_evidence
  add constraint person_evidence_lifecycle_status_check
  check (lifecycle_status in ('active', 'expired', 'superseded', 'entered_in_error'));

-- Bidirectional, same discipline as this table's existing
-- person_evidence_verification_fields_check: 'active' carries no
-- lifecycle-transition trail; anything else requires all three (a blank
-- reason is not a reason).
alter table public.person_evidence
  drop constraint if exists person_evidence_lifecycle_status_fields_check;

alter table public.person_evidence
  add constraint person_evidence_lifecycle_status_fields_check
  check (
    (lifecycle_status = 'active'
      and lifecycle_status_reason is null
      and lifecycle_status_changed_by is null
      and lifecycle_status_changed_at is null)
    or (lifecycle_status <> 'active'
      and lifecycle_status_reason is not null and length(trim(lifecycle_status_reason)) > 0
      and lifecycle_status_changed_by is not null
      and lifecycle_status_changed_at is not null)
  );

-- ─── 3. Immutability triggers ──────────────────────────────────────────────
-- "Verified evidence must remain historically immutable" — enforced here,
-- not just by convention. Once verification_status moves off 'unverified'
-- (verified OR rejected — both are settled judgments), every substantive
-- field is frozen; only the lifecycle_status trio (+ updated_at) may still
-- change, which is exactly how supersede / mark-entered-in-error / expire
-- work on an already-judged record. Free in-place editing remains
-- available only while verification_status = 'unverified'.
create or replace function assert_verified_evidence_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.verification_status in ('verified', 'rejected') then
    if new.subject_type is distinct from old.subject_type
      or new.subject_id is distinct from old.subject_id
      or new.requirement_id is distinct from old.requirement_id
      or new.document_id is distinct from old.document_id
      or new.verification_status is distinct from old.verification_status
      or new.result is distinct from old.result
      or new.source_system is distinct from old.source_system
      or new.performed_at is distinct from old.performed_at
      or new.effective_date is distinct from old.effective_date
      or new.review_due_date is distinct from old.review_due_date
      or new.expiration_date is distinct from old.expiration_date
      or new.entered_by is distinct from old.entered_by
      or new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at
      or new.notes is distinct from old.notes
      or new.supersedes_evidence_id is distinct from old.supersedes_evidence_id
      or new.created_at is distinct from old.created_at
    then
      raise exception
        'Evidence % has been % and is historically immutable — only a lifecycle_status transition (supersede, mark entered in error, expire) is permitted. Create a new evidence record instead.',
        old.id, old.verification_status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_verified_evidence_immutable on public.person_evidence;
create trigger check_verified_evidence_immutable
  before update on public.person_evidence
  for each row execute function assert_verified_evidence_immutable();

-- A document referenced by verified-or-rejected evidence is likewise
-- frozen except for its own status field (how supersession marks it
-- replaced) — closes the gap where someone could bypass the evidence-level
-- protection above by editing the document row directly.
create or replace function assert_verified_document_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.person_evidence
    where document_id = old.id and verification_status in ('verified', 'rejected')
  ) then
    if new.subject_type is distinct from old.subject_type
      or new.subject_id is distinct from old.subject_id
      or new.storage_bucket is distinct from old.storage_bucket
      or new.storage_path is distinct from old.storage_path
      or new.document_type is distinct from old.document_type
      or new.original_filename is distinct from old.original_filename
      or new.document_date is distinct from old.document_date
      or new.checksum is distinct from old.checksum
      or new.supersedes_document_id is distinct from old.supersedes_document_id
      or new.created_at is distinct from old.created_at
    then
      raise exception
        'Document % is referenced by verified or rejected evidence and is historically immutable except for its status field. Upload a replacement instead.',
        old.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_verified_document_immutable on public.person_documents;
create trigger check_verified_document_immutable
  before update on public.person_documents
  for each row execute function assert_verified_document_immutable();

-- ─── 4. RPCs ────────────────────────────────────────────────────────────────

-- Atomic "wrong caregiver" reassignment — unverified evidence only (backed
-- by the immutability trigger above; this function's own guard is the
-- friendly, specific error). Updates the document's subject first, then
-- the evidence's, so the live check_document_subject trigger (which fires
-- on the evidence update) always sees a document that already matches —
-- order matters here. Relies on assert_valid_person_subject(), already
-- live from the original migration.
create or replace function reassign_unverified_evidence_subject(
  p_evidence_id uuid,
  p_new_subject_id uuid,
  p_actor text,
  p_rationale text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_evidence public.person_evidence%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to reassign evidence';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to reassign evidence';
  end if;

  select * into v_evidence from public.person_evidence where id = p_evidence_id for update;
  if not found then
    raise exception 'Evidence % not found', p_evidence_id;
  end if;
  if v_evidence.verification_status <> 'unverified' then
    raise exception 'Only unverified evidence may be reassigned — evidence % has verification_status %',
      p_evidence_id, v_evidence.verification_status;
  end if;

  -- A record created via supersede/renewal carries supersedes_evidence_id
  -- pointing at the *old* subject's prior record — reassigning just this
  -- row's subject would either break that chain's own same-subject
  -- guarantee or trip it as a confusing, incidental error. If a renewal
  -- was matched to the wrong caregiver, delete it (see
  -- delete_unverified_evidence_and_document below) and create a
  -- correctly-assigned replacement instead of reassigning.
  if v_evidence.supersedes_evidence_id is not null then
    raise exception
      'Evidence % supersedes another record and cannot be reassigned — delete it and create a correctly-assigned replacement instead',
      p_evidence_id;
  end if;

  perform assert_valid_person_subject(v_evidence.subject_type, p_new_subject_id);

  if v_evidence.document_id is not null then
    update public.person_documents set subject_id = p_new_subject_id where id = v_evidence.document_id;
  end if;

  update public.person_evidence set subject_id = p_new_subject_id where id = p_evidence_id;
end;
$$;

revoke execute on function reassign_unverified_evidence_subject(uuid, uuid, text, text) from public;
grant execute on function reassign_unverified_evidence_subject(uuid, uuid, text, text) to service_role;

-- Hard delete — the one destructive operation Evidence Management permits,
-- and only for an unverified record that has never been relied upon: never
-- verified/rejected, and nothing else has ever superseded it (which would
-- itself prove it was relied upon as history). Deletes the evidence row
-- and, if nothing else references the same document, the document row too.
-- Does not touch Supabase Storage — the caller (lib/actions/workforce.ts)
-- removes the underlying file only after this succeeds, using the storage
-- path it read before calling this function.
create or replace function delete_unverified_evidence_and_document(
  p_evidence_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_evidence public.person_evidence%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to delete an accidental upload';
  end if;

  select * into v_evidence from public.person_evidence where id = p_evidence_id for update;
  if not found then
    raise exception 'Evidence % not found', p_evidence_id;
  end if;
  if v_evidence.verification_status <> 'unverified' then
    raise exception 'Only unverified evidence may be hard-deleted — evidence % has verification_status %',
      p_evidence_id, v_evidence.verification_status;
  end if;
  if exists (select 1 from public.person_evidence where supersedes_evidence_id = p_evidence_id) then
    raise exception 'Evidence % has already been relied upon (a later record supersedes it) and cannot be deleted', p_evidence_id;
  end if;
  if v_evidence.document_id is not null
    and exists (select 1 from public.person_documents where supersedes_document_id = v_evidence.document_id) then
    raise exception 'Document % has already been relied upon (a later document supersedes it) and cannot be deleted', v_evidence.document_id;
  end if;

  delete from public.person_evidence where id = p_evidence_id;

  if v_evidence.document_id is not null
    and not exists (select 1 from public.person_evidence where document_id = v_evidence.document_id) then
    delete from public.person_documents where id = v_evidence.document_id;
  end if;
end;
$$;

revoke execute on function delete_unverified_evidence_and_document(uuid, text) from public;
grant execute on function delete_unverified_evidence_and_document(uuid, text) to service_role;

-- ─── 5. workforce_activity: new event types ────────────────────────────────
-- Additive only — the 8 event types already live (including
-- 'evidence_superseded', from the original supersede action this session
-- replaced) remain valid. The application no longer *writes*
-- 'evidence_superseded' going forward (it now writes 'evidence_replaced' /
-- 'evidence_renewed' instead), but the value is left in the allowed set
-- rather than removed, since removing it could fail this migration if any
-- row already used it, and no such cleanup was requested.
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
    -- Evidence Management:
    'document_metadata_corrected',
    'document_reassigned',
    'accidental_upload_removed',
    'evidence_corrected',
    'evidence_marked_entered_in_error',
    'evidence_replaced',
    'evidence_renewed'
  ));

-- ─── 6. Supporting indexes ──────────────────────────────────────────────────
-- Both the new RPCs above and lib/data/personEvidence.ts's
-- hasSupersedingEvidence() query "does anything supersede this record" —
-- previously an unindexed scan of the FK column.
create index if not exists person_evidence_supersedes_evidence_id_idx
  on public.person_evidence (supersedes_evidence_id)
  where supersedes_evidence_id is not null;

create index if not exists person_documents_supersedes_document_id_idx
  on public.person_documents (supersedes_document_id)
  where supersedes_document_id is not null;

commit;
