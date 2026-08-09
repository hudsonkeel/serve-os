-- Serve OS — Pending Migration Validation Queries
-- Companion to docs/architecture/SERVE_OS_MIGRATION_DEPENDENCY_GRAPH.md
--
-- READ-ONLY. Every query here is a SELECT against information_schema,
-- pg_catalog, or pg_proc. Nothing here creates, alters, or deletes
-- anything. Run each block against the live Supabase project (SQL editor
-- or psql) to determine exactly which of the 10 pending migrations are
-- already applied, partially applied, or not applied at all.
--
-- Read the result of each query, then consult the "how to interpret"
-- comment above it — do not assume "table exists" means "fully applied."

-- ============================================================
-- 1. CAP-REC-001 — 20260726000000 / 20260728000000 / 20260730000000
-- ============================================================

-- 1a. Foundation tables present?
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'recruiting_lead_collector_runs',
    'recruiting_lead_observations',
    'recruiting_lead_desired_state_evaluations',
    'recruiting_lead_desired_state_evaluation_evidence'
  )
order by table_name;
-- Interpretation: 0 rows = none applied. 2 rows (collector_runs +
-- observations only) = 20260726 applied, 20260728/20260730 not yet.
-- 4 rows = all three migrations' tables exist (does not yet confirm
-- 20260728's column patch — see 1b).

-- 1b. Has 20260728's column patch landed on recruiting_lead_observations?
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'recruiting_lead_observations'
  and column_name in (
    'source_system', 'source_record_id', 'collected_at', 'source_location',
    'extractor_version', 'extraction_confidence', 'match_method',
    'failure_reason', 'sensitivity', 'collection_method'
  )
order by column_name;
-- Interpretation: 0 rows with the base table present = "only foundation
-- objects present, patch absent" (the partial-application state named in
-- the graph doc). 10 rows = 20260728 fully applied.

-- 1c. Are the 4 widened constraints from 20260728 present?
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.recruiting_lead_observations'::regclass
  and conname in (
    'recruiting_lead_observations_visibility_check',
    'recruiting_lead_observations_extraction_confidence_check',
    'recruiting_lead_observations_match_method_check',
    'recruiting_lead_observations_sensitivity_check'
  );
-- Interpretation: compare each definition's allowed-value list against the
-- migration file directly — a constraint with the same name but an older
-- value list is a "function/constraint present with older definition"
-- partial-application state, not a clean miss.

-- ============================================================
-- 2. CAP-REL-SUG-001 — 20260803000000
-- ============================================================

-- 2a. New table present?
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'relationship_interaction_suggestions';

-- 2b. New column on the EXISTING production relationship_touches table?
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'relationship_touches'
  and column_name = 'structured_summary';
-- Interpretation: relationship_touches itself will always exist (production,
-- 20260717010000). This query specifically checks only the new column.

-- 2c. Do the 3 new functions exist, with the expected signature?
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'generate_interaction_suggestions',
    'approve_interaction_suggestion',
    'dismiss_interaction_suggestion'
  );

-- ============================================================
-- 3. CAP-ROSTER-001 — 20260804000000
-- ============================================================

-- 3a. Foundation tables present?
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'roster_import_runs', 'roster_source_rows',
    'resident_apartment_history', 'roster_absence_reviews'
  )
order by table_name;

-- 3b. CRITICAL: which SIGNATURE of apply_roster_new_resident is live?
-- The original (20260804) has 14 parameters, ending ...text, uuid, text
-- (no p_phone_raw). The corrected version (20260807) has 15 parameters
-- with p_phone_raw inserted before p_source_system. This is the single
-- most important query in this file — it tells you which behavior is
-- currently live.
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.pronargs as arg_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'apply_roster_new_resident';
-- Interpretation:
--   0 rows                => neither migration applied.
--   1 row, 14 args, no phone_raw param => ONLY 20260804 applied — the
--     phone_raw bug is LIVE. Every roster-imported resident since has a
--     wrong phone_raw value. Flag for data correction once 20260807 lands.
--   1 row, 15 args, phone_raw present  => 20260807's correction is live.

-- ============================================================
-- 4. CAP-RES-ID-001 — 20260805 / 20260806 / 20260806010000 / 20260806020000
-- ============================================================

-- 4a. Foundation tables present?
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'resident_identity_candidates', 'resident_identity_candidate_members',
    'resident_identity_aliases', 'resident_merge_events',
    'resident_identity_redirects', 'resident_identity_suppressions',
    'resident_household_links'
  )
order by table_name;
-- Interpretation: the first 6 belong to 20260805; resident_household_links
-- belongs to 20260806 and depends on 20260805 already being applied.

