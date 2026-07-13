-- Connections: relationship-memory foundation for Watermere residents.
--
-- Purpose: help Serve staff remember meaningful, respectful details about
-- residents (interests, milestones, outreach preferences, and touchpoints)
-- so relationships can be genuine and service-first over time.
--
-- This is explicitly NOT a lead-nurture, sales, campaign, or marketing
-- system. It applies to all Watermere residents, including non-clients.
--
-- public.residents remains the canonical resident identity and roster
-- table. Every table here references public.residents(id) and stores no
-- duplicated identity fields.

-- Shared updated_at trigger, scoped to the four Connections tables created
-- in this migration. No updated_at trigger convention exists elsewhere in
-- this repo yet, so this function is self-contained and does not touch any
-- other table.
create or replace function resident_connections_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- A. resident_relationship_profiles ------------------------------------
-- One optional profile row per resident: broad relationship context and
-- outreach preferences.

create table if not exists resident_relationship_profiles (
  id                          uuid primary key default gen_random_uuid(),

  resident_id                 uuid not null unique
                               references public.residents(id) on delete cascade,

  preferred_name              text,
  conversation_style          text,
  communication_preference    text,
  preferred_contact_channel   text,
  best_time_to_contact        text,

  relationship_stage          text not null default 'unknown',

  -- No established user-profile UUID FK convention exists in this repo
  -- (user_profiles is keyed by email; no user id is exposed to the app).
  -- Left nullable and unconstrained rather than inventing a risky FK.
  relationship_owner_user_id  uuid,

  last_meaningful_touch_at    timestamptz,
  next_suggested_touch_at     timestamptz,

  general_notes                text,
  do_not_contact                boolean not null default false,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint resident_relationship_profiles_stage_check
    check (relationship_stage in (
      'unknown',
      'introduced',
      'acquaintance',
      'familiar',
      'established_relationship'
    ))
);

create index if not exists resident_relationship_profiles_resident_id_idx
  on resident_relationship_profiles (resident_id);

create index if not exists resident_relationship_profiles_next_touch_idx
  on resident_relationship_profiles (next_suggested_touch_at)
  where next_suggested_touch_at is not null;

drop trigger if exists set_updated_at on resident_relationship_profiles;
create trigger set_updated_at
  before update on resident_relationship_profiles
  for each row execute function resident_connections_set_updated_at();

alter table resident_relationship_profiles enable row level security;

-- B. resident_interests --------------------------------------------------
-- Multiple interests / relationship facts per resident. Observed
-- information must remain clearly distinguishable from resident-confirmed
-- information (source_type + confirmed_by_resident together, never merged
-- into a single "fact").

create table if not exists resident_interests (
  id                       uuid primary key default gen_random_uuid(),

  resident_id              uuid not null
                            references public.residents(id) on delete cascade,

  interest_type            text not null,
  interest_value           text not null,
  details                  text,

  source_type              text not null default 'staff_observation',
  source_note              text,

  confidence               text not null default 'unconfirmed',
  sensitivity              text not null default 'standard',

  confirmed_by_resident    boolean not null default false,
  supports_future_touch    boolean not null default false,
  active                   boolean not null default true,

  created_by               uuid,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint resident_interests_type_check
    check (interest_type in (
      'college',
      'sports_team',
      'hobby',
      'former_profession',
      'military_service',
      'hometown',
      'travel',
      'music',
      'books',
      'pets',
      'family',
      'community_activity',
      'food',
      'faith_or_tradition',
      'conversation_topic',
      'other'
    )),

  constraint resident_interests_source_type_check
    check (source_type in (
      'resident_shared',
      'family_shared',
      'staff_observation',
      'staff_conversation',
      'imported',
      'other'
    )),

  constraint resident_interests_confidence_check
    check (confidence in ('unconfirmed', 'probable', 'confirmed')),

  constraint resident_interests_sensitivity_check
    check (sensitivity in ('standard', 'sensitive', 'high'))
);

create index if not exists resident_interests_resident_id_idx
  on resident_interests (resident_id);

create index if not exists resident_interests_resident_active_idx
  on resident_interests (resident_id, updated_at desc)
  where active = true;

create index if not exists resident_interests_type_idx
  on resident_interests (interest_type);

drop trigger if exists set_updated_at on resident_interests;
create trigger set_updated_at
  before update on resident_interests
  for each row execute function resident_connections_set_updated_at();

