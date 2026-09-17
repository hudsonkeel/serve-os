-- User Roles & Permissions v0.1 — production follow-up.
--
-- Context: attempting to provision Idah Jaji's user_profiles row with
-- role = 'office_staff' was rejected in production by an existing CHECK
-- constraint, user_profiles_role_check. That constraint (and a
-- DEFAULT 'admin' on the same column) exist live in Supabase but were
-- never represented in this repo's tracked migration history — like
-- user_profiles itself, they were provisioned directly against the
-- database outside of any migration. This is that constraint and
-- default's first appearance in version control.
--
-- Confirmed via direct production introspection (2026-09-16):
--   - user_profiles.role has CHECK constraint user_profiles_role_check.
--   - 'office_staff' is currently rejected by that constraint.
--   - existing production rows only use role values admin/executive/
--     operations today — so widening the CHECK below cannot violate any
--     existing row (a strict superset of what's in use).
--   - user_profiles.role has DEFAULT 'admin'::text.
--   - user_profiles.role is already NOT NULL (unchanged by this
--     migration).
--
-- This migration does two things, both schema-only — no existing row
-- data is inserted, updated, or deleted. (The CHECK constraint's own
-- validation does scan existing rows, per Postgres's normal ADD
-- CONSTRAINT behavior — see the introspection note above confirming
-- that scan cannot fail against current data.)
--
-- 1. Drop and recreate user_profiles_role_check to allow exactly the
--    five roles the application (lib/auth/constants.ts's AUTH_ROLES)
--    already expects: admin, manager, executive, operations,
--    office_staff.
--
-- 2. Drop the DEFAULT 'admin' on user_profiles.role. Provisioning a new
--    Serve OS user today is a manual, hand-typed INSERT against
--    Supabase (no Settings UI exists yet — see app/settings/page.tsx's
--    "provisioned directly in Supabase" note) — an INSERT that
--    accidentally omitted the role column would previously have
--    silently created a full administrator. Combined with role already
--    being NOT NULL, removing the default makes that failure mode loud
--    instead of silent, producing exactly the intended invariant:
--
--      role omitted        -> INSERT fails (NOT NULL, no default)
--      invalid role         -> INSERT fails (CHECK)
--      valid explicit role  -> accepted
--
-- Deliberately NOT in scope (per explicit instruction): NOT NULL is
-- already present and is not touched; no existing row is inserted,
-- updated, or deleted; RLS, storage policies, and auth architecture are
-- untouched.

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('admin', 'manager', 'executive', 'operations', 'office_staff'));

alter table public.user_profiles
  alter column role drop default;

-- ROLLBACK:
--
-- No executable rollback is provided here. The pre-migration CHECK
-- definition was never version-controlled (it was provisioned directly
-- in Supabase, outside any tracked migration — see the header above),
-- so its exact prior form is not something this migration can safely
-- assert or reconstruct. Before rolling back, confirm the exact
-- pre-migration constraint definition directly against a backup/point-
-- in-time-recovery snapshot taken before this migration ran (e.g. via
-- pg_get_constraintdef on that snapshot), then hand-write and review a
-- rollback statement from that confirmed definition — do not guess at
-- it from production data alone, since data in use is not proof of
-- everything the constraint allowed.
