begin;

-- Community Roster Import + Reconciliation phase, Pass 3 correction
-- (pre-Pass 4). A person can legitimately appear on two community
-- rosters at once during a move or lease-overlap period. Pass 3 linked
-- that second confirmed roster observation as 'historical' — but
-- link_role's own governing comment (20260811000000) already says
-- 'historical' is "reserved for future lineage use; no Phase 1 action
-- assigns this value yet," precisely BECAUSE it asserts a chronological
-- claim ("this came before / is superseded") this system does not yet
-- have the evidence to make. Neither 'duplicate' (a same-source data
-- artifact — two vendor records for one person within ONE source
-- system's own data, e.g. two AxisCare client IDs from a vendor entry
-- mistake) nor 'retired' (a reviewer's deliberate deactivation) fits
-- either: this is a second GENUINE, still-current source observation,
-- not a data error and not something anyone retired.
--
-- 'concurrent' is the smallest additive correction: a confirmed,
-- non-primary link that coexists with the primary (or another
-- concurrent link) with NO claim about which is more current. Used
-- today only for the community-roster cross-community/move case. A
-- future residency-episode/transfer model determines actual current-vs-
-- historical community affiliation from effective dates and source
-- chronology — link_role alone must never assert that in the meantime.
--
-- SAFETY REVIEW:
--   - Forward-only, additive: widens two existing allow-lists (the
--     link_role CHECK constraint, and confirm_person_vendor_identity_link's
--     /set_person_vendor_identity_link_role's own in-function validation)
--     and adds one comment. No data is migrated or deleted by this
--     migration itself.
--   - Checked live before writing this migration: every 'historical'
--     community_roster row that existed was disposable test-fixture
--     debris from this session's own verify scripts (resolved_by =
--     'verify-script', subject already deleted) — never real production
--     data, since the real Firewheel roster has never been imported
--     through this phase. That debris (21 orphaned rows, plus their
--     decision rows) was deleted directly; there is no real-data
--     backfill for this migration to perform.
--   - While re-creating set_person_vendor_identity_link_role, this
--     migration also fixes a pre-existing, unrelated bug: its own
--     "does not accept %%" RAISE format string used a literal-percent
--     escape (%%, zero substitution slots) while still passing
--     p_new_role as an argument — Postgres's check_function_bodies
--     rejects that as "too many parameters specified for RAISE" the
--     moment the function is (re)compiled. Fixed to a single % so the
--     error message actually reports the invalid value, as originally
--     intended. This bug predates this migration (present in
--     20260811000000's own original body) and was latent only because
--     nothing had re-created this function since; caught here because
--     CREATE OR REPLACE recompiles it.
--
-- ROLLBACK (only safe once no row uses link_role = 'concurrent'):
--   alter table person_vendor_identity_links drop constraint if exists person_vendor_identity_links_link_role_check;
--   alter table person_vendor_identity_links add constraint person_vendor_identity_links_link_role_check
--     check (link_role is null or link_role in ('primary', 'duplicate', 'retired', 'historical'));
--   -- (and revert the two RPCs below to their prior CREATE OR REPLACE bodies)

alter table public.person_vendor_identity_links
  drop constraint if exists person_vendor_identity_links_link_role_check;
alter table public.person_vendor_identity_links
  add constraint person_vendor_identity_links_link_role_check
  check (link_role is null or link_role in ('primary', 'duplicate', 'retired', 'historical', 'concurrent'));

comment on column public.person_vendor_identity_links.link_role is
  'primary: current profile-driving link, at most one per subject+source. duplicate: confirmed same person, same-source data artifact (e.g. two vendor records for one person), kept in sync, not profile-driving. retired: explicitly deactivated by a reviewer. historical: reserved for a future lineage/chronology model -- never assigned by any action today. concurrent: confirmed same person, a second GENUINE non-driving source observation with no claim about current-vs-historical (e.g. Community Roster Import: a legitimate cross-community/move overlap) -- Pass 3 correction, 20260902330000.';

-- ─── confirm_person_vendor_identity_link (5-arg) — widen role validation ─
create or replace function confirm_person_vendor_identity_link(
  p_link_id uuid,
  p_subject_id uuid,
  p_actor text,
  p_link_role text default 'primary',
  p_rationale text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_link public.person_vendor_identity_links%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to confirm an identity link';
  end if;

  if p_link_role not in ('primary', 'duplicate', 'retired', 'historical', 'concurrent') then
    raise exception 'Invalid link_role: %', p_link_role;
  end if;

  if p_link_role <> 'primary' and (p_rationale is null or length(trim(p_rationale)) = 0) then
    raise exception 'A rationale is required to link a record as %', p_link_role;
  end if;

  select * into v_link from public.person_vendor_identity_links where id = p_link_id for update;
  if not found then
    raise exception 'Identity link % not found', p_link_id;
  end if;
  if v_link.status <> 'proposed' then
    raise exception 'Identity link % is not in a proposed state', p_link_id;
  end if;

  perform assert_valid_person_subject(v_link.subject_type, p_subject_id);

  if p_link_role = 'primary' and exists (
    select 1 from public.person_vendor_identity_links
    where subject_type = v_link.subject_type and subject_id = p_subject_id
      and source_system = v_link.source_system and status = 'confirmed' and link_role = 'primary'
  ) then
    raise exception
      '% % already has a primary % identity — use promote_person_vendor_identity_link_to_primary to replace it, or link this record as duplicate/retired/concurrent instead',
      v_link.subject_type, p_subject_id, v_link.source_system;
  end if;

  update public.person_vendor_identity_links
  set subject_id = p_subject_id,
      status = 'confirmed',
      link_role = p_link_role,
      resolved_by = p_actor,
      resolved_at = now()
  where id = p_link_id;

  insert into public.person_vendor_identity_link_decisions (
    link_id, action, previous_status, new_status, previous_link_role, new_link_role,
    previous_subject_id, new_subject_id, actor, rationale
  ) values (
    p_link_id, 'confirmed', 'proposed', 'confirmed', null, p_link_role,
    v_link.subject_id, p_subject_id, p_actor, coalesce(p_rationale, 'Confirmed as ' || p_link_role)
  );
end;
$$;

revoke execute on function confirm_person_vendor_identity_link(uuid, uuid, text, text, text) from public;
grant execute on function confirm_person_vendor_identity_link(uuid, uuid, text, text, text) to service_role;

-- ─── set_person_vendor_identity_link_role — widen role validation ───────
-- Identical to the original (20260811000000) except the p_new_role
-- allow-list gains 'concurrent'; every other line, including the exact
-- error message text and the decisions-row column list, is unchanged.
create or replace function set_person_vendor_identity_link_role(
  p_link_id uuid,
  p_new_role text,
  p_actor text,
  p_rationale text,
  p_duplicate_of_link_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_link public.person_vendor_identity_links%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to change an identity link role';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to change an identity link role';
  end if;
  if p_new_role not in ('duplicate', 'retired', 'historical', 'concurrent') then
    raise exception 'set_person_vendor_identity_link_role does not accept % — use promote_person_vendor_identity_link_to_primary for primary', p_new_role;
  end if;

  select * into v_link from public.person_vendor_identity_links where id = p_link_id for update;
  if not found then
    raise exception 'Identity link % not found', p_link_id;
  end if;
  if v_link.status <> 'confirmed' then
    raise exception 'Identity link % is not confirmed (status: %)', p_link_id, v_link.status;
  end if;

  update public.person_vendor_identity_links
  set link_role = p_new_role,
      duplicate_of_link_id = p_duplicate_of_link_id
  where id = p_link_id;

  insert into public.person_vendor_identity_link_decisions (
    link_id, action, previous_link_role, new_link_role, actor, rationale
  ) values (
    p_link_id, 'role_changed', v_link.link_role, p_new_role, p_actor, p_rationale
  );
end;
$$;

revoke execute on function set_person_vendor_identity_link_role(uuid, text, text, text, uuid) from public;
grant execute on function set_person_vendor_identity_link_role(uuid, text, text, text, uuid) to service_role;

commit;
