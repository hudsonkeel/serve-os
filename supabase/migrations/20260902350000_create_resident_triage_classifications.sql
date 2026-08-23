-- Governed, structured Emergency Preparedness triage classification for a
-- resident (Serve P&P §256, item 4; EP_CLIENT_TRIAGE_CLASSIFIED). Replaces
-- the generic document-upload path with a selectable fact recorded directly
-- by Serve staff: one of three stable internal codes (P1/P2/P3), each with
-- an exact display label matching AxisCare's own Client Profile Triage
-- Level picklist verbatim (leadership/production data confirmed AxisCare's
-- account already uses these exact three strings for ids 4/5/6 — see
-- lib/clientReadiness/triageClassification.ts).
--
-- Append-only, never updated or deleted in place — same "supersedable/
-- reversible without deleting history" shape as
-- resident_serve_relationship_corrections (20260826000000): the current
-- value is derived, not stored as a separate flag. Unlike that table,
-- "current" here is NOT simply the latest inserted row — it's the latest
-- row whose effective_date has actually arrived (effective_date <= today,
-- tie-broken by created_at desc), so a future-dated classification can be
-- recorded ahead of time without taking effect early. See
-- lib/data/residentTriageClassifications.ts's getCurrentResidentTriageClassification().
--
-- notes is optional (unlike resident_serve_relationship_corrections'
-- required rationale) — this is a routine structured recording, not a
-- "the computed answer was wrong" correction.
create table resident_triage_classifications (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id),
  level_code text not null check (level_code in ('P1', 'P2', 'P3')),
  effective_date date not null,
  notes text,
  actor text not null check (length(trim(actor)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists resident_triage_classifications_resident_idx
  on resident_triage_classifications (resident_id, created_at desc);

-- Supports "current = latest effective_date <= today, tie-broken by
-- created_at desc" without a full table scan per resident.
create index if not exists resident_triage_classifications_resident_effective_idx
  on resident_triage_classifications (resident_id, effective_date desc, created_at desc);

alter table resident_triage_classifications enable row level security;
revoke all on resident_triage_classifications from public, anon, authenticated;
grant all on resident_triage_classifications to service_role;

-- Governed insert-only RPC — actor is required (matches every other
-- governed-fact RPC in this codebase); notes is not, since it's optional
-- by design here. level_code is validated by the table's own check
-- constraint, not re-validated in this function.
create or replace function record_resident_triage_classification(
  p_resident_id uuid,
  p_level_code text,
  p_effective_date date,
  p_notes text,
  p_actor text
)
returns resident_triage_classifications
language plpgsql
set search_path = public
as $$
declare
  v_row resident_triage_classifications;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to record a triage classification';
  end if;
  if not exists (select 1 from residents where id = p_resident_id) then
    raise exception 'resident % not found', p_resident_id;
  end if;

  insert into resident_triage_classifications (
    resident_id, level_code, effective_date, notes, actor
  ) values (
    p_resident_id, p_level_code, p_effective_date, p_notes, p_actor
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function record_resident_triage_classification(uuid, text, date, text, text) from public;
grant execute on function record_resident_triage_classification(uuid, text, date, text, text) to service_role;

-- ROLLBACK:
--
--   revoke execute on function record_resident_triage_classification(uuid, text, date, text, text) from service_role;
--   drop function if exists record_resident_triage_classification(uuid, text, date, text, text);
--   drop table if exists resident_triage_classifications;
