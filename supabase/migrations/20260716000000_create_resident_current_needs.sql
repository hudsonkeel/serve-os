begin;

-- Resident Current Needs: the first layer of resident memory. A concise,
-- curated summary of what Serve staff should know before interacting with a
-- resident — never a running diary, activity log, or assessment transcript.
-- Working Notes, Timeline, and Resident Intelligence are the later layers
-- (see docs) and are explicitly out of scope for this table.
--
-- Versioned rather than mutable: every save supersedes the previous version
-- instead of overwriting it, so staff can never silently lose what was
-- previously documented. Exactly one version per resident is ever "current".
--
-- Staff-identity note: created_by / superseded_by are stored as `text`, not
-- `uuid` — same convention established in
-- 20260712010000_create_resident_wellness_follow_ups.sql. The repo's only
-- working staff-identity signal is the email/full_name pair surfaced by
-- getCurrentAuthorizedUser(); user_profiles exposes no uuid to the app.

create table if not exists resident_current_needs (
  id                uuid primary key default gen_random_uuid(),

  resident_id       uuid not null
                     references public.residents(id) on delete cascade,

  content           text not null,

  version_number    integer not null,

  is_current        boolean not null default true,

  source_type       text not null default 'staff_entry',
  source_label      text,

  created_by        text not null,
  created_at        timestamptz not null default now(),

  superseded_at     timestamptz,
  superseded_by     text,

  constraint resident_current_needs_content_not_blank
    check (length(trim(content)) > 0),

  constraint resident_current_needs_content_length_check
    check (length(content) <= 1500),

  constraint resident_current_needs_version_positive
    check (version_number > 0),

  constraint resident_current_needs_source_type_check
    check (source_type in (
      'staff_entry',
      'assessment',
      'conversation',
      'document_import',
      'system'
    )),

  -- A version is either still current (no supersede info) or fully
  -- superseded (both fields set) — never half-way.
  constraint resident_current_needs_supersede_consistency_check
    check (
      (is_current and superseded_at is null and superseded_by is null)
      or
      (not is_current and superseded_at is not null and superseded_by is not null)
    )
);

-- At most one active ("current") version per resident.
create unique index if not exists resident_current_needs_one_current_idx
  on resident_current_needs (resident_id)
  where is_current = true;

create index if not exists resident_current_needs_history_idx
  on resident_current_needs (resident_id, version_number desc);

-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this
-- subsystem. Writes only ever happen through save_resident_current_needs()
-- below (called with the service-role client from the server action layer),
-- never through a raw update/delete from the client, so history stays
-- effectively immutable in practice.
alter table resident_current_needs enable row level security;

-- Atomic save: supersede the current version (if any) and insert the next
-- one in a single transaction, with the current row locked for the
-- duration so two concurrent saves for the same resident can't both
-- observe themselves as "the" current version. Mirrors the
-- create_resident_wellness_note_with_follow_ups() "insert new / never
-- coordinate multi-step writes from the app layer" convention.
create or replace function save_resident_current_needs(
  p_resident_id uuid,
  p_content text,
  p_source_type text,
  p_source_label text,
  p_actor text
)
returns table (
  id uuid,
  version_number integer,
  created_at timestamptz,
  changed boolean
)
language plpgsql
set search_path = public
as $$
declare
  v_current resident_current_needs%rowtype;
  v_next_version integer;
  v_new_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to save current needs';
  end if;

  if length(trim(p_content)) = 0 then
    raise exception 'Current needs cannot be blank';
  end if;

  select * into v_current
  from resident_current_needs
  where resident_id = p_resident_id and is_current = true
  for update;

  if found and v_current.content = p_content then
    return query
    select v_current.id, v_current.version_number, v_current.created_at, false;
    return;
  end if;

  if found then
    update resident_current_needs
    set is_current = false,
        superseded_at = now(),
        superseded_by = p_actor
    where id = v_current.id;

    v_next_version := v_current.version_number + 1;
  else
    v_next_version := 1;
  end if;

  insert into resident_current_needs (
    resident_id,
    content,
    version_number,
    is_current,
    source_type,
    source_label,
    created_by
  ) values (
    p_resident_id,
    p_content,
    v_next_version,
    true,
    coalesce(p_source_type, 'staff_entry'),
    p_source_label,
    p_actor
  )
  returning resident_current_needs.id into v_new_id;

  return query
  select rcn.id, rcn.version_number, rcn.created_at, true
  from resident_current_needs rcn
  where rcn.id = v_new_id;
end;
$$;

-- Same function-privilege convention as the wellness RPCs: only service_role
-- may execute this, and only the server-side data layer ever calls it.
revoke execute on function save_resident_current_needs(
  uuid, text, text, text, text
) from public;

grant execute on function save_resident_current_needs(
  uuid, text, text, text, text
) to service_role;

commit;
