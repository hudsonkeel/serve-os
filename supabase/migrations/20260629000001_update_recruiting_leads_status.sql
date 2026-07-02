-- Rename status values to match Serve recruiting workflow vocabulary.
-- Before: new | reviewing | contacted | advanced | hired | declined | withdrawn
-- After:  new | contacted | in_review | applied | not_a_fit | hired | archived
--
-- Run this in the Supabase SQL editor after the initial recruiting_leads migration.

begin;

alter table recruiting_leads
  drop constraint recruiting_leads_status_check;

-- Migrate any existing rows to the new vocabulary
update recruiting_leads set status = 'in_review'  where status = 'reviewing';
update recruiting_leads set status = 'applied'    where status = 'advanced';
update recruiting_leads set status = 'not_a_fit'  where status = 'declined';
update recruiting_leads set status = 'archived'   where status = 'withdrawn';

alter table recruiting_leads
  add constraint recruiting_leads_status_check
  check (status in ('new', 'contacted', 'in_review', 'applied', 'not_a_fit', 'hired', 'archived'));

commit;
