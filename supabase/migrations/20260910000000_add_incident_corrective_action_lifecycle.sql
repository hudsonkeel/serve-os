begin;

-- Incident Corrective Action Lifecycle v0.1 — Phase 1 (schema only).
--
-- Extends the existing Incident -> Review -> Corrective Action pipeline
-- (20260907000000, 20260908000000) with the full QAPI arc: Corrective
-- Action -> Implementation -> Follow-Up Activity -> Effectiveness Review
-- -> Resolution. Every domain record this touches already exists
-- (incidents, compliance_corrective_actions) and remains the sole source
-- of truth — this migration adds columns, two new child tables, and new
-- RPCs. No existing table is dropped or renamed; no existing column is
-- dropped or narrowed.
--
-- ─── Design decisions (confirmed with product before writing this file) ──
--
-- 1. lifecycle_stage, not a repurposed `status`. compliance_corrective_actions
--    is shared infrastructure (EPRP, evidence-based findings, incidents) and
--    its existing `status` (open/resolved/dismissed) column keeps its exact
--    current meaning and its existing RPC
--    (resolve_compliance_corrective_action) untouched for every current
--    consumer. `lifecycle_stage` (open/implemented/verified_effective/
--    cancelled) is a second, orthogonal axis that only answers "has the
--    intervention happened, and been proven effective" — a question no
--    other domain asks today. An action can sit at status='open' for its
--    entire implementation + effectiveness-review arc (correctly keeping it
--    visible in Today's Work the whole time, per the existing "an open
--    corrective Action must keep showing... independently of the
--    Incident's lifecycle" precedent) and only gets formally closed
--    (status -> resolved) as a final bookkeeping step once its
--    lifecycle_stage reaches a real terminal state — REVISED: that
--    bookkeeping step is not left to a second manual click. Whichever RPC
--    drives lifecycle_stage to a state that needs no further action
--    (verified_effective; implemented with no effectiveness review
--    required; cancelled) closes status in the very same statement,
--    attributed to the same actor/timestamp already performing the
--    transition. See the comments directly above
--    mark_corrective_action_implemented, cancel_corrective_action_implementation,
--    and record_effectiveness_review_outcome for the exact rule per
--    transition. status stays 'open' for as long as real work remains
--    (plain 'open', or 'implemented' with an effectiveness review still
--    outstanding) — that is what keeps Today's Work's unmodified
--    status='open' filter accurate without any change to that filter
--    itself.
--
-- 2. Effectiveness review is a dedicated child record
--    (corrective_action_effectiveness_reviews), one per action in v0.1 — a
--    Partially Effective/Ineffective outcome is never retried on the same
--    row; the product path is a brand-new corrective action (see
--    create_incident_corrective_action below), never a mutated review. Its
--    due_at is the sole canonical due date for an effectiveness review —
--    compliance_corrective_actions does NOT also carry an
--    effectiveness_review_due_at column (an earlier draft of this
--    migration did; revised in place before this ever reached a database,
--    matching the audit_session_corrections precedent, 20260902060000, for
--    revising an unapplied migration rather than layering a correction on
--    top). effectiveness_review_required stays on the parent (a plain
--    boolean the two gating RPCs below need inline, not duplicated mutable
--    state — nothing about "was this demanded" changes over the action's
--    life once set at creation), but the due date itself has exactly one
--    source of truth.
--
-- 3. Follow-up activity is corrective_action_updates, single-parent
--    (corrective_action_id only, no incident_id) — every meaningful
--    follow-up event belongs to a specific corrective action; an incident
--    with follow_up_required=true and no action yet has nothing follow-up
--    shaped to log until one exists. True DB-enforced append-only via a
--    reject-on-UPDATE/DELETE trigger, not just RPC convention — matching
--    "no silent overwrites of historical QAPI evidence."
--
-- 4. The generic resolved/dismissed path must never silently substitute
--    for effectiveness verification. resolve_compliance_corrective_action
--    now refuses to close (resolve or dismiss) an
--    effectiveness_review_required action unless it has already reached
--    lifecycle_stage 'verified_effective' (a real completed, successful
--    review) or 'cancelled' (an explicit, reasoned withdrawal — its own
--    RPC, its own required note). This guard is a no-op for every row
--    where effectiveness_review_required is false (the default, and the
--    only value every pre-existing row — EPRP, evidence, infection-sourced
--    — will ever have), so no other domain's behavior changes.
--
-- 5. compliance_corrective_actions_one_open_per_incident_idx (added in
--    20260908000000) is dropped. Investigation confirmed its only caller
--    was createIncidentCorrectiveActionAction — a single human-click
--    action, never a recurring automated reconciliation job — so "one open
--    action per incident" was never a real business rule, only a side
--    effect of routing that one-time human action through
--    sync_compliance_corrective_action's idempotent-upsert idiom (the
--    idiom genuinely automated domains — EPRP's readiness evaluator,
--    evidence-expiry recompute — actually need). Incident corrective
--    actions now support real multiplicity via a dedicated plain-insert
--    RPC (create_incident_corrective_action) that never dedupes by
--    source. sync_compliance_corrective_action itself, and its
--    subject+requirement+action_type / source_infection_id /
--    source_review_item_id branches, are completely untouched — real
--    automated dedupe for every other domain is preserved exactly as-is.
--
-- 6. Reviewed incident findings, like reviewed_by/reviewed_at, are frozen
--    once populated — but never populated is not the same as frozen blank.
--    Every incident reviewed before this column existed (the canonical
--    acceptance case's medication incident included) has review_findings
--    = null with no way to ever receive it, since a pre-existing reviewed
--    incident never goes through the first-review branch again.
--    mark_incident_reviewed's re-affirm path (review_status already
--    'reviewed') therefore permits exactly one write to review_findings —
--    only when the current value is null and the caller supplies a
--    non-blank one — without ever touching reviewed_by/reviewed_at. The
--    instant it is non-null, this same branch never writes it again,
--    regardless of what is passed; this is a narrow legacy-backfill path,
--    not a general edit capability. A later substantive *change* to
--    already-recorded findings is still future amendment-capability work
--    (see audit_session_corrections' append-only correction-log precedent,
--    20260902060000) — explicitly not built here.
--
-- 7. Incident participant multi-select/role tagging is explicitly deferred
--    to a follow-on slice — not touched by this migration.
--
-- SAFETY REVIEW: two net-new tables (plus two trigger functions guarding
-- one of them), eight new/replaced columns on compliance_corrective_actions,
-- one new column on incidents, one dropped index (permissive — narrows
-- nothing that could be violated, since it can only be violated going
-- forward once multi-action creation exists), six new or replaced RPCs. No
-- existing table is dropped; no existing column is dropped or narrowed; no
-- existing row's data is modified. mark_incident_reviewed's signature
-- changes (a required new positional parameter) — its one call site
-- (lib/data/incidents.ts) is updated in the same change so nothing is left
-- broken mid-deploy.

