begin;

-- Community Roster Import + Reconciliation phase, Pass 3 — Finalize
-- Import, plus two identity-model refinements carried in from the
-- approved plan's clarifications.
--
-- SAFETY REVIEW (required before applying):
--   - Forward-only: no DROP TABLE, DROP COLUMN, DELETE, TRUNCATE, or data
--     mutation of any kind.
--   - finalized_by is a new, nullable column -- every existing row is
--     unaffected (reads back null, exactly meaning "never finalized").
--   - The resolution_status CHECK constraint change only WIDENS an
--     existing allow-list (adds 'contradicted_match' and
--     'possible_cross_community_match'); every row that satisfied the
--     old constraint still satisfies the new one. Neither the legacy CLI
--     nor matchPerson()/reconcileRoster() (both unmodified) ever produce
--     these values -- only the orchestration layer
--     (communityRosterReconciliation.ts) does.
--
-- ROLLBACK (safe any time; a row using either new resolution_status
-- value would need reclassifying first if a full constraint rollback is
-- intended):
--
--   alter table roster_import_runs drop column if exists finalized_by;
--   alter table roster_source_rows drop constraint if exists roster_source_rows_resolution_status_check;
--   alter table roster_source_rows add constraint roster_source_rows_resolution_status_check
--     check (resolution_status in (
--       'exact_match', 'apartment_change', 'new_resident', 'ambiguous', 'possible_duplicate', 'conflict', 'skipped',
--       'possible_match'
--     ));

-- ─── Finalize Import ─────────────────────────────────────────────────
-- Pass 2's confirm/reject/defer/create actions already write durably the
-- moment a human decides -- there is no second "apply" of those
-- decisions. Finalize Import is a distinct, governed action that closes
-- out a review session: it computes the run's final status from
-- whatever review_state each row has already reached (never re-executes
-- any row's decision) and records who closed it out, mirroring
-- imported_by's own existing convention.
alter table public.roster_import_runs
  add column if not exists finalized_by text;

comment on column public.roster_import_runs.finalized_by is
  'Who ran Finalize Import (Community Roster Import + Reconciliation phase, Pass 3) -- distinct from imported_by. Null until finalized. Finalizing never re-applies any row''s already-durable Match/Create/Reject decision; it only records the run''s closing status and summary.';

-- ─── Identity refinement 1: cross-community overlap/move ────────────
-- 'possible_cross_community_match': a roster row with no in-community
-- candidate, where Serve's canonical identity signals found a credible
-- candidate living in a DIFFERENT community. Distinct from a plain
-- 'new_resident' (no candidate anywhere) and from an ordinary
-- same-community 'possible_match' -- this classification exists so the
-- review UI can present it explicitly as a possible move/lease-overlap
-- case, never silently folded into either of the other two. Confirming
-- it links the roster observation to the existing resident as a SECOND
-- source (never 'primary' if a primary community_roster link already
-- exists for that resident -- see confirmCommunityRosterMatch) and never
-- writes residents.community_id; both communities' source observations
-- and roster history are preserved side by side.
--
-- ─── Identity refinement 2: exact-name collisions ────────────────────
-- 'contradicted_match': the roster engine's own unit/name-tier match
-- (exact_match/apartment_change) found a specific candidate, but Serve's
-- canonical identity signals independently found STRONG CONTRADICTING
-- evidence for that same candidate (today: a conflicting date of birth,
-- or a confirmed alias for this exact name that points at a different
-- resident). Name+unit agreement is never treated as sufficient on its
-- own once a real contradiction is on file -- the row is routed to
-- explicit human review instead of being presented as a confident
-- suggestion, even though the roster's own tier would have called it a
-- clean match.
alter table public.roster_source_rows
  drop constraint if exists roster_source_rows_resolution_status_check;
alter table public.roster_source_rows
  add constraint roster_source_rows_resolution_status_check
  check (resolution_status in (
    'exact_match', 'apartment_change', 'new_resident', 'ambiguous', 'possible_duplicate', 'conflict', 'skipped',
    'possible_match', 'contradicted_match', 'possible_cross_community_match'
  ));

commit;
