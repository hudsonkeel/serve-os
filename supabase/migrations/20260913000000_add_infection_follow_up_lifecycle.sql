begin;

-- Infection Lifecycle & Learning Loop v0.1 — Phase 1 (schema only).
--
-- Extends the existing Infection -> Review -> Resolve pipeline
-- (20260907000000, 20260908000000) with two independent additions, per the
-- revised product direction (superseding an earlier draft plan that would
-- have directly cloned the Incident corrective-action model onto
-- infections):
--
--   1. Infection Follow-Up — a brand-new, first-class, append-only
--      longitudinal timeline (infection_follow_ups), with no Incident
--      analog. Every follow-up call/contact about a disclosed infection is
--      recorded as its own row: what was reported, how it affects service
--      delivery, what Serve did in response, and (optionally) when/why the
--      next follow-up should happen. The two "current obligation" columns
--      on infections itself (next_follow_up_date/next_follow_up_purpose)
--      are the single thing Today's Work and resolution gating read
--      directly — no join required to know whether an infection has
--      outstanding follow-up work.
--
--   2. An infection's own review_findings + a widened resolve_infection
--      gate, mirroring incidents' review_findings/resolve_incident
--      discipline (20260910000000) field-for-field EXCEPT for the
--      follow-up completion rule itself, which is deliberately NOT the
--      same as Incident's corrective-action-centric rule — see
--      resolve_infection below. The optional Serve corrective-action
--      branch (create_infection_corrective_action) reuses
--      compliance_corrective_actions/corrective_action_effectiveness_reviews/
--      corrective_action_updates completely unchanged; effectiveness
--      review, when it exists, always evaluates the corrective action, NOT
--      the client's infection.
--
-- REGULATORY BOUNDARY (Serve is a non-medical Texas PAS provider — never a
-- clinical/diagnostic actor): reported_status/service_impact record what
-- was REPORTED or OBSERVED operationally, never a clinical determination.
-- No column here asserts a diagnosis, a treatment outcome, or a clinical
-- severity judgment — "resolved_per_report" means "the client/family/
-- provider reported it as resolved," not "Serve determined it is
-- resolved." serve_response is an open, unconstrained label array (same
-- shape as incidents.parties_notified) precisely so it can never read as a
-- fixed clinical protocol.
--
-- Structured vocabularies below (reported_status, service_impact,
-- next_follow_up_purpose, information_source) are a v0.1 starter set with
-- an 'other' escape valve on every one — the same "controlled vocabulary +
-- other" discipline incidents.incident_type already established. Widening
-- any of them later is an additive CHECK-constraint migration, not a
-- breaking change.
--
-- ─── Design decisions (mirroring 20260910000000 where the shape is
-- genuinely shared, diverging deliberately where the product direction
-- requires it — see the header note above each RPC) ────────────────────
--
-- SAFETY REVIEW: one net-new table (plus two trigger functions guarding
-- it), five new columns on infections, one new RPC
-- (create_infection_corrective_action) reusing the untouched
-- compliance_corrective_actions/corrective_action_effectiveness_reviews
-- tables, two new RPCs (schedule_infection_follow_up,
-- record_infection_follow_up), mark_infection_reviewed and resolve_infection
-- widened (signature-preserving for resolve_infection; mark_infection_reviewed
-- gains one required parameter, matching mark_incident_reviewed's own
-- precedent), one dropped index (permissive — narrows nothing that could be
-- violated, since Infection corrective actions have not yet used real
-- multiplicity). No existing table is dropped or renamed; no existing
-- column is dropped or narrowed; no existing row's data is modified.
-- lib/data/infections.ts's markInfectionReviewed call site is updated in
-- the same change so nothing is left broken mid-deploy.

-- ─── 1. infections: review findings, frozen after first review ───────────
-- Exact mirror of incidents' own review_findings discipline
-- (20260910000000, design decision 6) — including the same one-time
-- legacy-backfill allowance for Linda Kaplan's real existing record
-- (reviewed before this column existed).