-- ─── 1. incidents: review findings, frozen after first review ────────────

alter table incidents add column if not exists review_findings text;

drop function if exists mark_incident_reviewed(uuid, boolean, text, text);

create or replace function mark_incident_reviewed(
  p_incident_id uuid,
  p_follow_up_required boolean,
  p_owner text,
  p_review_findings text,
  p_actor text
)
returns public.incidents
language plpgsql
set search_path = public
as $$
declare
  v_current public.incidents%rowtype;
  v_result public.incidents%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to review an incident';
  end if;

  if p_follow_up_required is null then
    raise exception 'A follow-up decision (yes/no) is required to review an incident';
  end if;

  select * into v_current from public.incidents where id = p_incident_id for update;

  if not found then
    raise exception 'Incident % not found', p_incident_id;
  end if;

  if v_current.review_status = 'reviewed' then
    -- Re-affirmation path: follow_up_required/owner may still evolve.
    -- reviewed_by/reviewed_at are frozen at their first-review values
    -- forever, never touched here. review_findings gets exactly one
    -- legacy-backfill write: only when it is currently null AND the caller
    -- supplies a non-blank value — covers every incident reviewed before
    -- this column existed (this incident's own current review_findings is
    -- unaffected once it is non-null; the CASE below then always keeps the
    -- existing value). See design decision 6 above.
    update public.incidents
    set follow_up_required = p_follow_up_required,
        owner = p_owner,
        review_findings = case
          when v_current.review_findings is null
            and p_review_findings is not null
            and length(trim(p_review_findings)) > 0
          then trim(p_review_findings)
          else v_current.review_findings
        end,
        updated_by = p_actor,
        updated_at = now()
    where id = p_incident_id
    returning * into v_result;
    return v_result;
  end if;

  update public.incidents
  set review_status = 'reviewed',
      reviewed_by = p_actor,
      reviewed_at = now(),
      review_findings = nullif(trim(coalesce(p_review_findings, '')), ''),
      follow_up_required = p_follow_up_required,
      owner = p_owner,
      updated_by = p_actor,
      updated_at = now()
  where id = p_incident_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function mark_incident_reviewed(uuid, boolean, text, text, text) from public;
