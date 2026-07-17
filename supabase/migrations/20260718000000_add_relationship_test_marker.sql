begin;

-- Test-data hygiene (docs/engineering/TEST_DATA_HYGIENE.md): a nullable
-- marker on the one root entity (relationships) is enough to identify an
-- entire synthetic verification run — every dependent table
-- (relationship_actions, relationship_touches, relationship_stage_history,
-- relationship_timeline, relationship_working_notes,
-- relationship_service_opportunities) is reachable by joining back through
-- relationship_id, so no other table needs its own is_test_data column
-- (Part 4's stated preference: "If one root Relationship marker can safely
-- identify all dependent records, prefer that").
--
-- Never set by any application code path a normal user can reach —
-- create_relationship() only accepts it as an optional trailing parameter,
-- and the RPC itself is already revoked from public / granted to
-- service_role only, same as every other write in this subsystem. Only
-- scripts/cleanup-test-data.ts (service-role, outside the app) ever reads
-- or writes it deliberately.
alter table relationships add column if not exists test_marker text;

create index if not exists relationships_test_marker_idx
  on relationships (test_marker)
  where test_marker is not null;

-- Postgres identifies functions by (name, parameter types) — adding a new
-- trailing parameter creates a distinct overload rather than replacing the
-- 18-parameter original, so the old signature must be dropped explicitly
-- or both would exist (and supabase.rpc()'s named-argument call becomes
-- ambiguous between them).
drop function if exists create_relationship(
  text, text, text, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
);

create or replace function create_relationship(
  p_relationship_type text,
  p_stage text,
  p_display_name text,
  p_resident_id uuid,
  p_prospect_id uuid,
  p_community_name text,
  p_organization_name text,
  p_primary_contact_name text,
  p_primary_contact_relationship text,
  p_primary_contact_phone text,
  p_primary_contact_email text,
  p_prospective_resident_name text,
  p_summary text,
  p_owner_label text,
  p_priority text,
  p_source_type text,
  p_source_label text,
  p_actor text,
  p_test_marker text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to create a relationship';
  end if;

  if length(trim(p_display_name)) = 0 then
    raise exception 'Relationship display name cannot be blank';
  end if;

  insert into relationships (
    relationship_type, stage, display_name, resident_id, prospect_id,
    community_name, organization_name,
    primary_contact_name, primary_contact_relationship, primary_contact_phone, primary_contact_email,
    prospective_resident_name, summary, owner_label,
    priority, source_type, source_label, created_by, test_marker
  ) values (
    p_relationship_type, p_stage, p_display_name, p_resident_id, p_prospect_id,
    p_community_name, p_organization_name,
    p_primary_contact_name, p_primary_contact_relationship, p_primary_contact_phone, p_primary_contact_email,
    p_prospective_resident_name, p_summary, p_owner_label,
    coalesce(p_priority, 'normal'), p_source_type, p_source_label, p_actor, p_test_marker
  )
  returning id into v_id;

  insert into relationship_stage_history (relationship_id, from_stage, to_stage, changed_by)
  values (v_id, null, p_stage, p_actor);

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    v_id, 'relationship_created', p_display_name || ' created.',
    case when p_resident_id is not null then 'Linked to resident at creation.' else null end,
    'relationships', p_actor, true
  );

  return v_id;
end;
$$;

revoke execute on function create_relationship(
  text, text, text, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function create_relationship(
  text, text, text, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

commit;
