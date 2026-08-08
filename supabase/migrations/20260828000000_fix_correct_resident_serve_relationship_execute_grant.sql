-- Security correction — correct_resident_serve_relationship's EXECUTE
-- grant was not actually restricted on the live database, despite
-- 20260826000000_add_resident_serve_relationship_corrections.sql
-- containing the correct `revoke execute ... from public` statement
-- immediately after creating the function. Live-verified this pass: an
-- anon-key RPC call reached the function's internal logic (evaluated
-- "resident ... not found" on a probe UUID) instead of being denied at
-- the permission boundary, unlike every other governed RPC in this
-- codebase (re-confirmed set_axiscare_client_disposition and
-- confirm_person_vendor_identity_link both still correctly deny anon).
-- The migration file itself was correct; this is a forward correction
-- of the live grant state, not a fix to a code defect — repository
-- history should show the correction as its own migration rather than
-- editing or re-running 20260826000000, which already accurately
-- describes what was intended to run.
--
-- Live-verified exact signature before targeting this (matches the
-- original migration exactly — not a signature mismatch):
--   correct_resident_serve_relationship(
--     p_resident_id uuid, p_previous_value text, p_new_value text,
--     p_actor text, p_rationale text
--   )
--
-- Table-level privileges (resident_serve_relationship_corrections)
-- were independently verified still correctly restricted (anon SELECT
-- denied) and are not touched here — this migration only corrects the
-- function's EXECUTE grant. No table privilege, function logic, or
-- security-definer change.
--
-- `authenticated` is revoked too, not just anon/public: the governed
-- server action that calls this RPC
-- (lib/actions/residents.ts:correctServeRelationship) always connects
-- via createServerClient(), which authenticates with
-- SUPABASE_SERVICE_ROLE_KEY regardless of the calling user's own
-- Supabase Auth session — the `authenticated` Postgres role is never
-- the one making this call, so it has no legitimate need for EXECUTE,
-- matching the same all-three-revoked pattern already used by
-- set_axiscare_client_disposition
-- (20260823000000_add_axiscare_client_disposition.sql).
revoke execute on function correct_resident_serve_relationship(uuid, text, text, text, text)
  from public, anon, authenticated;

grant execute on function correct_resident_serve_relationship(uuid, text, text, text, text)
  to service_role;

-- ROLLBACK: restores the exact (defective) grant state this migration
-- corrects, for completeness only — not expected to ever be needed.
--
--   revoke execute on function correct_resident_serve_relationship(uuid, text, text, text, text) from service_role;
--   grant execute on function correct_resident_serve_relationship(uuid, text, text, text, text) to public;