grant execute on function mark_incident_reviewed(uuid, boolean, text, text, text) to service_role;

-- ─── 2. compliance_corrective_actions: lifecycle + effectiveness columns ──

alter table compliance_corrective_actions add column if not exists action_plan text;
alter table compliance_corrective_actions add column if not exists lifecycle_stage text not null default 'open';
alter table compliance_corrective_actions add column if not exists implemented_at timestamptz;
alter table compliance_corrective_actions add column if not exists implemented_by text;
alter table compliance_corrective_actions add column if not exists cancelled_at timestamptz;
alter table compliance_corrective_actions add column if not exists cancelled_by text;
alter table compliance_corrective_actions add column if not exists cancellation_note text;
alter table compliance_corrective_actions add column if not exists effectiveness_review_required boolean not null default false;

alter table compliance_corrective_actions
  drop constraint if exists compliance_corrective_actions_lifecycle_stage_check;
alter table compliance_corrective_actions
  add constraint compliance_corrective_actions_lifecycle_stage_check
  check (lifecycle_stage in ('open', 'implemented', 'verified_effective', 'cancelled'));

-- Actor/timestamp discipline per lifecycle_stage — the same "all-or-nothing
-- per state" pattern as incidents_resolution_consistency_check. Note
-- verified_effective still carries implemented_at/implemented_by (it can
-- only be reached from 'implemented' — see
-- record_effectiveness_review_outcome below), never cancellation fields.
alter table compliance_corrective_actions
  drop constraint if exists compliance_corrective_actions_lifecycle_fields_check;
alter table compliance_corrective_actions
  add constraint compliance_corrective_actions_lifecycle_fields_check
  check (
    (lifecycle_stage = 'open'
      and implemented_at is null and implemented_by is null
      and cancelled_at is null and cancelled_by is null and cancellation_note is null)
    or
    (lifecycle_stage in ('implemented', 'verified_effective')
      and implemented_at is not null and implemented_by is not null
      and cancelled_at is null and cancelled_by is null and cancellation_note is null)
    or
    (lifecycle_stage = 'cancelled'
      and cancelled_at is not null and cancelled_by is not null and cancellation_note is not null)
  );

-- No effectiveness_review_due_at column/CHECK here — see design decision 2
-- above. "effectiveness_review_required = true implies a due date" is
-- guaranteed by create_incident_corrective_action always inserting the
-- child corrective_action_effectiveness_reviews row (due_at not null,
-- itself DB-enforced) in the same transaction whenever the flag is set —
-- the only path that ever sets the flag.

-- See design decision 5 above — this invariant was never a real business
-- rule; it only served the single-shot manual-creation flow being replaced
-- by create_incident_corrective_action below.
drop index if exists compliance_corrective_actions_one_open_per_incident_idx;

-- resolve_compliance_corrective_action: unchanged signature, new guard —
-- see design decision 4 above. A no-op for every row with
-- effectiveness_review_required = false (every pre-existing row).
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
  v_current public.compliance_corrective_actions%rowtype;
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

  select * into v_current
  from public.compliance_corrective_actions
  where id = p_action_id and status = 'open'
  for update;

  if not found then
    raise exception 'Open corrective action % not found', p_action_id;
  end if;

  if v_current.effectiveness_review_required
     and v_current.lifecycle_stage not in ('verified_effective', 'cancelled') then
    raise exception 'This corrective action requires a completed effectiveness review — or an explicit cancellation — before it can be resolved or dismissed';
  end if;

  update public.compliance_corrective_actions
  set status = p_status, resolved_by = p_actor, resolved_at = now(), resolution_note = p_resolution_note, updated_at = now()
  where id = p_action_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function resolve_compliance_corrective_action(uuid, text, text, text) from public;
grant execute on function resolve_compliance_corrective_action(uuid, text, text, text) to service_role;

