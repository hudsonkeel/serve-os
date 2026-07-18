begin;

-- Contact-Ready Intake Workflow (Scope H) — see docs/design/
-- SERVE_INTAKE_INTELLIGENCE_ENGINE.md, "Contact-Ready Principle." The Contact-Ready /
-- Needs Resolution decision now lives entirely in the pure TypeScript engine
-- (lib/intake/classification.ts, lib/intake/contactReadiness.ts) — a submission with a
-- usable contact name and a phone or email is classified as an actionable Relationship
-- (`resident_prospect` / `external_prospect` / `professional_relationship`) even when
-- everything else about it is incomplete, per the audit in this scope's completion report.
--
-- No table, column, or constraint changes are required: `relationships` already allows an
-- incomplete row (only `display_name` and `created_by` are ever required —
-- 20260717000000_create_relationships_core.sql), and `intake_processing_records`'s existing
-- `processing_status` values (`processed` / `needs_review` / `failed` / `not_qualified`)
-- already say everything the UI/Dashboard need to derive Contact-Ready vs Needs Resolution
-- at read time, once `needs_review` is only ever reached for genuine blockers. This
-- migration's only change is additive: `process_website_intake_submission()` gains one new
-- trailing parameter so the first Next Action can carry a deterministic follow-up agenda
-- ("Learn during follow-up: ...") instead of always having a blank description.

create or replace function process_website_intake_submission(
  p_submission_id uuid,
  p_classification text,
  p_confidence_score integer,
  p_confidence_band text,
  p_reason_codes text[],
  p_normalized_envelope jsonb,
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
  p_service_address_line_1 text,
  p_service_address_line_2 text,
  p_service_city text,
  p_service_state text,
  p_service_postal_code text,
  p_service_residence_type text,
  p_service_summary text,
  p_intake_context_note text,
  p_action_title text,
  p_action_type text,
  p_action_due_at timestamptz,
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
  p_test_marker text default null,
  -- Contact-Ready Intake Workflow (Scope H): the deterministic "Contact {name}. Learn
  -- during follow-up: ..." agenda computed by lib/intake/contactReadiness.ts — the first
  -- Relationship Action's description, in place of the previously hardcoded null.
  p_action_detail text default null
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
          p_action_detail, p_action_due_at, p_owner_label, coalesce(p_priority, 'normal'), 'intake-engine'
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
          p_action_detail, p_action_due_at, p_owner_label, coalesce(p_priority, 'normal'), 'intake-engine'
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
  boolean, text, text
) from public;
grant execute on function process_website_intake_submission(
  uuid, text, integer, text, text[], jsonb, uuid, text, text, uuid, text, text, text, text, text,
  text, text, text, text, boolean, text, text, text, text,
  text, text, text, text, text, text,
  text, text,
  text, text, timestamptz,
  text, text, text, text, text, text, text, text, text, text,
  boolean, text, text
) to service_role;

commit;
