begin;

-- Adds the ability to edit an existing open/in_progress wellness follow-up
-- (previously the only lifecycle actions were create/complete/dismiss —
-- changing a due date or assignment meant dismissing and recreating the
-- whole task). Follow-ups represent work, and work changes; this migration
-- lets that work be updated in place without losing the record of what
-- changed.

-- "Who last touched this row" at a glance, alongside the existing
-- updated_at (already trigger-maintained). Nullable — most existing rows
-- have never been edited.
alter table resident_wellness_follow_ups
  add column if not exists updated_by text;

-- The lightweight audit record: one row per changed field per edit, not a
-- full-row snapshot. Preserves exactly what Working Notes/Current Needs
-- already preserve elsewhere in this app — a "what changed, who changed
-- it, when" trail — without duplicating the entire follow-up row on every
-- save the way resident_current_needs' full versioning does. Follow-ups
-- are edited in place (their own row is the single current state);
-- history lives here, not as competing "current" rows.
create table if not exists resident_wellness_follow_up_edits (
  id             uuid primary key default gen_random_uuid(),

  follow_up_id   uuid not null
                 references public.resident_wellness_follow_ups(id) on delete cascade,

  field_name     text not null,
  old_value      text,
  new_value      text,

  edited_by      text not null,
  edited_at      timestamptz not null default now(),

  constraint resident_wellness_follow_up_edits_field_name_check
    check (field_name in (
      'title', 'description', 'follow_up_type', 'due_at', 'assigned_to', 'priority'
    ))
);

create index if not exists resident_wellness_follow_up_edits_follow_up_idx
  on resident_wellness_follow_up_edits (follow_up_id, edited_at desc);

-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this
-- subsystem. Append-only in practice: nothing in the app ever updates or
-- deletes a row here.
alter table resident_wellness_follow_up_edits enable row level security;

-- New Timeline event type for an edit. Postgres check constraints can't be
-- altered in place — drop and recreate with the same four existing values
-- plus this one.
alter table resident_timeline
  drop constraint resident_timeline_event_type_check;

alter table resident_timeline
  add constraint resident_timeline_event_type_check
    check (event_type in (
      'resident_created',
      'current_needs_updated',
      'working_note_created',
      'working_note_resolved',
      'follow_up_updated'
    ));

-- Atomic edit: diffs the six editable fields against the current row,
-- writes one audit row per field that actually changed, updates the
-- follow-up itself, and (only if something changed) logs one Timeline
-- event summarizing all the changes from this save. A no-op save (nothing
-- actually different) writes nothing at all — mirrors the dedup behavior
-- already established for Current Needs.
--
-- Non-editable system metadata (source_type, source_id, suggested_by,
-- suggestion_rule_id, created_by, created_at, status and the
-- completed_*/dismissed_* fields) is deliberately untouched here — this
-- function only ever writes to the six columns listed in its parameters
-- plus updated_by/updated_at.
create or replace function update_resident_wellness_follow_up(
  p_follow_up_id uuid,
  p_resident_id uuid,
  p_title text,
  p_description text,
  p_follow_up_type text,
  p_due_at timestamptz,
  p_assigned_to text,
  p_priority text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_current resident_wellness_follow_ups%rowtype;
  v_changes text[] := array[]::text[];
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to edit a follow-up';
  end if;

  if length(trim(p_title)) = 0 then
    raise exception 'Follow-up title cannot be blank';
  end if;

  select * into v_current
  from resident_wellness_follow_ups
  where id = p_follow_up_id and resident_id = p_resident_id
  for update;

  if not found then
    raise exception 'Follow-up not found for this resident';
  end if;

  if v_current.status not in ('open', 'in_progress') then
    raise exception 'Only open follow-ups can be edited';
  end if;

  if v_current.title is distinct from p_title then
    insert into resident_wellness_follow_up_edits (follow_up_id, field_name, old_value, new_value, edited_by)
    values (p_follow_up_id, 'title', v_current.title, p_title, p_actor);
    v_changes := array_append(v_changes, 'Title updated.');
  end if;

  if v_current.due_at is distinct from p_due_at then
    insert into resident_wellness_follow_up_edits (follow_up_id, field_name, old_value, new_value, edited_by)
    values (p_follow_up_id, 'due_at', v_current.due_at::text, p_due_at::text, p_actor);
    v_changes := array_append(
      v_changes,
      case
        when v_current.due_at is not null and p_due_at is not null
          then 'Due date changed from ' || to_char(v_current.due_at, 'Mon DD') || ' to ' || to_char(p_due_at, 'Mon DD') || '.'
        when p_due_at is not null
          then 'Due date set to ' || to_char(p_due_at, 'Mon DD') || '.'
        else 'Due date cleared.'
      end
    );
  end if;

  if v_current.assigned_to is distinct from p_assigned_to then
    insert into resident_wellness_follow_up_edits (follow_up_id, field_name, old_value, new_value, edited_by)
    values (p_follow_up_id, 'assigned_to', v_current.assigned_to, p_assigned_to, p_actor);
    v_changes := array_append(
      v_changes,
      case when p_assigned_to is not null then 'Assigned to ' || p_assigned_to || '.' else 'Assignment cleared.' end
    );
  end if;

  if v_current.priority is distinct from p_priority then
    insert into resident_wellness_follow_up_edits (follow_up_id, field_name, old_value, new_value, edited_by)
    values (p_follow_up_id, 'priority', v_current.priority, p_priority, p_actor);
    v_changes := array_append(v_changes, 'Priority changed to ' || p_priority || '.');
  end if;

  if v_current.follow_up_type is distinct from p_follow_up_type then
    insert into resident_wellness_follow_up_edits (follow_up_id, field_name, old_value, new_value, edited_by)
    values (p_follow_up_id, 'follow_up_type', v_current.follow_up_type, p_follow_up_type, p_actor);
    v_changes := array_append(v_changes, 'Category changed.');
  end if;

  if v_current.description is distinct from p_description then
    insert into resident_wellness_follow_up_edits (follow_up_id, field_name, old_value, new_value, edited_by)
    values (p_follow_up_id, 'description', v_current.description, p_description, p_actor);
    v_changes := array_append(v_changes, 'Notes updated.');
  end if;

  if array_length(v_changes, 1) is null then
    return;
  end if;

  update resident_wellness_follow_ups
  set title = p_title,
      description = p_description,
      follow_up_type = p_follow_up_type,
      due_at = p_due_at,
      assigned_to = p_assigned_to,
      priority = p_priority,
      updated_by = p_actor
  where id = p_follow_up_id;

  insert into resident_timeline (
    resident_id, event_type, event_title, event_description, source, created_by, system_generated
  ) values (
    p_resident_id,
    'follow_up_updated',
    p_title || ' follow-up updated.',
    array_to_string(v_changes, ' '),
    'resident_wellness_follow_ups',
    p_actor,
    true
  );
end;
$$;

revoke execute on function update_resident_wellness_follow_up(
  uuid, uuid, text, text, text, timestamptz, text, text, text
) from public;

grant execute on function update_resident_wellness_follow_up(
  uuid, uuid, text, text, text, timestamptz, text, text, text
) to service_role;

commit;
