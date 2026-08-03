begin;

-- Canonical Workforce Profile Editor + multi-community foundation. See the
-- "Serve OS Canonical Profile Editor" engineering scope. Builds on
-- 20260812000000_add_workforce_member_canonical_identity.sql (which added
-- display_name/legal_first_name/legal_last_name/preferred_name and the
-- display_name NOT NULL guarantee) — this migration adds the remaining
-- canonical fields, the review/lock lifecycle, append-only change history,
-- source-discrepancy tracking, and a minimal multi-community foundation
-- (Phase 1 + Phase 2 of the scope's own suggested phasing; Phase 3 —
-- community_workforce_roles, requirement-set assignment rules, onboarding
-- templates, a community launch wizard — is explicitly NOT built here, see
-- the implementation report).
--
-- Additive only. Does not touch 20260808000000/20260809000000/
-- 20260810000000/20260811000000/20260812000000.

-- ─── 1. Remaining canonical fields on workforce_members ───────────────────
-- legal_middle_name/primary_email/primary_phone/canonical_identity_notes
-- are genuinely optional — a member's canonical name (display_name/
-- legal_first_name/legal_last_name) is already required as of
-- 20260812000000; these are not. canonical_profile_status governs whether
-- AxisCare sync may still auto-seed/auto-correct these fields (see the
-- application-layer lib/workforce/canonicalProfileSync.ts) — 'reviewed'
-- and 'locked' both mean "sync must never overwrite this again," matching
-- the scope's own rule: "Canonical value reviewed -> source cannot
-- overwrite it."
alter table public.workforce_members
  add column if not exists legal_middle_name text,
  add column if not exists primary_email text,
  add column if not exists primary_phone text,
  add column if not exists canonical_profile_status text not null default 'unreviewed',
  add column if not exists canonical_identity_notes text,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by text;

update public.workforce_members
set updated_at = coalesce(updated_at, created_at),
    updated_by = coalesce(updated_by, created_by)
where updated_at is null or updated_by is null;

alter table public.workforce_members
  alter column updated_at set not null,
  alter column updated_at set default now();

alter table public.workforce_members
  drop constraint if exists workforce_members_canonical_profile_status_check;

alter table public.workforce_members
  add constraint workforce_members_canonical_profile_status_check
  check (canonical_profile_status in ('unreviewed', 'reviewed', 'needs_review', 'locked'));

-- ─── 2. Communities — the first normalized Community entity in Serve OS ───
-- Every other domain (residents, relationships) still tracks community as
-- a free-text community_name/community_code pair — untouched here,
-- out of scope. This table exists specifically so
-- workforce_community_memberships (and, later, Phase 3's
-- community_workforce_roles/community_requirement_set_assignments) can
-- reference a real community_id instead of hardcoding a name string, per
-- the scope's explicit "Do not hardcode Watermere in component logic."
create table if not exists public.communities (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint communities_code_not_blank check (length(trim(code)) > 0),
  constraint communities_name_not_blank check (length(trim(name)) > 0)
);

alter table public.communities enable row level security;
revoke all on public.communities from public, anon, authenticated;
grant all on public.communities to service_role;

insert into public.communities (code, name)
values ('watermere_frisco', 'Watermere at Frisco')
on conflict (code) do nothing;

