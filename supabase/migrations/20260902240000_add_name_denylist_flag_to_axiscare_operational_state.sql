begin;

-- AxisCare Reconciliation + Multi-Source Identity Ingestion phase.
--
-- The live /clients and /reconciliation path (axiscareClientOperationalSummary.ts)
-- excludes a name-denylisted record (isKnownNonResidentAxisCareClient — a
-- related contact person mistakenly entered as an AxisCare client, not a
-- placeholder) as a SEPARATE mechanism from disposition, applied before
-- resolveAxisCareClientOperationalBucket(). The stored
-- axiscare_client_operational_state table never persisted this flag, only
-- is_placeholder_record. Migrating /clients to stored state (this phase)
-- requires it, or a name-denylisted-but-not-placeholder record would wrongly
-- stop being excluded once the live call is removed.
alter table public.axiscare_client_operational_state
  add column if not exists is_name_denylisted boolean not null default false;

comment on column public.axiscare_client_operational_state.is_name_denylisted is
  'True when the AxisCare record''s normalized name matches lib/integrations/axiscare/clientIdentityMatching.ts''s KNOWN_NON_RESIDENT_NAMES denylist -- a real contact person entered as an AxisCare client, never a resident candidate. Independent from is_placeholder_record (structural "Community" placeholder rows).';

-- ROLLBACK:
--
--   alter table public.axiscare_client_operational_state drop column if exists is_name_denylisted;

commit;
