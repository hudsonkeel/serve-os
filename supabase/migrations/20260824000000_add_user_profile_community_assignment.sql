-- People We Serve — community-context foundation (schema only).
--
-- Adds a nullable community assignment to user_profiles, reusing the
-- existing communities table (created by
-- 20260813000000_add_canonical_workforce_profile_editor.sql for
-- workforce/HR purposes) rather than inventing a second community
-- concept. This is deliberately the SMALLEST durable piece of the
-- future authorization model — see the application-layer note below
-- for what is explicitly NOT included here.
--
-- IMPORTANT — what this migration does NOT do, on purpose:
-- it does not add any RLS policy, does not change what any query
-- returns, and does not restrict access in any way. Investigated
-- directly this session: RLS is enabled on every People-We-Serve-
-- adjacent table but zero policies exist anywhere in this codebase
-- (confirmed via a full repo grep for "create policy" — 0 matches),
-- and all server-side reads/writes authenticate with
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS unconditionally
-- regardless of any policy that might exist. Real community
-- enforcement, when built, must live in application-code query
-- scoping (lib/data/*.ts, gated by the authenticated user's resolved
-- community), not in RLS policies that server code would bypass
-- anyway. This migration only adds the DATA needed for that future
-- work — it does not perform it. lib/auth/communityScope.ts (added
-- alongside this migration) is deliberately NOT wired into
-- lib/auth/profiles.ts's live query yet, specifically so this
-- migration can be applied without the auth path breaking beforehand
-- (adding a column here is safe on its own; querying for it before it
-- exists would break every login).
--
-- Null community_id means "no specific community assignment" — for
-- admin/executive/corporate roles this is the expected default
-- (cross-community by role, not by a stored assignment); for a
-- community-scoped staff role it means "not yet assigned," which the
-- application layer must treat as a real gap requiring assignment
-- before that person's community-scoped access can be considered
-- correctly configured — never silently treated as "all communities."
alter table user_profiles
  add column if not exists community_id uuid references communities(id);

comment on column user_profiles.community_id is
  'The single community this staff member is assigned to, if scoped to one. Null for staff not assigned to a specific community (expected default for admin/executive/corporate roles; a real configuration gap for community-scoped roles). Not yet enforced anywhere — see this migration''s own header comment.';

-- Governed assignment RPC, matching this codebase's actor+rationale
-- convention for correction actions — not yet called from any UI in
-- this pass (app/settings has no user-management UI at all today; see
-- app/settings/page.tsx's own "Access is currently provisioned
-- directly in Supabase" note). Exists so the capability is ready
-- without requiring a second migration once a settings UI is built.
create or replace function set_user_profile_community(
  p_user_profile_id uuid,
  p_community_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to change a community assignment';
  end if;

  update user_profiles
  set community_id = p_community_id
  where id = p_user_profile_id;

  if not found then
    raise exception 'user_profile % not found', p_user_profile_id;
  end if;
end;
$$;

revoke execute on function set_user_profile_community(uuid, uuid, text) from public;
grant execute on function set_user_profile_community(uuid, uuid, text) to service_role;

-- ROLLBACK:
--
--   revoke execute on function set_user_profile_community(uuid, uuid, text) from service_role;
--   drop function if exists set_user_profile_community(uuid, uuid, text);
--   alter table user_profiles drop column if exists community_id;