-- ─── 3. Community memberships ──────────────────────────────────────────
-- "Jessicah exists as a Serve workforce member" is workforce_members.
-- "Jessicah currently works at Watermere" is a row here. One workforce
-- member, any number of community memberships — never a second
-- workforce_members row for the same person working elsewhere.
--
-- unique(workforce_member_id, community_id) is the scope's own suggested
-- uniqueness — one row per person+community for life, status transitions
-- in place (pending -> active -> terminated/transferred), with
-- workforce_profile_changes as the durable history layer rather than a
-- chain of superseding rows. If a person is ever rehired at the same
-- community and Serve needs two distinct employment episodes preserved
-- separately, that requires a dedicated employment-period table — out of
-- scope here, per the spec's own explicit escape hatch (do not weaken
-- this uniqueness to work around it).
create table if not exists public.workforce_community_memberships (
  id                              uuid primary key default gen_random_uuid(),
  workforce_member_id             uuid not null references public.workforce_members(id) on delete no action,
  community_id                    uuid not null references public.communities(id) on delete no action,

  membership_status               text not null default 'pending',
  role_type                       text,
  employment_relationship         text,
  start_date                      date,
  end_date                        date,
  is_primary_community            boolean not null default false,

  community_display_name_override text,
  community_email                 text,
  community_phone                 text,
  scheduler_notes                 text,
  availability_notes              text,
  transportation_notes            text,
  access_notes                    text,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  created_by                      text not null,
  updated_by                      text,

  constraint workforce_community_memberships_status_check
    check (membership_status in ('pending', 'active', 'inactive', 'terminated', 'transferred')),
  constraint workforce_community_memberships_created_by_not_blank
    check (length(trim(created_by)) > 0),
  constraint workforce_community_memberships_dates_check
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint workforce_community_memberships_end_date_required_check
    check (membership_status not in ('terminated', 'transferred') or end_date is not null),

  unique (workforce_member_id, community_id)
);

-- "optional one primary community per workforce member" — partial unique
-- index, same mechanism as person_vendor_identity_links' primary-link
-- constraint (20260811000000_add_vendor_identity_lineage.sql).
create unique index if not exists workforce_community_memberships_one_primary_per_member_idx
  on public.workforce_community_memberships (workforce_member_id)
  where is_primary_community = true;

create index if not exists workforce_community_memberships_community_idx
  on public.workforce_community_memberships (community_id);

alter table public.workforce_community_memberships enable row level security;
revoke all on public.workforce_community_memberships from public, anon, authenticated;
grant all on public.workforce_community_memberships to service_role;

-- ─── 4. Append-only canonical profile change history ──────────────────────
-- "Do not rely only on updated_at." Every saved field change — canonical
-- profile fields, community membership fields, review/lock transitions,
-- discrepancy decisions — writes one row here per changed field.
create table if not exists public.workforce_profile_changes (
  id                    uuid primary key default gen_random_uuid(),
  workforce_member_id   uuid not null references public.workforce_members(id) on delete no action,
  community_id          uuid references public.communities(id) on delete no action,
  field_name            text not null,
  previous_value        text,
  new_value             text,
  change_type           text not null,
  actor                 text not null,
  rationale             text,
  created_at            timestamptz not null default now(),

  -- 'discrepancy_flagged'/'discrepancy_resolved' are additive to the
  -- scope's own suggested vocabulary (canonical_correction/
  -- preferred_value_change/community_override/profile_reviewed/
  -- profile_unlocked/profile_locked) — needed for section 4.4's flag/
  -- resolve workflow and its "decision is logged" acceptance criterion.
  constraint workforce_profile_changes_change_type_check
    check (change_type in (
      'canonical_correction', 'preferred_value_change', 'community_override',
      'profile_reviewed', 'profile_unlocked', 'profile_locked',
      'discrepancy_flagged', 'discrepancy_resolved'
    )),
  constraint workforce_profile_changes_actor_not_blank
    check (length(trim(actor)) > 0)
);

create index if not exists workforce_profile_changes_member_idx
  on public.workforce_profile_changes (workforce_member_id, created_at desc);

alter table public.workforce_profile_changes enable row level security;
revoke all on public.workforce_profile_changes from public, anon, authenticated;
grant all on public.workforce_profile_changes to service_role;

-- ─── 5. Source discrepancies ────────────────────────────────────────────
-- "Source differs from reviewed canonical value -> create discrepancy."
-- One open discrepancy per field at a time (a second sync refresh before
-- the first is resolved just updates source_value/detected_at in place,
-- rather than creating a pile of duplicate open discrepancies for the
-- same field).
create table if not exists public.workforce_profile_discrepancies (
  id                    uuid primary key default gen_random_uuid(),
  workforce_member_id   uuid not null references public.workforce_members(id) on delete no action,
  field_name            text not null,
  canonical_value       text,
  source_value          text,
  source_system         text not null default 'axiscare',
  status                text not null default 'open',
  detected_at           timestamptz not null default now(),
  resolved_by           text,
  resolved_at           timestamptz,
  resolution_rationale  text,

  constraint workforce_profile_discrepancies_status_check
    check (status in ('open', 'accepted_source', 'retained_canonical', 'dismissed')),
  constraint workforce_profile_discrepancies_resolution_fields_check
    check (
      (status = 'open' and resolved_by is null and resolved_at is null)
      or (status <> 'open' and resolved_by is not null and resolved_at is not null)
    )
);

