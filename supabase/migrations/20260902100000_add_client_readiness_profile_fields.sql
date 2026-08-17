-- Client Readiness v0.1 — Migration 1 of 2.
--
-- The smallest canonical resident extension Client Readiness needs, per the
-- approved Phase A.2 architecture lock: physician contact and legal
-- guardian contact. Deliberately minimal — no broader physician/provider/
-- guardian/legal-authority model. family_contact_* (already on residents)
-- remains Serve's emergency-contact structure; nothing new is added for
-- that.
--
-- "No legal guardian" vs "guardian information unknown" is NOT represented
-- by a third resident column — per the approved architecture, that
-- distinction is carried by a recorded person_evidence attestation
-- (requirement_id = CR_CLIENT_PROFILE_ON_FILE, a "confirmed no legal
-- guardian" verification) rather than expanding the resident row. This
-- keeps the visible client record minimal while still making unknown and
-- none genuinely distinguishable — silence is never treated as "none."
--
-- Also widens the existing Human Attestation authoritative_source_system
-- vocabulary (supabase/migrations/20260817000000_add_human_attestation.sql)
-- to add 'physical_client_folder' — Medication List Available's evidence
-- source (Serve obtains the client's medication list and keeps it in the
-- physical Serve folder in the client's apartment; Serve OS never
-- transcribes it). This reuses the exact same Verify From Source
-- architecture Workforce already proved, rather than inventing a parallel
-- verification mechanism for one new source type.
--
-- SAFETY REVIEW: 4 new nullable columns (no default, no backfill needed —
-- every existing resident row is simply unset for these, which is the
-- correct "unresolved" state). The authoritative_source_system widening
-- only ADDS to the existing allow-list (idempotent drop/add, same pattern
-- as every prior widening in this series) — no existing row's value
-- becomes invalid.
--
-- APPLIED — confirmed live 2026-08-16 (Live Product Verification pass):
-- physician_name/physician_phone/legal_guardian_name/legal_guardian_phone
-- read via explicit select; 'physical_client_folder' accepted by the
-- widened constraint.

begin;

alter table public.residents
  add column if not exists physician_name text,
  add column if not exists physician_phone text,
  add column if not exists legal_guardian_name text,
  add column if not exists legal_guardian_phone text;

alter table public.person_evidence
  drop constraint if exists person_evidence_authoritative_source_system_check;
alter table public.person_evidence
  add constraint person_evidence_authoritative_source_system_check
  check (authoritative_source_system is null or authoritative_source_system in (
    'viventium', 'axiscare', 'texas_nar', 'semarc', 'background_vendor',
    'uploaded_document', 'other_authorized_source', 'physical_client_folder'
  ));

commit;
