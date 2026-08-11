-- Assessment-to-Client Operationalization — canonical assessment intelligence layer.
--
-- Scope: strictly additive. No column, constraint, trigger, or row on `residents`,
-- `relationships`, `person_vendor_identity_links`, `axiscare_client_dispositions`, or any
-- other pre-existing table is altered, EXCEPT one widened CHECK constraint on
-- `intake_assessment_sessions.status` (adds 'operationalized' to the existing lifecycle
-- vocabulary — loosening an existing constraint, never replacing it, matching this
-- repository's established discipline for constraint edits).
--
-- Builds on the capture layer from 20260830000000_create_serve_intake_engine_foundation.sql
-- (intake_assessment_sessions, intake_sources, intake_handoff_codes) — completes it with the
-- transcript-segment table its own design always anticipated, then adds a genuinely new
-- assessment-intelligence layer on top, deliberately prefixed `assessment_` (not `intake_`)
-- to avoid colliding with either existing `intake_`-prefixed system (the website-form Intake
-- Intelligence Engine, and the voice-capture foundation itself) — see
-- docs/architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md.
--
-- Conventions matched throughout, consistent with every other migration in this repository:
--   - RLS enabled, zero policies (service_role bypasses RLS by design; real enforcement is
--     application/RPC-layer).
--   - Governed, atomic, audit-relevant actions go through a revoke-from-public,
--     service_role-only RPC. Machine-generated evidence (draft facts, decisions, outputs) is
--     written directly by server code via the service-role client, matching how
--     intake_sources/intake_assessment_sessions are already written.
--   - Each table owns its own `set_updated_at`-style trigger function.

-- ============================================================================
-- Widen intake_assessment_sessions.status — additive only
-- ============================================================================
-- Adds 'operationalized' (approved AND the client-conversion/AxisCare-preview step has run)
-- to the existing lifecycle vocabulary. The constraint is dropped and recreated with a
-- superset of its previous values — no existing row's status becomes invalid.
--
-- The original migration (20260830000000) declared this as an inline column-level `check`,
-- so its actual name is whatever Postgres auto-generated — not safely guessable. Rather than
-- assume the default `{table}_{column}_check` naming convention held (a wrong guess would
-- make `drop constraint if exists <guessed name>` silently no-op, leaving the OLD constraint
-- active alongside a NEW one — both would then apply, and 'operationalized' would still be
-- silently rejected), find and drop it dynamically by inspecting its actual definition.

do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'intake_assessment_sessions'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%'
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.intake_assessment_sessions drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_status_check
  check (status in ('recording', 'processing', 'draft', 'needs_review', 'approved', 'amended', 'operationalized'));

-- ============================================================================
-- intake_transcript_segments — completes the capture layer (empty until a transcription
-- pipeline exists; the paste-transcript dev/validation path never writes here, only to
-- intake_sources.transcript_text directly — see architecture doc §3A)
-- ============================================================================

create table if not exists public.intake_transcript_segments (
  id uuid not null primary key default gen_random_uuid(),
  source_id uuid not null references public.intake_sources(id) on delete cascade,
  speaker text,
  start_time numeric,
  end_time numeric,
  text text not null,
  is_final boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_intake_transcript_segments_source_id
  on public.intake_transcript_segments(source_id);

alter table public.intake_transcript_segments enable row level security;

grant select, insert on public.intake_transcript_segments to service_role;

-- ============================================================================
-- assessment_draft_facts — machine-derived candidates, evidence-linked, never trusted
-- ============================================================================
-- assertion_state and collection_method are independent axes (a fact's truth-status and how
-- Serve learned it are never conflated into one enum) — the same epistemic model designed and
-- validated for the Serve Intake Engine PWA, ported here since this is now the canonical home
-- for it. Notably absent: 'not_discussed' (a topic never raised has no row at all — never a
-- fact saying so) and 'deferred' as an assertion_state (postponement is a conversation-level
-- concept, not a claim about a value — out of scope for this slice's exception-oriented review
-- UI, which has no live coverage-prompting to defer against yet).

create table if not exists public.assessment_draft_facts (
  id uuid not null primary key default gen_random_uuid(),
  assessment_session_id uuid not null references public.intake_assessment_sessions(id) on delete cascade,
  source_id uuid references public.intake_sources(id),
  source_segment_id uuid references public.intake_transcript_segments(id),
  domain text not null,
  field_path text not null,
  value jsonb,
  assertion_state text not null
    check (assertion_state in ('confirmed_yes', 'confirmed_no', 'uncertain', 'conflicting', 'not_applicable')),
  collection_method text
    check (collection_method is null or collection_method in ('observed', 'reported')),
  reporter text,
  evidence text,
  confidence text not null default 'none'
    check (confidence in ('none', 'low', 'medium', 'high')),
  extraction_run_ref text,
  model_version text,
  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_draft_facts_session_id
  on public.assessment_draft_facts(assessment_session_id);
create index if not exists idx_assessment_draft_facts_field_path
  on public.assessment_draft_facts(field_path);

alter table public.assessment_draft_facts enable row level security;

grant select, insert on public.assessment_draft_facts to service_role;

-- ============================================================================
-- assessment_fact_conflicts — always draft-vs-draft, real FKs (not a polymorphic reference —
-- a single Postgres FK cannot target one of two tables; new evidence vs. an already-approved
-- fact is handled by the ordinary review-and-supersede flow instead, never this table)
-- ============================================================================

create table if not exists public.assessment_fact_conflicts (
  id uuid not null primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id),
  field_path text not null,
  fact_a_draft_id uuid not null references public.assessment_draft_facts(id),
  fact_b_draft_id uuid not null references public.assessment_draft_facts(id) check (fact_b_draft_id <> fact_a_draft_id),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution_note text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_fact_conflicts_resident_id
  on public.assessment_fact_conflicts(resident_id);

alter table public.assessment_fact_conflicts enable row level security;

grant select, insert, update on public.assessment_fact_conflicts to service_role;

-- ============================================================================
-- assessment_approved_facts — genuinely immutable, append-only, resident-scoped (not
-- session-scoped — a fact survives repeat assessments). A correction never updates or
-- deletes the prior row; it inserts a new row whose supersedes_fact_id points backward.
-- ============================================================================

create table if not exists public.assessment_approved_facts (
  id uuid not null primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id),
  originating_assessment_session_id uuid not null references public.intake_assessment_sessions(id),
  field_path text not null,
  value jsonb,
  assertion_state text not null
    check (assertion_state in ('confirmed_yes', 'confirmed_no', 'uncertain', 'conflicting', 'not_applicable')),
  collection_method text
    check (collection_method is null or collection_method in ('observed', 'reported')),
  reporter text,
  evidence text,
  confidence text not null default 'none'
    check (confidence in ('none', 'low', 'medium', 'high')),
  source_draft_fact_id uuid references public.assessment_draft_facts(id),
  supersedes_fact_id uuid references public.assessment_approved_facts(id),
  approved_by text not null check (approved_by <> ''),
  approved_at timestamptz not null default now(),
  rationale text,
  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_approved_facts_resident_id
  on public.assessment_approved_facts(resident_id);
create index if not exists idx_assessment_approved_facts_field_path
  on public.assessment_approved_facts(field_path);

alter table public.assessment_approved_facts enable row level security;

grant select, insert on public.assessment_approved_facts to service_role;

-- ============================================================================
-- assessment_decisions — DECISIONS layer (service/pricing/AxisCare-readiness reasoning),
-- explainable, versioned, never itself treated as a fact
-- ============================================================================

create table if not exists public.assessment_decisions (
  id uuid not null primary key default gen_random_uuid(),
  assessment_session_id uuid not null references public.intake_assessment_sessions(id) on delete cascade,
  decision_type text not null
    check (decision_type in ('service_recommendation', 'pricing', 'axiscare_readiness')),
  input_fact_ids jsonb not null default '[]'::jsonb,
  output jsonb not null default '{}'::jsonb,
  rationale text,
  catalog_version text,
  rules_version text,
  human_override jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_decisions_session_id
  on public.assessment_decisions(assessment_session_id);

alter table public.assessment_decisions enable row level security;

grant select, insert, update on public.assessment_decisions to service_role;

-- ============================================================================
-- assessment_outputs — ACTIONS layer's generated artifacts. AxisCare/Cinch outputs here are
-- always previews; nothing in this schema performs a vendor write. status never reaches
-- "sent" — sending/submission is a manual, external action outside this schema.
-- ============================================================================

create table if not exists public.assessment_outputs (
  id uuid not null primary key default gen_random_uuid(),
  assessment_session_id uuid not null references public.intake_assessment_sessions(id) on delete cascade,
  output_type text not null
    check (output_type in ('internal_summary', 'client_email', 'proposal', 'axiscare_payload_preview', 'cinch_projection')),
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  generated_at timestamptz not null default now(),
  generated_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_outputs_session_id
  on public.assessment_outputs(assessment_session_id);

alter table public.assessment_outputs enable row level security;

grant select, insert, update on public.assessment_outputs to service_role;

-- ============================================================================
-- approve_assessment_session — the one governed, atomic, audit-relevant RPC this migration
-- adds. Bulk-inserts a reviewer-reconciled set of approved facts (which may include manual
-- corrections/overrides — those are just facts with a human as the reporter and no
-- source_draft_fact_id) and advances the session to 'approved', in one transaction. Every
-- individual approved-fact row still carries its own approved_by/approved_at; the actor
-- parameter here additionally becomes the resident_timeline entry's actor for this session's
-- approval event.
-- ============================================================================

create or replace function public.approve_assessment_session(
  p_assessment_session_id uuid,
  p_actor text,
  p_approved_facts jsonb,
  p_rationale text default null
)
returns setof public.assessment_approved_facts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resident_id uuid;
  v_fact jsonb;
  v_inserted public.assessment_approved_facts;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'actor is required';
  end if;

  select resident_id into v_resident_id
  from public.intake_assessment_sessions
  where id = p_assessment_session_id;

  if v_resident_id is null then
    raise exception 'assessment session % not found', p_assessment_session_id;
  end if;

  if p_approved_facts is null or jsonb_typeof(p_approved_facts) <> 'array' then
    raise exception 'p_approved_facts must be a JSON array';
  end if;

  for v_fact in select * from jsonb_array_elements(p_approved_facts)
  loop
    insert into public.assessment_approved_facts (
      resident_id, originating_assessment_session_id, field_path, value,
      assertion_state, collection_method, reporter, evidence, confidence,
      source_draft_fact_id, supersedes_fact_id, approved_by, rationale
    )
    values (
      v_resident_id,
      p_assessment_session_id,
      v_fact->>'field_path',
      v_fact->'value',
      v_fact->>'assertion_state',
      v_fact->>'collection_method',
      v_fact->>'reporter',
      v_fact->>'evidence',
      coalesce(v_fact->>'confidence', 'none'),
      nullif(v_fact->>'source_draft_fact_id', '')::uuid,
      nullif(v_fact->>'supersedes_fact_id', '')::uuid,
      p_actor,
      coalesce(v_fact->>'rationale', p_rationale)
    )
    returning * into v_inserted;

    return next v_inserted;
  end loop;

  update public.intake_assessment_sessions
  set status = 'approved'
  where id = p_assessment_session_id;

  insert into public.resident_timeline (
    resident_id, event_type, event_title, event_description, source, created_by, system_generated
  ) values (
    v_resident_id, 'profile_updated', 'Assessment approved',
    coalesce(p_rationale, 'Assessment facts reviewed and approved.'), 'assessment_intelligence', p_actor, false
  );

  return;
end;
$$;

revoke all on function public.approve_assessment_session(uuid, text, jsonb, text) from public;
revoke all on function public.approve_assessment_session(uuid, text, jsonb, text) from anon;
revoke all on function public.approve_assessment_session(uuid, text, jsonb, text) from authenticated;
grant execute on function public.approve_assessment_session(uuid, text, jsonb, text) to service_role;
