begin;

-- Bugfix: save_resident_current_needs() has failed with
-- "42702: column reference \"id\" is ambiguous" on every supersede path
-- (i.e. every save after a resident's first) since it was created in
-- 20260716000000_create_resident_current_needs.sql. The function's
-- `returns table (id uuid, ...)` clause declares an implicit `id` OUT
-- variable, which collides with the unqualified `where id = v_current.id`
-- in the supersede UPDATE below — Postgres can't tell which `id` is meant.
-- The very first save for a resident never hits this line (insert-only,
-- no existing row to supersede), which is why this went unnoticed. Found
-- via manual verification while working on the Current Needs lifecycle
-- language (this migration carries no copy/UX change of its own).
--
-- Same signature as the original — a true replace, not a new overload.
-- Only the UPDATE's WHERE clause changes (table-qualified instead of bare).
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
    where resident_current_needs.id = v_current.id;

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

  insert into resident_timeline (
    resident_id, event_type, event_title, event_description, source, created_by, system_generated
  ) values (
    p_resident_id,
    'current_needs_updated',
    'Current Needs updated',
    'Version ' || v_next_version || ' saved.',
    'resident_current_needs',
    p_actor,
    true
  );

  return query
  select rcn.id, rcn.version_number, rcn.created_at, true
  from resident_current_needs rcn
  where rcn.id = v_new_id;
end;
$$;

commit;
