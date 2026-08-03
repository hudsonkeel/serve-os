begin;

-- workforce_members — a durable Serve workforce identity that survives
-- beyond recruiting. See docs/intelligence/SERVE_HUMAN_LIFECYCLE_ONTOLOGY.md
-- Part 1/§4.1, approved decision 1.
--
-- Deliberately minimal. This is NOT a universal Person model, NOT an HR
-- profile, and NOT a duplicate of Viventium. Its only responsibilities:
--   - canonical workforce identity            (this row's own id)
--   - recruiting lead linkage                 (source_recruiting_lead_id)
--   - vendor identity linkage                 (reachable by joining
--                                              recruiting_lead_vendor_identities
--                                              through source_recruiting_lead_id
--                                              — no separate table)
--   - workforce lifecycle participation        (reachable by joining
--                                              recruiting_lead_desired_state_evaluations
--                                              the same way — no separate table)
-- No name, contact, or HR fields live here — they stay on recruiting_leads,
-- read by join, never duplicated.
--
-- Entirely additive. No change to recruiting_leads. Nothing here ever
-- marks recruiting_leads.status.

create table if not exists workforce_members (
  id                         uuid primary key default gen_random_uuid(),
  source_recruiting_lead_id uuid not null unique references public.recruiting_leads(id),
  created_at                 timestamptz not null default now(),
  created_by                 text not null,

  constraint workforce_members_created_by_not_blank
    check (length(trim(created_by)) > 0)
);

alter table workforce_members enable row level security;

revoke all on workforce_members from public, anon, authenticated;
grant all on workforce_members to service_role;

commit;