alter table infections add column if not exists review_findings text;

drop function if exists mark_infection_reviewed(uuid, boolean, text, text);

create or replace function mark_infection_reviewed(
  p_infection_id uuid,
  p_follow_up_required boolean,
  p_owner text,
  p_review_findings text,
  p_actor text
)
returns public.infections
language plpgsql
set search_path = public
as $$
declare
  v_current public.infections%rowtype;
  v_result public.infections%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to review an infection record';
  end if;

  if p_follow_up_required is null then
    raise exception 'A follow-up decision (yes/no) is required to review an infection record';
  end if;

  select * into v_current from public.infections where id = p_infection_id for update;

  if not found then
    raise exception 'Infection record % not found', p_infection_id;
  end if;

  if v_current.review_status = 'reviewed' then
    -- Re-affirmation path: follow_up_required/owner may still evolve.
    -- reviewed_by/reviewed_at are frozen at their first-review values
    -- forever, never touched here. review_findings gets exactly one
    -- legacy-backfill write: only when it is currently null AND the caller
    -- supplies a non-blank value — covers Linda Kaplan's real infection
    -- (reviewed before this column existed) and every other pre-existing
    -- reviewed infection.
    --
    -- Final Migration Tightening — deliberately does NOT touch
    -- next_follow_up_date/next_follow_up_purpose/next_follow_up_purpose_note
    -- here, even when p_follow_up_required is being flipped to false. A
    -- populated next_follow_up_date is a real outstanding operational
    -- obligation (someone scheduled a specific follow-up) — re-affirming
    -- the broader follow-up DECISION must never silently erase or
    -- invalidate an already-scheduled obligation. resolve_infection below
    -- enforces this: it blocks on a non-null next_follow_up_date
    -- unconditionally, regardless of the current follow_up_required value.
    -- The only paths that ever clear these three columns are
    -- record_infection_follow_up (recording a real follow-up that resolves
    -- the obligation) and a future explicit follow-up-cancellation
    -- mechanism, which does not exist yet — not this reaffirm branch, and
    -- not any other write path in this migration.
    update public.infections
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
    where id = p_infection_id
    returning * into v_result;
    return v_result;
  end if;

  update public.infections
  set review_status = 'reviewed',
      reviewed_by = p_actor,
      reviewed_at = now(),
      review_findings = nullif(trim(coalesce(p_review_findings, '')), ''),
      follow_up_required = p_follow_up_required,
      owner = p_owner,
      updated_by = p_actor,
      updated_at = now()
  where id = p_infection_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function mark_infection_reviewed(uuid, boolean, text, text, text) from public;
grant execute on function mark_infection_reviewed(uuid, boolean, text, text, text) to service_role;

-- ─── 2. infections: current follow-up obligation ──────────────────────────
-- The single thing Today's Work and resolution gating read directly, no
-- join required. Set/cleared exclusively by schedule_infection_follow_up
-- and record_infection_follow_up below — never edited by any other path.

alter table infections add column if not exists next_follow_up_date date;
alter table infections add column if not exists next_follow_up_purpose text;
alter table infections add column if not exists next_follow_up_purpose_note text;

-- Final Migration Tightening — PAS-operational vocabulary (not
-- clinical/diagnostic language). Replaces the original v0.1 draft values
-- (confirm_symptom_status/confirm_treatment_completion/reassess_service_impact/
-- confirm_provider_followup/routine_check_in) before this migration is ever
-- applied live — no data exists yet under the old values, so this is a
-- plain swap, not a backfill/migration-of-data concern.
alter table infections
  drop constraint if exists infections_next_follow_up_purpose_check;
alter table infections
  add constraint infections_next_follow_up_purpose_check
  check (next_follow_up_purpose is null or next_follow_up_purpose in (
    'check_client_service_status', 'hospital_er_follow_up', 'confirm_updated_instructions',
    'assess_service_impact', 'infection_control_follow_up', 'other'
  ));

