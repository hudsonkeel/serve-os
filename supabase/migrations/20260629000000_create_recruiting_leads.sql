-- Recruiting leads: prospective employees who have expressed interest in joining Serve.
-- Separate from the prospects table (care seekers) — these are two distinct relationship types.
-- Mirrors the lifecycle pattern of prospects (status pipeline, source tracking, raw submission).

create table if not exists recruiting_leads (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz default now() not null,

  -- Relationship classification
  role_interest         text not null,
  source                text not null default 'website',
  status                text not null default 'new',

  -- Identity
  first_name            text,
  last_name             text,
  phone                 text,
  email                 text,

  -- Location
  zip_code              text,
  city_state            text,

  -- Caregiver-specific
  availability          text,
  experience_level      text,
  certification_license text,

  -- Managing Director-specific
  linkedin_url          text,
  resume_url            text,

  -- Shared optional
  message               text,

  -- Funnel tracking
  raw_submission        jsonb,
  form_started_at       timestamptz,
  form_completed_at     timestamptz,

  -- External portal tracking
  apploi_redirected_at  timestamptz,

  constraint recruiting_leads_role_interest_check
    check (role_interest in ('caregiver', 'managing_director')),

  constraint recruiting_leads_status_check
    check (status in ('new', 'reviewing', 'contacted', 'advanced', 'hired', 'declined', 'withdrawn'))
);

-- Deduplication lookup by email within a role
create index if not exists recruiting_leads_email_role_idx
  on recruiting_leads (lower(email), role_interest)
  where email is not null;

-- Deduplication lookup by phone within a role
create index if not exists recruiting_leads_phone_role_idx
  on recruiting_leads (phone, role_interest)
  where phone is not null;

-- Dashboard queries by status and role
create index if not exists recruiting_leads_status_role_idx
  on recruiting_leads (status, role_interest);

-- Dashboard queries sorted by creation date
create index if not exists recruiting_leads_created_at_idx
  on recruiting_leads (created_at desc);

-- RLS: service role bypasses this automatically (server action is safe).
-- No policies are defined, so anon key has zero access — no browser client can
-- read or write this table directly.
alter table recruiting_leads enable row level security;