alter table resident_interests enable row level security;

-- C. resident_milestones --------------------------------------------------
-- Meaningful dates or recurring occasions. Supports partial dates (month +
-- day only, no year required).

create table if not exists resident_milestones (
  id                          uuid primary key default gen_random_uuid(),

  resident_id                 uuid not null
                               references public.residents(id) on delete cascade,

  milestone_type               text not null,
  title                        text not null,

  event_date                   date,
  month                        integer,
  day                          integer,
  year_known                   boolean not null default false,
  recurs_annually              boolean not null default true,

  source_type                  text not null default 'staff_conversation',
  confirmed                    boolean not null default false,
  appropriate_for_outreach     boolean not null default false,

  notes                        text,
  created_by                   uuid,

  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  constraint resident_milestones_type_check
    check (milestone_type in (
      'birthday',
      'wedding_anniversary',
      'military_anniversary',
      'graduation',
      'move_in_anniversary',
      'bereavement_remembrance',
      'religious_observance',
      'personal_accomplishment',
      'custom'
    )),

  constraint resident_milestones_source_type_check
    check (source_type in (
      'resident_shared',
      'family_shared',
      'staff_observation',
      'staff_conversation',
      'imported',
      'other'
    )),

  constraint resident_milestones_month_check
    check (month is null or (month between 1 and 12)),

  constraint resident_milestones_day_check
    check (day is null or (day between 1 and 31))
);

create index if not exists resident_milestones_resident_id_idx
  on resident_milestones (resident_id);

create index if not exists resident_milestones_month_day_idx
  on resident_milestones (month, day)
  where month is not null and day is not null;

create index if not exists resident_milestones_event_date_idx
  on resident_milestones (event_date)
  where event_date is not null;

drop trigger if exists set_updated_at on resident_milestones;
create trigger set_updated_at
  before update on resident_milestones
  for each row execute function resident_connections_set_updated_at();

alter table resident_milestones enable row level security;

-- D. resident_touches ------------------------------------------------------
-- Completed and planned relationship touches. No automated sending happens
-- from this table in this scope — it is a record of human-initiated,
-- human-reviewed touchpoints.

create table if not exists resident_touches (
  id                    uuid primary key default gen_random_uuid(),

  resident_id           uuid not null
                         references public.residents(id) on delete cascade,

  touch_type            text not null,
  status                text not null default 'suggested',
  channel               text not null default 'in_person',

  scheduled_for         timestamptz,
  completed_at          timestamptz,
  completed_by          uuid,

  subject               text,
  message_text          text,
  reason                text,
  source_rule           text,

  requires_review       boolean not null default true,
  approved_by           uuid,

  sent_at               timestamptz,
  external_message_id   text,

  resident_response     text,
  outcome               text,
  follow_up_date        date,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint resident_touches_type_check
    check (touch_type in (
      'birthday',
      'anniversary',
      'holiday',
      'sports',
      'interest',
      'welcome',
      'check_in',
      'congratulations',
      'sympathy',
      'community_event',
      'personal_follow_up',
      'just_because'
    )),

  constraint resident_touches_status_check
    check (status in (
      'suggested',
      'scheduled',
      'drafted',
      'approved',
      'completed',
      'sent',
      'dismissed',
      'cancelled'
    )),

  constraint resident_touches_channel_check
    check (channel in (
      'in_person',
      'phone',
      'text',
      'email',
      'card',
      'gift',
      'other'
    ))
);

create index if not exists resident_touches_resident_id_idx
  on resident_touches (resident_id);

create index if not exists resident_touches_resident_created_idx
  on resident_touches (resident_id, created_at desc);

create index if not exists resident_touches_status_idx
  on resident_touches (status);

create index if not exists resident_touches_scheduled_for_idx
  on resident_touches (scheduled_for)
  where scheduled_for is not null;

drop trigger if exists set_updated_at on resident_touches;
create trigger set_updated_at
  before update on resident_touches
  for each row execute function resident_connections_set_updated_at();

alter table resident_touches enable row level security;

-- RLS: service role bypasses this automatically (server actions and data
-- access run through createServerClient(), which uses the service role
-- key). No policies are defined on any of the four tables, so the anon key
-- has zero access — matches the recruiting_leads convention.
