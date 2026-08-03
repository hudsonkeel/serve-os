begin;

-- Workforce Intelligence Phase 1 — Caregiver Profiles & Registry Evidence.
-- See docs/intelligence/SERVE_HUMAN_LIFECYCLE_ONTOLOGY.md Part 1/4.4 and
-- docs/design/WORKFORCE_OPERATIONS_ASSISTANT.md §8's own note that its
-- domain-scoped evidence tables are "deliberately shaped to be structurally
-- identical to the eventual shared primitives so they can migrate into a
-- shared persistence layer later with a rename, not a redesign."
--
-- This migration builds that shared layer now, generalizing the proven
-- recruiting_lead_vendor_identities pattern (7-tier match ladder, human-
-- confirmation-required, hard-stop-on-mismatch) into a polymorphic,
-- platform-owned form. recruiting_lead_vendor_identities itself is left
-- completely untouched — proven, in production, orthogonal to this work.
--
-- Platform hierarchy this migration establishes:
--   Subject -> Requirement Set -> Requirements -> Evidence -> Verification
--     -> Compliance Status (lib/compliance/requirementSetStatus.ts, not SQL)
--     -> Domain Interpretation (lib/workforce/registryReadiness.ts, etc.)
--
-- Polymorphic subject_type/subject_id (no real FK — matches this codebase's
-- existing relationship_timeline.source_type/source_record_id precedent)
-- lets person_vendor_identity_links / person_documents / person_evidence
-- serve 'workforce_member' now and other person domains later without a
-- redesign. Only one subject_type value is valid today; adding another is
-- always a follow-up `alter table ... drop/add constraint` migration plus a
-- new branch in assert_valid_person_subject() below — both travel together,
-- by convention, so the two can never drift out of sync.

-- ─── workforce_members: allow an AxisCare-only identity ───────────────────
-- Most/all AxisCare caregivers being synced were hired before Serve OS's
-- recruiting pipeline existed, or applied via Apploi directly (which today
-- never creates a recruiting_leads row — see
-- docs/design/WORKFORCE_OPERATIONS_ASSISTANT.md §1). The original NOT NULL
-- FK made it structurally impossible to create a workforce_members row for
-- them. Existing rows are unaffected — they already all have a value.
alter table workforce_members alter column source_recruiting_lead_id drop not null;

-- ─── Requirement Sets ──────────────────────────────────────────────────────
-- Named, reusable collections of Requirements — e.g. "Employee Record
-- Audit," "New Hire," "State Survey," "QAPI Registry Evidence." Mirrors real
-- checklist documents the organization already uses. Only one set is
-- populated by this migration (see seed data below); the structure supports
-- more without a schema change.
create table if not exists requirement_sets (
  id           uuid primary key default gen_random_uuid(),
  set_code     text not null unique,
  name         text not null,
  description  text,
  category     text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint requirement_sets_set_code_not_blank
    check (length(trim(set_code)) > 0)
);

alter table requirement_sets enable row level security;

-- ─── Requirements (platform-owned reference data) ─────────────────────────
create table if not exists person_requirements (
  id                     uuid primary key default gen_random_uuid(),
  requirement_code       text not null unique,
  name                   text not null,
  description            text,
  -- Open text, not a closed enum — new requirement categories (credential,
  -- training, etc.) are new rows, never a schema change.
  category               text not null,
  requires_document      boolean not null default true,
  requires_verification  boolean not null default true,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint person_requirements_requirement_code_not_blank
    check (length(trim(requirement_code)) > 0)
);

alter table person_requirements enable row level security;

create table if not exists requirement_set_members (
  id                  uuid primary key default gen_random_uuid(),
  requirement_set_id  uuid not null references public.requirement_sets(id),
  requirement_id      uuid not null references public.person_requirements(id),
  is_required         boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),

  constraint requirement_set_members_unique
    unique (requirement_set_id, requirement_id)
);

create index if not exists requirement_set_members_set_idx
  on requirement_set_members (requirement_set_id, sort_order);

alter table requirement_set_members enable row level security;

