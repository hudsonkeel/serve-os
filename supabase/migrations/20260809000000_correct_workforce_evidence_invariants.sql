begin;

-- ============================================================
-- Workforce Intelligence Phase 1 corrective migration
--
-- 1. Restrict vendor-identity uniqueness to confirmed links.
-- 2. Separate evidence verification from lifecycle status.
-- 3. Prevent cross-subject or self-referential supersession.
-- ============================================================


-- ─── 1. Confirmed-link uniqueness ───────────────────────────

drop index if exists
  person_vendor_identity_links_one_confirmed_per_subject_idx;

create unique index
  person_vendor_identity_links_one_confirmed_per_subject_idx
on public.person_vendor_identity_links (
  subject_type,
  subject_id,
  source_system
)
where status = 'confirmed'
  and subject_id is not null;


-- ─── 2. Separate verification from lifecycle ────────────────

alter table public.person_evidence
  add column if not exists lifecycle_status text
  not null default 'active';

-- Remove the old constraints before normalizing any existing rows.
alter table public.person_evidence
  drop constraint if exists person_evidence_verification_status_check;

alter table public.person_evidence
  drop constraint if exists person_evidence_verification_fields_check;

-- Preserve the meaning of any rows already marked expired or superseded.
update public.person_evidence
set lifecycle_status =
  case
    when verification_status = 'expired' then 'expired'
    when verification_status = 'superseded' then 'superseded'
    else lifecycle_status
  end;

-- The old model did not retain whether expired/superseded evidence had
-- previously been verified. Normalize those rows to unverified unless
-- verification metadata is present.
update public.person_evidence
set verification_status =
  case
    when verification_status in ('expired', 'superseded')
      and verified_by is not null
      and verified_at is not null
      then 'verified'
    when verification_status in ('expired', 'superseded')
      then 'unverified'
    else verification_status
  end;

alter table public.person_evidence
  add constraint person_evidence_verification_status_check
  check (
    verification_status in (
      'unverified',
      'verified',
      'rejected'
    )
  );

alter table public.person_evidence
  add constraint person_evidence_lifecycle_status_check
  check (
    lifecycle_status in (
      'active',
      'expired',
      'superseded'
    )
  );

alter table public.person_evidence
  add constraint person_evidence_verification_fields_check
  check (
    (
      verification_status = 'verified'
      and verified_by is not null
      and verified_at is not null
    )
    or
    (
      verification_status in ('unverified', 'rejected')
      and verified_by is null
      and verified_at is null
    )
  );


-- ─── 3A. Document supersession integrity ────────────────────

create or replace function
  assert_document_supersession_same_subject()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prior_subject_type text;
  prior_subject_id uuid;
begin
  if new.supersedes_document_id is null then
    return new;
  end if;

  if new.id = new.supersedes_document_id then
    raise exception
      'A document cannot supersede itself: %',
      new.id;
  end if;

  select subject_type, subject_id
    into prior_subject_type, prior_subject_id
  from public.person_documents
  where id = new.supersedes_document_id;

  if not found then
    raise exception
      'Superseded document % does not exist',
      new.supersedes_document_id;
  end if;

  if prior_subject_type <> new.subject_type
     or prior_subject_id <> new.subject_id then
    raise exception
      'Document subject (%, %) does not match superseded document subject (%, %)',
      new.subject_type,
      new.subject_id,
      prior_subject_type,
      prior_subject_id;
  end if;

  return new;
end;
$$;

drop trigger if exists
  check_document_supersession_subject
on public.person_documents;

create trigger check_document_supersession_subject
before insert or update
on public.person_documents
for each row
execute function assert_document_supersession_same_subject();


-- ─── 3B. Evidence supersession integrity ────────────────────

create or replace function
  assert_evidence_supersession_same_subject()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prior_subject_type text;
  prior_subject_id uuid;
  prior_requirement_id uuid;
begin
  if new.supersedes_evidence_id is null then
    return new;
  end if;

  if new.id = new.supersedes_evidence_id then
    raise exception
      'Evidence cannot supersede itself: %',
      new.id;
  end if;

  select subject_type, subject_id, requirement_id
    into prior_subject_type, prior_subject_id, prior_requirement_id
  from public.person_evidence
  where id = new.supersedes_evidence_id;

  if not found then
    raise exception
      'Superseded evidence % does not exist',
      new.supersedes_evidence_id;
  end if;

  if prior_subject_type <> new.subject_type
     or prior_subject_id <> new.subject_id then
    raise exception
      'Evidence subject (%, %) does not match superseded evidence subject (%, %)',
      new.subject_type,
      new.subject_id,
      prior_subject_type,
      prior_subject_id;
  end if;

  if prior_requirement_id <> new.requirement_id then
    raise exception
      'Evidence for requirement % cannot supersede evidence for requirement %',
      new.requirement_id,
      prior_requirement_id;
  end if;

  return new;
end;
$$;

drop trigger if exists
  check_evidence_supersession_subject
on public.person_evidence;

create trigger check_evidence_supersession_subject
before insert or update
on public.person_evidence
for each row
execute function assert_evidence_supersession_same_subject();


commit;