-- Hiring Pipeline Reconciliation — governed linkage between a
-- recruiting_leads row and the workforce_members row it converted into,
-- closing a real structural gap: workforce_members.source_recruiting_lead_id
-- (added 20260808000000) has never been written by any code path (confirmed
-- live: all rows null), and recruiting_leads.status has no audit trail at
-- all (bare UPDATE, no actor/rationale/history).
--
-- Confirmed live root cause example: Alma Dhora Owolabi has a
-- recruiting_leads row (status='in_review') and a separate, unconnected
-- workforce_members row (confirmed active via AxisCare) — no link of any
-- kind exists between them today, so the Recruiting UI has no way to know
-- she was already hired.
--
-- This does not auto-link anyone. lib/recruitingLeads/workforceResolution.ts
-- (already shipped, already tested, previously unwired) refuses to resolve
-- on name alone — every non-trivial match still requires an explicit human
-- decision through this RPC. Append-only, mirroring the same pattern as
-- person_vendor_identity_link_decisions and
-- resident_serve_relationship_corrections: every decision (confirmed,
-- rejected, or deferred) is preserved permanently, so a rejected candidate
-- pair never silently resurfaces as unresolved and a confirmed link's
-- history is never lost.
create table recruiting_lead_workforce_link_decisions (
  id uuid primary key default gen_random_uuid(),
  recruiting_lead_id uuid not null references recruiting_leads(id),
  workforce_member_id uuid not null references workforce_members(id),
  decision text not null check (decision in ('confirmed', 'rejected', 'deferred')),
  -- RecruitingResolutionBasis value from workforceResolution.ts, when the
  -- decision followed the resolution engine's own tiering — nullable for a
  -- decision made from a manual review with no engine-computed basis.
  match_basis text,
  actor text not null check (length(trim(actor)) > 0),
  rationale text not null check (length(trim(rationale)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists recruiting_lead_workforce_link_decisions_lead_idx
  on recruiting_lead_workforce_link_decisions (recruiting_lead_id, created_at desc);
create index if not exists recruiting_lead_workforce_link_decisions_member_idx
  on recruiting_lead_workforce_link_decisions (workforce_member_id, created_at desc);

alter table recruiting_lead_workforce_link_decisions enable row level security;
revoke all on recruiting_lead_workforce_link_decisions from public, anon, authenticated;
grant all on recruiting_lead_workforce_link_decisions to service_role;

-- Confirms a recruiting-lead-to-workforce-member match: sets the
-- already-existing workforce_members.source_recruiting_lead_id (the
-- structural link this migration finally starts writing) and transitions
-- recruiting_leads.status to 'hired' (an existing, already-supported
-- terminal status — no new vocabulary needed) — both in the same
-- transaction as the audit row, so the link and the status transition can
-- never exist independently of each other or of their own history.
--
-- Idempotent against re-confirmation of the same pair (harmless — the
-- workforce_members update is a no-op if already set to the same value,
-- and a fresh audit row is still written, which is correct: a
-- re-confirmation is itself a real event worth auditing, e.g. after a
-- rejected decision is reconsidered).
create or replace function confirm_recruiting_lead_workforce_link(
  p_recruiting_lead_id uuid,
  p_workforce_member_id uuid,
  p_match_basis text,
  p_actor text,
  p_rationale text
)
returns recruiting_lead_workforce_link_decisions
language plpgsql
set search_path = public
as $$
declare
  v_row recruiting_lead_workforce_link_decisions;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to confirm a recruiting-to-workforce link';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to confirm a recruiting-to-workforce link';
  end if;
  if not exists (select 1 from recruiting_leads where id = p_recruiting_lead_id) then
    raise exception 'recruiting lead % not found', p_recruiting_lead_id;
  end if;
  if not exists (select 1 from workforce_members where id = p_workforce_member_id) then
    raise exception 'workforce member % not found', p_workforce_member_id;
  end if;

  update workforce_members
  set source_recruiting_lead_id = p_recruiting_lead_id
  where id = p_workforce_member_id;

  update recruiting_leads
  set status = 'hired'
  where id = p_recruiting_lead_id;

  insert into recruiting_lead_workforce_link_decisions (
    recruiting_lead_id, workforce_member_id, decision, match_basis, actor, rationale
  ) values (
    p_recruiting_lead_id, p_workforce_member_id, 'confirmed', p_match_basis, p_actor, p_rationale
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function confirm_recruiting_lead_workforce_link(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function confirm_recruiting_lead_workforce_link(uuid, uuid, text, text, text) to service_role;

-- Records that a candidate pair is NOT the same person (or should be
-- looked at again later) without touching either record's real data —
-- the audit row alone is the durable "do not re-surface this pair as
-- unresolved" signal a future review-queue query can check for.
create or replace function record_recruiting_lead_workforce_link_decision(
  p_recruiting_lead_id uuid,
  p_workforce_member_id uuid,
  p_decision text,
  p_match_basis text,
  p_actor text,
  p_rationale text
)
returns recruiting_lead_workforce_link_decisions
language plpgsql
set search_path = public
as $$
declare
  v_row recruiting_lead_workforce_link_decisions;
begin
  if p_decision not in ('rejected', 'deferred') then
    raise exception 'record_recruiting_lead_workforce_link_decision only accepts rejected or deferred — use confirm_recruiting_lead_workforce_link to confirm a match';
  end if;
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to record a recruiting-to-workforce decision';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to record a recruiting-to-workforce decision';
  end if;
  if not exists (select 1 from recruiting_leads where id = p_recruiting_lead_id) then
    raise exception 'recruiting lead % not found', p_recruiting_lead_id;
  end if;
  if not exists (select 1 from workforce_members where id = p_workforce_member_id) then
    raise exception 'workforce member % not found', p_workforce_member_id;
  end if;

  insert into recruiting_lead_workforce_link_decisions (
    recruiting_lead_id, workforce_member_id, decision, match_basis, actor, rationale
  ) values (
    p_recruiting_lead_id, p_workforce_member_id, p_decision, p_match_basis, p_actor, p_rationale
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function record_recruiting_lead_workforce_link_decision(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function record_recruiting_lead_workforce_link_decision(uuid, uuid, text, text, text, text) to service_role;

-- ROLLBACK:
--
--   revoke execute on function confirm_recruiting_lead_workforce_link(uuid, uuid, text, text, text) from service_role;
--   drop function if exists confirm_recruiting_lead_workforce_link(uuid, uuid, text, text, text);
--   revoke execute on function record_recruiting_lead_workforce_link_decision(uuid, uuid, text, text, text, text) from service_role;
--   drop function if exists record_recruiting_lead_workforce_link_decision(uuid, uuid, text, text, text, text);
--   drop table if exists recruiting_lead_workforce_link_decisions;