create unique index if not exists workforce_profile_discrepancies_one_open_per_field_idx
  on public.workforce_profile_discrepancies (workforce_member_id, field_name)
  where status = 'open';

alter table public.workforce_profile_discrepancies enable row level security;
revoke all on public.workforce_profile_discrepancies from public, anon, authenticated;
grant all on public.workforce_profile_discrepancies to service_role;

-- ─── 6. Widen workforce_activity for the new profile/community events ────
alter table public.workforce_activity
  drop constraint if exists workforce_activity_event_type_check;

alter table public.workforce_activity
  add constraint workforce_activity_event_type_check
  check (event_type in (
    'workforce_profile_created',
    'identity_link_confirmed',
    'axiscare_source_data_refreshed',
    'document_uploaded',
    'evidence_created',
    'evidence_verified',
    'evidence_rejected',
    'evidence_superseded',
    'document_metadata_corrected',
    'document_reassigned',
    'accidental_upload_removed',
    'evidence_corrected',
    'evidence_marked_entered_in_error',
    'evidence_replaced',
    'evidence_renewed',
    'identity_link_reopened',
    'identity_link_promoted_to_primary',
    'identity_link_role_changed',
    'identity_link_subject_reassigned',
    'canonical_profile_updated',
    'canonical_profile_reviewed',
    'canonical_profile_locked',
    'canonical_profile_unlocked',
    'community_membership_updated',
    'profile_discrepancy_flagged',
    'profile_discrepancy_resolved'
  ));

-- ─── 7. Shared helper: apply one canonical-field change + log it ─────────
-- Used by every RPC below that touches a single workforce_members column,
-- so "record only changed fields" and "write one history row per changed
-- field" can never be forgotten in one write path but not another.
create or replace function apply_workforce_canonical_field_change(
  p_workforce_member_id uuid,
  p_field_name text,
  p_previous_value text,
  p_new_value text,
  p_change_type text,
  p_actor text,
  p_rationale text,
  p_community_id uuid default null
)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  if p_previous_value is not distinct from p_new_value then
    return false;
  end if;

  insert into public.workforce_profile_changes (
    workforce_member_id, community_id, field_name, previous_value, new_value, change_type, actor, rationale
  ) values (
    p_workforce_member_id, p_community_id, p_field_name, p_previous_value, p_new_value, p_change_type, p_actor, p_rationale
  );

  return true;
end;
$$;

revoke execute on function apply_workforce_canonical_field_change(uuid, text, text, text, text, text, text, uuid) from public;
grant execute on function apply_workforce_canonical_field_change(uuid, text, text, text, text, text, text, uuid) to service_role;