-- ─── Vendor Identity Links (platform-owned, polymorphic subject) ──────────
-- Generalizes recruiting_lead_vendor_identities: same match ladder, same
-- human-confirmation-required discipline, plus a persisted review lifecycle
-- (proposed/confirmed/rejected/deferred) so a not-yet-existing subject can
-- be proposed before it exists — a case recruiting_lead_vendor_identities
-- never needed, since a recruiting_leads row always already exists before
-- any vendor collector runs.
create table if not exists person_vendor_identity_links (
  id                    uuid primary key default gen_random_uuid(),

  subject_type          text not null,
  -- Null while status = 'proposed' and no existing subject has been
  -- matched yet (i.e. "propose a brand-new profile"). Set exactly once,
  -- atomically with status -> 'confirmed'.
  subject_id            uuid,

  source_system         text not null,
  vendor_record_id      text not null,
  vendor_display_name   text,

  match_method          text not null,
  match_confidence      text not null,

  status                text not null default 'proposed',

  -- Allowlisted snapshot of source-system fields approved for storage —
  -- never the raw vendor response. See lib/workforce/axiscareFieldAllowlist.ts.
  approved_source_data  jsonb not null default '{}'::jsonb,
  last_synced_at        timestamptz not null default now(),

  resolved_by           text,
  resolved_at           timestamptz,
  resolution_rationale  text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint person_vendor_identity_links_subject_type_check
    check (subject_type in ('workforce_member')),

  constraint person_vendor_identity_links_match_method_check
    check (match_method in (
      'existing_linkage', 'vendor_id', 'verified_email', 'verified_phone',
      'verified_email_or_phone_plus_name', 'normalized_name_plus_attribute',
      'name_similarity_pending_review'
    )),

  constraint person_vendor_identity_links_match_confidence_check
    check (match_confidence in ('high', 'medium', 'low')),

  constraint person_vendor_identity_links_status_check
    check (status in ('proposed', 'confirmed', 'rejected', 'deferred')),

  -- Bidirectional, same discipline as every other closure-field check in
  -- this codebase: 'proposed' has no resolution yet; 'confirmed' requires a
  -- subject and a named actor; 'rejected'/'deferred' require a named actor
  -- and a stated rationale (never a silent decision).
  constraint person_vendor_identity_links_resolution_check
    check (
      (status = 'proposed' and resolved_by is null and resolved_at is null)
      or (status = 'confirmed' and subject_id is not null and resolved_by is not null and resolved_at is not null)
      or (status in ('rejected', 'deferred') and resolved_by is not null and resolved_at is not null
          and resolution_rationale is not null and length(trim(resolution_rationale)) > 0)
    ),

  -- One link row per vendor record, re-synced in place, never duplicated.
  constraint person_vendor_identity_links_unique_vendor_record
    unique (source_system, vendor_record_id)
);

-- One confirmed link per subject per source system — partial (only applies
-- once subject_id is actually set, i.e. status = 'confirmed').
create unique index if not exists person_vendor_identity_links_one_confirmed_per_subject_idx
  on person_vendor_identity_links (subject_type, subject_id, source_system)
  where subject_id is not null;

create index if not exists person_vendor_identity_links_status_idx
  on person_vendor_identity_links (subject_type, status);

alter table person_vendor_identity_links enable row level security;

-- ─── Documents (platform-owned, polymorphic subject) ──────────────────────
create table if not exists person_documents (
  id                      uuid primary key default gen_random_uuid(),

  subject_type            text not null,
  subject_id              uuid not null,

  storage_bucket          text not null,
  storage_path            text not null,
  original_filename       text not null,
  document_type           text not null,
  mime_type               text,
  file_size_bytes         bigint,
  document_date           date,

  source_system           text not null default 'manual_upload',
  uploaded_by              text not null,
  uploaded_at              timestamptz not null default now(),

  is_sensitive             boolean not null default true,
  status                   text not null default 'active',
  checksum                 text,

  -- NO ACTION, not CASCADE — provenance-preserving, matches Relationship
  -- Intelligence's established convention (Insight/Commitment/Open Loop's
  -- FKs back to their source Interaction) so a superseded document's chain
  -- can never be silently erased.
  supersedes_document_id   uuid references public.person_documents(id) on delete no action,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint person_documents_subject_type_check
    check (subject_type in ('workforce_member')),

  constraint person_documents_document_type_not_blank
    check (length(trim(document_type)) > 0),

  constraint person_documents_status_check
    check (status in ('active', 'superseded')),

  constraint person_documents_uploaded_by_not_blank
    check (length(trim(uploaded_by)) > 0)
);

create index if not exists person_documents_subject_idx
  on person_documents (subject_type, subject_id, document_type);

alter table person_documents enable row level security;

