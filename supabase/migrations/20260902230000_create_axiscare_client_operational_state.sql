begin;

-- AxisCare Community Mapping + Operational State phase — a new,
-- purpose-built table, deliberately NOT an extension of
-- axiscare_client_canonical_snapshot. That table's own description is
-- explicit: "Temporary AxisCare -> Serve canonical bootstrap staging
-- layer... never a second canonical client record" -- a one-time
-- demographic gap-fill for already-confirmed residents, applied once
-- (applied_to_serve_at/applied_by) and never covering unmatched roster
-- records at all. Operational state is the opposite shape: it needs to
-- cover every roster record (matched or not, e.g. AxisCare client #40 /
-- Maria Matos, who has no resident match yet), refreshed on an ongoing
-- daily cadence, never "applied" as a one-time event. Extending the
-- bootstrap table would violate its own documented, narrow purpose.
--
-- Two kinds of columns, kept visually and structurally distinct (see
-- this phase's own "why did we think this belonged to Firewheel and why
-- did we think they were a prospect?" requirement):
--   - raw source facts: exactly what AxisCare returned, for audit;
--   - normalized outputs: what Serve concluded from those facts, via
--     the reviewed mapping tables in lib/integrations/axiscare/
--     communityMapping.ts and lifecycleSignals.ts.
--
-- Deliberately does NOT store raw contact info (email/phone) -- only a
-- has_contact_info presence boolean. Identity matching (which needs real
-- contact values) still runs at sync time against the live AxisCare
-- payload, exactly as it already does today; only the RESULT (which
-- resident, if any, and how confidently) is persisted here, never the
-- raw PHI it was computed from.
create table if not exists public.axiscare_client_operational_state (
  id                          uuid primary key default gen_random_uuid(),
  axiscare_client_id          text not null unique,

  -- ─── raw source facts, for audit/reproducibility ───────────────────
  -- The AxisCare-side display name -- real PII (a name), but not in the
  -- same category as the contact-info/medical/address fields
  -- deliberately excluded below: it's the least-sensitive identifying
  -- fact about a person, already displayed everywhere in this app for
  -- every resident, and genuinely needed by an existing UI feature
  -- (components/residents/ResidentIdentityAndRelationship.tsx's "listed
  -- there as <name>" display, and the identity-confirmation action that
  -- reads it) that would otherwise silently degrade.
  vendor_display_name         text,
  status_active               boolean not null,
  status_label                text,
  class_codes                 text[] not null default '{}',
  axiscare_community_id       integer,
  axiscare_community_name     text,
  start_date                  date,
  conversion_date             date,
  effective_end_date          date,
  has_contact_info            boolean not null default false,

  -- ─── normalized outputs ─────────────────────────────────────────────
  -- Nullable: unresolved community is a real, honest state, never
  -- defaulted to Frisco. See communityMapping.ts's own contract.
  resolved_community_id       uuid references public.communities(id),
  community_resolution_source text not null
    check (community_resolution_source in ('community_id', 'community_name', 'class_code', 'unresolved')),
  -- The Serve lifecycle (active_client/inactive_client/prospect/
  -- needs_review) computed from status/classes/contact/start-date at
  -- sync time via clientLifecycle.ts's classifyAxisCareClientLifecycle()
  -- -- unchanged logic, just relocated from render-time to sync-time.
  -- Deliberately NOT combined with disposition here: a human disposition
  -- override (axiscare_client_dispositions) must stay immediately
  -- responsive, so it is still looked up live (a fast, internal Supabase
  -- query, not a live AxisCare call) and combined with this stored
  -- lifecycle at read time, exactly as resolveAxisCareClientOperationalBucket()
  -- already does today.
  computed_lifecycle          text not null
    check (computed_lifecycle in ('active_client', 'inactive_client', 'prospect', 'needs_review')),
  is_placeholder_record       boolean not null default false,

  -- ─── identity match result, computed once at sync time ─────────────
  -- The full matchAxisCareClientToResident() + resolveAxisCareResidentMatch()
  -- pipeline (lib/integrations/axiscare/clientIdentityMatching.ts,
  -- clientOperationalStatus.ts) is unchanged -- it now runs once per
  -- sync instead of on every page render, and only its RESULT is stored.
  -- A confirmed link (person_vendor_identity_links) always wins here,
  -- exactly as it already does live.
  matched_resident_id         uuid references public.residents(id),
  identity_status             text not null
    check (identity_status in ('confirmed', 'candidate', 'needs_identity_review', 'unmatched')),
  match_basis                 text,

  synced_at                   timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists axiscare_client_operational_state_community_idx
  on public.axiscare_client_operational_state (resolved_community_id);

create index if not exists axiscare_client_operational_state_resident_idx
  on public.axiscare_client_operational_state (matched_resident_id);

alter table public.axiscare_client_operational_state enable row level security;
revoke all on public.axiscare_client_operational_state from public, anon, authenticated;
grant all on public.axiscare_client_operational_state to service_role;

comment on table public.axiscare_client_operational_state is
  'Ongoing, roster-wide (matched and unmatched alike) AxisCare operational state, refreshed by the daily scheduled sync -- distinct from axiscare_client_canonical_snapshot''s one-time demographic bootstrap purpose. Normal /residents and /residents/[id] page reads consume this table instead of calling AxisCare live; the Reconciliation workflow is unaffected and continues to compute live.';

-- ROLLBACK:
--
--   drop table if exists public.axiscare_client_operational_state;

commit;
