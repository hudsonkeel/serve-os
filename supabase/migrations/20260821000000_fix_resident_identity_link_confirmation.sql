-- Post-Release Stabilization — corrects two further gaps in the
-- 'resident' subject_type generalization, both live-confirmed while
-- running scripts/syncAxisCareClientIdentities.ts against real
-- production data.
--
-- GAP 1 — confirm_person_vendor_identity_link() hardcodes
-- 'workforce_member' as the subject_type passed to
-- assert_valid_person_subject(), for BOTH live overloads (the 3-arg
-- version from 20260808000000 and the 5-arg version from
-- 20260811000000). 20260820000000 widened assert_valid_person_subject()
-- itself to accept 'resident', but these two callers never read the
-- row's actual subject_type — they pass the literal string
-- 'workforce_member' regardless. Live-confirmed: confirming a real
-- 'proposed' resident-subject link (AxisCare client #20, Delia Reyes;
-- #22, Pamela Hatch) failed with "subject_id ... does not reference an
-- existing workforce_members row", because the resident's UUID was
-- checked against the workforce_members table instead of residents.
-- Fix: both overloads now load the link row first and pass its own
-- subject_type through, instead of a hardcoded literal. For every
-- existing 'workforce_member' row this is byte-for-byte the same
-- behavior (v_link.subject_type is literally 'workforce_member' for
-- those rows) — purely additive for 'resident'.
--
-- The 5-arg overload has a second instance of the same hardcode: its
-- "already has a primary identity" duplicate-check query filters on
-- subject_type = 'workforce_member' literally, so it would silently
-- fail to detect an existing primary resident link. Fixed the same way.
--
-- GAP 2 — person_vendor_identity_links_unique_vendor_record is
-- unique(source_system, vendor_record_id), with no subject_type
-- component. This was correct when 'workforce_member' was the only
-- subject_type, but AxisCare's client and caregiver ID spaces are
-- independent and overlap: AxisCare client #17 (resident Cecilia
-- Perry) collides with the already-confirmed AxisCare caregiver #17
-- (workforce member Morah Muganyi) purely because both happen to be
-- numbered "17" in their respective AxisCare endpoints. Live-confirmed:
-- sync_axiscare_client_identity for clients #17, #19, #28 each failed
-- with "duplicate key value violates unique constraint
-- person_vendor_identity_links_unique_vendor_record" against
-- pre-existing, unrelated confirmed workforce_member rows for the same
-- numbers (caregivers Morah Muganyi, Idah Jaji, Chelsea-Leslie Mpita).
-- Fix: widen the unique key to (source_system, subject_type,
-- vendor_record_id) — a strict widening, so no existing row combination
-- can newly violate it (a superset of distinguishing columns can only
-- shrink the set of rows considered duplicates, never grow it).
--
-- Forward-only: CREATE OR REPLACE on both function overloads (no
-- signature change, so no call-site changes needed) plus a
-- drop/add-constraint widening. Zero data changes.
--
-- ROLLBACK:
--
--   alter table person_vendor_identity_links
--     drop constraint if exists person_vendor_identity_links_unique_vendor_record;
--   alter table person_vendor_identity_links
--     add constraint person_vendor_identity_links_unique_vendor_record
--     unique (source_system, vendor_record_id);
--
--   create or replace function confirm_person_vendor_identity_link(
--     p_link_id uuid,
--     p_subject_id uuid,
--     p_actor text
--   )
--   returns void
--   language plpgsql
--   set search_path = public
--   as $$
--   begin
--     if p_actor is null or length(trim(p_actor)) = 0 then
--       raise exception 'An authenticated actor is required to confirm an identity link';
--     end if;
--     perform assert_valid_person_subject('workforce_member', p_subject_id);
--     update person_vendor_identity_links
--     set subject_id = p_subject_id, status = 'confirmed', resolved_by = p_actor, resolved_at = now()
--     where id = p_link_id and status = 'proposed';
--     if not found then
--       raise exception 'Identity link % is not in a proposed state', p_link_id;
--     end if;
--   end;
--   $$;
--
--   create or replace function confirm_person_vendor_identity_link(
--     p_link_id uuid,
--     p_subject_id uuid,
--     p_actor text,
--     p_link_role text default 'primary',
--     p_rationale text default null
--   )
--   returns void
--   language plpgsql
--   set search_path = public
--   as $$
--   declare
--     v_link public.person_vendor_identity_links%rowtype;
--   begin
--     if p_actor is null or length(trim(p_actor)) = 0 then
--       raise exception 'An authenticated actor is required to confirm an identity link';
--     end if;
--     if p_link_role not in ('primary', 'duplicate', 'retired', 'historical') then
--       raise exception 'Invalid link_role: %', p_link_role;
--     end if;
--     if p_link_role <> 'primary' and (p_rationale is null or length(trim(p_rationale)) = 0) then
--       raise exception 'A rationale is required to link a record as %', p_link_role;
--     end if;
--     perform assert_valid_person_subject('workforce_member', p_subject_id);
--     select * into v_link from public.person_vendor_identity_links where id = p_link_id for update;
--     if not found then
--       raise exception 'Identity link % not found', p_link_id;
--     end if;
--     if v_link.status <> 'proposed' then
--       raise exception 'Identity link % is not in a proposed state', p_link_id;
--     end if;
--     if p_link_role = 'primary' and exists (
--       select 1 from public.person_vendor_identity_links
--       where subject_type = 'workforce_member' and subject_id = p_subject_id
--         and source_system = v_link.source_system and status = 'confirmed' and link_role = 'primary'
--     ) then
--       raise exception
--         'Workforce member % already has a primary % identity — use promote_person_vendor_identity_link_to_primary to replace it, or link this record as duplicate/retired instead',
--         p_subject_id, v_link.source_system;
--     end if;
--     update public.person_vendor_identity_links
--     set subject_id = p_subject_id, status = 'confirmed', link_role = p_link_role,
--         resolved_by = p_actor, resolved_at = now()
--     where id = p_link_id;
--     insert into public.person_vendor_identity_link_decisions (
--       link_id, action, previous_status, new_status, previous_link_role, new_link_role,
--       previous_subject_id, new_subject_id, actor, rationale
--     ) values (
--       p_link_id, 'confirmed', 'proposed', 'confirmed', null, p_link_role,
--       v_link.subject_id, p_subject_id, p_actor, coalesce(p_rationale, 'Confirmed as ' || p_link_role)
--     );
--   end;
--   $$;

