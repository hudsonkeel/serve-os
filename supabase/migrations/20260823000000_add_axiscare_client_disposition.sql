-- AxisCare Operational Synchronization — a durable, human-set
-- disposition for AxisCare client records that are not true clients
-- (or whose lifecycle bucket needs an explicit human override),
-- without deleting or hiding the underlying AxisCare row. Built after
-- live reconciliation of the full AxisCare client roster surfaced real
-- non-client rows mixed into the client list (e.g. a client's adult
-- son, mistakenly given his own AxisCare client record instead of
-- being tracked as a related person).
--
-- Deliberately absent-by-default: most AxisCare client records will
-- never have a row here. Absence means "no human override — use the
-- computed lifecycle (lib/integrations/axiscare/clientLifecycle.ts) as
-- the operating classification." A row here is exclusively a
-- deliberate, actor-attributed human decision — never written by an
-- automated sync.
--
-- Single current-state row per AxisCare client (unique
-- axiscare_client_id, upserted on re-classification) — not an
-- append-only history table. "Survives future syncs" only requires
-- durability of the current classification plus who/why/when it was
-- last set, which this satisfies; a full change history was not asked
-- for and isn't built speculatively.
create table axiscare_client_dispositions (
  id uuid primary key default gen_random_uuid(),
  axiscare_client_id text not null,

  -- Controlled vocabulary:
  --   real_client               — a genuine Serve service recipient (the default assumption when no row exists at all)
  --   prospect                  — a genuine prospective client, explicitly confirmed by a human (distinct from the
  --                                computed "prospect" lifecycle bucket, which is class-code-driven, not human-set)
  --   non_client_related_person — a real person, but not a service recipient in their own right (e.g. an adult
  --                                child/relative mistakenly given their own AxisCare client record)
  --   administrative_record     — a non-person AxisCare row (e.g. a community/office-level placeholder account)
  --   test_placeholder          — a test/QA/integration row with no real-world referent at all
  --   needs_review              — explicitly parked for human review, overriding whatever the computed lifecycle says
  disposition text not null
    check (disposition in (
      'real_client',
      'prospect',
      'non_client_related_person',
      'administrative_record',
      'test_placeholder',
      'needs_review'
    )),

  rationale text not null check (length(trim(rationale)) > 0),

  -- Informational only, not a foreign key — the related AxisCare client
  -- may or may not itself have a disposition row, and AxisCare record
  -- IDs are external, vendor-owned identifiers (not guaranteed stable
  -- against a local constraint). Lets a disposition like
  -- non_client_related_person preserve which real client this record
  -- actually relates to (e.g. an adult son's record pointing at his
  -- parent's AxisCare client id) without building a full relationship
  -- graph that wasn't asked for.
  related_axiscare_client_id text,
  related_person_note text,

  set_by text not null check (length(trim(set_by)) > 0),
  set_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint axiscare_client_dispositions_unique_client
    unique (axiscare_client_id)
);

alter table axiscare_client_dispositions enable row level security;
revoke all on axiscare_client_dispositions from public, anon, authenticated;
grant all on axiscare_client_dispositions to service_role;

-- Upserts the current disposition for one AxisCare client. Always
-- actor + rationale attributed; re-classifying an already-classified
-- record overwrites the prior disposition/rationale/actor in place
-- (see table comment on why this is current-state, not history).
create or replace function set_axiscare_client_disposition(
  p_axiscare_client_id text,
  p_disposition text,
  p_rationale text,
  p_actor text,
  p_related_axiscare_client_id text default null,
  p_related_person_note text default null
)
returns axiscare_client_dispositions
language plpgsql
set search_path = public
as $$
declare
  v_row axiscare_client_dispositions;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to set an AxisCare client disposition';
  end if;

  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to set an AxisCare client disposition';
  end if;

  insert into axiscare_client_dispositions (
    axiscare_client_id, disposition, rationale, related_axiscare_client_id, related_person_note, set_by, set_at
  ) values (
    p_axiscare_client_id, p_disposition, p_rationale, p_related_axiscare_client_id, p_related_person_note, p_actor, now()
  )
  on conflict (axiscare_client_id) do update
  set disposition = excluded.disposition,
      rationale = excluded.rationale,
      related_axiscare_client_id = excluded.related_axiscare_client_id,
      related_person_note = excluded.related_person_note,
      set_by = excluded.set_by,
      set_at = excluded.set_at,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function set_axiscare_client_disposition(text, text, text, text, text, text) from public;
grant execute on function set_axiscare_client_disposition(text, text, text, text, text, text) to service_role;

-- ROLLBACK:
--
--   revoke execute on function set_axiscare_client_disposition(text, text, text, text, text, text) from service_role;
--   drop function if exists set_axiscare_client_disposition(text, text, text, text, text, text);
--   drop table if exists axiscare_client_dispositions;
