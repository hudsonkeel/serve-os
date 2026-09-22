begin;

-- Ask Serve Policy & Texas PAS Intelligence v0.1 — knowledge foundation.
--
-- Two tables: knowledge_documents (source + provenance) and
-- knowledge_sections (retrievable evidence units). See
-- docs/architecture/ASK_SERVE_KNOWLEDGE_LAYER.md for the full design and
-- docs/architecture/ASK_SERVE_KNOWLEDGE_COVERAGE.md for what is and is
-- not currently ingested.
--
-- Two independent status axes on knowledge_documents, per this feature's
-- explicit governance requirement that a document's revision state must
-- never be confused with whether Ask Serve may treat it as authoritative:
--   - source_status: the document's own lifecycle state (current / draft
--     pending review / superseded).
--   - operational_authority: what Ask Serve is allowed to treat the
--     document as (Serve's current operating policy / binding regulation /
--     a supplementary cross-referenced statute / explicitly not binding
--     pending approval). A document can be source_status = 'current' (the
--     latest, actively-maintained copy of something) while still being
--     operational_authority = 'pending_not_binding' — see the EPRP
--     controlled procedure, which is the newest supplied file and also
--     explicitly not yet adopted.
--
-- Full-text search: knowledge_sections.search_vector is a generated
-- tsvector column with a GIN index — standard Postgres FTS, no pgvector,
-- no embeddings. Deterministic §558 cross-referencing (Serve P&P and
-- Texas PAS share the same section numbering) is a first-class column
-- (section_number), not a side effect of FTS ranking.
--
-- Convention alignment with the rest of this codebase (see
-- supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql
-- and 20260902010000_add_requirement_versioning_and_authority.sql):
--   - uuid primary keys, created_at/updated_at on every table.
--   - supersession via a self-referencing FK (supersedes_document_id),
--     never destructive replacement.
--   - RLS enabled on every table; no policies defined — this codebase's
--     established pattern is that all server-side access uses the
--     service-role key (which bypasses RLS unconditionally) and access
--     control is enforced in application code (lib/data/*.ts), not RLS.
--   - status/authority columns are open CHECK-constrained text, not
--     native Postgres enums, so a new allowed value is an additive
--     `drop constraint if exists` + `add constraint` migration.

create table if not exists knowledge_documents (
  id                        uuid primary key default gen_random_uuid(),

  source_type               text not null,
  title                     text not null,
  source_filename           text not null,
  -- Repository-relative path — the deterministic identity ingestion uses
  -- to detect "have I already ingested this file" (see scripts/ingest-ask-serve-knowledge.ts).
  source_path               text not null,

  source_status             text not null,
  operational_authority     text not null,

  -- ISO date the source itself evidences (a P&P footer "Updated:" line, a
  -- Texas Administrative Code "as in effect on" watermark). Null when the
  -- source provides no such date — e.g. the EPRP, which states no
  -- effective date exists yet pending approval. Never populated from a
  -- file's mere upload/print timestamp, which is not the same fact.
  effective_or_updated_date date,

  -- Bare §558-style section number (e.g. "256") this document is
  -- conceptually linked to, for source types that do not themselves
  -- participate in the shared P&P/Texas-PAS section-number namespace
  -- (the EPRP controlled procedure -> "256"; the §558.255 Occupations
  -- Code cross-reference -> "255"). Null for serve_pnp/texas_pas
  -- documents, which link via their sections' own section_number instead.
  related_section_number    text,

  -- Free-form, source-derived provenance not worth its own column (a
  -- de-duplication note, a raw footer/status-field snapshot). Display/
  -- audit only — never read by matching or ranking logic.
  source_metadata           jsonb not null default '{}'::jsonb,

  -- SHA-256 of the raw source file, for idempotent re-ingestion (a
  -- byte-identical file re-run is a no-op, not a duplicate row).
  content_hash              text not null,

  -- NO ACTION, not CASCADE — matches person_documents' established
  -- supersession convention so a superseded document's provenance chain
  -- can never be silently erased when a newer version is ingested later.
  supersedes_document_id    uuid references public.knowledge_documents(id) on delete no action,

  ingested_at               timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint knowledge_documents_source_type_check
    check (source_type in ('serve_pnp', 'texas_pas', 'texas_statute_cross_reference', 'serve_controlled_procedure')),

  constraint knowledge_documents_source_status_check
    check (source_status in ('current', 'draft_pending_review', 'superseded')),

  constraint knowledge_documents_operational_authority_check
    check (operational_authority in ('current_operating_policy', 'binding_regulation', 'supplementary_reference', 'pending_not_binding')),

  constraint knowledge_documents_source_path_not_blank
    check (length(trim(source_path)) > 0),

  constraint knowledge_documents_source_path_unique
    unique (source_path)
);

create index if not exists knowledge_documents_source_type_idx
  on knowledge_documents (source_type, source_status);

alter table knowledge_documents enable row level security;

-- A superseding document must be the same source_type as the document it
-- replaces — same discipline as person_documents'
-- assert_document_supersession_same_subject(), scaled to this table's one
-- dimension that must never drift across a supersession chain.
create or replace function assert_knowledge_document_supersession_same_type()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prior_source_type text;
begin
  if new.supersedes_document_id is not null then
    select source_type into prior_source_type
    from knowledge_documents where id = new.supersedes_document_id;

    if not found then
      raise exception 'supersedes_document_id % does not exist', new.supersedes_document_id;
    end if;

    if prior_source_type <> new.source_type then
      raise exception 'superseding document source_type (%) does not match superseded document source_type (%)',
        new.source_type, prior_source_type;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_knowledge_document_supersession_same_type on knowledge_documents;
create trigger check_knowledge_document_supersession_same_type
  before insert or update on knowledge_documents
  for each row execute function assert_knowledge_document_supersession_same_type();

create or replace function set_knowledge_documents_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_knowledge_documents_updated_at on knowledge_documents;
create trigger set_knowledge_documents_updated_at
  before update on knowledge_documents
  for each row execute function set_knowledge_documents_updated_at();

-- ─── Sections (retrievable evidence units) ─────────────────────────────

create table if not exists knowledge_sections (
  id                 uuid primary key default gen_random_uuid(),
  document_id        uuid not null references public.knowledge_documents(id) on delete cascade,

  -- Bare "245" for serve_pnp/texas_pas (the shared §558 numbering); a
  -- namespaced form for the other two source types ("EPRP-4.1",
  -- "OCC-102.001") so they can never be mistaken for, or accidentally
  -- cross-referenced against, an unrelated §558 number — see
  -- lib/askServe/knowledge/sectionNumbers.ts.
  section_number     text not null,
  -- The owning numbered section's title — constant across every chunk
  -- that shares this document_id + section_number (a sub-chunk's title is
  -- its parent section's title; subsection_label carries its own heading).
  section_title      text not null,
  -- Sub-heading text for a secondary chunk within a large section (e.g.
  -- "Not Hirable" within P&P §245). Null for a section's primary chunk.
  subsection_label   text,
  -- 0 for a section's primary/lead chunk; 1.. for subsequent sub-chunks
  -- of the SAME document_id + section_number.
  chunk_index        integer not null default 0,
  -- Position within the source document — stable ordering / context
  -- reconstruction, not guaranteed contiguous across sections.
  sort_order         integer not null default 0,

  body_text          text not null,

  -- Standard Postgres full-text search — no pgvector/embeddings. Title
  -- and sub-heading are weighted above body text so a section whose
  -- heading matches the question ranks above one that merely contains an
  -- incidental word match in a long body.
  search_vector      tsvector generated always as (
    setweight(to_tsvector('english', coalesce(section_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(subsection_label, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'C')
  ) stored,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint knowledge_sections_section_number_not_blank
    check (length(trim(section_number)) > 0),

  constraint knowledge_sections_body_text_not_blank
    check (length(trim(body_text)) > 0),

  -- Re-running ingestion for the same document upserts by this natural
  -- key rather than duplicating rows.
  constraint knowledge_sections_unique_chunk
    unique (document_id, section_number, chunk_index)
);

create index if not exists knowledge_sections_search_vector_idx
  on knowledge_sections using gin (search_vector);

-- Deterministic cross-reference lookups ("find every section numbered
-- 245, across every source type") — the other half of retrieval, see
-- lib/askServe/retrieval.ts.
create index if not exists knowledge_sections_section_number_idx
  on knowledge_sections (section_number);

alter table knowledge_sections enable row level security;

create or replace function set_knowledge_sections_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_knowledge_sections_updated_at on knowledge_sections;
create trigger set_knowledge_sections_updated_at
  before update on knowledge_sections
  for each row execute function set_knowledge_sections_updated_at();

-- ─── Grants ─────────────────────────────────────────────────────────────
-- This is server-side knowledge infrastructure only (no client-facing
-- table access in this slice) — same service-role-only pattern as every
-- other table in this codebase.
revoke all on knowledge_documents from public, anon, authenticated;
grant all on knowledge_documents to service_role;

revoke all on knowledge_sections from public, anon, authenticated;
grant all on knowledge_sections to service_role;

commit;
