begin;

-- Serve Intake Intelligence Engine — see docs/design/
-- SERVE_INTAKE_INTELLIGENCE_ENGINE.md for the full conceptual model. This
-- is the ONLY schema permitted to translate external intake submissions
-- (starting with `website_intake_submissions`) into operational Serve OS
-- records (Relationships, Residents, External Clients, Recruiting Leads).
--
-- `website_intake_submissions` itself (20260703000000, not yet merged to
-- production at the time this migration was written) is immutable
-- provenance — this migration never alters it. `intake_processing_records`
-- is the mutable operational-metadata layer: one row per source
-- submission, enforced by a unique (intake_source, source_submission_id)
-- constraint (Part 12: idempotency).

create table if not exists intake_processing_records (
  id                        uuid primary key default gen_random_uuid(),

  intake_source             text not null default 'website',
  source_submission_id      uuid not null,
  source_table              text not null default 'website_intake_submissions',
  intake_type               text not null,

  -- 'needs_review' | 'processed' | 'failed' | 'not_qualified'. "New" (Part
  -- 23) is deliberately NOT a stored value here — it's the absence of any
  -- row for a given source_submission_id, computed by the caller via a
  -- left join against website_intake_submissions, not persisted state.
  processing_status         text not null,

  classification            text,
  confidence_score          integer,
  confidence_band           text,
  reason_codes              text[] not null default '{}',
  processing_notes          text,
  -- The full computed IntakeEnvelope at the time of this processing
  -- attempt — audit/debugging value, and what a future reprocessing pass
  -- would compare against to detect drift in the normalization rules.
  normalized_envelope       jsonb,

  relationship_id           uuid references public.relationships(id) on delete set null,
  resident_id               uuid references public.residents(id) on delete set null,
  external_client_id        uuid references public.external_clients(id) on delete set null,
  recruiting_lead_id        uuid references public.recruiting_leads(id) on delete set null,
  first_action_id           uuid references public.relationship_actions(id) on delete set null,

  processing_version        text not null default 'website-intake-v1',
  processed_by              text not null default 'intake-engine',

  processing_started_at     timestamptz,
  processed_at              timestamptz,
  last_error                text,
  retry_count                integer not null default 0,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint intake_processing_records_status_check
    check (processing_status in ('needs_review', 'processed', 'failed', 'not_qualified')),

  constraint intake_processing_records_classification_check
    check (classification is null or classification in (
      'resident_prospect', 'external_prospect', 'professional_relationship',
      'recruiting', 'needs_review', 'not_qualified'
    )),

  constraint intake_processing_records_confidence_band_check
    check (confidence_band is null or confidence_band in (
      'automatic', 'high_confidence', 'review_recommended', 'needs_review'
    )),

  constraint intake_processing_records_source_unique
    unique (intake_source, source_submission_id)
);

create index if not exists intake_processing_records_status_idx
  on intake_processing_records (processing_status, created_at desc);

create index if not exists intake_processing_records_relationship_idx
  on intake_processing_records (relationship_id) where relationship_id is not null;

alter table intake_processing_records enable row level security;

create or replace function intake_processing_records_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on intake_processing_records;
create trigger set_updated_at
  before update on intake_processing_records
  for each row execute function intake_processing_records_set_updated_at();

-- New Relationship Timeline / Resident Timeline event types for
-- intake-originated activity — distinct from any manually-created
-- equivalent, so provenance stays visible in the Timeline itself, not
-- just in intake_processing_records.
alter table relationship_timeline drop constraint if exists relationship_timeline_event_type_check;
alter table relationship_timeline add constraint relationship_timeline_event_type_check
  check (event_type in (
    'relationship_created', 'resident_linked', 'stage_changed', 'touch_logged',
    'action_created', 'action_updated', 'action_completed', 'action_dismissed',
    'relationship_won', 'relationship_on_hold', 'relationship_closed',
    'working_note_created', 'working_note_resolved', 'service_opportunity_updated',
    'relationship_updated', 'relationship_converted', 'external_client_status_changed',
    'service_location_updated', 'website_inquiry_received'
  ));

