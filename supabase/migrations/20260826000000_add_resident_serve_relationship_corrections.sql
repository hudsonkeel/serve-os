-- Governed "fix incorrect stuff" capability for a resident's Serve
-- relationship (prospect/active_client/inactive_client/
-- no_current_relationship/needs_review — see
-- lib/residents/serveRelationshipProjection.ts). This is deliberately
-- NOT a general-purpose editable field: it exists because the
-- projected relationship is computed from AxisCare/CRM/legacy
-- evidence, and a human reviewer sometimes has to be able to say "the
-- computed answer is wrong, here is the reviewed truth" without
-- waiting on an engineering fix to the underlying matching/evidence
-- pipeline.
--
-- Append-only, never updated or deleted in place — "supersedable/
-- reversible without deleting history" is satisfied by construction:
-- the current value for a resident is simply its most recent row here;
-- reverting is inserting a new row with the prior value, itself fully
-- audited. No separate "is_current"/"superseded_by" bookkeeping is
-- needed or added.
create table resident_serve_relationship_corrections (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id),
  previous_value text,
  new_value text not null
    check (new_value in ('prospect', 'active_client', 'inactive_client', 'no_current_relationship', 'needs_review')),
  actor text not null check (length(trim(actor)) > 0),
  rationale text not null check (length(trim(rationale)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists resident_serve_relationship_corrections_resident_idx
  on resident_serve_relationship_corrections (resident_id, created_at desc);

alter table resident_serve_relationship_corrections enable row level security;
revoke all on resident_serve_relationship_corrections from public, anon, authenticated;
grant all on resident_serve_relationship_corrections to service_role;

-- Governed insert-only RPC — actor and rationale are required, matching
-- every other correction/decision RPC in this codebase.
-- previous_value is passed by the caller (the value the projection
-- actually showed at correction time) rather than looked up here, so
-- the recorded "previous value" always reflects exactly what the human
-- reviewer saw and disagreed with, not a value recomputed after the
-- fact.
create or replace function correct_resident_serve_relationship(
  p_resident_id uuid,
  p_previous_value text,
  p_new_value text,
  p_actor text,
  p_rationale text
)
returns resident_serve_relationship_corrections
language plpgsql
set search_path = public
as $$
declare
  v_row resident_serve_relationship_corrections;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to correct a Serve relationship';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to correct a Serve relationship';
  end if;
  if not exists (select 1 from residents where id = p_resident_id) then
    raise exception 'resident % not found', p_resident_id;
  end if;

  insert into resident_serve_relationship_corrections (
    resident_id, previous_value, new_value, actor, rationale
  ) values (
    p_resident_id, p_previous_value, p_new_value, p_actor, p_rationale
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function correct_resident_serve_relationship(uuid, text, text, text, text) from public;
grant execute on function correct_resident_serve_relationship(uuid, text, text, text, text) to service_role;

-- ROLLBACK:
--
--   revoke execute on function correct_resident_serve_relationship(uuid, text, text, text, text) from service_role;
--   drop function if exists correct_resident_serve_relationship(uuid, text, text, text, text);
--   drop table if exists resident_serve_relationship_corrections;
