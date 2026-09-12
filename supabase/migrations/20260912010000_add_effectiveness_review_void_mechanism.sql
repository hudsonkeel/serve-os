begin;

-- Incident Corrective Action Lifecycle v0.1 — the void-and-reopen
-- correction mechanism for an erroneously-recorded effectiveness outcome,
-- approved after live-validation surfaced exactly one real case (Brenda
-- Fritchen's medication-event incident: outcome recorded 2026-09-12,
-- twelve days before the review's own 2026-09-24 due date — the defect
-- 20260912000000's due-date guard now prevents going forward).
--
-- WHY "void the same row" rather than a new review row or a new
-- corrective action: corrective_action_effectiveness_reviews carries
-- unique(corrective_action_id) — one review per action, by original
-- design (a Partially Effective/Ineffective outcome is supposed to spawn
-- a brand-new corrective action, never retry the same review — see
-- 20260910000000's design decision 2). That precedent doesn't fit here:
-- this isn't a legitimate outcome that needs a new corrective action, it's
-- the SAME review, wrongly completed early, whose original schedule
-- (due_at/owner/success_criteria — all still correct) simply needs to
-- become live again. So this migration adds a narrower, smaller
-- mechanism: void the recorded outcome IN PLACE, snapshotting it into a
-- parallel set of columns (immutable once set — no UPDATE path is ever
-- exposed for them beyond the one-shot void RPC itself) and nulling the
-- active outcome/evidence/reviewed_by/reviewed_at back to their
-- pre-recording state so record_effectiveness_review_outcome (completely
-- UNCHANGED by this migration) treats the row as never-recorded again.
-- due_at/owner/success_criteria are never touched by any of this — they
-- have held 2026-09-24 the entire time, so reopening the row IS restoring
-- that scheduled review, not recreating it.
--
-- Scoped to exactly one correction per review (voided_at must currently be
-- null) — this is a v0.1 mechanism sized to the one known real case, not a
-- repeatable append-only correction log. If voiding a SECOND recorded
-- outcome on the same review is ever needed, that calls for the heavier
-- parent/child append-only pattern audit_session_corrections already
-- establishes (20260902060000) — not an ad hoc extension of this table.
--
-- Permission: admin-only (canVoidEffectivenessReviewOutcome, mirroring
-- canSupersedeRequirement's admin-only precedent) — this reverses a
-- recorded compliance determination and reopens an already-resolved
-- corrective action, a materially different trust tier than the
-- admin+manager tier that governs the normal forward lifecycle.
--
-- SAFETY REVIEW: one net-new RPC, seven new nullable columns on
-- corrective_action_effectiveness_reviews (added as one all-null-or-all-
-- present group, matching this schema's universal discipline), one new
-- CHECK constraint. No existing table, column, constraint, or function is
-- touched or narrowed. No existing row is modified by this migration
-- itself — applying the correction to Brenda's specific review is a
-- separate, explicit RPC call after this migration is live, not part of
-- the schema change.

alter table corrective_action_effectiveness_reviews add column if not exists voided_outcome text;
alter table corrective_action_effectiveness_reviews add column if not exists voided_evidence text;
alter table corrective_action_effectiveness_reviews add column if not exists voided_reviewed_by text;
alter table corrective_action_effectiveness_reviews add column if not exists voided_reviewed_at timestamptz;
alter table corrective_action_effectiveness_reviews add column if not exists voided_by text;
alter table corrective_action_effectiveness_reviews add column if not exists voided_at timestamptz;
alter table corrective_action_effectiveness_reviews add column if not exists void_reason text;

-- Voided (all seven present) or never-voided (all seven null) — never
-- half-way, matching this schema's universal resolution-fields discipline
-- (see corrective_action_effectiveness_reviews_outcome_fields_check for
-- the same pattern on the active outcome fields).
alter table corrective_action_effectiveness_reviews
  drop constraint if exists corrective_action_effectiveness_reviews_void_fields_check;
alter table corrective_action_effectiveness_reviews
  add constraint corrective_action_effectiveness_reviews_void_fields_check
  check (
    (voided_outcome is null and voided_evidence is null and voided_reviewed_by is null
      and voided_reviewed_at is null and voided_by is null and voided_at is null and void_reason is null)
    or
    (voided_outcome is not null and voided_evidence is not null and voided_reviewed_by is not null
      and voided_reviewed_at is not null and voided_by is not null and voided_at is not null
      and length(trim(void_reason)) > 0)
  );

-- One-shot per review (voided_at must currently be null — see migration
-- header for why this isn't a repeatable log in v0.1). Requires the review
-- to currently carry a real outcome; snapshots it verbatim into the
-- voided_* columns, then nulls the active outcome fields so
-- record_effectiveness_review_outcome (unchanged) can record a genuine new
-- determination once the review's own due date actually arrives. Reverts
-- the parent action only when it is in the exact state this review's
-- effective outcome would have produced (lifecycle_stage =
-- 'verified_effective') — the only path that could have gotten it there.
-- Also appends one corrective_action_updates row documenting the
-- correction on the existing, already-visible Follow-Up Activity timeline
-- — no new audit-trail surface needed.
create or replace function void_effectiveness_review_outcome(
  p_review_id uuid,
  p_actor text,
  p_void_reason text
)
returns public.corrective_action_effectiveness_reviews
language plpgsql
set search_path = public
as $$
declare
  v_current public.corrective_action_effectiveness_reviews%rowtype;
  v_result public.corrective_action_effectiveness_reviews%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to void an effectiveness review outcome';
  end if;
  if p_void_reason is null or length(trim(p_void_reason)) = 0 then
    raise exception 'A void reason is required';
  end if;

  select * into v_current from public.corrective_action_effectiveness_reviews where id = p_review_id for update;

  if not found then
    raise exception 'Effectiveness review % not found', p_review_id;
  end if;

  if v_current.outcome is null then
    raise exception 'Effectiveness review % has no recorded outcome to void', p_review_id;
  end if;

  if v_current.voided_at is not null then
    raise exception 'Effectiveness review % has already been voided', p_review_id;
  end if;

  update public.corrective_action_effectiveness_reviews
  set voided_outcome = outcome,
      voided_evidence = evidence,
      voided_reviewed_by = reviewed_by,
      voided_reviewed_at = reviewed_at,
      voided_by = p_actor,
      voided_at = now(),
      void_reason = trim(p_void_reason),
      outcome = null,
      evidence = null,
      reviewed_by = null,
      reviewed_at = null
  where id = p_review_id
  returning * into v_result;

  update public.compliance_corrective_actions
  set lifecycle_stage = 'implemented',
      status = 'open',
      resolved_by = null,
      resolved_at = null,
      resolution_note = null,
      updated_at = now()
  where id = v_current.corrective_action_id and lifecycle_stage = 'verified_effective';

  insert into public.corrective_action_updates (corrective_action_id, body, created_by)
  values (
    v_current.corrective_action_id,
    'Effectiveness outcome voided — ' || trim(p_void_reason),
    p_actor
  );

  return v_result;
end;
$$;

revoke execute on function void_effectiveness_review_outcome(uuid, text, text) from public;
grant execute on function void_effectiveness_review_outcome(uuid, text, text) to service_role;

commit;