-- Final Migration Tightening — the three current-obligation fields now
-- travel together as a genuine unit: either NO obligation exists (all
-- three null) or an obligation is fully scheduled (date + purpose both
-- required; purpose_note remains optional even when scheduled). The
-- earlier draft of this constraint only paired date+purpose and left
-- purpose_note unconstrained even when there was no obligation at all —
-- that allowed a stale/orphaned purpose note to linger with no scheduled
-- follow-up behind it. schedule_infection_follow_up and
-- record_infection_follow_up are the only two writers of these three
-- columns and both already set/clear all three together, so this
-- tightening changes no application behavior, only closes the gap in the
-- invariant itself.
alter table infections
  drop constraint if exists infections_next_follow_up_fields_check;
alter table infections
  add constraint infections_next_follow_up_fields_check
  check (
    (next_follow_up_date is null and next_follow_up_purpose is null and next_follow_up_purpose_note is null)
    or
    (next_follow_up_date is not null and next_follow_up_purpose is not null)
  );

-- ─── 3. infection_follow_ups (append-only longitudinal timeline) ──────────
-- No Incident analog — a genuinely new domain-specific concept. Structured
-- fields for the learning-loop analytics this is architected for
-- (reported_status/service_impact/information_source), an open label array
-- for Serve's own response (serve_response — same shape as
-- incidents.parties_notified, deliberately never a fixed clinical
-- protocol), and an OPTIONAL narrative note: structured data alone is
-- often sufficient for a routine follow-up, so narrative is required only
-- when 'other' was chosen for reported_status or service_impact and
-- therefore needs real explanation.