-- ─── 3. corrective_action_effectiveness_reviews (dedicated child record) ──

create table if not exists corrective_action_effectiveness_reviews (
  id                    uuid primary key default gen_random_uuid(),

  corrective_action_id  uuid not null references public.compliance_corrective_actions(id) on delete no action,

  due_at                date not null,
  owner                 text,
  success_criteria      text not null,

  outcome               text,
  evidence              text,
  reviewed_by           text,
  reviewed_at           timestamptz,

  created_by            text not null,
  created_at            timestamptz not null default now(),

  -- One review record per action in v0.1 — a Partially Effective/
  -- Ineffective outcome is never retried here; the path forward is a new
  -- corrective action. See design decision 2 above.
  constraint corrective_action_effectiveness_reviews_one_per_action
    unique (corrective_action_id),
  constraint corrective_action_effectiveness_reviews_success_criteria_not_blank
    check (length(trim(success_criteria)) > 0),
  constraint corrective_action_effectiveness_reviews_created_by_not_blank
    check (length(trim(created_by)) > 0),
  constraint corrective_action_effectiveness_reviews_outcome_check
    check (outcome is null or outcome in ('effective', 'partially_effective', 'ineffective')),
  -- Scheduled (due_at/owner/criteria present, outcome null) or completed
  -- (all four present) — never half-way, matching this schema's universal
  -- resolution-fields discipline.
  constraint corrective_action_effectiveness_reviews_outcome_fields_check
    check (
      (outcome is null and evidence is null and reviewed_by is null and reviewed_at is null)
      or
      (outcome is not null and evidence is not null and length(trim(evidence)) > 0
        and reviewed_by is not null and reviewed_at is not null)
    )
);

create index if not exists corrective_action_effectiveness_reviews_action_idx
  on corrective_action_effectiveness_reviews (corrective_action_id);

alter table corrective_action_effectiveness_reviews enable row level security;
revoke all on corrective_action_effectiveness_reviews from public, anon, authenticated;
grant all on corrective_action_effectiveness_reviews to service_role;

-- ─── 4. corrective_action_updates (append-only follow-up activity) ───────

create table if not exists corrective_action_updates (
  id                    uuid primary key default gen_random_uuid(),

  corrective_action_id  uuid not null references public.compliance_corrective_actions(id) on delete no action,

  body                  text not null,

  created_by            text not null,
  created_at            timestamptz not null default now(),

  constraint corrective_action_updates_body_not_blank check (length(trim(body)) > 0),
  constraint corrective_action_updates_created_by_not_blank check (length(trim(created_by)) > 0)
);

create index if not exists corrective_action_updates_action_idx
  on corrective_action_updates (corrective_action_id, created_at);

alter table corrective_action_updates enable row level security;
revoke all on corrective_action_updates from public, anon, authenticated;
grant all on corrective_action_updates to service_role;

-- True DB-enforced append-only — no UPDATE or DELETE is ever legitimate on
-- a follow-up activity entry. Even service_role (the only role with any
-- grant on this table) is blocked structurally, not just by RPC-surface
-- convention — matching "no silent overwrites of historical QAPI
-- evidence."
create or replace function reject_corrective_action_update_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'corrective_action_updates is append-only — % is not permitted', tg_op;
end;
$$;

drop trigger if exists corrective_action_updates_no_update on corrective_action_updates;
create trigger corrective_action_updates_no_update
  before update on corrective_action_updates
  for each row execute function reject_corrective_action_update_mutation();

drop trigger if exists corrective_action_updates_no_delete on corrective_action_updates;
create trigger corrective_action_updates_no_delete
  before delete on corrective_action_updates
  for each row execute function reject_corrective_action_update_mutation();

-- ─── 5. New RPCs ───────────────────────────────────────────────────────