-- ─── Idempotent lookup helper ────────────────────────────────────────────
-- Returns the existing settled processing record for a submission, if any
-- ('processed'/'needs_review'/'not_qualified' — everything except
-- 'failed', which is retryable by design, see Part 22).
create or replace function intake_find_settled_record(
  p_intake_source text,
  p_source_submission_id uuid
)
returns intake_processing_records
language sql
stable
set search_path = public
as $$
  select * from intake_processing_records
  where intake_source = p_intake_source
    and source_submission_id = p_source_submission_id
    and processing_status <> 'failed'
  limit 1;
$$;

-- ─── Core atomic processor ────────────────────────────────────────────────
-- Every field below is already decided by the pure TypeScript engine
-- (lib/intake/*.ts) before this function is ever called — classification,
-- confidence, resident matching, priority/due-date, and Service
-- Opportunity mapping are all computed in TS (testable without a
-- database) and passed in as plain values. This function's only job is
-- the atomic write: either the full operational graph for this
-- submission is created/reused, or nothing is (Part 14).
--
-- p_force: bypasses the "already settled" idempotency short-circuit —
-- set true only by an explicit staff resolution action (Part 24), never
-- by automatic (re)processing. Automatic processing always passes false.
create or replace function process_website_intake_submission(
  p_submission_id uuid,
  p_classification text,
  p_confidence_score integer,
  p_confidence_band text,
  p_reason_codes text[],
  p_normalized_envelope jsonb,
  -- Relationship upsert (Part 13): non-null means reuse this existing
  -- Relationship rather than creating a new one.
  p_existing_relationship_id uuid,
  p_relationship_type text,
  p_display_name text,
  p_resident_id uuid,
  p_prospective_client_first_name text,
  p_prospective_client_last_name text,
  p_prospective_client_preferred_name text,
  p_prospective_client_phone text,
  p_prospective_client_email text,
  p_primary_contact_name text,
  p_primary_contact_relationship text,
  p_primary_contact_phone text,
  p_primary_contact_email text,
  p_primary_contact_is_prospective_client boolean,
  p_organization_name text,
  p_owner_label text,
  p_priority text,
  p_source_label text,
  -- Expected service location (external_prospect only) — null for every
  -- other classification.
  p_service_address_line_1 text,
  p_service_address_line_2 text,
  p_service_city text,
  p_service_state text,
  p_service_postal_code text,
  p_service_residence_type text,
  -- Service Opportunity + intake context (resident_prospect /
  -- external_prospect only).
  p_service_summary text,
  p_intake_context_note text,
  -- First Next Action.
  p_action_title text,
  p_action_type text,
  p_action_due_at timestamptz,
  -- Recruiting (recruiting classification only).
  p_recruiting_role text,
  p_recruiting_first_name text,
  p_recruiting_last_name text,
  p_recruiting_phone text,
  p_recruiting_email text,
  p_recruiting_zip text,
  p_recruiting_city_state text,
  p_recruiting_linkedin text,
  p_recruiting_resume_filename text,
  p_recruiting_message text,
  p_force boolean default false,
  -- Test-data hygiene only (docs/engineering/TEST_DATA_HYGIENE.md) — never
  -- set by automatic processing; a verification script passes this
  -- explicitly so the Relationship created here (if any) carries the same
  -- marker every other test-created Relationship does, letting
  -- scripts/cleanup-test-data.ts --marker=... reach it and its dependents.
  p_test_marker text default null
)
returns intake_processing_records
language plpgsql
set search_path = public
as $$
declare
  v_existing intake_processing_records;
  v_relationship_id uuid;
  v_recruiting_lead_id uuid;
  v_first_action_id uuid;
  v_status text;
  v_result intake_processing_records;
  v_open_action_count integer;
begin
  if not p_force then
    -- FOUND is only set by SELECT INTO / INSERT..RETURNING / etc. — a
    -- plain function-call assignment like this never sets it, so the
    -- idempotency check must test the returned row directly rather than
    -- relying on FOUND (a bug caught during live verification: without
    -- this fix, every "already processed" submission was silently
    -- reprocessed and created a second Relationship).
    v_existing := intake_find_settled_record('website', p_submission_id);
    if v_existing.id is not null then
      return v_existing;
    end if;
  end if;

  v_status := case
    when p_classification in ('resident_prospect', 'external_prospect', 'professional_relationship', 'recruiting')
      then 'processed'
    else p_classification -- 'needs_review' or 'not_qualified'
  end;

  -- ─── Resident Prospect / External Prospect / Professional Relationship ──
  if p_classification in ('resident_prospect', 'external_prospect', 'professional_relationship') then

    if p_existing_relationship_id is not null then
      v_relationship_id := p_existing_relationship_id;

      -- Reuse: append one Timeline event, add a new action only if none is
      -- currently open (Part 13: "create a new action only if... no
      -- equivalent open action exists").
      insert into relationship_timeline (
        relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
      ) values (
        v_relationship_id, 'website_inquiry_received', 'Additional website inquiry received.',
        p_intake_context_note, 'website_intake_submissions', p_submission_id, 'intake-engine', true
      );

      if p_intake_context_note is not null and length(trim(p_intake_context_note)) > 0 then
        perform create_relationship_working_note(v_relationship_id, p_intake_context_note, null, 'intake-engine');
      end if;

      select count(*) into v_open_action_count
      from relationship_actions
      where relationship_id = v_relationship_id and status = 'open';

      if v_open_action_count = 0 and p_action_title is not null then
        v_first_action_id := create_relationship_action(
          v_relationship_id, coalesce(p_action_type, 'follow_up'), p_action_title,
          null, p_action_due_at, p_owner_label, coalesce(p_priority, 'normal'), 'intake-engine'
        );
      end if;

    else
      v_relationship_id := create_relationship(
        p_relationship_type, 'new_inquiry', p_display_name, p_resident_id, null,
        null, p_organization_name,
        p_primary_contact_name, p_primary_contact_relationship, p_primary_contact_phone, p_primary_contact_email,
        null, null, p_owner_label,
        coalesce(p_priority, 'normal'), 'website', p_source_label, 'intake-engine', p_test_marker,
        p_prospective_client_first_name, p_prospective_client_last_name, p_prospective_client_preferred_name,
        p_prospective_client_phone, p_prospective_client_email,
        coalesce(p_primary_contact_is_prospective_client, false)
      );

      insert into relationship_timeline (
        relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
      ) values (
        v_relationship_id, 'website_inquiry_received', 'Website inquiry received.',
        p_intake_context_note, 'website_intake_submissions', p_submission_id, 'intake-engine', true
      );

      if p_intake_context_note is not null and length(trim(p_intake_context_note)) > 0 then
        perform create_relationship_working_note(v_relationship_id, p_intake_context_note, null, 'intake-engine');
      end if;

      if p_service_summary is not null and length(trim(p_service_summary)) > 0 then
        perform upsert_relationship_service_opportunity(
          v_relationship_id, p_service_summary, null, null, null, null, null, null, null, 'intake-engine'
        );
      end if;

      if p_classification = 'external_prospect' and p_service_address_line_1 is not null then
        perform upsert_relationship_service_location(
          v_relationship_id, p_service_address_line_1, p_service_address_line_2, p_service_city,
          p_service_state, p_service_postal_code, p_service_residence_type, null, null, 'intake-engine'
        );
      end if;

      if p_action_title is not null then
        v_first_action_id := create_relationship_action(
          v_relationship_id, coalesce(p_action_type, 'follow_up'), p_action_title,
          null, p_action_due_at, p_owner_label, coalesce(p_priority, 'normal'), 'intake-engine'
        );
      end if;
    end if;

  -- ─── Recruiting ──────────────────────────────────────────────────────
  elsif p_classification = 'recruiting' then
    select id into v_recruiting_lead_id
    from recruiting_leads
    where role_interest = p_recruiting_role
      and (
        (p_recruiting_email is not null and lower(email) = lower(p_recruiting_email))
        or (p_recruiting_phone is not null and phone = p_recruiting_phone)
      )
    order by created_at desc
    limit 1;

    if v_recruiting_lead_id is null then
      insert into recruiting_leads (
        role_interest, source, status, first_name, last_name, phone, email,
        zip_code, city_state, linkedin_url, resume_url, message, raw_submission
      ) values (
        p_recruiting_role, 'website', 'new', p_recruiting_first_name, p_recruiting_last_name,
        p_recruiting_phone, p_recruiting_email, p_recruiting_zip, p_recruiting_city_state,
        p_recruiting_linkedin, p_recruiting_resume_filename, p_recruiting_message, p_normalized_envelope
      )
      returning id into v_recruiting_lead_id;
    end if;
  end if;

  -- ─── Idempotent upsert of the processing record itself ────────────────
  insert into intake_processing_records (
    intake_source, source_submission_id, source_table, intake_type,
    processing_status, classification, confidence_score, confidence_band, reason_codes,
    normalized_envelope, relationship_id, resident_id, recruiting_lead_id, first_action_id,
    processed_by, processing_started_at, processed_at
  ) values (
    'website', p_submission_id, 'website_intake_submissions',
    coalesce((p_normalized_envelope->>'intakeType'), 'unknown'),
    v_status, p_classification, p_confidence_score, p_confidence_band, coalesce(p_reason_codes, '{}'),
    p_normalized_envelope, v_relationship_id, p_resident_id, v_recruiting_lead_id, v_first_action_id,
    'intake-engine', now(), now()
  )
  on conflict (intake_source, source_submission_id) do update
  set processing_status = excluded.processing_status,
      classification = excluded.classification,
      confidence_score = excluded.confidence_score,
      confidence_band = excluded.confidence_band,
      reason_codes = excluded.reason_codes,
      normalized_envelope = excluded.normalized_envelope,
      relationship_id = excluded.relationship_id,
      resident_id = excluded.resident_id,
      recruiting_lead_id = excluded.recruiting_lead_id,
      first_action_id = excluded.first_action_id,
      last_error = null,
      processed_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function process_website_intake_submission(
  uuid, text, integer, text, text[], jsonb, uuid, text, text, uuid, text, text, text, text, text,
  text, text, text, text, boolean, text, text, text, text,
  text, text, text, text, text, text,
  text, text,
  text, text, timestamptz,
  text, text, text, text, text, text, text, text, text, text,
  boolean, text
) from public;
grant execute on function process_website_intake_submission(
  uuid, text, integer, text, text[], jsonb, uuid, text, text, uuid, text, text, text, text, text,
  text, text, text, text, boolean, text, text, text, text,
  text, text, text, text, text, text,
  text, text,
  text, text, timestamptz,
  text, text, text, text, text, text, text, text, text, text,
  boolean, text
) to service_role;

-- ─── Failure recording ────────────────────────────────────────────────────
-- Deliberately a separate, tiny transaction from
-- process_website_intake_submission — if the main processor throws, its
-- entire transaction (including any processing-record insert) rolls back,
-- so failure must be recorded from outside that transaction (Part 22:
-- "Processing failures must never lose customer data... update the
-- processing record to failed... preserve retry count").
create or replace function record_intake_processing_failure(
  p_submission_id uuid,
  p_intake_type text,
  p_error text
)
returns intake_processing_records
language plpgsql
set search_path = public
as $$
declare
  v_result intake_processing_records;
begin
  insert into intake_processing_records (
    intake_source, source_submission_id, source_table, intake_type,
    processing_status, last_error, retry_count, processed_by, processing_started_at
  ) values (
    'website', p_submission_id, 'website_intake_submissions', p_intake_type,
    'failed', p_error, 1, 'intake-engine', now()
  )
  on conflict (intake_source, source_submission_id) do update
  set processing_status = 'failed',
      last_error = excluded.last_error,
      retry_count = intake_processing_records.retry_count + 1
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function record_intake_processing_failure(uuid, text, text) from public;
grant execute on function record_intake_processing_failure(uuid, text, text) to service_role;

commit;
