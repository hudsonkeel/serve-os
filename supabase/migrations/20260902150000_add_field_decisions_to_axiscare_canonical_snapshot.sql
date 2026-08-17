-- Closed-Loop UX Pass, Phase 1 — per-field conflict review decisions.
--
-- Today axiscare_client_canonical_snapshot tracks conflict state at the
-- WHOLE-ROW level only (canonicalization_status/conflict_status/
-- conflict_notes) even though a single AxisCare client can disagree with
-- Serve on MULTIPLE independent fields at once (live-confirmed: Michele
-- Helsley disagrees on both family_contact_name and family_contact_phone).
-- The existing "Mark Reviewed" action can therefore only dismiss the
-- entire row, which would silently swallow a second, genuinely different
-- disagreement on another field of the same client the moment one field
-- is reviewed. Field-level granularity is required for correctness here,
-- not an enhancement.
--
-- Reuses this table's own existing snapshot/review pattern (an additive
-- column on the table that already IS this bootstrap's review-state
-- record) rather than a new generalized conflict-history table.
--
-- Separately, every unattended scheduled AxisCare Client Data Sync run
-- re-runs applyAxisCareCanonicalSnapshotToResident() for every confirmed
-- resident, which unconditionally recomputes and overwrites
-- canonicalization_status/conflict_notes from scratch — so a prior human
-- "Mark Reviewed" decision was being silently erased and re-flagged as
-- unresolved on the very next sync, forever, as long as the two systems
-- still disagreed. field_decisions lets the apply step distinguish "the
-- same AxisCare observation already reviewed" (stay quiet) from
-- "AxisCare's value changed again after review" (re-surface — a stale
-- decision must never suppress a materially NEW disagreement).
--
-- SAFETY REVIEW: pure additive column with a safe default on an existing,
-- already-live table. No backfill needed (defaults to '{}', meaning "no
-- field has been reviewed yet" for every existing row, which is exactly
-- true today). No FK, no constraint that could fail against existing
-- data.

begin;

alter table axiscare_client_canonical_snapshot
  add column if not exists field_decisions jsonb not null default '{}'::jsonb;

comment on column axiscare_client_canonical_snapshot.field_decisions is
  'Per-field human review decisions for conflicting bootstrap fields, keyed by the residents column name (e.g. "family_contact_relationship"). Each entry: {"decision": "keep_serve" | "use_axiscare", "axiscare_value_at_decision": text, "decided_by": text, "decided_at": timestamptz}. Read by applyAxisCareCanonicalSnapshotToResident() (lib/integrations/axiscare/clientCanonicalApply.ts): a field whose current AxisCare value still matches axiscare_value_at_decision stays quiet (no re-flag) on the next sync; a field whose AxisCare value has changed since the decision is treated as a genuinely new, unresolved conflict regardless of the stale decision on file.';

commit;
