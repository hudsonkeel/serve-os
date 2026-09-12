begin;

-- Incident Corrective Action Lifecycle v0.1 — defense-in-depth fix for a
-- live-validation defect: record_effectiveness_review_outcome allowed an
-- Effective/Partially Effective/Ineffective outcome to be recorded before
-- the review's own due_at, with nothing (UI or RPC) enforcing "not yet
-- due." Confirmed reproduced on a real corrective action (Brenda
-- Fritchen's medication-event incident): effectiveness review due
-- 2026-09-24 had its outcome recorded 2026-09-12, twelve days early.
--
-- 20260910000000_add_incident_corrective_action_lifecycle.sql is already
-- applied to production — this is a NEW migration (create-or-replace on
-- the same, unchanged 4-parameter signature), not an edit to that file.
--
-- Business-date discipline (matches lib/utils/date.ts's
-- isBusinessDateOverdue/isBusinessDateDueTodayOrEarlier, added for the
-- separate Today's Work date-only display/classification bug): due_at is
-- a plain `date` column — a calendar day, not an instant. The correct
-- Postgres equivalent of "what Central-time calendar date is it right
-- now" is `(now() at time zone 'America/Chicago')::date` — converting the
-- current instant into Central wall-clock time, then truncating to a
-- date. This is compared directly against due_at (also a plain date, no
-- conversion needed on that side) — never `now()::date` alone, which
-- would silently use UTC and reintroduce the exact class of drift already
-- fixed on the TypeScript side.
--
-- "Not due until <due_at>" means due_at STRICTLY in the future relative
-- to today (Central) is rejected; due_at equal to today, or in the past,
-- is allowed — the guard only blocks early completion, never late
-- completion, matching v0.1's explicit no-early-review-override decision
-- (a late outcome is still a real, valid determination).
--
-- SAFETY REVIEW: one function replaced (create or replace, identical
-- signature — no existing caller's arity changes). No table, column, or
-- constraint touched. No existing row modified. The one erroneous
-- pre-due row already recorded is left completely alone here — its
-- correction is a separate, explicitly-approved migration, since undoing
-- recorded audit history is a different kind of change than closing this
-- forward-looking gap.
create or replace function record_effectiveness_review_outcome(
  p_review_id uuid,
  p_outcome text,
  p_evidence text,
  p_actor text
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
    raise exception 'An authenticated actor is required to record an effectiveness review outcome';
  end if;
  if p_outcome is null or p_outcome not in ('effective', 'partially_effective', 'ineffective') then
    raise exception 'Invalid outcome: %', p_outcome;
  end if;
  if p_evidence is null or length(trim(p_evidence)) = 0 then
    raise exception 'Evidence/findings are required to record an outcome';
  end if;

  select * into v_current from public.corrective_action_effectiveness_reviews where id = p_review_id for update;

  if not found then
    raise exception 'Effectiveness review % not found', p_review_id;
  end if;

  if v_current.outcome is not null then
    raise exception 'Effectiveness review % has already recorded an outcome', p_review_id;
  end if;

  -- Live-validation fix: an effectiveness determination cannot normally be
  -- made before its scheduled review date. Central-calendar-date
  -- comparison, never a UTC instant — see migration header.
  if v_current.due_at > (now() at time zone 'America/Chicago')::date then
    raise exception 'This effectiveness review is not due until % and cannot be completed before its scheduled review date', v_current.due_at;
  end if;

  update public.corrective_action_effectiveness_reviews
  set outcome = p_outcome, evidence = trim(p_evidence), reviewed_by = p_actor, reviewed_at = now()
  where id = p_review_id
  returning * into v_result;

  -- Effective -> the action is now genuinely, fully done: lifecycle_stage
  -- advances to verified_effective AND status auto-closes to 'resolved' in
  -- the same statement (see 20260910000000's closure-decision note above
  -- mark_corrective_action_implemented) — attributed to this same actor
  -- and this same instant, since recording a successful outcome IS the
  -- completing event, not a later reconciliation. Partially
  -- Effective/Ineffective deliberately leaves both lifecycle_stage
  -- ('implemented') and status ('open') exactly as they were — the action
  -- stays active, visible, and blocking, which is the whole point of that
  -- outcome.
  if p_outcome = 'effective' then
    update public.compliance_corrective_actions
    set lifecycle_stage = 'verified_effective',
        status = 'resolved',
        resolved_by = p_actor,
        resolved_at = now(),
        resolution_note = 'Automatically resolved — effectiveness verified.',
        updated_at = now()
    where id = v_current.corrective_action_id and lifecycle_stage = 'implemented';
  end if;

  return v_result;
end;
$$;

revoke execute on function record_effectiveness_review_outcome(uuid, text, text, text) from public;
grant execute on function record_effectiveness_review_outcome(uuid, text, text, text) to service_role;

commit;
