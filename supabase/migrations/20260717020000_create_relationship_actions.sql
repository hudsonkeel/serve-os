begin;

-- Relationship Next Actions — accountable, owned, due work. Directly
-- modeled on resident_wellness_follow_ups' editable-follow-up
-- architecture (20260712010000_create_resident_wellness_follow_ups.sql,
-- 20260716050000_add_wellness_follow_up_editing.sql): atomic edits,
-- field-level audit history, no-op-safe saves, one Timeline event per
-- save. Deliberately simpler status set (open/completed/dismissed, no
-- in_progress/cancelled) since Relationship Actions are single next-step
-- items, not the more open-ended wellness workflow.
create table if not exists relationship_actions (
  id                  uuid primary key default gen_random_uuid(),
  relationship_id     uuid not null references public.relationships(id) on delete cascade,

  action_type         text not null,
  title               text not null,
  description         text,
  due_at              timestamptz,
  assigned_to         text,
  priority            text not null default 'normal',
  status              text not null default 'open',
  completion_outcome  text,

  created_by          text not null,
  created_at          timestamptz not null default now(),
  updated_by          text,
  updated_at          timestamptz not null default now(),

  completed_by        text,
  completed_at        timestamptz,
  dismissed_by        text,
  dismissed_at        timestamptz,

  constraint relationship_actions_type_check
    check (action_type in (
      'call', 'email', 'text', 'schedule_assessment', 'complete_assessment',
      'prepare_proposal', 'send_proposal', 'follow_up', 'resident_visit',
      'family_meeting', 'other'
    )),

  constraint relationship_actions_status_check
    check (status in ('open', 'completed', 'dismissed')),

  constraint relationship_actions_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),

  constraint relationship_actions_title_not_blank
    check (length(trim(title)) > 0),

  -- Part 20: an action can never be both completed and dismissed.
  constraint relationship_actions_completion_exclusive_check
    check (not (completed_at is not null and dismissed_at is not null)),

  constraint relationship_actions_status_fields_check
    check (
      (status = 'open' and completed_at is null and dismissed_at is null) or
      (status = 'completed' and completed_at is not null and dismissed_at is null) or
      (status = 'dismissed' and dismissed_at is not null and completed_at is null)
    )
);

create index if not exists relationship_actions_relationship_idx
  on relationship_actions (relationship_id, status, due_at);
create index if not exists relationship_actions_assigned_idx
  on relationship_actions (assigned_to, status, due_at);
create index if not exists relationship_actions_open_due_idx
  on relationship_actions (due_at) where status = 'open';

alter table relationship_actions enable row level security;

create table if not exists relationship_action_edits (
  id                        uuid primary key default gen_random_uuid(),
  relationship_action_id    uuid not null references public.relationship_actions(id) on delete cascade,
  field_name                text not null,
  old_value                 text,
  new_value                 text,
  edited_by                 text not null,
  edited_at                 timestamptz not null default now(),

  constraint relationship_action_edits_field_name_check
    check (field_name in ('title', 'description', 'action_type', 'due_at', 'assigned_to', 'priority'))
);

create index if not exists relationship_action_edits_action_idx
  on relationship_action_edits (relationship_action_id, edited_at desc);

alter table relationship_action_edits enable row level security;

create or replace function create_relationship_action(
  p_relationship_id uuid,
  p_action_type text,
  p_title text,
  p_description text,
  p_due_at timestamptz,
  p_assigned_to text,
  p_priority text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_action_id uuid;
  v_display_name text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to create an action';
  end if;

  if length(trim(p_title)) = 0 then
    raise exception 'Enter a title for this action';
  end if;

  select display_name into v_display_name from relationships where id = p_relationship_id;
  if not found then
    raise exception 'Relationship not found';
  end if;

  insert into relationship_actions (
    relationship_id, action_type, title, description, due_at, assigned_to, priority, created_by
  ) values (
    p_relationship_id, p_action_type, p_title, p_description, p_due_at, p_assigned_to,
    coalesce(p_priority, 'normal'), p_actor
  )
  returning id into v_action_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'action_created', p_title || ' added.', null,
    'relationship_actions', v_action_id, p_actor, true
  );

  return v_action_id;
end;
$$;

revoke execute on function create_relationship_action(uuid, text, text, text, timestamptz, text, text, text) from public;
grant execute on function create_relationship_action(uuid, text, text, text, timestamptz, text, text, text) to service_role;

