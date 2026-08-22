begin;

-- Multi-Community Foundation, Phase B (1 of 3) — seed the two new
-- communities into the existing `communities` table
-- (20260813000000_add_canonical_workforce_profile_editor.sql), which
-- already holds exactly one row today: ('watermere_frisco', 'Watermere
-- at Frisco'). Pure additive INSERT — no column changes to `communities`
-- itself. Per Phase B's governing decision #10, only fields with current
-- operational value are added to this table, and none are needed to
-- seed two more rows of reference data, so this migration touches no
-- columns at all.
--
-- Codes follow this table's own existing underscore convention
-- (matching requirement_code/set_code elsewhere in this schema), not
-- the hyphenated slug the original scope suggested before this table
-- was discovered to already exist.
insert into public.communities (code, name)
values
  ('watermere_firewheel', 'Watermere at Firewheel'),
  ('watermere_mckinney', 'Watermere at McKinney')
on conflict (code) do nothing;

-- ROLLBACK:
--
--   delete from public.communities where code in ('watermere_firewheel', 'watermere_mckinney');
--
-- Safe only as long as nothing yet references these rows by id (true as
-- of this migration; the two migrations that follow in this phase are
-- what would create such references).

commit;