-- Plain insert — deliberately not an upsert/sync. Subject resolution
-- (resident/community) stays the app layer's job, exactly as
-- createIncidentCorrectiveActionAction already does today via
-- resolveGovernanceActivitySubject; this RPC only validates structural
-- invariants. domain/action_type/requirement_id are fixed — this RPC exists
-- only for incident-sourced actions.
create or replace function create_incident_corrective_action(
  p_incident_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_title text,
  p_finding text,
  p_action_plan text,
  p_owner text,
  p_priority text,
  p_due_at date,
  p_effectiveness_review_required boolean,
  p_effectiveness_review_due_at date,
  p_effectiveness_review_owner text,
  p_effectiveness_success_criteria text,
  p_actor text
)
returns public.compliance_corrective_actions
language plpgsql
set search_path = public
as $$
declare
  v_result public.compliance_corrective_actions%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An actor is required to create a corrective action';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'A title is required';
  end if;
  if p_finding is null or length(trim(p_finding)) = 0 then
    raise exception 'A finding/reason is required';
  end if;
  if p_action_plan is null or length(trim(p_action_plan)) = 0 then
    raise exception 'An action to be taken is required';
  end if;
  if p_incident_id is null then
    raise exception 'A source incident is required';
  end if;
  if coalesce(p_effectiveness_review_required, false) and (
       p_effectiveness_review_due_at is null
       or p_effectiveness_success_criteria is null
       or length(trim(p_effectiveness_success_criteria)) = 0
     ) then
    raise exception 'An effectiveness review due date and success criteria are required when an effectiveness review is required';
  end if;

  insert into public.compliance_corrective_actions (
    subject_type, subject_id, requirement_id, domain, action_type,
    title, reason, action_plan, owner, priority, due_at,
    effectiveness_review_required,
    source_incident_id, created_by
  ) values (
    p_subject_type, p_subject_id, null, 'incidents', 'incident_follow_up_required',
    trim(p_title), trim(p_finding), trim(p_action_plan), p_owner, coalesce(p_priority, 'normal'), p_due_at,
    coalesce(p_effectiveness_review_required, false),
    p_incident_id, p_actor
  )
  returning * into v_result;

  -- p_effectiveness_review_due_at is not stored on the parent row (see
  -- design decision 2) — it lives only here, on the child review record,
  -- which is the sole canonical source of the due date.
  if coalesce(p_effectiveness_review_required, false) then
    insert into public.corrective_action_effectiveness_reviews (
      corrective_action_id, due_at, owner, success_criteria, created_by
    ) values (
      v_result.id, p_effectiveness_review_due_at, p_effectiveness_review_owner, trim(p_effectiveness_success_criteria), p_actor
    );
  end if;

  return v_result;
end;
$$;

revoke execute on function create_incident_corrective_action(
  uuid, text, uuid, text, text, text, text, text, date, boolean, date, text, text, text
) from public;
grant execute on function create_incident_corrective_action(
  uuid, text, uuid, text, text, text, text, text, date, boolean, date, text, text, text
) to service_role;

-- Closure decision (confirmed with product before writing this): a
-- verified_effective/implemented-without-effectiveness-review/cancelled
-- action must not linger indefinitely at status='open' looking like
-- unfinished work everywhere status='open' is the filter (Today's Work's
-- getAllOpenCorrectiveActions() foremost). So whenever this RPC (or
-- cancel_corrective_action_implementation / record_effectiveness_review_outcome
-- below) drives lifecycle_stage to a real terminal state that needs no
-- further action, it now ALSO closes status in the same statement —
-- attributed to the same actor/timestamp already performing the
-- transition (this is a direct, synchronous consequence of a human
-- action, not a later background reconciliation job, so it is not
-- attributed to 'System' the way auto_resolve_compliance_corrective_actions
-- is). This reuses the existing resolved_by/resolved_at/resolution_note
-- fields rather than adding new ones. The still-pending states (plain
-- 'open', or 'implemented' while an effectiveness review is still
-- outstanding) are deliberately left at status='open' — genuinely still
-- active work — and the existing manual
-- resolve_compliance_corrective_action guard (this migration, above)
-- still protects that case from being closed out generically before
-- verification completes.
--
-- Here: implemented with NO effectiveness review required is a fully
-- complete action — auto-resolved immediately. Implemented WITH an
-- effectiveness review required stays status='open' until
-- record_effectiveness_review_outcome (or an explicit cancellation)
-- closes it.
create or replace function mark_corrective_action_implemented(
  p_action_id uuid,
  p_actor text
)
returns public.compliance_corrective_actions
language plpgsql
set search_path = public
as $$
declare
  v_result public.compliance_corrective_actions%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to mark a corrective action implemented';
  end if;

  update public.compliance_corrective_actions
  set lifecycle_stage = 'implemented',
      implemented_at = now(),
      implemented_by = p_actor,
      status = case when effectiveness_review_required then status else 'resolved' end,
      resolved_by = case when effectiveness_review_required then resolved_by else p_actor end,
      resolved_at = case when effectiveness_review_required then resolved_at else now() end,
      resolution_note = case
        when effectiveness_review_required then resolution_note
        else 'Automatically resolved — implemented; no effectiveness review required.'
      end,
      updated_at = now()
  -- status = 'open' guards the symmetric case: this action may already
  -- have been closed via the generic resolve/dismiss path (still possible
  -- for a non-effectiveness-required action while lifecycle_stage is
  -- still 'open') — never let this "reopen" an already-closed action.
  where id = p_action_id and lifecycle_stage = 'open' and status = 'open'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Corrective action % not found, not in an implementable state, or already closed', p_action_id;
  end if;

  return v_result;
