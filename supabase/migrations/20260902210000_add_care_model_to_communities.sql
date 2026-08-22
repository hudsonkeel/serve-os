begin;

-- Multi-Community Foundation, Phase D.5 — the minimum durable distinction
-- between Serve's two top-level care models, attached to the existing
-- `communities` table rather than a new hierarchy/table. Community Care
-- (Watermere and future ISL/senior-living partner communities) and
-- Traditional Care (Frisco Lakes, Heritage Ranch, and eventually
-- geography-based direct private-home service, which may have no
-- canonical community at all) both remain represented by real
-- `communities` rows where a real partner/community environment exists --
-- this migration only classifies which of the two models each row
-- belongs to. It does NOT assert every future Serve client needs a
-- community_id: residents.community_id and relationships.community_id
-- (20260902190000_add_community_id_to_residents_and_relationships.sql)
-- stay exactly as nullable as before -- nothing here tightens that.
--
-- Classification is explicit, stored data -- never inferred from name
-- patterns at runtime. This migration is the one place a code-to-name
-- mapping is allowed to exist, because it's a one-time, reviewable,
-- explicit backfill by `code`, not a runtime `name.includes("Watermere")`
-- check baked into application logic.

alter table public.communities
  add column if not exists care_model text;

-- Backfill the three existing Watermere communities.
update public.communities
set care_model = 'community_care'
where code in ('watermere_frisco', 'watermere_firewheel', 'watermere_mckinney')
  and care_model is null;

-- Seed the two near-term Traditional Care contexts. Real partner/
-- community environments (large partner developments), not a stand-in
-- for individual private households -- a private home is never a
-- `communities` row.
insert into public.communities (code, name, care_model)
values
  ('frisco_lakes', 'Frisco Lakes', 'traditional_care'),
  ('heritage_ranch', 'Heritage Ranch', 'traditional_care')
on conflict (code) do nothing;

-- Every row has a value by this point (the three existing rows were just
-- backfilled above; the two new rows were inserted with care_model set;
-- no other rows exist). Lock it down now that nothing is null.
alter table public.communities
  add constraint communities_care_model_check
  check (care_model in ('community_care', 'traditional_care'));

alter table public.communities
  alter column care_model set not null;

-- ROLLBACK:
--
--   alter table public.communities alter column care_model drop not null;
--   alter table public.communities drop constraint if exists communities_care_model_check;
--   delete from public.communities where code in ('frisco_lakes', 'heritage_ranch');
--   alter table public.communities drop column if exists care_model;

commit;
