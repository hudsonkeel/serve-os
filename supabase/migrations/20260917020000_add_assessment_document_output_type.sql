begin;

-- Assessment Workflow Slice B (2026-09-17): the immutable approved-assessment snapshot lives as
-- one more assessment_outputs row, output_type='assessment_document' -- the same generic
-- artifacts table axiscare_payload_preview/cinch_projection already use, not a new table. This
-- widens the existing output_type CHECK constraint to add it (additive, matches this
-- repository's established constraint-widening discipline -- see
-- 20260916000000_add_assessment_processing_queue.sql for the identical pattern applied to
-- intake_assessment_sessions.status).
alter table public.assessment_outputs
  drop constraint if exists assessment_outputs_output_type_check;

alter table public.assessment_outputs
  add constraint assessment_outputs_output_type_check
  check (
    output_type in (
      'internal_summary', 'client_email', 'proposal', 'axiscare_payload_preview', 'cinch_projection',
      'assessment_document'
    )
  );

-- At most one assessment_document row per session -- the DB-level backstop for
-- approveAssessment()'s own check-then-insert idempotency (application-level check first;
-- this constraint is what makes a genuine race between two concurrent requests safe too,
-- matching requirement_evidence_links_unique's identical belt-and-suspenders discipline). A
-- PARTIAL index, not a full (assessment_session_id, output_type) unique constraint: the other
-- output_types (axiscare_payload_preview, cinch_projection) are generated via an explicit
-- "Preview"/"Generate" button a reviewer may legitimately click more than once, and this
-- migration makes no change to that existing behavior.
create unique index if not exists assessment_outputs_one_document_per_session
  on public.assessment_outputs (assessment_session_id)
  where output_type = 'assessment_document';

commit;
