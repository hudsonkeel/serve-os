begin;

-- Recruiting Operational Understanding Engine — persisted Desired State
-- evaluations. See docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md
-- (Revision 2). A Desired State evaluator is itself a Rule/RuleVersion
-- instance (recruiting_lead_rules / recruiting_lead_rule_versions, already
-- created by 20260728000000) — this migration adds only the two tables
-- that record what those evaluators concluded, per lead, per desired
-- state, and which observations supported the conclusion.
--
-- Entirely additive. No change to recruiting_leads. Nothing here ever
-- marks recruiting_leads.status — no function in this migration is
-- capable of it.

create table if not exists recruiting_lead_desired_state_evaluations (
  id                 uuid primary key default gen_random_uuid(),
  recruiting_lead_id uuid not null references public.recruiting_leads(id),
  desired_state_key  text not null,
  rule_version_id    uuid not null references public.recruiting_lead_rule_versions(id),

  status             text not null,
  gaps               jsonb not null default '[]'::jsonb,
  unknown_evidence   jsonb not null default '[]'::jsonb,
  explanation        text not null,

  evaluated_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),

  constraint recruiting_lead_desired_state_evaluations_status_check
    check (status in ('satisfied', 'blocked', 'unknown', 'in_progress', 'not_applicable'))
);

create index if not exists recruiting_lead_desired_state_evaluations_lead_idx
  on recruiting_lead_desired_state_evaluations (recruiting_lead_id, desired_state_key, evaluated_at desc);

-- Evaluation -> Evidence link: which directly-observed rows supported this
-- evaluation. A real join table, same pattern as
-- recruiting_lead_inference_evidence, so the relationship stays queryable
-- and auditable on its own.
create table if not exists recruiting_lead_desired_state_evaluation_evidence (
  evaluation_id  uuid not null references public.recruiting_lead_desired_state_evaluations(id),
  observation_id uuid not null references public.recruiting_lead_observations(id),
  primary key (evaluation_id, observation_id)
);

alter table recruiting_lead_desired_state_evaluations enable row level security;
alter table recruiting_lead_desired_state_evaluation_evidence enable row level security;

revoke all on recruiting_lead_desired_state_evaluations from public, anon, authenticated;
grant all on recruiting_lead_desired_state_evaluations to service_role;

revoke all on recruiting_lead_desired_state_evaluation_evidence from public, anon, authenticated;
grant all on recruiting_lead_desired_state_evaluation_evidence to service_role;

commit;