-- ─── 8. update_workforce_canonical_profile ────────────────────────────────
-- The Canonical Profile Editor's write path. Refuses to edit a 'locked'
-- profile (use unlock_workforce_canonical_profile first). Rationale is
-- required for legal-identity fields and for editing an already-reviewed
-- profile at all — optional for preferred name/contact fields on an
-- unreviewed profile, matching the UI spec's rationale rules exactly.
create or replace function update_workforce_canonical_profile(
  p_workforce_member_id uuid,
  p_legal_first_name text,
  p_legal_middle_name text,
  p_legal_last_name text,
  p_preferred_name text,
  p_display_name text,
  p_primary_email text,
  p_primary_phone text,
  p_actor text,
  p_rationale text
)
returns public.workforce_members
language plpgsql
set search_path = public
as $$
declare
  v_member public.workforce_members%rowtype;
  v_legal_first_name text;
  v_legal_middle_name text;
  v_legal_last_name text;
  v_preferred_name text;
  v_display_name text;
  v_primary_email text;
  v_primary_phone text;
  v_identity_changed boolean := false;
  v_any_changed boolean := false;
  v_changed boolean;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update a workforce canonical profile';
  end if;

  select * into v_member from public.workforce_members where id = p_workforce_member_id for update;
  if not found then
    raise exception 'Workforce member % not found', p_workforce_member_id;
  end if;

  if v_member.canonical_profile_status = 'locked' then
    raise exception 'Workforce member % has a locked canonical profile — unlock it before editing', p_workforce_member_id;
  end if;

  -- Trim, normalize '' -> null.
  v_legal_first_name := nullif(trim(p_legal_first_name), '');
  v_legal_middle_name := nullif(trim(p_legal_middle_name), '');
  v_legal_last_name := nullif(trim(p_legal_last_name), '');
  v_preferred_name := nullif(trim(p_preferred_name), '');
  v_primary_email := nullif(trim(p_primary_email), '');
  v_primary_phone := nullif(trim(p_primary_phone), '');
  v_display_name := nullif(trim(p_display_name), '');

  if v_primary_email is not null and v_primary_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Primary email "%" is not a valid email address', v_primary_email;
  end if;
  if v_primary_phone is not null and length(regexp_replace(v_primary_phone, '\D', '', 'g')) not between 7 and 15 then
    raise exception 'Primary phone "%" does not look like a valid phone number', v_primary_phone;
  end if;

  -- Calculate display name if omitted, per the same priority the shared
  -- resolver (lib/workforce/resolvers.ts) uses: preferred+last, then
  -- legal first+last.
  if v_display_name is null then
    v_display_name := nullif(trim(coalesce(v_preferred_name, v_legal_first_name, '') || ' ' || coalesce(v_legal_last_name, '')), '');
  end if;
  if v_display_name is null then
    raise exception 'A display name is required — provide one, a preferred name, or a legal name';
  end if;

  v_identity_changed :=
    v_legal_first_name is distinct from v_member.legal_first_name
    or v_legal_middle_name is distinct from v_member.legal_middle_name
    or v_legal_last_name is distinct from v_member.legal_last_name
    or v_display_name is distinct from v_member.display_name;

  if (v_identity_changed or v_member.canonical_profile_status in ('reviewed', 'needs_review'))
     and (p_rationale is null or length(trim(p_rationale)) = 0) then
    raise exception 'A rationale is required to change a legal-identity field or edit a reviewed profile';
  end if;

  v_changed := apply_workforce_canonical_field_change(p_workforce_member_id, 'legal_first_name', v_member.legal_first_name, v_legal_first_name, 'canonical_correction', p_actor, p_rationale);
  v_any_changed := v_any_changed or v_changed;
  v_changed := apply_workforce_canonical_field_change(p_workforce_member_id, 'legal_middle_name', v_member.legal_middle_name, v_legal_middle_name, 'canonical_correction', p_actor, p_rationale);
  v_any_changed := v_any_changed or v_changed;
  v_changed := apply_workforce_canonical_field_change(p_workforce_member_id, 'legal_last_name', v_member.legal_last_name, v_legal_last_name, 'canonical_correction', p_actor, p_rationale);
  v_any_changed := v_any_changed or v_changed;
  v_changed := apply_workforce_canonical_field_change(p_workforce_member_id, 'display_name', v_member.display_name, v_display_name, 'canonical_correction', p_actor, p_rationale);
  v_any_changed := v_any_changed or v_changed;
  v_changed := apply_workforce_canonical_field_change(p_workforce_member_id, 'preferred_name', v_member.preferred_name, v_preferred_name, 'preferred_value_change', p_actor, p_rationale);
  v_any_changed := v_any_changed or v_changed;
  v_changed := apply_workforce_canonical_field_change(p_workforce_member_id, 'primary_email', v_member.primary_email, v_primary_email, 'preferred_value_change', p_actor, p_rationale);
  v_any_changed := v_any_changed or v_changed;
  v_changed := apply_workforce_canonical_field_change(p_workforce_member_id, 'primary_phone', v_member.primary_phone, v_primary_phone, 'preferred_value_change', p_actor, p_rationale);
  v_any_changed := v_any_changed or v_changed;

  if not v_any_changed then
    return v_member;
  end if;

  update public.workforce_members
  set legal_first_name = v_legal_first_name,
      legal_middle_name = v_legal_middle_name,
      legal_last_name = v_legal_last_name,
      preferred_name = v_preferred_name,
      display_name = v_display_name,
      primary_email = v_primary_email,
      primary_phone = v_primary_phone,
      canonical_profile_status = case when v_member.canonical_profile_status = 'needs_review' then 'needs_review' else v_member.canonical_profile_status end,
      updated_at = now(),
      updated_by = p_actor
  where id = p_workforce_member_id
  returning * into v_member;

  return v_member;
