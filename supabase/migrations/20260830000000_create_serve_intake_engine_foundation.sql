-- Serve Intake Engine v2 — foundation migration for the first implementation vertical slice.
--
-- Scope: strictly additive. No column, constraint, trigger, or row on `residents` (or any
-- other pre-existing table) is altered. Everything here is new, standalone tables plus
-- governed RPCs, following this repository's established conventions:
--   - RLS enabled, zero policies (real enforcement is application/RPC-layer; service_role
--     bypasses RLS by design, matching every other table in this schema).
--   - Sensitive/atomic operations go through a revoke-from-public, service_role-only RPC
--     rather than raw client-side table writes.
--   - Each table owns its own `set_updated_at`-style trigger function rather than sharing
--     a central one (matching e.g. `resident_connections_set_updated_at()`).
--
-- Scope of this migration matches exactly what the first vertical slice needs (per
-- docs/architecture/phase2-canonical-intake-architecture.md and
-- docs/architecture/phase3-mobile-person-first-architecture.md in the serve-intake-mvp
-- repository): person-first entry (existing resident or new name-only provisional resident),
-- session creation, and audio-source status tracking through upload. Extraction, draft/
-- approved facts, conflicts, decisions, outputs, and topic coverage are Phase 2 §17's
-- proposed migrations for a LATER slice — deliberately not created here.
--
-- NOT YET APPLIED as of authoring. This file is the reviewable migration artifact; it must
-- be run against the Serve OS Supabase project (via the Supabase SQL editor or
-- `supabase db push` once the CLI is linked/authenticated) by someone with dashboard/CLI
-- access before the Intake PWA's server code in this slice can succeed against a real
-- database.
--
-- 2026-08-11 correction (Vertical Slice 2 functional test found this live): all three
-- SECURITY DEFINER functions below were originally `set search_path = public`, which broke
-- create_intake_handoff_code's use of pgcrypto's gen_random_bytes() — Supabase installs
-- extensions into the `extensions` schema by convention, not `public`, so a search_path
-- scoped to `public` alone cannot find it. (gen_random_uuid(), used elsewhere for id
-- defaults, never hit this because it's a PostgreSQL core function, not part of pgcrypto —
-- that's why table creation and id generation worked fine while this did not.) Fixed to
-- `set search_path = public, extensions` on all three functions, including the two that
-- don't currently call an extension function, for consistency and to avoid the same class of
-- bug if one is added later. This is a CREATE OR REPLACE FUNCTION change only — safe to
-- re-run the whole file; nothing about the tables, bucket, or grants changed.

create extension if not exists pgcrypto;

-- ============================================================================
-- Private storage bucket for captured audio
-- ============================================================================
-- Not public. All access (upload, playback) is exclusively via short-lived signed URLs
-- minted server-side (service_role) — never a public bucket URL, matching Phase 2 §21's
-- security requirement. Object paths are opaque (assessment_session_id/chunk index), never
-- derived from a resident's name.

insert into storage.buckets (id, name, public)
values ('intake-audio', 'intake-audio', false)
on conflict (id) do nothing;

-- ============================================================================
-- intake_assessment_sessions
-- ============================================================================

create table if not exists public.intake_assessment_sessions (
  id uuid not null primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id),
  status text not null default 'recording'
    check (status in ('recording', 'processing', 'draft', 'needs_review', 'approved', 'amended')),
  initiated_from text not null
    check (initiated_from in ('existing_person', 'new_provisional')),
  started_by text not null check (started_by <> ''),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  community_name_snapshot text,
  consent_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_intake_assessment_sessions_resident_id
  on public.intake_assessment_sessions(resident_id);

create or replace function intake_assessment_sessions_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.intake_assessment_sessions;
create trigger set_updated_at
  before update on public.intake_assessment_sessions
  for each row execute function intake_assessment_sessions_set_updated_at();

alter table public.intake_assessment_sessions enable row level security;

grant select, insert, update on public.intake_assessment_sessions to service_role;

-- ============================================================================
-- intake_sources
-- ============================================================================
-- Carries forward the source-agnostic raw_text/transcript_text/source_payload design from
-- the legacy Intake application's intake_sources table (confirmed reusable in Phase 1
-- archaeology) — this slice only ever writes source_type='live_audio_stream' rows and
-- leaves raw_text/transcript_text null (no transcription in this slice); source_payload
-- carries the opaque private-storage identifier, mime type, and duration once known.

