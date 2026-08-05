begin;

-- Resident Household Detection — Phase 2 of Resident Identity Resolution.
-- Answers a DIFFERENT question than identity resolution: "do these two
-- residents likely share a household?" (same apartment, same phone, same
-- building, shared emergency contact). This table has NO relationship to
-- resident_identity_candidates or resident_merge_events — it is standalone
-- Community Intelligence infrastructure. A pair recorded here is never
-- proposed as a duplicate-identity candidate on that basis alone; see
-- lib/residents/identity/confidenceBands.ts for where that separation is
-- enforced in code.

create table if not exists resident_household_links (
  id                    uuid primary key default gen_random_uuid(),
  resident_id_a         uuid not null references public.residents(id),
  resident_id_b         uuid not null references public.residents(id),
  relationship_hint     text not null,
  evidence              jsonb not null default '[]'::jsonb,
  matching_rule_version text not null,
  detection_run_id      uuid,
  status                text not null default 'inferred',
  confirmed_by          text,
  confirmed_at          timestamptz,
  created_at            timestamptz not null default now(),

  constraint resident_household_links_not_self check (resident_id_a <> resident_id_b),
  -- Always stored smaller-uuid-first (enforced by the inserting RPC, not
  -- just convention) so a lookup never has to check both orderings.
  constraint resident_household_links_ordered check (resident_id_a < resident_id_b),
  constraint resident_household_links_unique unique (resident_id_a, resident_id_b),
  constraint resident_household_links_relationship_hint_check
    check (relationship_hint in ('likely_spouse', 'shared_household')),
  constraint resident_household_links_status_check
    check (status in ('inferred', 'confirmed', 'dismissed')),
  constraint resident_household_links_evidence_is_array_check
    check (jsonb_typeof(evidence) = 'array'),
  constraint resident_household_links_confirmed_fields_check
    check (
      (status = 'inferred' and confirmed_by is null and confirmed_at is null)
      or (status <> 'inferred' and confirmed_by is not null and confirmed_at is not null)
    )
);

create index if not exists resident_household_links_resident_a_idx
  on resident_household_links (resident_id_a);
create index if not exists resident_household_links_resident_b_idx
  on resident_household_links (resident_id_b);

alter table resident_household_links enable row level security;
-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this app.

comment on table resident_household_links is
  'Reusable Community Intelligence infrastructure: co-residency/household relationships inferred from apartment, phone, building, and emergency-contact evidence — never identity evidence. Fully independent of resident_identity_candidates/resident_merge_events by design.';
comment on column resident_household_links.evidence is
  'jsonb array of {signalType, residentIdA, residentIdB, description}. Household evidence only — never counted toward identity confidence.';

-- ─── create_resident_household_links: idempotent bulk insert ────────────
-- Mirrors create_resident_identity_candidates's shape and idempotency
-- style. Skips (rather than duplicating) any pair that already has an
-- inferred/confirmed link; a pair whose only existing link is 'dismissed'
-- is also skipped, since a human already reviewed and rejected it.
create or replace function create_resident_household_links(
  p_detection_run_id uuid,
  p_links jsonb,
  p_actor text
)
returns setof resident_household_links
language plpgsql
set search_path = public
as $$
declare
  v_link jsonb;
  v_resident_a uuid;
  v_resident_b uuid;
  v_ordered_a uuid;
  v_ordered_b uuid;
  v_existing_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to record household links';
  end if;
  if jsonb_typeof(coalesce(p_links, '[]'::jsonb)) <> 'array' then
    raise exception 'links must be a JSON array';
  end if;

  for v_link in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb))
  loop
    v_resident_a := (v_link->'residentIds'->>0)::uuid;
    v_resident_b := (v_link->'residentIds'->>1)::uuid;

    if v_resident_a is null or v_resident_b is null or v_resident_a = v_resident_b then
      raise exception 'Each household link requires exactly two distinct residentIds';
    end if;

    if v_resident_a < v_resident_b then
      v_ordered_a := v_resident_a;
      v_ordered_b := v_resident_b;
    else
      v_ordered_a := v_resident_b;
      v_ordered_b := v_resident_a;
    end if;

    select id into v_existing_id
    from resident_household_links
    where resident_id_a = v_ordered_a and resident_id_b = v_ordered_b
    limit 1;

    if v_existing_id is not null then
      continue;
    end if;

    insert into resident_household_links (
      resident_id_a, resident_id_b, relationship_hint, evidence, matching_rule_version, detection_run_id
    ) values (
      v_ordered_a, v_ordered_b, v_link->>'relationshipHint', coalesce(v_link->'evidence', '[]'::jsonb),
      v_link->>'matchingRuleVersion', p_detection_run_id
    );
  end loop;

  return query
  select * from resident_household_links
  where detection_run_id = p_detection_run_id
  order by created_at asc;
end;
$$;

revoke execute on function create_resident_household_links(uuid, jsonb, text) from public;
grant execute on function create_resident_household_links(uuid, jsonb, text) to service_role;

commit;
