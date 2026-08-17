-- Audit Readiness v0.1 — Phase 1, Migration 3 of 4.
--
-- person_evidence.requirement_id is a single FK — one evidence row
-- satisfies exactly one requirement. That has been sufficient for
-- Workforce (a registry search or a signed form satisfies exactly the one
-- requirement it was collected for) and is left completely untouched here.
--
-- Audit Readiness needs the many-to-many case on top of it: one piece of
-- evidence satisfying multiple requirements, with a stated reason why —
-- e.g. a documented actual emergency response satisfying both "the annual
-- planned drill was tested" and "the response phase of the EPRP was
-- exercised" from a single event record (see Serve P&P §256's own
-- "...in a planned drill if not tested during an actual emergency
-- response" language — the source of the "satisfied by event" requirement
-- in the Audit Readiness spec).
--
-- This is additive platform infrastructure, not an Audit-Readiness-owned
-- silo: it lives alongside person_requirements/person_evidence in the
-- same platform layer, available to any domain (workforce included) that
-- later has a genuine many-to-many case, though no existing workforce code
-- is changed to use it — person_evidence.requirement_id remains the
-- primary, sufficient link for every current workforce call site.
--
-- rationale is required (matches this codebase's universal discipline that
-- no consequential link is ever silent — see
-- person_vendor_identity_links_resolution_check, workforce_activity, etc.).
--
-- SAFETY REVIEW: net-new table, no existing table/column touched. RLS
-- enabled with zero policies + service_role-only grant, matching every
-- other table in this schema.

begin;

create table if not exists requirement_evidence_links (
  id              uuid primary key default gen_random_uuid(),

  requirement_id  uuid not null references public.person_requirements(id) on delete no action,
  evidence_id     uuid not null references public.person_evidence(id) on delete no action,

  rationale       text not null,

  linked_by       text not null,
  linked_at       timestamptz not null default now(),

  created_at      timestamptz not null default now(),

  constraint requirement_evidence_links_rationale_not_blank
    check (length(trim(rationale)) > 0),
  constraint requirement_evidence_links_linked_by_not_blank
    check (length(trim(linked_by)) > 0),
  constraint requirement_evidence_links_unique
    unique (requirement_id, evidence_id)
);

create index if not exists requirement_evidence_links_requirement_idx
  on requirement_evidence_links (requirement_id);

create index if not exists requirement_evidence_links_evidence_idx
  on requirement_evidence_links (evidence_id);

alter table requirement_evidence_links enable row level security;
revoke all on requirement_evidence_links from public, anon, authenticated;
grant all on requirement_evidence_links to service_role;

commit;
