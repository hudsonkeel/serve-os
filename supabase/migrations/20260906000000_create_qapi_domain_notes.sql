begin;

-- QAPI Domain Notes: a lightweight leadership/action narrative per QAPI
-- domain ("what are we doing about it," in the leader's own words) —
-- distinct from compliance_corrective_actions (a specific, resolvable
-- problem tied to a requirement and a real, validated subject) and from
-- Working Notes (many concurrent, independently-resolvable items per
-- subject; see resident_working_notes/relationship_working_notes). This
-- table instead mirrors resident_current_needs
-- (20260716000000_create_resident_current_needs.sql) exactly: versioned
-- rather than mutable — every save supersedes the previous version instead
-- of overwriting it, so history is never lost — with exactly one "current"
-- version per domain at all times.
--
-- Deliberately narrower than resident_current_needs: no source_type/
-- source_label columns. Every row here is always a direct staff/leadership
-- entry from the QAPI page itself — there is no non-UI writer to
-- distinguish, so those columns would add surface area with nothing to use
-- it yet. Add them later, the same way resident_current_needs' own
-- reserved-for-later columns were added, if a real second writer emerges.
--
-- v0.1 is organization-wide only, by explicit product decision — no
-- community_id column. A per-community note is a deliberate later
-- extension, not an oversight: the rest of today's QAPI/Audit Readiness
-- composition already treats Workforce and Emergency Preparedness as
-- organization-wide (see lib/compliance/auditReadinessDashboard.ts's own
-- comment), and a naive nullable community_id would need an expression
-- index (Postgres treats NULL <> NULL in uniqueness checks) to correctly
-- guarantee "at most one current org-wide note" — not worth shipping half
-- of that guarantee now.
--
-- Staff-identity note: created_by / superseded_by are `text`, matching the
-- convention already established for resident_current_needs and every
-- other actor-tracking column in this schema — this app's only working
-- staff-identity signal is the email/full_name pair from
-- getCurrentAuthorizedUser().

create table if not exists qapi_domain_notes (
  id                uuid primary key default gen_random_uuid(),

  domain_id         text not null,

  content           text not null,

  version_number    integer not null,

  is_current        boolean not null default true,

  created_by        text not null,
  created_at        timestamptz not null default now(),

  superseded_at     timestamptz,
  superseded_by     text,

  constraint qapi_domain_notes_domain_id_check
    check (domain_id in ('workforce', 'client_readiness', 'emergency_preparedness')),

  constraint qapi_domain_notes_content_not_blank
    check (length(trim(content)) > 0),

  constraint qapi_domain_notes_content_length_check
    check (length(content) <= 1000),

  constraint qapi_domain_notes_version_positive
    check (version_number > 0),

  -- A version is either still current (no supersede info) or fully
  -- superseded (both fields set) — never half-way. Identical to
  -- resident_current_needs_supersede_consistency_check.
  constraint qapi_domain_notes_supersede_consistency_check
    check (
      (is_current and superseded_at is null and superseded_by is null)
      or
      (not is_current and superseded_at is not null and superseded_by is not null)
    )
);

-- At most one active ("current") version per domain.
create unique index if not exists qapi_domain_notes_one_current_idx
  on qapi_domain_notes (domain_id)
  where is_current = true;

create index if not exists qapi_domain_notes_history_idx
  on qapi_domain_notes (domain_id, version_number desc);

-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this
-- schema. Writes only ever happen through save_qapi_domain_note() below
-- (called with the service-role client from the server action layer),
-- never through a raw update/delete from the client, so history stays
-- effectively immutable in practice.
alter table qapi_domain_notes enable row level security;

-- Atomic save: supersede the current version (if any) and insert the next
-- one in a single transaction, with the current row locked for the
-- duration so two concurrent saves for the same domain can't both observe
-- themselves as "the" current version. A no-op save (identical content)
-- returns the existing current version unchanged rather than minting a new
-- one — mirrors save_resident_current_needs() exactly.
create or replace function save_qapi_domain_note(
  p_domain_id text,
  p_content text,
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
  v_current qapi_domain_notes%rowtype;
  v_next_version integer;
  v_new_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to save a QAPI domain note';
  end if;

  if p_domain_id is null or p_domain_id not in ('workforce', 'client_readiness', 'emergency_preparedness') then
    raise exception 'Unknown QAPI domain: %', p_domain_id;
  end if;

  if length(trim(p_content)) = 0 then
    raise exception 'QAPI domain note content cannot be blank';
  end if;

  select * into v_current
  from qapi_domain_notes
  where domain_id = p_domain_id and is_current = true
  for update;

  if found and v_current.content = p_content then
    return query
    select v_current.id, v_current.version_number, v_current.created_at, false;
    return;
  end if;

  if found then
    update qapi_domain_notes
    set is_current = false,
        superseded_at = now(),
        superseded_by = p_actor
    where id = v_current.id;

    v_next_version := v_current.version_number + 1;
  else
    v_next_version := 1;
  end if;

  insert into qapi_domain_notes (
    domain_id,
    content,
    version_number,
    is_current,
    created_by
  ) values (
    p_domain_id,
    p_content,
    v_next_version,
    true,
    p_actor
  )
  returning qapi_domain_notes.id into v_new_id;

  return query
  select qdn.id, qdn.version_number, qdn.created_at, true
  from qapi_domain_notes qdn
  where qdn.id = v_new_id;
end;
$$;

revoke execute on function save_qapi_domain_note(text, text, text) from public;
grant execute on function save_qapi_domain_note(text, text, text) to service_role;

commit;
