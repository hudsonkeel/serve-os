begin;

-- Canonical identity fields on workforce_members — fixes the "Unnamed
-- workforce member" bug: workforce_members had no name fields at all
-- (see 20260802000000_create_workforce_members.sql's own comment, "No
-- name, contact, or HR fields live here"), so the UI's displayName was
-- always *computed at read time* from a recruiting lead join or the
-- primary AxisCare link, never persisted on the canonical row itself. A
-- workforce member created from an AxisCare identity with no linked
-- recruiting lead (see createStandaloneWorkforceMember) had no name
-- source to compute from until its identity link was confirmed, so it
-- rendered "Unnamed workforce member" until then — and if that link was
-- later demoted/reassigned (Vendor Identity Lineage,
-- 20260811000000_add_vendor_identity_lineage.sql), the computed name
-- could change out from under a caregiver's own profile with no durable
-- record of what it "should" be.
--
-- This migration makes the canonical identity a real, persisted fact
-- of workforce_members itself, initialized once at creation and never
-- silently recomputed — AxisCare/recruiting-lead data remains the
-- *source of attribution* (this is not a second editable name source;
-- see lib/data/workforceMembers.ts and lib/actions/workforce.ts, which
-- are the only writers), but the canonical row itself always carries a
-- human-readable name.
--
-- Additive only. Does not touch 20260808000000/20260809000000/
-- 20260810000000/20260811000000.

alter table public.workforce_members
  add column if not exists display_name text,
  add column if not exists legal_first_name text,
  add column if not exists legal_last_name text,
  add column if not exists preferred_name text;

-- ─── Backfill existing rows ────────────────────────────────────────────
-- Leg 1: members linked to a recruiting lead — the lead's name is the
-- canonical identity source (matches the original, pre-AxisCare
-- resolveDisplayName() precedent in lib/workforce/roster.ts).
update public.workforce_members wm
set legal_first_name = rl.first_name,
    legal_last_name = rl.last_name,
    display_name = nullif(trim(concat_ws(' ', rl.first_name, rl.last_name)), '')
from public.recruiting_leads rl
where wm.source_recruiting_lead_id = rl.id
  and wm.display_name is null;

-- Leg 2: standalone (AxisCare-only) members, or lead-linked members whose
-- lead had no name on file — fall back to the confirmed PRIMARY AxisCare
-- identity (never a duplicate/retired one; see
-- person_vendor_identity_links_one_primary_per_subject_idx, which
-- guarantees at most one such row per subject+source).
update public.workforce_members wm
set legal_first_name = coalesce(wm.legal_first_name, pvil.approved_source_data ->> 'firstName'),
    legal_last_name = coalesce(wm.legal_last_name, pvil.approved_source_data ->> 'lastName'),
    preferred_name = coalesce(wm.preferred_name, pvil.approved_source_data ->> 'goesBy'),
    display_name = coalesce(
      wm.display_name,
      nullif(trim(concat_ws(' ', pvil.approved_source_data ->> 'firstName', pvil.approved_source_data ->> 'lastName')), ''),
      pvil.vendor_display_name
    )
from public.person_vendor_identity_links pvil
where pvil.subject_type = 'workforce_member'
  and pvil.subject_id = wm.id
  and pvil.status = 'confirmed'
  and pvil.link_role = 'primary'
  and pvil.source_system = 'axiscare'
  and wm.display_name is null;

-- ─── Enforce the invariant going forward ──────────────────────────────
-- "The canonical Serve person should never exist without a human-readable
-- name." Both writers (lib/data/workforceMembers.ts's
-- createWorkforceMember/createStandaloneWorkforceMember) now require and
-- set display_name at INSERT time — this constraint makes that a database
-- guarantee, not just an application convention.
--
-- If this fails when applied, it means at least one existing
-- workforce_members row has neither a named recruiting lead nor a
-- confirmed primary AxisCare identity to backfill from. Run this first to
-- find any such row and resolve it manually before re-applying:
--
--   select id, source_recruiting_lead_id, created_at, created_by
--   from workforce_members where display_name is null;
alter table public.workforce_members
  alter column display_name set not null;

alter table public.workforce_members
  add constraint workforce_members_display_name_not_blank
  check (length(trim(display_name)) > 0);

commit;