-- A superseding document must belong to the same subject as the document
-- it replaces — structurally prevents one caregiver's corrected upload
-- from ever being recorded as replacing a different caregiver's document.
create or replace function assert_document_supersession_same_subject()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prior_subject_type text;
  prior_subject_id uuid;
begin
  if new.supersedes_document_id is not null then
    select subject_type, subject_id into prior_subject_type, prior_subject_id
    from person_documents where id = new.supersedes_document_id;

    if prior_subject_type is null then
      raise exception 'supersedes_document_id % does not exist', new.supersedes_document_id;
    end if;

    if prior_subject_type <> new.subject_type or prior_subject_id <> new.subject_id then
      raise exception 'superseding document subject (%, %) does not match superseded document subject (%, %)',
        new.subject_type, new.subject_id, prior_subject_type, prior_subject_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_supersession_subject on person_documents;
create trigger check_supersession_subject
  before insert or update on person_documents
  for each row execute function assert_document_supersession_same_subject();

-- ─── Evidence (platform-owned, polymorphic subject) ───────────────────────
-- The shared record both Workforce Intelligence and the future Background
-- Eligibility engine will read — see docs/governance/workforce/
-- background-eligibility/canonicalization-report.md's own recommendation
-- that NAR/EMR results feed hiring-time classification. One canonical row
-- per registry check; multiple domains interpret it independently.
create table if not exists person_evidence (
  id                      uuid primary key default gen_random_uuid(),

  subject_type            text not null,
  subject_id              uuid not null,

  requirement_id          uuid not null references public.person_requirements(id),
  document_id             uuid references public.person_documents(id) on delete no action,

  verification_status     text not null default 'unverified',
  result                  text,

  source_system           text not null default 'manual_upload',
  performed_at            timestamptz,
  effective_date          date,
  review_due_date         date,
  expiration_date         date,

  entered_by              text not null,
  verified_by             text,
  verified_at             timestamptz,
  notes                   text,

  -- NO ACTION — same provenance-preserving convention as
  -- supersedes_document_id above.
  supersedes_evidence_id  uuid references public.person_evidence(id) on delete no action,

  created_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint person_evidence_subject_type_check
    check (subject_type in ('workforce_member')),

  constraint person_evidence_verification_status_check
    check (verification_status in ('unverified', 'verified', 'rejected', 'superseded', 'expired')),

  constraint person_evidence_result_check
    check (result is null or result in (
      'no_record_returned', 'listed_no_findings', 'listed_with_findings',
      'requires_review', 'unable_to_determine'
    )),

  constraint person_evidence_entered_by_not_blank
    check (length(trim(entered_by)) > 0),

  -- A filename is never proof of a result — verified_by/verified_at are
  -- only ever set together with verification_status = 'verified'.
  constraint person_evidence_verification_fields_check
    check (
      (verification_status = 'verified' and verified_by is not null and verified_at is not null)
      or (verification_status <> 'verified' and verified_by is null and verified_at is null)
    )
);

create index if not exists person_evidence_subject_idx
  on person_evidence (subject_type, subject_id, requirement_id);

alter table person_evidence enable row level security;

-- A superseding evidence row must belong to the same subject AND the same
-- requirement as the row it replaces — narrower than the document check
-- above, since evidence additionally carries a requirement_id a document
-- doesn't. Prevents NAR evidence from ever being recorded as superseding
-- EMR evidence, even for the same caregiver.
create or replace function assert_evidence_supersession_same_subject_and_requirement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prior_subject_type text;
  prior_subject_id uuid;
  prior_requirement_id uuid;
begin
  if new.supersedes_evidence_id is not null then
    select subject_type, subject_id, requirement_id
      into prior_subject_type, prior_subject_id, prior_requirement_id
    from person_evidence where id = new.supersedes_evidence_id;

    if prior_subject_type is null then
      raise exception 'supersedes_evidence_id % does not exist', new.supersedes_evidence_id;
    end if;

    if prior_subject_type <> new.subject_type or prior_subject_id <> new.subject_id then
      raise exception 'superseding evidence subject (%, %) does not match superseded evidence subject (%, %)',
        new.subject_type, new.subject_id, prior_subject_type, prior_subject_id;
    end if;

    if prior_requirement_id <> new.requirement_id then
      raise exception 'superseding evidence requirement (%) does not match superseded evidence requirement (%)',
        new.requirement_id, prior_requirement_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_supersession_subject_and_requirement on person_evidence;
