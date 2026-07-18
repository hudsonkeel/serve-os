begin;

-- Scope J — Production Intake Unification. See docs/design/
-- SERVE_INTAKE_INTELLIGENCE_ENGINE.md and
-- docs/integrations/WEBSITE_TO_SERVE_INTAKE_CONTRACT.md for the full
-- conceptual model this migration implements.
--
-- Renames website_intake_submissions -> intake_submissions: this table is
-- becoming the landing point for every Serve-approved intake source
-- (website, Serve OS's own /get-started, and future phone/voice/partner/
-- hospital sources), not just the marketing website. Renamed now, while
-- the table has zero real production data (5 synthetic "TEST ..." rows
-- only, confirmed by this scope's own audit) — the cheapest this rename
-- will ever be. Postgres tracks foreign keys, indexes, and views by OID,
-- not name, so this single rename does not break intake_processing_records'
-- existing relationship to this table.

alter table website_intake_submissions rename to intake_submissions;

alter table intake_processing_records
  alter column source_table set default 'intake_submissions';

update intake_processing_records
  set source_table = 'intake_submissions'
  where source_table = 'website_intake_submissions';

-- Idempotency key supplied by the caller (the Canonical Intake Service, or
-- any future conversation layer retrying a submission attempt) — distinct
-- from `id`, which is server-generated and therefore useless for a caller
-- trying to safely retry the same logical submission.
alter table intake_submissions add column if not exists client_submission_id text;

create unique index if not exists intake_submissions_client_submission_id_key
  on intake_submissions (client_submission_id)
  where client_submission_id is not null;

-- ─── Conversation layer ───────────────────────────────────────────────────
-- Optional upstream telemetry for interactive intake experiences (today:
-- Serve OS's /get-started care + careers wizards). Product-experience truth
-- only — never a substitute for an intake_submissions row, and never itself
-- the basis for creating a Relationship or Recruiting Lead. Not every
-- intake source has a conversation; sources with no interactive
-- back-and-forth call the Canonical Intake Service directly and never
-- create a row here.

create table if not exists conversation_sessions (
  id                      uuid primary key default gen_random_uuid(),
  session_key             text not null unique,
  -- 'website_wizard_care' | 'website_wizard_careers' today; 'ai_voice' |
  -- 'staff_assisted' | 'chat' etc. later — never a hardcoded enum tied to
  -- today's one UI implementation.
  experience_type         text not null,
  source                  text not null,
  channel_version         text not null,
  started_at              timestamptz not null default now(),
  last_activity_at        timestamptz not null default now(),
  completed_at            timestamptz,
  highest_step_reached    text,
  final_submission_id     uuid references intake_submissions(id) on delete set null,
  contact_capture_status  text not null default 'none',
  -- Partial-recovery fields — updated in place, only ever high-level
  -- context, never the free-text message/care-needs content. Populated
  -- only once contact_capture_status reaches 'partial_contact_captured' or
  -- beyond.
  draft_contact_name      text,
  draft_contact_phone     text,
  draft_contact_email     text,
  draft_inquiry_summary   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint conversation_sessions_contact_capture_status_check
    check (contact_capture_status in ('none', 'partial_contact_captured', 'consented_for_followup', 'completed'))
);

-- Backs getRecoverablePartialSessions(): abandoned (completed_at is null),
-- consented sessions only — partial_contact_captured alone is never
-- eligible for follow-up (see the contract doc's consent boundary).
create index if not exists conversation_sessions_recoverable_idx
  on conversation_sessions (last_activity_at)
  where contact_capture_status = 'consented_for_followup' and completed_at is null;

alter table conversation_sessions enable row level security;

create or replace function conversation_sessions_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on conversation_sessions;
create trigger set_updated_at
  before update on conversation_sessions
  for each row execute function conversation_sessions_set_updated_at();

create table if not exists conversation_events (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references conversation_sessions(id) on delete cascade,
  event_type     text not null,
  step_key       text,
  step_sequence  integer,
  -- Non-sensitive only, e.g. {"field": "phone"} for validation_failed —
  -- never a full care narrative or clinical information.
  metadata       jsonb,
  created_at     timestamptz not null default now(),

  constraint conversation_events_event_type_check
    check (event_type in (
      'conversation_started', 'step_viewed', 'step_completed', 'contact_information_entered',
      'validation_failed', 'back_navigation', 'submission_attempted',
      'submission_succeeded', 'submission_failed'
    ))
);

create index if not exists conversation_events_session_idx
  on conversation_events (session_id, created_at);

alter table conversation_events enable row level security;

-- ─── Canonical Intake Service RPC ─────────────────────────────────────────
-- Deliberately the ONLY write path into intake_submissions going forward.
-- Narrow: one insert (or idempotent lookup-and-return), nothing else — no
-- classification, no other table access. service_role-only (see the
-- revoke/grant below): callable only by the Supabase Edge Function
-- `intake-submit`, which holds the service-role key as a Function secret
-- (never in any git repo, never shipped to a browser). Granting anon or
-- authenticated execute here would let anyone with the public anon key call
-- this directly over PostgREST, bypassing the Edge Function's own
-- validation entirely — so, matching every other write RPC in this
-- codebase (e.g. process_website_intake_submission), it is revoked from
-- public and granted only to service_role.
create or replace function accept_intake_submission(
  p_client_submission_id text,
  p_intake_type text,
  p_source text,
  p_name text,
  p_phone text,
  p_email text,
  p_zip text,
  p_community text,
  p_city text,
  p_outside_service_area boolean,
  p_form_payload jsonb
)
returns intake_submissions
language plpgsql
set search_path = public
as $$
declare
  v_existing intake_submissions;
  v_result intake_submissions;
begin
  if p_client_submission_id is not null then
    select * into v_existing
    from intake_submissions
    where client_submission_id = p_client_submission_id;

    if v_existing.id is not null then
      return v_existing;
    end if;
  end if;

  insert into intake_submissions (
    client_submission_id, intake_type, source, status, name, phone, email,
    zip, community, city, outside_service_area, form_payload
  ) values (
    p_client_submission_id, p_intake_type, p_source, 'new', p_name, p_phone, p_email,
    p_zip, p_community, p_city, coalesce(p_outside_service_area, false), p_form_payload
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function accept_intake_submission(
  text, text, text, text, text, text, text, text, text, boolean, jsonb
) from public;
grant execute on function accept_intake_submission(
  text, text, text, text, text, text, text, text, text, boolean, jsonb
) to service_role;

-- ─── Self-documentation ───────────────────────────────────────────────────

comment on table intake_submissions is
  'Canonical immutable raw intake submissions received from every Serve-approved intake source (website, Serve OS''s own /get-started, and future phone/voice/partner/hospital sources). Source evidence only — not the operational prospect record. Written to exclusively via accept_intake_submission(), called only by the intake-submit Supabase Edge Function.';

comment on table intake_processing_records is
  'Canonical intake-engine processing ledger for classification, readiness, confidence, status, idempotency, failures, and resulting operational-record links.';

comment on table relationships is
  'Canonical operational record for Serve care prospects, referrals, and active engagements, including stage, actions, notes, timeline, and conversion context.';

comment on table recruiting_leads is
  'Canonical operational record for employment candidates, created by the Serve Intake Intelligence Engine''s recruiting classification.';

comment on table external_clients is
  'Durable external client identity created after conversion from an operational Relationship.';

comment on table conversation_sessions is
  'Optional product-experience telemetry for interactive intake journeys (e.g. the /get-started wizards). Product-experience truth only — never a substitute for an intake_submissions row, and never itself the basis for creating a Relationship or Recruiting Lead. May reach contact_capture_status = consented_for_followup for abandoned-but-consented partial recovery; see docs/integrations/WEBSITE_TO_SERVE_INTAKE_CONTRACT.md.';

comment on table conversation_events is
  'Non-sensitive product analytics events for a conversation_sessions journey (funnel/abandonment measurement only). Never contains free-text care narratives or clinical information.';

comment on table prospects is
  'Legacy care-inquiry table, superseded by intake_submissions -> relationships. Retained temporarily during production intake migration — do not use for new submissions.';

commit;
