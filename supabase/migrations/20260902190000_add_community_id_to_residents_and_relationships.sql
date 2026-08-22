begin;

-- Multi-Community Foundation, Phase B (2 of 3) — give `residents` and
-- `relationships` a real, FK-backed community relationship, additive
-- alongside their existing free-text community_name/community_code
-- columns (never removed or backfilled-and-dropped in this phase, per
-- governing decision #6/#11 — legacy text stays until canonical
-- ownership is proven in production use).
--
-- ─── residents ──────────────────────────────────────────────────────
-- One canonical community per resident. Nullable: a resident whose
-- community can't be confidently determined stays unassigned rather
-- than guessed (see the backfill migration that follows).
alter table public.residents
  add column if not exists community_id uuid references public.communities(id);

comment on column public.residents.community_id is
  'Canonical community this resident belongs to. Additive alongside the legacy community_name/community_code text columns, which remain the display/source-of-record fields until this column is proven correct in production. Null means not yet confidently assigned -- never silently defaulted to a specific community by application code.';

create index if not exists residents_community_id_idx
  on public.residents (community_id);

-- ─── relationships ──────────────────────────────────────────────────
-- A Relationship can legitimately exist before any resident record does
-- (see this table's own header comment in
-- 20260717000000_create_relationships_core.sql: "an external prospect
-- who contacted Serve before any resident record exists" -- resident_id
-- is nullable for exactly this reason). Because of that, community
-- ownership cannot always be inherited through resident_id, so
-- relationships gets its own community_id rather than relying solely on
-- a join to residents.
--
-- Once a relationship IS linked to a resident (resident_id set), the
-- two community_id values should agree -- that invariant is
-- deliberately NOT enforced by a trigger/constraint here (this phase is
-- schema-only, per its own scope) and is flagged as a write-safety
-- concern for the phase that wires actual creation/linking actions.
alter table public.relationships
  add column if not exists community_id uuid references public.communities(id);

comment on column public.relationships.community_id is
  'Canonical community this relationship belongs to. Independent of residents.community_id because a relationship (e.g. an external prospect) can exist before any resident record does. When resident_id is set, this should agree with that resident''s community_id -- an invariant intended for enforcement at the write-action layer, not yet enforced here. Additive alongside the legacy community_name text column.';

create index if not exists relationships_community_id_idx
  on public.relationships (community_id);

-- Composite indexes (e.g. community_id + status) are deliberately not
-- added here -- no real community-scoped query pattern exists yet to
-- justify one (that lands in a later phase that actually wires
-- community-scoped reads). A plain single-column index on the new FK is
-- the minimal, clearly-justified need for this phase.

-- ROLLBACK:
--
--   drop index if exists relationships_community_id_idx;
--   alter table public.relationships drop column if exists community_id;
--   drop index if exists residents_community_id_idx;
--   alter table public.residents drop column if exists community_id;

commit;