end;
$$;

revoke execute on function mark_corrective_action_implemented(uuid, text) from public;
grant execute on function mark_corrective_action_implemented(uuid, text) to service_role;

-- Explicit, reasoned withdrawal — the one path (besides a completed,
-- successful effectiveness review) that lets an effectiveness-required
-- action stop blocking incident resolution. Allowed from 'open' or
-- 'implemented' (leadership may abandon the effectiveness-review plan
-- after implementing something, without that ever reading as "proven
-- effective"); never from 'verified_effective', which is already a real
-- terminal success. A cancelled action is also done needing attention —
-- see the closure-decision note above mark_corrective_action_implemented
-- — so this always closes status too, as 'dismissed' (not 'resolved':
-- nothing was accomplished, it was withdrawn), reusing cancellation_note's
-- own text as resolution_note rather than inventing a second free-text
-- field for the same explanation. IMPORTANT — this closure must never be
-- read as "cancellation counts as effectiveness verified": incident
-- resolution eligibility (lib/compliance/incidentResolutionEligibility.ts)
-- and resolve_incident's own gate below judge a cancelled action purely by
-- lifecycle_stage = 'cancelled', never by status; this status auto-close
-- is bookkeeping (keeping it out of Today's Work's open-actions list),
-- not a statement about whether the underlying problem was addressed.
create or replace function cancel_corrective_action_implementation(
  p_action_id uuid,
  p_actor text,
  p_cancellation_note text
)
returns public.compliance_corrective_actions
language plpgsql
set search_path = public
as $$
declare
  v_result public.compliance_corrective_actions%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to cancel a corrective action';
  end if;
  if p_cancellation_note is null or length(trim(p_cancellation_note)) = 0 then
    raise exception 'A cancellation reason is required';
  end if;

  update public.compliance_corrective_actions
  set lifecycle_stage = 'cancelled',
      cancelled_at = now(),
      cancelled_by = p_actor,
      cancellation_note = trim(p_cancellation_note),
      status = 'dismissed',
      resolved_by = p_actor,
      resolved_at = now(),
      resolution_note = trim(p_cancellation_note),
      updated_at = now()
  -- status = 'open' guards against cancelling an action that
  -- mark_corrective_action_implemented already auto-resolved (implemented,
  -- no effectiveness review required) — lifecycle_stage alone would still
  -- read 'implemented' there, which would otherwise let this regress an
  -- already-closed, fully-completed action back to 'cancelled'.
  where id = p_action_id and lifecycle_stage in ('open', 'implemented') and status = 'open'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Corrective action % not found, already in a terminal state, or already closed', p_action_id;
  end if;

  return v_result;
end;
$$;

revoke execute on function cancel_corrective_action_implementation(uuid, text, text) from public;
grant execute on function cancel_corrective_action_implementation(uuid, text, text) to service_role;

-- One-shot, matching resolve_incident's non-idempotent discipline — an
-- outcome is a deliberate, one-time statement, never silently re-recorded.
-- Only flips the parent action to verified_effective when the outcome is
-- 'effective' AND the action is currently 'implemented' — never from
-- 'open' (skipping implementation) or 'cancelled'/'verified_effective'
-- (already terminal).
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

  update public.corrective_action_effectiveness_reviews
  set outcome = p_outcome, evidence = trim(p_evidence), reviewed_by = p_actor, reviewed_at = now()
  where id = p_review_id
  returning * into v_result;

  -- Effective -> the action is now genuinely, fully done: lifecycle_stage
  -- advances to verified_effective AND status auto-closes to 'resolved' in
  -- the same statement (see the closure-decision note above
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

create or replace function add_corrective_action_update(
  p_corrective_action_id uuid,
  p_body text,
  p_actor text
)
returns public.corrective_action_updates
language plpgsql
set search_path = public
as $$
declare
  v_result public.corrective_action_updates%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to add a follow-up update';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'Update text is required';
  end if;

  insert into public.corrective_action_updates (corrective_action_id, body, created_by)
  values (p_corrective_action_id, trim(p_body), p_actor)
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function add_corrective_action_update(uuid, text, text) from public;
grant execute on function add_corrective_action_update(uuid, text, text) to service_role;

-- ─── 6. resolve_incident: resolution gating ───────────────────────────────
-- Unchanged signature. Defense-in-depth mirror of the pure eligibility
-- function (lib/compliance/incidentResolutionEligibility.ts) that renders
-- the Resolution card's checklist — never trust the client alone for a
-- structural gate, matching this migration's own guard on
-- resolve_compliance_corrective_action and the existing
-- incidents_resolve_requires_review_check precedent.
create or replace function resolve_incident(
  p_incident_id uuid,
  p_resolution_note text,
  p_actor text
)
returns public.incidents
language plpgsql
set search_path = public
as $$
declare
  v_current public.incidents%rowtype;
  v_result public.incidents%rowtype;
  v_blocking_count integer;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve an incident';
  end if;

  if p_resolution_note is null or length(trim(p_resolution_note)) = 0 then
    raise exception 'A resolution note is required';
  end if;

  select * into v_current from public.incidents where id = p_incident_id for update;

  if not found then
    raise exception 'Incident % not found', p_incident_id;
  end if;

  if v_current.status = 'resolved' then
    raise exception 'Incident % is already resolved', p_incident_id;
  end if;

  if v_current.review_status <> 'reviewed' then
    raise exception 'Incident % must be reviewed before it can be resolved', p_incident_id;
  end if;

  if v_current.follow_up_required then
    if not exists (
      select 1 from public.compliance_corrective_actions where source_incident_id = p_incident_id
    ) then
      raise exception 'Incident % requires at least one corrective action before it can be resolved', p_incident_id;
    end if;

    -- Cancellation-gating decision (confirmed with product before writing
    -- this): withdrawing every action is not the same as completing the
    -- follow-up requirement — an incident whose ONLY corrective action(s)
    -- were all cancelled must not become trivially resolvable, exactly as
    -- if zero actions had ever been created. A MIX of cancelled and
    -- completed actions is fine (the cancelled ones are legitimately
    -- withdrawn, the completed one(s) satisfy the requirement) — only the
    -- all-cancelled case is blocked here.
    if not exists (
      select 1 from public.compliance_corrective_actions
      where source_incident_id = p_incident_id and lifecycle_stage <> 'cancelled'
    ) then
      raise exception 'Incident % has no corrective action that was completed — every action was cancelled', p_incident_id;
    end if;

    -- A source-linked action stops blocking when: it was cancelled
    -- (explicit, reasoned withdrawal); or, if it demands effectiveness
    -- verification, only when it has reached verified_effective (status
    -- resolved/dismissed alone is NOT sufficient — see design decision 4
    -- and resolve_compliance_corrective_action's own guard, which prevents
    -- that combination from ever being reachable in the first place); or,
    -- if it does not demand effectiveness verification, when it is
    -- implemented/verified_effective OR closed via the generic
    -- resolved/dismissed path.
    select count(*) into v_blocking_count
    from public.compliance_corrective_actions a
    where a.source_incident_id = p_incident_id
      and a.lifecycle_stage <> 'cancelled'
      and not (
        case
          when a.effectiveness_review_required then a.lifecycle_stage = 'verified_effective'
          else a.lifecycle_stage in ('implemented', 'verified_effective') or a.status in ('resolved', 'dismissed')
        end
      );

    if v_blocking_count > 0 then
      raise exception 'Incident % has % corrective action(s) not yet complete', p_incident_id, v_blocking_count;
    end if;
  end if;

  update public.incidents
  set status = 'resolved',
      resolution_note = trim(p_resolution_note),
      resolved_by = p_actor,
      resolved_at = now(),
      updated_by = p_actor,
      updated_at = now()
  where id = p_incident_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function resolve_incident(uuid, text, text) from public;
grant execute on function resolve_incident(uuid, text, text) to service_role;

commit;
