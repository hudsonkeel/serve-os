// Pure-function tests for Vendor Identity Lineage's decision logic — see
// lib/workforce/identityLinkLifecycle.ts.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/identityLinkLifecycle.test.ts
import assert from "node:assert/strict";
import {
  canPromoteToPrimary,
  canReassignConfirmedSubject,
  canReopen,
  canSetRole,
  getAvailableIdentityLinkActions,
  selectConfirmedLinksForSource,
  selectPrimaryLink,
} from "../identityLinkLifecycle.ts";
import type { PersonVendorIdentityLink } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function link(overrides: Partial<PersonVendorIdentityLink> = {}): PersonVendorIdentityLink {
  return {
    id: "link-1",
    subject_type: "workforce_member",
    subject_id: "member-1",
    source_system: "axiscare",
    vendor_record_id: "AC-1",
    vendor_display_name: "Locardia Magoga",
    match_method: "vendor_id",
    match_confidence: "high",
    status: "confirmed",
    link_role: "primary",
    duplicate_of_link_id: null,
    approved_source_data: {},
    last_synced_at: "2026-07-01T00:00:00Z",
    resolved_by: "reviewer@example.com",
    resolved_at: "2026-07-01T00:00:00Z",
    resolution_rationale: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

// ─── selectPrimaryLink / selectConfirmedLinksForSource ─────────────────────
// Scenario: two AxisCare records linked to one workforce member — an active
// primary and an inactive duplicate (the Locardia case).
test("selectConfirmedLinksForSource returns both the primary and the duplicate for one subject", () => {
  const primary = link({ id: "link-active", link_role: "primary" });
  const duplicate = link({ id: "link-inactive", link_role: "duplicate", vendor_record_id: "AC-2" });
  const links = [primary, duplicate];

  const confirmed = selectConfirmedLinksForSource(links, "axiscare");
  assert.equal(confirmed.length, 2);
});

test("selectPrimaryLink returns only the primary-role record, even when a duplicate is also confirmed", () => {
  const primary = link({ id: "link-active", link_role: "primary" });
  const duplicate = link({ id: "link-inactive", link_role: "duplicate", vendor_record_id: "AC-2" });

  const result = selectPrimaryLink([primary, duplicate], "axiscare");
  assert.equal(result?.id, "link-active");
});

test("selectPrimaryLink returns null when no confirmed link is primary — duplicate/retired never drive the profile", () => {
  const duplicate = link({ id: "link-1", link_role: "duplicate" });
  const retired = link({ id: "link-2", link_role: "retired", vendor_record_id: "AC-2" });

  assert.equal(selectPrimaryLink([duplicate, retired], "axiscare"), null);
});

test("selectPrimaryLink ignores links from a different source_system", () => {
  const other = link({ source_system: "viventium", link_role: "primary" });
  assert.equal(selectPrimaryLink([other], "axiscare"), null);
});

test("selectPrimaryLink ignores non-confirmed links even if link_role is somehow set", () => {
  const proposed = link({ status: "proposed", link_role: null });
  assert.equal(selectPrimaryLink([proposed], "axiscare"), null);
});

// ─── canPromoteToPrimary ────────────────────────────────────────────────────
test("canPromoteToPrimary is true for a confirmed duplicate", () => {
  assert.equal(canPromoteToPrimary(link({ link_role: "duplicate" })), true);
});

test("canPromoteToPrimary is false for a link that is already primary", () => {
  assert.equal(canPromoteToPrimary(link({ link_role: "primary" })), false);
});

test("canPromoteToPrimary is false for a proposed link", () => {
  assert.equal(canPromoteToPrimary(link({ status: "proposed", link_role: null })), false);
});

// ─── canSetRole ──────────────────────────────────────────────────────────
test("canSetRole allows duplicate/retired/historical on a confirmed link", () => {
  assert.equal(canSetRole(link({ link_role: "primary" }), "duplicate"), true);
  assert.equal(canSetRole(link({ link_role: "primary" }), "retired"), true);
  assert.equal(canSetRole(link({ link_role: "primary" }), "historical"), true);
});

test("canSetRole is false for a link that is not confirmed", () => {
  assert.equal(canSetRole(link({ status: "deferred", link_role: null }), "retired"), false);
});

// ─── canReopen ───────────────────────────────────────────────────────────
// Scenario: reopening both a rejected and a deferred decision must work.
test("canReopen is true for a rejected decision", () => {
  assert.equal(canReopen(link({ status: "rejected", link_role: null, resolution_rationale: "Wrong person" })), true);
});

test("canReopen is true for a deferred decision", () => {
  assert.equal(canReopen(link({ status: "deferred", link_role: null, resolution_rationale: "Needs more info" })), true);
});

test("canReopen is false for a proposed or already-confirmed link", () => {
  assert.equal(canReopen(link({ status: "proposed", link_role: null })), false);
  assert.equal(canReopen(link({ status: "confirmed" })), false);
});

// ─── canReassignConfirmedSubject ───────────────────────────────────────────
// Scenario: correcting a link assigned to the wrong workforce member.
test("canReassignConfirmedSubject is true only for a confirmed link", () => {
  assert.equal(canReassignConfirmedSubject(link({ status: "confirmed" })), true);
  assert.equal(canReassignConfirmedSubject(link({ status: "proposed", link_role: null })), false);
  assert.equal(canReassignConfirmedSubject(link({ status: "rejected", link_role: null })), false);
});

// ─── getAvailableIdentityLinkActions ───────────────────────────────────────
test("a rejected link only offers reopen", () => {
  const actions = getAvailableIdentityLinkActions(link({ status: "rejected", link_role: null }));
  assert.deepEqual(actions, ["reopen"]);
});

test("a deferred link only offers reopen", () => {
  const actions = getAvailableIdentityLinkActions(link({ status: "deferred", link_role: null }));
  assert.deepEqual(actions, ["reopen"]);
});

test("a confirmed duplicate offers promote, set_role, and reassign_subject", () => {
  const actions = getAvailableIdentityLinkActions(link({ link_role: "duplicate" }));
  assert.deepEqual(actions, ["promote_to_primary", "set_role", "reassign_subject"]);
});

test("a confirmed primary offers set_role and reassign_subject, but not promote (already primary)", () => {
  const actions = getAvailableIdentityLinkActions(link({ link_role: "primary" }));
  assert.deepEqual(actions, ["set_role", "reassign_subject"]);
});

test("a proposed link offers no correction actions", () => {
  const actions = getAvailableIdentityLinkActions(link({ status: "proposed", link_role: null }));
  assert.deepEqual(actions, []);
});

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();