end;
$$;

revoke execute on function update_workforce_canonical_profile(uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function update_workforce_canonical_profile(uuid, text, text, text, text, text, text, text, text, text) to service_role;

-- ─── 9. review_workforce_canonical_profile ────────────────────────────────
create or replace function review_workforce_canonical_profile(
  p_workforce_member_id uuid,
  p_actor text,
  p_rationale text
)
returns public.workforce_members
language plpgsql
set search_path = public
as $$
declare
  v_member public.workforce_members%rowtype;
  v_previous_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to review a workforce canonical profile';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to review a workforce canonical profile';
  end if;

  select * into v_member from public.workforce_members where id = p_workforce_member_id for update;
  if not found then
    raise exception 'Workforce member % not found', p_workforce_member_id;
  end if;
  if v_member.canonical_profile_status not in ('unreviewed', 'needs_review') then
    raise exception 'Workforce member % is not in a reviewable state (status: %)', p_workforce_member_id, v_member.canonical_profile_status;
  end if;
  v_previous_status := v_member.canonical_profile_status;

  update public.workforce_members
  set canonical_profile_status = 'reviewed',
      updated_at = now(),
      updated_by = p_actor
  where id = p_workforce_member_id
  returning * into v_member;

  perform apply_workforce_canonical_field_change(p_workforce_member_id, 'canonical_profile_status', v_previous_status, 'reviewed', 'profile_reviewed', p_actor, p_rationale);
  return v_member;
end;
$$;

revoke execute on function review_workforce_canonical_profile(uuid, text, text) from public;
grant execute on function review_workforce_canonical_profile(uuid, text, text) to service_role;

-- ─── 10. lock / unlock ─────────────────────────────────────────────────
create or replace function lock_workforce_canonical_profile(
  p_workforce_member_id uuid,
  p_actor text,
  p_rationale text
)
returns public.workforce_members
language plpgsql
set search_path = public
as $$
declare
  v_member public.workforce_members%rowtype;
  v_previous_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to lock a workforce canonical profile';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to lock a workforce canonical profile';
  end if;

  select * into v_member from public.workforce_members where id = p_workforce_member_id for update;
  if not found then
    raise exception 'Workforce member % not found', p_workforce_member_id;
  end if;
  if v_member.canonical_profile_status = 'locked' then
    raise exception 'Workforce member % is already locked', p_workforce_member_id;
  end if;
  v_previous_status := v_member.canonical_profile_status;

  update public.workforce_members
  set canonical_profile_status = 'locked', updated_at = now(), updated_by = p_actor
  where id = p_workforce_member_id
  returning * into v_member;

  perform apply_workforce_canonical_field_change(p_workforce_member_id, 'canonical_profile_status', v_previous_status, 'locked', 'profile_locked', p_actor, p_rationale);
  return v_member;
end;
$$;

revoke execute on function lock_workforce_canonical_profile(uuid, text, text) from public;
grant execute on function lock_workforce_canonical_profile(uuid, text, text) to service_role;

create or replace function unlock_workforce_canonical_profile(
  p_workforce_member_id uuid,
  p_actor text,
  p_rationale text
)
returns public.workforce_members
language plpgsql
set search_path = public
as $$
declare
  v_member public.workforce_members%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to unlock a workforce canonical profile';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to unlock a workforce canonical profile';
  end if;

  select * into v_member from public.workforce_members where id = p_workforce_member_id for update;
  if not found then
    raise exception 'Workforce member % not found', p_workforce_member_id;
  end if;
  if v_member.canonical_profile_status <> 'locked' then
    raise exception 'Workforce member % is not locked', p_workforce_member_id;
  end if;

  update public.workforce_members
  set canonical_profile_status = 'needs_review', updated_at = now(), updated_by = p_actor
  where id = p_workforce_member_id
  returning * into v_member;

  perform apply_workforce_canonical_field_change(p_workforce_member_id, 'canonical_profile_status', 'locked', 'needs_review', 'profile_unlocked', p_actor, p_rationale);
  return v_member;
end;
$$;

revoke execute on function unlock_workforce_canonical_profile(uuid, text, text) from public;
grant execute on function unlock_workforce_canonical_profile(uuid, text, text) to service_role;

-- ─── 11. Sync seed/auto-correct (system-driven, narrow) ───────────────────
-- The ONLY write path AxisCare sync is allowed to use against
-- workforce_members' canonical fields — see
-- lib/workforce/canonicalProfileSync.ts's evaluateCanonicalFieldSyncAction()
-- for the deterministic decision logic the TS orchestration layer runs
-- before ever calling this. This RPC re-validates the same two safe cases
-- itself (defense in depth, same discipline as every other guard in this
-- schema): seeding a currently-null field, or a capitalization-only
-- correction while the profile is not yet reviewed/locked. Anything else
-- is refused — the caller must flag a discrepancy instead.
create or replace function sync_seed_or_correct_workforce_canonical_field(
  p_workforce_member_id uuid,
  p_field_name text,
  p_new_value text,
  p_actor text
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_member public.workforce_members%rowtype;
  v_current text;
  v_new text;
begin
  if p_field_name not in ('legal_first_name', 'legal_last_name', 'preferred_name', 'primary_email', 'primary_phone') then
    raise exception 'sync_seed_or_correct_workforce_canonical_field does not support field %', p_field_name;
  end if;

  select * into v_member from public.workforce_members where id = p_workforce_member_id for update;
  if not found then
    raise exception 'Workforce member % not found', p_workforce_member_id;
  end if;

  v_new := nullif(trim(p_new_value), '');
  if v_new is null then
    return false;
  end if;

  execute format('select ($1).%I', p_field_name) into v_current using v_member;

  if v_current is not null and v_member.canonical_profile_status in ('reviewed', 'locked') then
    raise exception 'Cannot sync-write % on workforce member % — canonical profile is %', p_field_name, p_workforce_member_id, v_member.canonical_profile_status;
  end if;

  if v_current is not null and lower(trim(v_current)) <> lower(trim(v_new)) then
    raise exception 'Cannot sync-write % on workforce member % — material difference from current value, must go through a discrepancy', p_field_name, p_workforce_member_id;
  end if;

  if v_current is not distinct from v_new then
    return false;
  end if;

  execute format('update public.workforce_members set %I = $1, updated_at = now(), updated_by = $2 where id = $3', p_field_name)
    using v_new, p_actor, p_workforce_member_id;

  perform apply_workforce_canonical_field_change(
    p_workforce_member_id, p_field_name, v_current, v_new,
    case when v_current is null then 'canonical_correction' else 'preferred_value_change' end,
    p_actor, case when v_current is null then 'Seeded from AxisCare source data' else 'Capitalization corrected from AxisCare source data' end
  );

  return true;
end;
$$;

revoke execute on function sync_seed_or_correct_workforce_canonical_field(uuid, text, text, text) from public;
grant execute on function sync_seed_or_correct_workforce_canonical_field(uuid, text, text, text) to service_role;

-- ─── 12. Discrepancy flag + resolve ────────────────────────────────────
create or replace function flag_workforce_profile_discrepancy(
  p_workforce_member_id uuid,
  p_field_name text,
  p_canonical_value text,
  p_source_value text,
  p_source_system text,
  p_actor text
)
returns public.workforce_profile_discrepancies
language plpgsql
set search_path = public
as $$
declare
  v_discrepancy public.workforce_profile_discrepancies%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An actor is required to flag a workforce profile discrepancy';
  end if;

  select * into v_discrepancy
  from public.workforce_profile_discrepancies
  where workforce_member_id = p_workforce_member_id and field_name = p_field_name and status = 'open'
  for update;

  if found then
    update public.workforce_profile_discrepancies
    set source_value = p_source_value, canonical_value = p_canonical_value, detected_at = now()
    where id = v_discrepancy.id
    returning * into v_discrepancy;
  else
    insert into public.workforce_profile_discrepancies (
      workforce_member_id, field_name, canonical_value, source_value, source_system
    ) values (
      p_workforce_member_id, p_field_name, p_canonical_value, p_source_value, coalesce(p_source_system, 'axiscare')
    )
    returning * into v_discrepancy;
  end if;

  perform apply_workforce_canonical_field_change(
    p_workforce_member_id, p_field_name, p_canonical_value, p_source_value, 'discrepancy_flagged', p_actor,
    'Source value differs from the reviewed canonical value'
  );

  return v_discrepancy;
end;
$$;

revoke execute on function flag_workforce_profile_discrepancy(uuid, text, text, text, text, text) from public;
grant execute on function flag_workforce_profile_discrepancy(uuid, text, text, text, text, text) to service_role;

create or replace function resolve_workforce_profile_discrepancy(
  p_discrepancy_id uuid,
  p_resolution text,
  p_actor text,
  p_rationale text
)
returns public.workforce_profile_discrepancies
language plpgsql
set search_path = public
as $$
declare
  v_discrepancy public.workforce_profile_discrepancies%rowtype;
  v_member public.workforce_members%rowtype;
  v_current text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve a workforce profile discrepancy';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to resolve a workforce profile discrepancy';
  end if;
  if p_resolution not in ('accepted_source', 'retained_canonical', 'dismissed') then
    raise exception 'Invalid resolution: %', p_resolution;
  end if;

  select * into v_discrepancy from public.workforce_profile_discrepancies where id = p_discrepancy_id and status = 'open' for update;
  if not found then
    raise exception 'Open discrepancy % not found', p_discrepancy_id;
  end if;

  if p_resolution = 'accepted_source' and v_discrepancy.field_name in ('legal_first_name', 'legal_last_name', 'preferred_name', 'primary_email', 'primary_phone', 'legal_middle_name', 'display_name') then
    select * into v_member from public.workforce_members where id = v_discrepancy.workforce_member_id for update;
    execute format('select ($1).%I', v_discrepancy.field_name) into v_current using v_member;
    execute format('update public.workforce_members set %I = $1, updated_at = now(), updated_by = $2 where id = $3', v_discrepancy.field_name)
      using v_discrepancy.source_value, p_actor, v_discrepancy.workforce_member_id;
    perform apply_workforce_canonical_field_change(
      v_discrepancy.workforce_member_id, v_discrepancy.field_name, v_current, v_discrepancy.source_value,
      'canonical_correction', p_actor, p_rationale
    );
  end if;

  update public.workforce_profile_discrepancies
  set status = p_resolution, resolved_by = p_actor, resolved_at = now(), resolution_rationale = p_rationale
  where id = p_discrepancy_id
  returning * into v_discrepancy;

  perform apply_workforce_canonical_field_change(
    v_discrepancy.workforce_member_id, v_discrepancy.field_name, v_discrepancy.canonical_value, v_discrepancy.source_value,
    'discrepancy_resolved', p_actor, p_resolution || ' — ' || p_rationale
  );

  return v_discrepancy;
end;
$$;

revoke execute on function resolve_workforce_profile_discrepancy(uuid, text, text, text) from public;
grant execute on function resolve_workforce_profile_discrepancy(uuid, text, text, text) to service_role;

-- ─── 13. upsert_workforce_community_membership ────────────────────────────
create or replace function upsert_workforce_community_membership(
  p_workforce_member_id uuid,
  p_community_id uuid,
  p_membership_status text,
  p_role_type text,
  p_employment_relationship text,
  p_start_date date,
  p_end_date date,
  p_is_primary_community boolean,
  p_community_display_name_override text,
  p_community_email text,
  p_community_phone text,
  p_scheduler_notes text,
  p_availability_notes text,
  p_transportation_notes text,
  p_access_notes text,
  p_actor text,
  p_rationale text
)
returns public.workforce_community_memberships
language plpgsql
set search_path = public
as $$
declare
  v_existing public.workforce_community_memberships%rowtype;
  v_existing_found boolean;
  v_result public.workforce_community_memberships%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update a community membership';
  end if;
  if p_membership_status not in ('pending', 'active', 'inactive', 'terminated', 'transferred') then
    raise exception 'Invalid membership_status: %', p_membership_status;
  end if;
  if p_membership_status in ('terminated', 'transferred') and p_end_date is null then
    raise exception 'An end date is required for a terminated or transferred membership';
  end if;
  if p_end_date is not null and p_start_date is not null and p_end_date < p_start_date then
    raise exception 'end_date cannot precede start_date';
  end if;

  if not exists (select 1 from public.workforce_members where id = p_workforce_member_id) then
    raise exception 'Workforce member % not found', p_workforce_member_id;
  end if;
  if not exists (select 1 from public.communities where id = p_community_id) then
    raise exception 'Community % not found', p_community_id;
  end if;

  select * into v_existing
  from public.workforce_community_memberships
  where workforce_member_id = p_workforce_member_id and community_id = p_community_id
  for update;
  -- Captured immediately — later statements (the primary-demotion UPDATE
  -- below) would otherwise overwrite plpgsql's own FOUND before the
  -- upsert branch below gets to read it.
  v_existing_found := found;

  -- Atomically demote any other primary community for this member, same
  -- pattern as promote_person_vendor_identity_link_to_primary's sibling
  -- demotion (20260811000000_add_vendor_identity_lineage.sql).
  if p_is_primary_community then
    update public.workforce_community_memberships
    set is_primary_community = false, updated_at = now(), updated_by = p_actor
    where workforce_member_id = p_workforce_member_id
      and community_id <> p_community_id
      and is_primary_community = true;
  end if;

  if v_existing_found then
    perform apply_workforce_canonical_field_change(p_workforce_member_id, 'membership_status', v_existing.membership_status, p_membership_status, 'community_override', p_actor, p_rationale, p_community_id);
    perform apply_workforce_canonical_field_change(p_workforce_member_id, 'role_type', v_existing.role_type, p_role_type, 'community_override', p_actor, p_rationale, p_community_id);
    perform apply_workforce_canonical_field_change(p_workforce_member_id, 'is_primary_community', v_existing.is_primary_community::text, p_is_primary_community::text, 'community_override', p_actor, p_rationale, p_community_id);

    update public.workforce_community_memberships
    set membership_status = p_membership_status,
        role_type = p_role_type,
        employment_relationship = p_employment_relationship,
        start_date = p_start_date,
        end_date = p_end_date,
        is_primary_community = p_is_primary_community,
        community_display_name_override = nullif(trim(p_community_display_name_override), ''),
        community_email = nullif(trim(p_community_email), ''),
        community_phone = nullif(trim(p_community_phone), ''),
        scheduler_notes = p_scheduler_notes,
        availability_notes = p_availability_notes,
        transportation_notes = p_transportation_notes,
        access_notes = p_access_notes,
        updated_at = now(),
        updated_by = p_actor
    where id = v_existing.id
    returning * into v_result;
  else
    insert into public.workforce_community_memberships (
      workforce_member_id, community_id, membership_status, role_type, employment_relationship,
      start_date, end_date, is_primary_community, community_display_name_override,
      community_email, community_phone, scheduler_notes, availability_notes, transportation_notes, access_notes,
      created_by
    ) values (
      p_workforce_member_id, p_community_id, p_membership_status, p_role_type, p_employment_relationship,
      p_start_date, p_end_date, p_is_primary_community, nullif(trim(p_community_display_name_override), ''),
      nullif(trim(p_community_email), ''), nullif(trim(p_community_phone), ''), p_scheduler_notes, p_availability_notes, p_transportation_notes, p_access_notes,
      p_actor
    )
    returning * into v_result;

    perform apply_workforce_canonical_field_change(p_workforce_member_id, 'membership_status', null, p_membership_status, 'community_override', p_actor, p_rationale, p_community_id);
  end if;

  return v_result;
end;
$$;

revoke execute on function upsert_workforce_community_membership(uuid, uuid, text, text, text, date, date, boolean, text, text, text, text, text, text, text, text, text) from public;
grant execute on function upsert_workforce_community_membership(uuid, uuid, text, text, text, date, date, boolean, text, text, text, text, text, text, text, text, text) to service_role;

commit;
