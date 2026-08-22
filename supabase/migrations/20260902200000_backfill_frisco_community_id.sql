begin;

-- Multi-Community Foundation, Phase B (3 of 3) — backfill community_id
-- for existing Frisco records only where the evidence is strong. No
-- record is ever assigned by default/absence -- every UPDATE below
-- requires a real positive signal. Anything without one keeps
-- community_id null and is left for manual review rather than guessed.
--
-- Verified against production data before writing this migration
-- (read-only queries, this session): all 334 existing residents.rows
-- have community_name = 'Watermere at Frisco' / community_code =
-- 'watermere-frisco' -- zero blanks, zero other values. Of 13
-- relationships rows, 12 carry a resident_id (8 of those have a blank
-- community_name themselves, 4 say 'Watermere at Frisco'); exactly one
-- ('Shurtleff Family Inquiry', an external_prospect with no resident_id
-- and no community_name) has no signal at all and is expected to remain
-- unassigned after this migration runs.

-- ─── residents: match on the resident's own community_name/community_code ───
-- This is the strong-evidence case for residents -- an explicit,
-- non-blank value that names Frisco. A resident with a blank
-- community_name is deliberately NOT swept in here even though, as of
-- today, none exist -- silence is not evidence, and this predicate
-- should not change behavior if that ever stops being true.
update public.residents
set community_id = (select id from public.communities where code = 'watermere_frisco')
where community_id is null
  and (
    (community_name is not null and lower(trim(community_name)) in ('watermere at frisco', 'watermere frisco', 'frisco'))
    or (community_code is not null and lower(trim(community_code)) in ('watermere-frisco', 'watermere_frisco', 'frisco'))
  );

-- ─── relationships, step 1: inherit through an already-confident resident ───
-- Where a relationship is linked to a resident (resident_id is not
-- null) and that resident now has a community_id (from the update
-- above), inherit it. This is stronger evidence than the relationship's
-- own community_name text -- it's why 8 of the 13 relationships rows
-- (blank community_name, but a real linked resident) can still be
-- confidently assigned here.
update public.relationships r
set community_id = res.community_id
from public.residents res
where r.resident_id = res.id
  and r.community_id is null
  and res.community_id is not null;

-- ─── relationships, step 2: fall back to the relationship's own text ───
-- Covers a relationship with no resident link yet but an explicit,
-- non-blank community_name of its own. Matches none of today's 13 rows
-- (the only resident_id-less row, 'Shurtleff Family Inquiry', also has
-- a blank community_name) but is the correct general rule, not a
-- special case for this dataset.
update public.relationships
set community_id = (select id from public.communities where code = 'watermere_frisco')
where community_id is null
  and resident_id is null
  and community_name is not null
  and lower(trim(community_name)) in ('watermere at frisco', 'watermere frisco', 'frisco');

-- Everything else keeps community_id null -- as of this writing, that is
-- expected to be exactly one relationships row and zero residents rows.
-- Re-run the verification counts in this phase's checkpoint report
-- against the live database immediately before applying this migration
-- to production, since new records may have been created since this
-- migration was written.

-- ROLLBACK:
--
--   update public.relationships set community_id = null
--     where community_id = (select id from public.communities where code = 'watermere_frisco');
--   update public.residents set community_id = null
--     where community_id = (select id from public.communities where code = 'watermere_frisco');
--
-- Safe to rerun: every UPDATE above is idempotent (community_id is null
-- guards each one), so re-applying this migration after a partial
-- failure is safe.

commit;
