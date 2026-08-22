begin;

-- AxisCare Reconciliation + Multi-Source Identity Ingestion phase.
--
-- "Create New Resident" (an operator reviews an external source record,
-- finds no credible existing canonical person, and intentionally creates
-- one) is not a MATCH at all -- no identity evidence was evaluated against
-- an existing person, because none existed to evaluate against. The
-- existing match_method vocabulary has no honest value for this ("vendor_id"
-- and every other value describe evidence FOR a specific existing person);
-- match_confidence's three values (high/medium/low) describe confidence IN
-- a match, which is a category error when there was no match to be
-- confident about. Storing match_confidence='high' here would read back as
-- "a high-confidence identity match occurred" when what actually happened
-- is "a human reviewed the source and intentionally created a new
-- canonical person because no appropriate existing person was selected" --
-- a materially different, and more important, audit fact.
--
-- Same idempotent drop/add pattern already used for this exact
-- match_method constraint's own subject_type sibling
-- (person_vendor_identity_links_subject_type_check, widened by
-- 20260820000000 and 20260902070000).
alter table public.person_vendor_identity_links
  drop constraint if exists person_vendor_identity_links_match_method_check;
alter table public.person_vendor_identity_links
  add constraint person_vendor_identity_links_match_method_check
  check (match_method in (
    'existing_linkage', 'vendor_id', 'verified_email', 'verified_phone',
    'verified_email_or_phone_plus_name', 'normalized_name_plus_attribute',
    'name_similarity_pending_review', 'created_new_subject'
  ));

alter table public.person_vendor_identity_links
  drop constraint if exists person_vendor_identity_links_match_confidence_check;
alter table public.person_vendor_identity_links
  add constraint person_vendor_identity_links_match_confidence_check
  check (match_confidence in ('high', 'medium', 'low', 'not_applicable'));

comment on column public.person_vendor_identity_links.match_method is
  'How this link was established. created_new_subject means an operator found no credible existing canonical person and intentionally created a new one from this source record -- never an identity match, so match_confidence on such a row is always not_applicable, never high/medium/low.';

-- ROLLBACK:
--
--   alter table public.person_vendor_identity_links drop constraint if exists person_vendor_identity_links_match_method_check;
--   alter table public.person_vendor_identity_links add constraint person_vendor_identity_links_match_method_check
--     check (match_method in ('existing_linkage','vendor_id','verified_email','verified_phone','verified_email_or_phone_plus_name','normalized_name_plus_attribute','name_similarity_pending_review'));
--   alter table public.person_vendor_identity_links drop constraint if exists person_vendor_identity_links_match_confidence_check;
--   alter table public.person_vendor_identity_links add constraint person_vendor_identity_links_match_confidence_check
--     check (match_confidence in ('high','medium','low'));

commit;
