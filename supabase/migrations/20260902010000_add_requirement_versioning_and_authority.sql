-- Audit Readiness v0.1 — Phase 1, Migration 2 of 4.
--
-- Additive-only widening of person_requirements (platform-owned reference
-- data, unchanged since 20260808000000) to carry the provenance and
-- versioning metadata Audit Readiness needs to answer "what did Serve
-- believe on a given date, and under what regulatory/policy authority."
-- Every new column is nullable or has a safe default; every existing row
-- (TX_NAR_SEARCH, TX_EMR_SEARCH, and the nine Employee Record Audit
-- requirements) is unaffected and still valid.
--
-- Versioning model — mirrors the existing supersedes_document_id /
-- supersedes_evidence_id self-FK convention exactly, rather than inventing
-- a new one:
--   - A requirement version is immutable once relied upon. A substantive
--     change to a requirement that has already been evaluated in a
--     completed audit session never rewrites that row in place — it
--     creates a NEW person_requirements row (new requirement_code — codes
--     stay unique and stable, they are not reused across versions) whose
--     supersedes_requirement_id points back at the prior version, exactly
--     as a new person_evidence row points back at the row it replaces.
--   - The prior version is marked retired (retired_at set, is_active
--     already exists and is set false) but never deleted — its
--     requirement_code, description, and evaluation history remain
--     queryable forever, so a completed audit session's "what was reviewed
--     and under what rule" answer never changes retroactively.
--   - This migration only adds the columns and the same-domain integrity
--     trigger. The actual immutability *enforcement* (refusing to hand-edit
--     a requirement once an audit has relied on it) is an application-layer
--     guard in lib/data/personRequirements.ts (updatePersonRequirement()),
--     consistent with this codebase's existing split between DB-level
--     structural integrity and app-level workflow rules — see
--     lib/workforce/evidenceLifecycle.ts mirroring
--     person_evidence's DB triggers without duplicating them.
--
-- domain vs. category: category (existing, open text) is a requirement-
-- level subcategory (e.g. "registry_check", "training_competency").
-- domain (new) is the Audit Readiness module/product area a requirement
-- belongs to (e.g. "emergency_preparedness", "client_file",
-- "workforce") — a coarser grouping used by the Audit Readiness dashboard
-- to roll requirements up by module, never used by the deterministic
-- evaluator itself (lib/compliance/requirementSetStatus.ts remains
-- unchanged and unaware of this column, same as every other domain-
-- interpretation-only field it already ignores, e.g. required_score's
-- sibling columns).
--
-- SAFETY REVIEW: forward-only, additive-only. No existing column, row, or
-- constraint is narrowed or removed. No existing caller of
-- person_requirements is affected — every new column defaults to null or a
-- value equal to what every existing row already implies (version = 1).
--
-- ROLLBACK:
--   alter table person_requirements
--     drop column if exists regulatory_authority,
--     drop column if exists domain,
--     drop column if exists version,
--     drop column if exists effective_date,
--     drop column if exists retired_at,
--     drop column if exists supersedes_requirement_id;
--   drop trigger if exists check_requirement_supersession_same_domain on person_requirements;
--   drop function if exists assert_requirement_supersession_same_domain();

begin;

alter table person_requirements
  add column if not exists regulatory_authority text,
  add column if not exists domain text,
  add column if not exists version integer not null default 1,
  add column if not exists effective_date date,
  add column if not exists retired_at timestamptz,
  add column if not exists supersedes_requirement_id uuid references public.person_requirements(id) on delete no action;

-- A superseding requirement must belong to the same domain as the
-- requirement it replaces — same discipline as
-- assert_evidence_supersession_same_subject_and_requirement(), scaled down
-- to the one dimension requirements actually have. Only enforced when the
-- prior row's domain is set (older/seed requirements may predate this
-- column and have a null domain — never retroactively assigned by this
-- migration).
create or replace function assert_requirement_supersession_same_domain()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prior_domain text;
begin
  if new.supersedes_requirement_id is not null then
    select domain into prior_domain
    from person_requirements where id = new.supersedes_requirement_id;

    if prior_domain is null and not found then
      raise exception 'supersedes_requirement_id % does not exist', new.supersedes_requirement_id;
    end if;

    if prior_domain is not null and new.domain is not null and prior_domain <> new.domain then
      raise exception 'superseding requirement domain (%) does not match superseded requirement domain (%)',
        new.domain, prior_domain;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_requirement_supersession_same_domain on person_requirements;
create trigger check_requirement_supersession_same_domain
  before insert or update on person_requirements
  for each row execute function assert_requirement_supersession_same_domain();

commit;
