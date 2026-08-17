-- Emergency Preparedness Activation — Phase B, Migration 1 of 3.
--
-- Emergency Preparedness's own requirements (Serve P&P §256) are mostly
-- agency-level, not per-person — "the EPRP is on file," "the Disaster
-- Coordinator is designated," "the annual review happened." Neither
-- person_evidence nor person_documents accepts subject_type = 'agency'
-- today (only 'workforce_member'/'resident'), and no agencies table exists
-- at all — 'agency' is already accepted by audit_session_items/
-- compliance_corrective_actions/compliance_activity's CHECK constraints
-- but with zero backing table and zero validation, a known, separately
-- tracked gap (see lib/data/auditSessions.ts's own KNOWN GAP comment).
--
-- This migration creates one real backing table (seeded with Serve's one
-- current agency) and widens person_evidence/person_documents plus
-- assert_valid_person_subject() exactly per the two-part pattern already
-- used twice for 'resident' (20260819000000 / 20260820000000).
--
-- No singleton assumption: `slug` is the stable lookup key, matching the
-- requirement_sets.set_code / person_requirements.requirement_code
-- reference-data convention already used everywhere else in this schema —
-- never an implicit "first row wins" query. The table is seeded with
-- exactly one row because that's the real current state, not because the
-- schema only supports one; a second agency later is a plain insert.
--
-- Also adds person_evidence.satisfaction_context — a narrowly-scoped,
-- nullable column carrying "how this evidence satisfies its requirement"
-- (e.g. "annual reaffirmation" vs "planned drill" vs "actual emergency
-- response"). Deliberately NOT layered onto source_system, which stays
-- strictly provenance/origin ("Serve OS", "AxisCare", "Viventium") — see
-- lib/emergencyPreparedness/satisfactionContext.ts for the closed, typed
-- vocabulary Emergency Preparedness writes here; no domain is required to
-- populate it, and no blanket CHECK constraint is imposed on a column
-- shared across domains.
--
-- SAFETY REVIEW:
--   - Forward-only: no DROP TABLE, DROP COLUMN, DELETE, TRUNCATE, or data
--     mutation of any kind. The two subject_type CHECK changes only WIDEN
--     an existing allow-list; every row that satisfied the old constraint
--     still satisfies the new one. satisfaction_context is a new nullable
--     column — every existing row is unaffected.
--   - assert_valid_person_subject()'s existing 'workforce_member'/
--     'resident' branches are byte-for-byte unchanged; only a new 'agency'
--     elsif is added ahead of the existing else.
--
-- ROLLBACK (safe to run any time after this migration, even with
-- agency-type rows already present — narrows the *capability* only; drop
-- agency-type person_evidence/person_documents rows first if a full
-- rollback is intended):
--
--   alter table person_evidence drop constraint if exists person_evidence_subject_type_check;
--   alter table person_evidence add constraint person_evidence_subject_type_check
--     check (subject_type in ('workforce_member', 'resident'));
--   alter table person_documents drop constraint if exists person_documents_subject_type_check;
--   alter table person_documents add constraint person_documents_subject_type_check
--     check (subject_type in ('workforce_member', 'resident'));
--   alter table person_evidence drop column if exists satisfaction_context;
--   create or replace function assert_valid_person_subject(p_subject_type text, p_subject_id uuid)
--   returns void language plpgsql set search_path = public as $$
--   begin
--     if p_subject_type = 'workforce_member' then
--       if not exists (select 1 from workforce_members where id = p_subject_id) then
--         raise exception 'subject_id % does not reference an existing workforce_members row', p_subject_id;
--       end if;
--     elsif p_subject_type = 'resident' then
--       if not exists (select 1 from residents where id = p_subject_id) then
--         raise exception 'subject_id % does not reference an existing residents row', p_subject_id;
--       end if;
--     else
--       raise exception 'unsupported subject_type: %', p_subject_type;
--     end if;
--   end;
--   $$;
--   drop table if exists agencies;
--
-- NOT YET APPLIED — pending explicit approval, per standing instruction.

begin;

create table if not exists agencies (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now(),

  constraint agencies_slug_not_blank check (length(trim(slug)) > 0),
  constraint agencies_name_not_blank check (length(trim(name)) > 0)
);

insert into agencies (slug, name)
values ('serve-caregiving', 'Serve Caregiving')
on conflict (slug) do nothing;

alter table agencies enable row level security;
revoke all on agencies from public, anon, authenticated;
grant all on agencies to service_role;

alter table person_evidence drop constraint if exists person_evidence_subject_type_check;
alter table person_evidence add constraint person_evidence_subject_type_check
  check (subject_type in ('workforce_member', 'resident', 'agency'));

alter table person_documents drop constraint if exists person_documents_subject_type_check;
alter table person_documents add constraint person_documents_subject_type_check
  check (subject_type in ('workforce_member', 'resident', 'agency'));

create or replace function assert_valid_person_subject(p_subject_type text, p_subject_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_subject_type = 'workforce_member' then
    if not exists (select 1 from workforce_members where id = p_subject_id) then
      raise exception 'subject_id % does not reference an existing workforce_members row', p_subject_id;
    end if;
  elsif p_subject_type = 'resident' then
    if not exists (select 1 from residents where id = p_subject_id) then
      raise exception 'subject_id % does not reference an existing residents row', p_subject_id;
    end if;
  elsif p_subject_type = 'agency' then
    if not exists (select 1 from agencies where id = p_subject_id) then
      raise exception 'subject_id % does not reference an existing agencies row', p_subject_id;
    end if;
  else
    raise exception 'unsupported subject_type: %', p_subject_type;
  end if;
end;
$$;

alter table person_evidence add column if not exists satisfaction_context text;

commit;