create table if not exists public.intake_sources (
  id uuid not null primary key default gen_random_uuid(),
  assessment_session_id uuid not null references public.intake_assessment_sessions(id) on delete cascade,
  source_type text not null default 'live_audio_stream'
    check (source_type in (
      'pasted_transcript', 'uploaded_txt', 'uploaded_pdf', 'uploaded_docx',
      'uploaded_audio', 'live_audio_stream', 'manual_notes'
    )),
  raw_text text,
  transcript_text text,
  source_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'uploading', 'uploaded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_intake_sources_assessment_session_id
  on public.intake_sources(assessment_session_id);

create or replace function intake_sources_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.intake_sources;
create trigger set_updated_at
  before update on public.intake_sources
  for each row execute function intake_sources_set_updated_at();

alter table public.intake_sources enable row level security;

grant select, insert, update on public.intake_sources to service_role;

-- ============================================================================
-- intake_handoff_codes
-- ============================================================================
-- Single-use, opaque handoff from a Serve OS person profile's "Capture Assessment" action
-- into the Intake PWA. `code` carries no embedded claims — it is meaningless without this
-- table. See docs/architecture/phase3-mobile-person-first-architecture.md §2 (2026-08-10
-- hardening revision) for the full rationale: URL-carried signed claims were rejected in
-- favor of this design specifically because URLs leak via history/logs/referrers.

create table if not exists public.intake_handoff_codes (
  id uuid not null primary key default gen_random_uuid(),
  code text not null unique,
  resident_id uuid not null references public.residents(id),
  actor text not null check (actor <> ''),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_intake_handoff_codes_code on public.intake_handoff_codes(code);

alter table public.intake_handoff_codes enable row level security;

-- No direct client access at all, in either direction — issuance and redemption both go
-- through the RPCs below. service_role itself only needs table privileges because the RPCs
-- execute as their caller under `security invoker` semantics (default); the RPCs are what
-- actually get invoked by Serve OS's and Intake's server code respectively.
grant select, insert, update on public.intake_handoff_codes to service_role;

-- ----------------------------------------------------------------------------
-- create_intake_handoff_code
-- ----------------------------------------------------------------------------
-- Called by Serve OS's server action when a user clicks "Capture Assessment" on an existing
-- person's profile. Generates a high-entropy opaque code (64 hex characters from 32 random
-- bytes) — not a JWT, not signed claims, carries no information on its own.

create or replace function public.create_intake_handoff_code(
  p_resident_id uuid,
  p_actor text,
  p_ttl_minutes integer default 5
)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_expires_at timestamptz;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'actor is required';
  end if;

  if not exists (select 1 from public.residents r where r.id = p_resident_id) then
    raise exception 'resident_id % does not exist', p_resident_id;
  end if;

  v_code := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + make_interval(mins => greatest(coalesce(p_ttl_minutes, 5), 1));

  insert into public.intake_handoff_codes (code, resident_id, actor, expires_at)
  values (v_code, p_resident_id, p_actor, v_expires_at);

  return query select v_code, v_expires_at;
end;
$$;

revoke all on function public.create_intake_handoff_code(uuid, text, integer) from public;
revoke all on function public.create_intake_handoff_code(uuid, text, integer) from anon;
revoke all on function public.create_intake_handoff_code(uuid, text, integer) from authenticated;
grant execute on function public.create_intake_handoff_code(uuid, text, integer) to service_role;

-- ----------------------------------------------------------------------------
-- redeem_intake_handoff_code
-- ----------------------------------------------------------------------------
-- Called by the Intake PWA's server when the handoff link is opened. Atomic single-use
-- redemption: the UPDATE's WHERE clause (redeemed_at is null and expires_at > now()) and
-- RETURNING clause together make "check, then use" a single statement, closing the race
-- window a separate SELECT-then-UPDATE would leave open, and guaranteeing the same code can
-- never be redeemed twice even under concurrent requests.

create or replace function public.redeem_intake_handoff_code(p_code text)
returns table (resident_id uuid, actor text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resident_id uuid;
  v_actor text;
begin
  update public.intake_handoff_codes
  set redeemed_at = now()
  where intake_handoff_codes.code = p_code
    and redeemed_at is null
    and expires_at > now()
  returning intake_handoff_codes.resident_id, intake_handoff_codes.actor
  into v_resident_id, v_actor;

  if v_resident_id is null then
    raise exception 'invalid_or_expired_code';
  end if;

  return query select v_resident_id, v_actor;
end;
$$;

revoke all on function public.redeem_intake_handoff_code(text) from public;
revoke all on function public.redeem_intake_handoff_code(text) from anon;
revoke all on function public.redeem_intake_handoff_code(text) from authenticated;
grant execute on function public.redeem_intake_handoff_code(text) to service_role;

-- ============================================================================
-- create_provisional_resident_from_intake
-- ============================================================================
-- Supports the "+ New Prospect: name only" path (docs/architecture/
-- phase2-canonical-intake-architecture.md §3.3): creates a minimal residents row tagged
-- source_system='serve_intake', immediately eligible for Serve OS's existing identity-
-- resolution machinery like any other resident row. Deliberately sets ONLY the columns this
-- migration's authors could confirm exist (via lib/supabase/types.ts's Resident interface,
-- per Phase 2 §2.1's documented finding that residents' true, complete column/constraint
-- list cannot be independently verified from either repository) — every other column is
-- left to whatever default the table already has. This RPC has not been exercised against
-- the live table (this migration has not been applied yet); it should be smoke-tested before
-- being relied on in production, and column coverage revisited once real schema access is
-- available (Phase 2 §19, open item 2).

create or replace function public.create_provisional_resident_from_intake(
  p_display_name text,
  p_actor text
)
returns public.residents
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_last_space int;
  v_resident public.residents;
begin
  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'display name is required';
  end if;

  if p_actor is null or p_actor = '' then
    raise exception 'actor is required';
  end if;

  v_display_name := btrim(regexp_replace(p_display_name, '\s+', ' ', 'g'));
  v_last_space := length(v_display_name) - length(regexp_replace(v_display_name, '^.*\s', ''));

  if v_last_space = 0 then
    -- single token, e.g. "Cher" — no last name given
    v_first_name := v_display_name;
    v_last_name := null;
  else
    v_first_name := substring(v_display_name from 1 for v_last_space - 1);
    v_last_name := substring(v_display_name from v_last_space + 1);
  end if;

  insert into public.residents (first_name, last_name, display_name, source_system)
  values (v_first_name, v_last_name, v_display_name, 'serve_intake')
  returning * into v_resident;

  return v_resident;
end;
$$;

revoke all on function public.create_provisional_resident_from_intake(text, text) from public;
revoke all on function public.create_provisional_resident_from_intake(text, text) from anon;
revoke all on function public.create_provisional_resident_from_intake(text, text) from authenticated;
grant execute on function public.create_provisional_resident_from_intake(text, text) to service_role;