-- 4b. Has 20260806010000's household_context column landed?
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'resident_identity_candidates'
  and column_name = 'household_context';
-- Interpretation: table present but this column absent = "tables present,
-- patches absent" partial-application state.

-- 4c. Which signature of create_resident_identity_candidates is live?
-- Both 20260805 and 20260806010000 use the SAME 3-argument signature
-- (p_detection_run_id uuid, p_candidates jsonb, p_actor text) — this is a
-- true in-place CREATE OR REPLACE, so argument count alone cannot
-- distinguish versions. Compare the function body instead:
select p.proname, pg_get_functiondef(p.oid) as full_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_resident_identity_candidates';
-- Interpretation: search the returned definition text for
-- "household_context" — if absent, only 20260805's version is live (the
-- 20260806010000 patch has not landed even though the base table might
-- already have the household_context COLUMN from 4b — these can be out of
-- sync since they're separate ALTER/CREATE OR REPLACE statements in the
-- same file, applied together or not at all in practice, but check both).

-- 4d. Does update_resident_identity_candidate_evidence exist? (20260806020000)
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_resident_identity_candidate_evidence';

-- ============================================================
-- 5. CAP-RES-DI-001 — 20260807000000
-- ============================================================

-- 5a. Foundation tables present?
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'resident_data_integrity_issues',
    'resident_data_integrity_issue_members',
    'resident_data_integrity_suppressions'
  )
order by table_name;

-- 5b. CRITICAL: which SIGNATURE of convert_external_prospect_to_new_resident
-- is live? This function is ALREADY IN PRODUCTION (20260719000000, 14 args,
-- no p_phone_raw). 20260807000000 drops and replaces it with a 15-arg
-- version. If application code expecting the 15-arg version is ever
-- deployed against a database still running the 14-arg version (or vice
-- versa), every call to this RPC will fail.
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.pronargs as arg_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'convert_external_prospect_to_new_resident';
-- Interpretation:
--   14 args, no phone_raw => production original still live (expected
--     baseline today — confirm this BEFORE any deploy that includes
--     updated application code expecting p_phone_raw).
--   15 args, phone_raw present => 20260807 already applied.
--   0 rows => impossible; this function must exist today (main is live).
--     Treat 0 rows as a signal something is very wrong, not a normal state.

-- 5c. Does resident_data_integrity_issues.linked_identity_candidate_id's
-- FK target exist? (confirms CAP-RES-ID-001 was applied first, as required)
select
  tc.constraint_name,
  ccu.table_name as references_table
from information_schema.table_constraints tc
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
where tc.table_name = 'resident_data_integrity_issues'
  and tc.constraint_type = 'FOREIGN KEY';
-- Interpretation: if resident_data_integrity_issues exists at all, this FK
-- must already resolve (Postgres would have refused to create the table
-- otherwise) — this query is a sanity check, not a live-or-not signal on
-- its own.

-- ============================================================
-- 6. Row Level Security — spot check across all 10 migrations' tables
-- ============================================================
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname in (
  'recruiting_lead_collector_runs', 'recruiting_lead_observations',
  'recruiting_lead_desired_state_evaluations', 'recruiting_lead_desired_state_evaluation_evidence',
  'relationship_interaction_suggestions',
  'roster_import_runs', 'roster_source_rows', 'resident_apartment_history', 'roster_absence_reviews',
  'resident_identity_candidates', 'resident_identity_candidate_members', 'resident_identity_aliases',
  'resident_merge_events', 'resident_identity_redirects', 'resident_identity_suppressions',
  'resident_household_links',
  'resident_data_integrity_issues', 'resident_data_integrity_issue_members', 'resident_data_integrity_suppressions'
)
order by table_name;
-- Interpretation: every table in this repository's convention enables RLS
-- with zero policies (service_role bypasses RLS entirely). Any row here
-- showing rls_enabled = false for a table that DOES exist is a deviation
-- from convention worth investigating before release.

-- ============================================================
-- 7. Grants spot check — service_role only, matching repository convention
-- ============================================================
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_name in (
  'apply_roster_new_resident',
  'convert_external_prospect_to_new_resident',
  'create_resident_identity_candidates',
  'update_resident_identity_candidate_evidence',
  'generate_interaction_suggestions'
)
order by routine_name, grantee;
-- Interpretation: expect exactly one row per function with grantee =
-- 'service_role', privilege_type = 'EXECUTE'. A row with grantee = 'PUBLIC'
-- present means the revoke statement did not run — a real security gap,
-- not just a partial-application curiosity.
