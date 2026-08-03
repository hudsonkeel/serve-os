begin;

-- Human Attestation & Evidence Assurance (Phase 1D) — the narrowest
-- additive change that lets an authorized human "personally review an
-- authoritative source and record that review inside Serve OS" as a real,
-- provenanced evidence-collection method, without touching the evaluation
-- engine (lib/compliance/requirementSetStatus.ts, unmodified) or
-- introducing a new platform primitive. Everything here is new, optional
-- columns on the existing, platform-owned person_evidence table.
--
-- Three separate concepts, kept deliberately distinct per explicit
-- instruction — do not overload person_evidence.source_system (left
-- completely untouched, still whatever legacy value it already held) with
-- any of this:
--
--   authoritative_source_system — WHERE the fact actually lives
--     (viventium, axiscare, texas_nar, semarc, background_vendor,
--      uploaded_document, other_authorized_source)
--   collection_method           — HOW Serve OS came to have this evidence
--     (human_attestation, api_sync, structured_import, document_upload,
--      digital_compatriot_observation)
--   verification_method         — HOW that collection was itself verified
--     (direct_source_review, document_review, imported_authoritative_status,
--      automated_source_confirmation)
--
-- A fourth new column, attestation_result, is the structured "what was
-- observed" outcome — deliberately NOT the same column as the existing
-- `result` (person_evidence_result_check), which is registry-search-
-- specific vocabulary (no_record_returned/listed_with_findings/etc.)
-- already relied on by the shipped NAR/EMR verify UI. Overloading it would
-- have mixed two different meanings in one column for no benefit; a new
-- column keeps both vocabularies clean and non-conflicting.

alter table public.person_evidence
  add column authoritative_source_system text,
  add column collection_method           text,
  add column verification_method         text,
  add column attestation_result          text,
  add column external_reference          text;

alter table public.person_evidence
  add constraint person_evidence_authoritative_source_system_check
  check (authoritative_source_system is null or authoritative_source_system in (
    'viventium', 'axiscare', 'texas_nar', 'semarc', 'background_vendor',
    'uploaded_document', 'other_authorized_source'
  ));

alter table public.person_evidence
  add constraint person_evidence_collection_method_check
  check (collection_method is null or collection_method in (
    'human_attestation', 'api_sync', 'structured_import', 'document_upload',
    'digital_compatriot_observation'
  ));

alter table public.person_evidence
  add constraint person_evidence_verification_method_check
  check (verification_method is null or verification_method in (
    'direct_source_review', 'document_review', 'imported_authoritative_status',
    'automated_source_confirmation'
  ));

-- A deliberately wide, requirement-agnostic vocabulary — it is the union of
-- a generic verification-outcome set and the E-Verify-specific set the
-- product mission calls out by name (completed_closed/pending/
-- case_not_found). Which of these values counts as "the requirement is
-- satisfied" is NOT decided here or in the evaluator — it's decided in
-- application code (lib/workforce/humanAttestation.ts's
-- isAttestationResultAcceptable()), per requirement code, exactly as
-- instructed: "map acceptable outcomes within the requirement evaluator or
-- requirement-specific playbook," never assume one outcome (e.g.
-- completed_closed) is universally sufficient.
alter table public.person_evidence
  add constraint person_evidence_attestation_result_check
  check (attestation_result is null or attestation_result in (
    'verified', 'verified_with_observation', 'completed_closed', 'pending',
    'case_not_found', 'unable_to_verify', 'contradictory', 'requires_review',
    'not_found', 'unknown'
  ));

-- A Human Attestation row must carry full provenance — which authoritative
-- source was reviewed, how, and what was observed. Nothing else is
-- required to have these set. Deliberately does NOT also require
-- verification_status to already be resolved at this constraint's level —
-- the application layer creates the row (with these three fields already
-- populated) and immediately verifies/rejects it in a second statement,
-- mirroring this codebase's existing "two explicit steps, not one DB
-- transaction" convention (e.g. document + evidence creation in
-- uploadWorkforceDocument) rather than a fragile single-insert invariant.
alter table public.person_evidence
  add constraint person_evidence_human_attestation_provenance_check
  check (
    collection_method is distinct from 'human_attestation'
    or (
      authoritative_source_system is not null
      and verification_method is not null
      and attestation_result is not null
    )
  );

-- Loosens (never tightens) the existing verification-fields constraint: a
-- rejected row may now OPTIONALLY carry verified_by/verified_at. Needed so
-- a Human Attestation whose observed result did not satisfy the
-- requirement (e.g. Pending, Contradictory) still preserves WHO reviewed
-- the authoritative source and WHEN — provenance must survive regardless
-- of outcome. Every existing caller of rejectPersonEvidence() continues to
-- leave these columns null exactly as before; this only widens what is
-- PERMITTED, so no existing behavior changes.
alter table public.person_evidence
  drop constraint person_evidence_verification_fields_check;

alter table public.person_evidence
  add constraint person_evidence_verification_fields_check
  check (
    (verification_status = 'unverified' and verified_by is null and verified_at is null)
    or (verification_status = 'verified' and verified_by is not null and verified_at is not null)
    or (verification_status = 'rejected')
  );

-- One new workforce_activity event type for the attestation workflow.
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
    'identity_link_subject_reassigned',
    'canonical_profile_updated',
    'canonical_profile_reviewed',
    'canonical_profile_locked',
    'canonical_profile_unlocked',
    'community_membership_updated',
    'profile_discrepancy_flagged',
    'profile_discrepancy_resolved',
    'compliance_action_created',
    'compliance_action_resolved',
    'compliance_action_dismissed',
    'evidence_attested'
  ));

commit;
