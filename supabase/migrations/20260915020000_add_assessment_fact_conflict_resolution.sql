begin;

-- Durable conflict resolution (Assessment Contract / Coverage slice
-- follow-up, 2026-09-15). A reviewer's "which value is correct" choice for
-- a genuinely conflicting field is a resolution of a real data-integrity
-- exception, not an ephemeral UI click -- it must survive reload and
-- another session, and remain traceable to which source fact was chosen.
-- assessment_fact_conflicts already has status/resolution_note/
-- resolved_by/resolved_at (written 'open' at creation and never updated by
-- any code path until this slice) -- the one thing genuinely missing is
-- WHICH of the conflicting facts was selected as correct. This is the
-- smallest additive fix: one new nullable column, reusing everything else
-- already in place.
alter table assessment_fact_conflicts
  add column if not exists resolved_fact_id uuid references assessment_draft_facts(id);

-- The application (resolveFactConflict(), lib/data/assessmentIntelligence.ts) always sets
-- status and resolved_fact_id together in one update, but the database itself must not allow a
-- logically invalid state -- status='resolved' with no actual resolution recorded, or
-- resolved_fact_id set on a row that isn't (or is no longer) marked resolved.
alter table assessment_fact_conflicts drop constraint if exists assessment_fact_conflicts_resolution_state_check;
alter table assessment_fact_conflicts
  add constraint assessment_fact_conflicts_resolution_state_check
  check ((status = 'resolved') = (resolved_fact_id is not null));

-- Model-self-flagged single-fact conflicts (assertion_state =
-- 'conflicting' on one draft fact, with no natural second fact to pair
-- against) need the same durable resolution path as paired conflicts --
-- represented as a "singleton" row in this same table (fact_a_draft_id =
-- the flagged fact, fact_b_draft_id = null) rather than inventing a
-- second, parallel conflict-tracking mechanism. This is additive/widening
-- only: every already-persisted row has a real, distinct fact_b_draft_id,
-- so no existing row is affected. The original inline CHECK
-- (fact_b_draft_id <> fact_a_draft_id) is left as-is and does not need to
-- be touched -- per Postgres CHECK semantics, a NULL comparison evaluates
-- to NULL, and a NULL check result is treated as satisfying the
-- constraint (only an explicit FALSE fails it), so a singleton row with
-- fact_b_draft_id = null already satisfies the existing constraint
-- unchanged.
alter table assessment_fact_conflicts
  alter column fact_b_draft_id drop not null;

commit;
