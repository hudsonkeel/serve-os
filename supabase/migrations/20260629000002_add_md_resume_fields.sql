-- Extend recruiting_leads with Managing Director resume metadata and exploration timeline.
-- resume_url already exists from migration 0000; these are the supporting metadata columns.

alter table recruiting_leads
  add column if not exists resume_filename       text,
  add column if not exists resume_uploaded_at    timestamptz,
  add column if not exists exploration_timeline  text;

-- Optional constraint: restrict to known timeline values if desired.
-- Left unconstrained for now to allow future vocabulary changes without a migration.