-- ─── Gap 2: widen the unique key to include subject_type ─────────────
alter table person_vendor_identity_links
  drop constraint if exists person_vendor_identity_links_unique_vendor_record;
alter table person_vendor_identity_links
  add constraint person_vendor_identity_links_unique_vendor_record
  unique (source_system, subject_type, vendor_record_id);

-- ─── Gap 1a: 3-arg confirm_person_vendor_identity_link ────────────────
create or replace function confirm_person_vendor_identity_link(
  p_link_id uuid,
  p_subject_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_subject_type text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to confirm an identity link';
  end if;

  select subject_type into v_subject_type
  from person_vendor_identity_links
  where id = p_link_id and status = 'proposed';

  if not found then
    raise exception 'Identity link % is not in a proposed state', p_link_id;
  end if;

  perform assert_valid_person_subject(v_subject_type, p_subject_id);

  update person_vendor_identity_links
  set subject_id = p_subject_id,
      status = 'confirmed',
      resolved_by = p_actor,
      resolved_at = now()
  where id = p_link_id and status = 'proposed';

  if not found then
    raise exception 'Identity link % is not in a proposed state', p_link_id;
  end if;
end;
$$;

revoke execute on function confirm_person_vendor_identity_link(uuid, uuid, text) from public;
grant execute on function confirm_person_vendor_identity_link(uuid, uuid, text) to service_role;

-- ─── Gap 1b: 5-arg confirm_person_vendor_identity_link ────────────────
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

  if p_link_role not in ('primary', 'duplicate', 'retired', 'historical') then
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
      '% % already has a primary % identity — use promote_person_vendor_identity_link_to_primary to replace it, or link this record as duplicate/retired instead',
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