create table if not exists infection_follow_ups (
  id                              uuid primary key default gen_random_uuid(),

  infection_id                    uuid not null references public.infections(id) on delete no action,

  -- What was reported to Serve about the infection's status — reported
  -- fact, never a Serve clinical determination.
  reported_status                 text not null,
  -- How the infection is currently affecting Serve's service delivery —
  -- deliberately a separate axis from reported_status, never collapsed
  -- into it.
  service_impact                  text not null,
  -- Open label array (e.g. "PPE provided/confirmed", "caregiver
  -- precautions communicated") — what Serve did in response. No fixed
  -- vocabulary, matching incidents.parties_notified's own shape, so this
  -- can never read as a rigid clinical protocol.
  serve_response                  text[] not null default '{}'::text[],
  -- Optional — required only when reported_status or service_impact is
  -- 'other' (see the CHECK below). Structured fields alone may fully
  -- describe a routine follow-up.
  narrative_note                  text,
  -- Distinguishes reported information (client/family/hospital/provider)
  -- from Serve's own observation, so this table can never be read as
  -- implying a clinical assessment Serve did not make.
  information_source              text not null,

  additional_follow_up_required   boolean not null,
  -- Required together, only when additional_follow_up_required is true —
  -- see the CHECK below. No fixed interval is ever computed here; the
  -- operator supplies the date directly.
  next_follow_up_date             date,
  next_follow_up_purpose          text,
  next_follow_up_purpose_note     text,

  created_by                      text not null,
  created_at                      timestamptz not null default now(),

  constraint infection_follow_ups_reported_status_check
    check (reported_status in (
      'improving', 'unchanged', 'worsening', 'resolved_per_report',
      'new_symptoms_reported', 'treatment_completed', 'treatment_ongoing',
      'hospitalized', 'seen_by_provider', 'other'
    )),

  constraint infection_follow_ups_service_impact_check
    check (service_impact in (
      'no_impact', 'reduced_participation', 'missed_services', 'schedule_adjusted',
      'temporary_service_pause', 'increased_monitoring_requested', 'other'
    )),

  constraint infection_follow_ups_information_source_check
    check (information_source in (
      'client', 'family_responsible_party', 'caregiver_observation',
      'hospital_facility', 'healthcare_provider', 'other'
    )),

  -- Final Migration Tightening — same PAS-operational vocabulary swap as
  -- infections_next_follow_up_purpose_check above; the two CHECK lists
  -- must stay identical (this table's next_follow_up_purpose feeds the
  -- same parent obligation columns via record_infection_follow_up).
  constraint infection_follow_ups_next_follow_up_purpose_check
    check (next_follow_up_purpose is null or next_follow_up_purpose in (
      'check_client_service_status', 'hospital_er_follow_up', 'confirm_updated_instructions',
      'assess_service_impact', 'infection_control_follow_up', 'other'
    )),

  constraint infection_follow_ups_created_by_not_blank
    check (length(trim(created_by)) > 0),

  -- Narrative required only where an 'other' choice genuinely needs
  -- explanation — never a blanket requirement that would push users toward
  -- manufacturing low-value prose on a routine, fully-structured entry.
  constraint infection_follow_ups_narrative_required_for_other
    check (
      (reported_status <> 'other' and service_impact <> 'other')
      or (narrative_note is not null and length(trim(narrative_note)) > 0)
    ),

  -- Additional follow-up is either fully scheduled (date + purpose
  -- together) or not requested at all — never half-way. Final Migration
  -- Tightening scope note: item 4 tightened the PARENT infections table's
  -- current-obligation constraint (the single live obligation Today's
  -- Work/resolution gating reads) to also require purpose_note null when
  -- there's no obligation. This per-entry historical constraint is left
  -- as-is by deliberate scope decision — record_infection_follow_up
  -- already nulls purpose_note whenever additional_follow_up_required is
  -- false (see its INSERT below), so no code path can violate the
  -- tightened invariant even without duplicating it here.
  constraint infection_follow_ups_next_follow_up_fields_check
    check (
      (additional_follow_up_required = false and next_follow_up_date is null and next_follow_up_purpose is null)
      or
      (additional_follow_up_required = true and next_follow_up_date is not null and next_follow_up_purpose is not null)
    )
);

create index if not exists infection_follow_ups_infection_idx
  on infection_follow_ups (infection_id, created_at);

alter table infection_follow_ups enable row level security;
revoke all on infection_follow_ups from public, anon, authenticated;
grant all on infection_follow_ups to service_role;

-- True DB-enforced append-only, matching corrective_action_updates' own
-- discipline exactly — even service_role is blocked structurally. A
-- follow-up entry is a point-in-time record of what was reported/observed;
-- correcting one is future correction-mechanism work (the void-and-reopen
-- precedent), never an in-place edit.
create or replace function reject_infection_follow_up_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'infection_follow_ups is append-only — % is not permitted', tg_op;
end;
$$;

drop trigger if exists infection_follow_ups_no_update on infection_follow_ups;
create trigger infection_follow_ups_no_update
  before update on infection_follow_ups
  for each row execute function reject_infection_follow_up_mutation();

drop trigger if exists infection_follow_ups_no_delete on infection_follow_ups;
create trigger infection_follow_ups_no_delete
  before delete on infection_follow_ups
  for each row execute function reject_infection_follow_up_mutation();

-- ─── 4. schedule_infection_follow_up ───────────────────────────────────────
-- Lightweight: sets only the current-obligation columns, no timeline row.
-- Used right after review, when follow-up is determined necessary but
-- there is nothing yet to report/observe — and reusable any time the
-- date/purpose needs to change without a full follow-up entry.
--
-- Final Migration Tightening — this RPC now requires the infection to
-- already be reviewed (a follow-up obligation is a review-level judgment;
-- scheduling one ahead of review would let the current-obligation state
-- and the review-level follow_up_required decision drift apart) and
-- always sets follow_up_required = true in the same statement — scheduling
-- IS the follow-up decision, so the two must never disagree (a caller
-- could otherwise schedule a follow-up while follow_up_required still
-- read false, which resolve_infection's "at least one recorded follow-up"
-- gate would then never even check).
create or replace function schedule_infection_follow_up(
  p_infection_id uuid,
  p_next_follow_up_date date,
  p_purpose text,
  p_purpose_note text,
  p_actor text
)
returns public.infections
language plpgsql
set search_path = public
as $$
declare
  v_current public.infections%rowtype;
  v_result public.infections%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to schedule an infection follow-up';
  end if;
  if p_next_follow_up_date is null then
    raise exception 'A next follow-up date is required';
  end if;
  if p_purpose is null or length(trim(p_purpose)) = 0 then
    raise exception 'A follow-up purpose is required';
  end if;

  select * into v_current from public.infections where id = p_infection_id for update;

  if not found then
    raise exception 'Infection record % not found', p_infection_id;
  end if;

  if v_current.status <> 'open' then
    raise exception 'Infection record % is already resolved', p_infection_id;
  end if;

  if v_current.review_status <> 'reviewed' then
    raise exception 'Infection record % must be reviewed before a follow-up can be scheduled', p_infection_id;
  end if;

  update public.infections
  set follow_up_required = true,
      next_follow_up_date = p_next_follow_up_date,
      next_follow_up_purpose = p_purpose,
      next_follow_up_purpose_note = nullif(trim(coalesce(p_purpose_note, '')), ''),
      updated_by = p_actor,
      updated_at = now()
  where id = p_infection_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function schedule_infection_follow_up(uuid, date, text, text, text) from public;
grant execute on function schedule_infection_follow_up(uuid, date, text, text, text) to service_role;

-- ─── 5. record_infection_follow_up ─────────────────────────────────────────
-- The real observation entry — inserts one append-only timeline row and,
-- in the same transaction, sets or clears the parent's current-obligation
-- columns based on p_additional_follow_up_required. This is what makes
-- Today's Work's remove/continue behavior automatic with no separate
-- bookkeeping call.
create or replace function record_infection_follow_up(
  p_infection_id uuid,
  p_reported_status text,
  p_service_impact text,
  p_serve_response text[],
  p_narrative_note text,
  p_information_source text,
  p_additional_follow_up_required boolean,
  p_next_follow_up_date date,
  p_next_follow_up_purpose text,
  p_next_follow_up_purpose_note text,
  p_actor text
)
returns public.infection_follow_ups
language plpgsql
set search_path = public
as $$
declare
  v_infection public.infections%rowtype;
  v_result public.infection_follow_ups%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to record an infection follow-up';
  end if;
  if p_reported_status is null or length(trim(p_reported_status)) = 0 then
    raise exception 'A reported status is required';
  end if;
  if p_service_impact is null or length(trim(p_service_impact)) = 0 then
    raise exception 'A service impact is required';
  end if;
  if p_information_source is null or length(trim(p_information_source)) = 0 then
    raise exception 'An information source is required';
  end if;
  if p_additional_follow_up_required is null then
    raise exception 'Whether additional follow-up is required must be specified';
  end if;
  if p_additional_follow_up_required and (p_next_follow_up_date is null or p_next_follow_up_purpose is null or length(trim(p_next_follow_up_purpose)) = 0) then
    raise exception 'A next follow-up date and purpose are required when additional follow-up is needed';
  end if;

  select * into v_infection from public.infections where id = p_infection_id for update;

  if not found then
    raise exception 'Infection record % not found', p_infection_id;
  end if;

  if v_infection.status <> 'open' then
    raise exception 'Infection record % is already resolved', p_infection_id;
  end if;

  insert into public.infection_follow_ups (
    infection_id, reported_status, service_impact, serve_response, narrative_note, information_source,
    additional_follow_up_required, next_follow_up_date, next_follow_up_purpose, next_follow_up_purpose_note,
    created_by
  ) values (
    p_infection_id, p_reported_status, p_service_impact, coalesce(p_serve_response, '{}'::text[]),
    nullif(trim(coalesce(p_narrative_note, '')), ''), p_information_source,
    p_additional_follow_up_required,
    case when p_additional_follow_up_required then p_next_follow_up_date else null end,
    case when p_additional_follow_up_required then p_next_follow_up_purpose else null end,
    case when p_additional_follow_up_required then nullif(trim(coalesce(p_next_follow_up_purpose_note, '')), '') else null end,
    p_actor
  )
  returning * into v_result;

  update public.infections
  set next_follow_up_date = v_result.next_follow_up_date,
      next_follow_up_purpose = v_result.next_follow_up_purpose,
      next_follow_up_purpose_note = v_result.next_follow_up_purpose_note,
      updated_by = p_actor,
      updated_at = now()
  where id = p_infection_id;

  return v_result;
end;
$$;

revoke execute on function record_infection_follow_up(uuid, text, text, text[], text, text, boolean, date, text, text, text) from public;
grant execute on function record_infection_follow_up(uuid, text, text, text[], text, text, boolean, date, text, text, text) to service_role;

-- ─── 6. create_infection_corrective_action (optional Serve corrective
-- action branch) ────────────────────────────────────────────────────────
-- Exact structural mirror of create_incident_corrective_action
-- (20260910000000) — same shared compliance_corrective_actions/
-- corrective_action_effectiveness_reviews tables, same plain-insert (never
-- dedupe-by-source) discipline, same UI (CorrectiveActionCard,
-- EffectivenessReviewSection) reused unchanged. Deliberately NOT gated on
-- follow_up_required — a Serve process/infection-control concern can be
-- identified independently of whether the client's own follow-up loop is
-- open (see the revised product direction's approved decision: no separate
-- stored "concern identified" flag, since corrective-action existence is
-- sufficient signal). effectiveness_review_required, when set, always
-- evaluates whether THIS corrective action worked — never the client's
-- infection itself.
create or replace function create_infection_corrective_action(
  p_infection_id uuid,
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
  if p_infection_id is null then
    raise exception 'A source infection record is required';
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
    source_infection_id, created_by
  ) values (
    p_subject_type, p_subject_id, null, 'infections', 'infection_follow_up_required',
    trim(p_title), trim(p_finding), trim(p_action_plan), p_owner, coalesce(p_priority, 'normal'), p_due_at,
    coalesce(p_effectiveness_review_required, false),
    p_infection_id, p_actor
  )
  returning * into v_result;

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

revoke execute on function create_infection_corrective_action(
  uuid, text, uuid, text, text, text, text, text, date, boolean, date, text, text, text
) from public;
grant execute on function create_infection_corrective_action(
  uuid, text, uuid, text, text, text, text, text, date, boolean, date, text, text, text
) to service_role;

-- "One open action per infection" was never a real business rule for the
-- same reason 20260910000000 dropped its incident equivalent: the only
-- caller was a single human-click action, not a recurring automated
-- reconciliation job. Infection corrective actions now support real
-- multiplicity via the plain-insert RPC above.
drop index if exists compliance_corrective_actions_one_open_per_infection_idx;

-- ─── 7. resolve_infection: resolution gating ───────────────────────────────
-- Unchanged signature. Deliberately NOT a copy of resolve_incident's
-- corrective-action-centric gate — the follow-up loop and the optional
-- corrective action are two independent tracks here, per the revised
-- product direction:
--   - A populated next_follow_up_date ALWAYS blocks resolution,
--     UNCONDITIONALLY — Final Migration Tightening. This check is
--     deliberately NOT nested inside the follow_up_required branch below:
--     an outstanding scheduled obligation is a real operational fact
--     (someone specifically committed to following up by that date)
--     regardless of what follow_up_required currently reads. Without this,
--     a sequence of (1) schedule a follow-up while follow_up_required is
--     true, (2) later re-affirm the review with follow_up_required=false
--     (mark_infection_reviewed's reaffirm path never clears the schedule —
--     see its own comment above) would let resolve_infection ignore the
--     still-outstanding date entirely. Cleared only by
--     record_infection_follow_up actually recording that follow-up (or a
--     future explicit cancellation mechanism, not built in this pass).
--   - follow_up_required = false: no OTHER gate beyond review and the
--     unconditional check above.
--   - follow_up_required = true: at least one infection_follow_ups entry
--     must ALSO exist (a follow-up-required infection with zero recorded
--     follow-ups — the state every pre-existing follow-up-required
--     infection, including Linda Kaplan's real record, is in immediately
--     after this migration — must not become trivially resolvable, exactly
--     as incidents' own all-cancelled-actions guard prevents a parallel
--     loophole).
--   - Independently of the above: if any compliance_corrective_actions row
--     is source-linked to this infection, the SAME per-action-completion
--     and all-cancelled gating incidents already use applies (cancelled
--     stops blocking; effectiveness-required actions need
--     verified_effective; others need implemented/verified_effective or a
--     generic resolved/dismissed close) — but a total ABSENCE of any
--     corrective action never blocks, since one is always optional here.
create or replace function resolve_infection(
  p_infection_id uuid,
  p_resolution_note text,
  p_actor text
)
returns public.infections
language plpgsql
set search_path = public
as $$
declare
  v_current public.infections%rowtype;
  v_result public.infections%rowtype;
  v_follow_up_count integer;
  v_blocking_action_count integer;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve an infection record';
  end if;

  if p_resolution_note is null or length(trim(p_resolution_note)) = 0 then
    raise exception 'A resolution note is required';
  end if;

  select * into v_current from public.infections where id = p_infection_id for update;

  if not found then
    raise exception 'Infection record % not found', p_infection_id;
  end if;

  if v_current.status = 'resolved' then
    raise exception 'Infection record % is already resolved', p_infection_id;
  end if;

  if v_current.review_status <> 'reviewed' then
    raise exception 'Infection record % must be reviewed before it can be resolved', p_infection_id;
  end if;

  -- Final Migration Tightening — unconditional, regardless of the current
  -- follow_up_required value. See this function's own header comment for
  -- the exact bypass sequence this closes.
  if v_current.next_follow_up_date is not null then
    raise exception 'Infection record % has an outstanding scheduled follow-up (%) and cannot be resolved yet', p_infection_id, v_current.next_follow_up_date;
  end if;

  if v_current.follow_up_required then
    select count(*) into v_follow_up_count
    from public.infection_follow_ups
    where infection_id = p_infection_id;

    if v_follow_up_count = 0 then
      raise exception 'Infection record % requires at least one recorded follow-up before it can be resolved', p_infection_id;
    end if;
  end if;

  select count(*) into v_blocking_action_count
  from public.compliance_corrective_actions a
  where a.source_infection_id = p_infection_id
    and a.lifecycle_stage <> 'cancelled'
    and not (
      case
        when a.effectiveness_review_required then a.lifecycle_stage = 'verified_effective'
        else a.lifecycle_stage in ('implemented', 'verified_effective') or a.status in ('resolved', 'dismissed')
      end
    );

  if v_blocking_action_count > 0 then
    raise exception 'Infection record % has % corrective action(s) not yet complete', p_infection_id, v_blocking_action_count;
  end if;

  if exists (
    select 1 from public.compliance_corrective_actions
    where source_infection_id = p_infection_id
  ) and not exists (
    select 1 from public.compliance_corrective_actions
    where source_infection_id = p_infection_id and lifecycle_stage <> 'cancelled'
  ) then
    raise exception 'Infection record % has no corrective action that was completed — every action was cancelled', p_infection_id;
  end if;

  update public.infections
  set status = 'resolved',
      resolution_note = trim(p_resolution_note),
      resolved_by = p_actor,
      resolved_at = now(),
      updated_by = p_actor,
      updated_at = now()
  where id = p_infection_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function resolve_infection(uuid, text, text) from public;
grant execute on function resolve_infection(uuid, text, text) to service_role;

commit;