create trigger check_supersession_subject_and_requirement
  before insert or update on person_evidence
  for each row execute function assert_evidence_supersession_same_subject_and_requirement();

-- ─── Subject Integrity Enforcement ─────────────────────────────────────────
-- The polymorphic design trades a real FK for flexibility, so integrity is
-- enforced explicitly rather than left implicit.

create or replace function assert_valid_person_subject(p_subject_type text, p_subject_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_subject_type = 'workforce_member' then
    if not exists (select 1 from workforce_members where id = p_subject_id) then
      raise exception 'subject_id % does not reference an existing workforce_members row', p_subject_id;
    end if;
  else
    raise exception 'unsupported subject_type: %', p_subject_type;
  end if;
end;
$$;

create or replace function person_vendor_identity_links_check_subject()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only enforced once a subject is actually claimed — a 'proposed' row
  -- proposing a brand-new profile legitimately has no subject yet.
  if new.subject_id is not null then
    perform assert_valid_person_subject(new.subject_type, new.subject_id);
  end if;
  return new;
end;
$$;

drop trigger if exists check_subject on person_vendor_identity_links;
create trigger check_subject
  before insert or update on person_vendor_identity_links
  for each row execute function person_vendor_identity_links_check_subject();

create or replace function person_documents_check_subject()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform assert_valid_person_subject(new.subject_type, new.subject_id);
  return new;
end;
$$;

drop trigger if exists check_subject on person_documents;
create trigger check_subject
  before insert or update on person_documents
  for each row execute function person_documents_check_subject();

create or replace function person_evidence_check_subject()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform assert_valid_person_subject(new.subject_type, new.subject_id);
  return new;
end;
$$;

drop trigger if exists check_subject on person_evidence;
create trigger check_subject
  before insert or update on person_evidence
  for each row execute function person_evidence_check_subject();

-- A document and its linked evidence must refer to the same subject —
-- structurally prevents an NAR document ever being attached to evidence
-- about a different caregiver.
create or replace function assert_evidence_document_same_subject()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  doc_subject_type text;
  doc_subject_id uuid;
begin
  if new.document_id is not null then
    select subject_type, subject_id into doc_subject_type, doc_subject_id
    from person_documents where id = new.document_id;

    if doc_subject_type is null then
      raise exception 'linked document_id % does not exist', new.document_id;
    end if;

    if doc_subject_type <> new.subject_type or doc_subject_id <> new.subject_id then
      raise exception 'evidence subject (%, %) does not match linked document subject (%, %)',
        new.subject_type, new.subject_id, doc_subject_type, doc_subject_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_document_subject on person_evidence;
create trigger check_document_subject
  before insert or update on person_evidence
  for each row execute function assert_evidence_document_same_subject();

-- ─── workforce_activity: person-specific timeline (workforce-domain-scoped,
-- by this codebase's existing convention of one timeline table per domain —
-- see resident_timeline/relationship_timeline). Every row requires a real
-- workforce_member_id; nothing is written here for an event that doesn't
-- have one yet (e.g. a proposed-but-unconfirmed identity link) — see
-- lib/workforce/axiscareCaregiverSync.ts for the full reasoning. ───────────
create table if not exists workforce_activity (
  id                  uuid primary key default gen_random_uuid(),

  workforce_member_id uuid not null references public.workforce_members(id),

  event_type          text not null,
  event_title         text not null,
  event_description   text,
  source               text not null,

  system_generated    boolean not null default true,
  created_by           text,
  created_at           timestamptz not null default now(),

  constraint workforce_activity_event_type_check
    check (event_type in (
      'workforce_profile_created',
      'identity_link_confirmed',
      'axiscare_source_data_refreshed',
      'document_uploaded',
      'evidence_created',
      'evidence_verified',
      'evidence_rejected',
      'evidence_superseded'
    )),

  constraint workforce_activity_event_title_not_blank
    check (length(trim(event_title)) > 0)
);

create index if not exists workforce_activity_member_idx
  on workforce_activity (workforce_member_id, created_at desc);

alter table workforce_activity enable row level security;

-- ─── workforce_axiscare_sync_runs: organization-wide sync log, not person-
-- scoped. Counters intentionally differ from the original mission spec —
-- sync itself never creates/updates a workforce_members row directly (only
-- a human confirming a proposed link does that), so profiles_created/
-- profiles_updated would always read zero. See
-- lib/workforce/axiscareCaregiverSync.ts. ──────────────────────────────────
create table if not exists workforce_axiscare_sync_runs (
  id                          uuid primary key default gen_random_uuid(),

  status                      text not null default 'in_progress',
  started_at                  timestamptz not null default now(),
  completed_at                timestamptz,

  records_received            integer not null default 0,
  source_records_refreshed    integer not null default 0,
  source_records_unchanged    integer not null default 0,
  review_candidates_created   integer not null default 0,
  errors                      jsonb not null default '[]'::jsonb,

  initiated_by                text not null,

  constraint workforce_axiscare_sync_runs_status_check
    check (status in ('in_progress', 'success', 'failed', 'partial')),

  constraint workforce_axiscare_sync_runs_initiated_by_not_blank
    check (length(trim(initiated_by)) > 0)
);

create index if not exists workforce_axiscare_sync_runs_started_idx
  on workforce_axiscare_sync_runs (started_at desc);

alter table workforce_axiscare_sync_runs enable row level security;

-- ─── Storage bucket ─────────────────────────────────────────────────────────
-- Named person-documents, not workforce-documents — the evidence layer is
-- platform-owned and will eventually serve recruiting leads and other
-- person domains. Private (public = false); every read goes through a
-- server-generated short-lived signed URL — see lib/workforce/storage.ts.
-- PDF-only, 10 MB limit for this first release.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('person-documents', 'person-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- ─── Atomic RPCs ────────────────────────────────────────────────────────────
-- Everything else (document upload, evidence creation/verification, simple
-- reads) is a plain insert/update via the service-role client from the data
-- layer, matching lib/data/recruitingLeadEvidence.ts's own established
-- convention. Only genuinely multi-row-atomic or invariant-heavy operations
-- get a dedicated RPC, mirroring save_resident_current_needs().

-- The per-caregiver AxisCare sync decision, atomic against concurrent sync
-- runs. Never auto-confirms a link — a first link always requires explicit
-- human confirmation via confirm_person_vendor_identity_link() below,
-- matching the proven recruiting_lead_vendor_identities discipline
-- (decideVendorIdentityAction) verbatim.
create or replace function sync_axiscare_vendor_identity(
  p_vendor_record_id text,
  p_vendor_display_name text,
  p_match_method text,
  p_match_confidence text,
  p_candidate_subject_id uuid,
  p_approved_source_data jsonb
)
returns table (action text, link_id uuid, workforce_member_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_existing person_vendor_identity_links%rowtype;
  v_new_id uuid;
begin
  select * into v_existing
  from person_vendor_identity_links
  where source_system = 'axiscare' and vendor_record_id = p_vendor_record_id
  for update;

  if found and v_existing.status = 'confirmed' then
    if v_existing.approved_source_data = p_approved_source_data then
      update person_vendor_identity_links
      set last_synced_at = now()
      where id = v_existing.id;

      return query select 'unchanged'::text, v_existing.id, v_existing.subject_id;
      return;
    end if;

    update person_vendor_identity_links
    set approved_source_data = p_approved_source_data,
        vendor_display_name = p_vendor_display_name,
        last_synced_at = now()
    where id = v_existing.id;

    return query select 'refreshed'::text, v_existing.id, v_existing.subject_id;
    return;
  end if;

  if found then
    -- proposed / rejected / deferred: a human decision (or an open
    -- proposal awaiting one) already exists for this vendor record.
    -- Sync never overrides it — leave the row untouched.
    return query select 'skipped_existing_decision'::text, v_existing.id, v_existing.subject_id;
    return;
  end if;

  insert into person_vendor_identity_links (
    subject_type, subject_id, source_system, vendor_record_id, vendor_display_name,
    match_method, match_confidence, status, approved_source_data, last_synced_at
  ) values (
    'workforce_member', p_candidate_subject_id, 'axiscare', p_vendor_record_id, p_vendor_display_name,
    p_match_method, p_match_confidence, 'proposed', p_approved_source_data, now()
  )
  returning id into v_new_id;

  return query select 'proposed'::text, v_new_id, p_candidate_subject_id;
end;
$$;

revoke execute on function sync_axiscare_vendor_identity(text, text, text, text, uuid, jsonb) from public;
grant execute on function sync_axiscare_vendor_identity(text, text, text, text, uuid, jsonb) to service_role;

-- Confirms a proposed link. p_subject_id is required — the caller (the
-- workforce-domain server action) resolves or creates the workforce_members
-- row FIRST (workforce_members creation is domain logic, not platform
-- logic) and passes its id here. This function only ever touches
-- person_vendor_identity_links.
create or replace function confirm_person_vendor_identity_link(
  p_link_id uuid,
  p_subject_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to confirm an identity link';
  end if;

  perform assert_valid_person_subject('workforce_member', p_subject_id);

  update person_vendor_identity_links
  set subject_id = p_subject_id,
      status = 'confirmed',
      resolved_by = p_actor,
      resolved_at = now()
  where id = p_link_id and status = 'proposed';

  if not found then
    raise exception 'Identity link % is not in a proposed state', p_link_id;
  end if;
end;
$$;

revoke execute on function confirm_person_vendor_identity_link(uuid, uuid, text) from public;
grant execute on function confirm_person_vendor_identity_link(uuid, uuid, text) to service_role;

create or replace function reject_person_vendor_identity_link(
  p_link_id uuid,
  p_actor text,
  p_rationale text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to reject an identity link';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to reject an identity link';
  end if;

  update person_vendor_identity_links
  set status = 'rejected',
      resolved_by = p_actor,
      resolved_at = now(),
      resolution_rationale = p_rationale
  where id = p_link_id and status = 'proposed';

  if not found then
    raise exception 'Identity link % is not in a proposed state', p_link_id;
  end if;
end;
$$;

revoke execute on function reject_person_vendor_identity_link(uuid, text, text) from public;
grant execute on function reject_person_vendor_identity_link(uuid, text, text) to service_role;

create or replace function defer_person_vendor_identity_link(
  p_link_id uuid,
  p_actor text,
  p_rationale text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to defer an identity link';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'A rationale is required to defer an identity link';
  end if;

  update person_vendor_identity_links
  set status = 'deferred',
      resolved_by = p_actor,
      resolved_at = now(),
      resolution_rationale = p_rationale
  where id = p_link_id and status = 'proposed';

  if not found then
    raise exception 'Identity link % is not in a proposed state', p_link_id;
  end if;
end;
$$;

revoke execute on function defer_person_vendor_identity_link(uuid, text, text) from public;
grant execute on function defer_person_vendor_identity_link(uuid, text, text) to service_role;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on requirement_sets from public, anon, authenticated;
grant all on requirement_sets to service_role;

revoke all on person_requirements from public, anon, authenticated;
grant all on person_requirements to service_role;

revoke all on requirement_set_members from public, anon, authenticated;
grant all on requirement_set_members to service_role;

revoke all on person_vendor_identity_links from public, anon, authenticated;
grant all on person_vendor_identity_links to service_role;

revoke all on person_documents from public, anon, authenticated;
grant all on person_documents to service_role;

revoke all on person_evidence from public, anon, authenticated;
grant all on person_evidence to service_role;

revoke all on workforce_activity from public, anon, authenticated;
grant all on workforce_activity to service_role;

revoke all on workforce_axiscare_sync_runs from public, anon, authenticated;
grant all on workforce_axiscare_sync_runs to service_role;

-- ─── Seed data ──────────────────────────────────────────────────────────────
insert into person_requirements (requirement_code, name, description, category, requires_document, requires_verification)
values
  ('TX_NAR_SEARCH', 'Nurse Aide Registry Search', 'Texas HHSC Nurse Aide Registry (NAR) search evidence.', 'registry_check', true, true),
  ('TX_EMR_SEARCH', 'Employee Misconduct Registry Search', 'Texas HHSC Employee Misconduct Registry (EMR) search evidence.', 'registry_check', true, true)
on conflict (requirement_code) do nothing;

insert into requirement_sets (set_code, name, description, category)
values ('WORKFORCE_REGISTRY_EVIDENCE', 'Workforce Registry Evidence', 'NAR and EMR registry evidence for active caregivers.', 'audit_checklist')
on conflict (set_code) do nothing;

insert into requirement_set_members (requirement_set_id, requirement_id, sort_order)
select rs.id, pr.id, row_number() over (order by pr.requirement_code)
from requirement_sets rs
cross join person_requirements pr
where rs.set_code = 'WORKFORCE_REGISTRY_EVIDENCE'
  and pr.requirement_code in ('TX_NAR_SEARCH', 'TX_EMR_SEARCH')
on conflict (requirement_set_id, requirement_id) do nothing;

commit;