-- Same shape as update_resident_wellness_follow_up(): diff the five
-- editable fields, write one audit row per changed field, update the
-- row, and (only if something changed) log one Timeline event
-- summarizing every change from this save.
create or replace function update_relationship_action(
  p_action_id uuid,
  p_relationship_id uuid,
  p_title text,
  p_description text,
  p_action_type text,
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
  v_current relationship_actions%rowtype;
  v_changes text[] := array[]::text[];
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to edit an action';
  end if;

  if length(trim(p_title)) = 0 then
    raise exception 'Action title cannot be blank';
  end if;

  select * into v_current
  from relationship_actions
  where id = p_action_id and relationship_id = p_relationship_id
  for update;

  if not found then
    raise exception 'Action not found for this relationship';
  end if;

  if v_current.status <> 'open' then
    raise exception 'Only open actions can be edited';
  end if;

  if v_current.title is distinct from p_title then
    insert into relationship_action_edits (relationship_action_id, field_name, old_value, new_value, edited_by)
    values (p_action_id, 'title', v_current.title, p_title, p_actor);
    v_changes := array_append(v_changes, 'Title updated.');
  end if;

  if v_current.due_at is distinct from p_due_at then
    insert into relationship_action_edits (relationship_action_id, field_name, old_value, new_value, edited_by)
    values (p_action_id, 'due_at', v_current.due_at::text, p_due_at::text, p_actor);
    v_changes := array_append(
      v_changes,
      case
        when v_current.due_at is not null and p_due_at is not null
          then 'Due date changed from ' || to_char(v_current.due_at, 'Mon DD') || ' to ' || to_char(p_due_at, 'Mon DD') || '.'
        when p_due_at is not null then 'Due date set to ' || to_char(p_due_at, 'Mon DD') || '.'
        else 'Due date cleared.'
      end
    );
  end if;

  if v_current.assigned_to is distinct from p_assigned_to then
    insert into relationship_action_edits (relationship_action_id, field_name, old_value, new_value, edited_by)
    values (p_action_id, 'assigned_to', v_current.assigned_to, p_assigned_to, p_actor);
    v_changes := array_append(
      v_changes,
      case when p_assigned_to is not null then 'Assigned to ' || p_assigned_to || '.' else 'Assignment cleared.' end
    );
  end if;

  if v_current.priority is distinct from p_priority then
    insert into relationship_action_edits (relationship_action_id, field_name, old_value, new_value, edited_by)
    values (p_action_id, 'priority', v_current.priority, p_priority, p_actor);
    v_changes := array_append(v_changes, 'Priority changed to ' || p_priority || '.');
  end if;

  if v_current.action_type is distinct from p_action_type then
    insert into relationship_action_edits (relationship_action_id, field_name, old_value, new_value, edited_by)
    values (p_action_id, 'action_type', v_current.action_type, p_action_type, p_actor);
    v_changes := array_append(v_changes, 'Action type changed.');
  end if;

  if v_current.description is distinct from p_description then
    insert into relationship_action_edits (relationship_action_id, field_name, old_value, new_value, edited_by)
    values (p_action_id, 'description', v_current.description, p_description, p_actor);
    v_changes := array_append(v_changes, 'Notes updated.');
  end if;

  if array_length(v_changes, 1) is null then
    return;
  end if;

  update relationship_actions
  set title = p_title,
      description = p_description,
      action_type = p_action_type,
      due_at = p_due_at,
      assigned_to = p_assigned_to,
      priority = p_priority,
      updated_by = p_actor
  where id = p_action_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'action_updated', p_title || ' updated.',
    array_to_string(v_changes, ' '), 'relationship_actions', p_action_id, p_actor, true
  );
end;
$$;

revoke execute on function update_relationship_action(uuid, uuid, text, text, text, timestamptz, text, text, text) from public;
grant execute on function update_relationship_action(uuid, uuid, text, text, text, timestamptz, text, text, text) to service_role;

create or replace function complete_relationship_action(
  p_action_id uuid,
  p_relationship_id uuid,
  p_completion_outcome text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_title text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to complete an action';
  end if;

  select title into v_title
  from relationship_actions
  where id = p_action_id and relationship_id = p_relationship_id and status = 'open'
  for update;

  if not found then
    raise exception 'Open action not found for this relationship';
  end if;

  update relationship_actions
  set status = 'completed',
      completed_at = now(),
      completed_by = p_actor,
      completion_outcome = p_completion_outcome
  where id = p_action_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'action_completed', v_title || ' completed.',
    p_completion_outcome, 'relationship_actions', p_action_id, p_actor, true
  );
end;
$$;

revoke execute on function complete_relationship_action(uuid, uuid, text, text) from public;
grant execute on function complete_relationship_action(uuid, uuid, text, text) to service_role;

create or replace function dismiss_relationship_action(
  p_action_id uuid,
  p_relationship_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_title text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to dismiss an action';
  end if;

  select title into v_title
  from relationship_actions
  where id = p_action_id and relationship_id = p_relationship_id and status = 'open'
  for update;

  if not found then
    raise exception 'Open action not found for this relationship';
  end if;

  update relationship_actions
  set status = 'dismissed',
      dismissed_at = now(),
      dismissed_by = p_actor
  where id = p_action_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'action_dismissed', v_title || ' dismissed.',
    null, 'relationship_actions', p_action_id, p_actor, true
  );
end;
$$;

revoke execute on function dismiss_relationship_action(uuid, uuid, text) from public;
grant execute on function dismiss_relationship_action(uuid, uuid, text) to service_role;

commit;
