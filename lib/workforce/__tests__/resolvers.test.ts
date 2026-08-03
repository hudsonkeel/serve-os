// Pure-function tests for the shared resolver layer — see
// lib/workforce/resolvers.ts. Every screen must read a workforce member's
// display name/phone/email/status through these, never duplicate the
// logic — these tests pin the exact priority order the scope specifies.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/resolvers.test.ts
import assert from "node:assert/strict";
import {
  resolvePrimaryVendorIdentity,
  resolveWorkforceDisplayName,
  resolveWorkforceEmail,
  resolveWorkforcePhone,
  resolveWorkforceStatus,
} from "../resolvers.ts";
import type { PersonVendorIdentityLink, WorkforceCommunityMembership, WorkforceMember } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function member(overrides: Partial<WorkforceMember> = {}): WorkforceMember {
  return {
    id: "member-1",
    source_recruiting_lead_id: null,
    display_name: "Jessicah Mudekunye",
    legal_first_name: "Jessicah",
    legal_middle_name: null,
    legal_last_name: "Mudekunye",
    preferred_name: null,
    primary_email: null,
    primary_phone: null,
    canonical_profile_status: "unreviewed",
    canonical_identity_notes: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by: "staff@example.com",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    ...overrides,
  };
}

function link(overrides: Partial<PersonVendorIdentityLink> = {}): PersonVendorIdentityLink {
  return {
    id: "link-1",
    subject_type: "workforce_member",
    subject_id: "member-1",
    source_system: "axiscare",
    vendor_record_id: "AC-1",
    vendor_display_name: "jessicah mudekunye",
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

function communityMembership(overrides: Partial<WorkforceCommunityMembership> = {}): WorkforceCommunityMembership {
  return {
    id: "membership-1",
    workforce_member_id: "member-1",
    community_id: "community-1",
    membership_status: "active",
    role_type: "caregiver",
    employment_relationship: null,
    start_date: null,
    end_date: null,
    is_primary_community: true,
    community_display_name_override: null,
    community_email: null,
    community_phone: null,
    scheduler_notes: null,
    availability_notes: null,
    transportation_notes: null,
    access_notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: "staff@example.com",
    updated_by: null,
    ...overrides,
  };
}

// ─── resolveWorkforceDisplayName priority chain ─────────────────────────
test("priority 1: a community display-name override wins over everything, including the canonical display_name", () => {
  const result = resolveWorkforceDisplayName(member(), {
    communityMembership: communityMembership({ community_display_name_override: "Jessi M." }),
  });
  assert.equal(result, "Jessi M.");
});

test("priority 2: the canonical display_name is used when no community override is present", () => {
  const result = resolveWorkforceDisplayName(member({ display_name: "Jessicah Mudekunye" }));
  assert.equal(result, "Jessicah Mudekunye");
});

test("an empty community_display_name_override does not shadow the canonical display_name", () => {
  const result = resolveWorkforceDisplayName(member(), {
    communityMembership: communityMembership({ community_display_name_override: "   " }),
  });
  assert.equal(result, "Jessicah Mudekunye");
});

test("priority 3: preferred name + legal last name is used when display_name is somehow blank", () => {
  const result = resolveWorkforceDisplayName(member({ display_name: "", preferred_name: "Jessi", legal_last_name: "Mudekunye" }));
  assert.equal(result, "Jessi Mudekunye");
});

test("priority 4: legal first + last name is used when display_name and preferred_name are both blank", () => {
  const result = resolveWorkforceDisplayName(member({ display_name: "", preferred_name: null, legal_first_name: "Jessicah", legal_last_name: "Mudekunye" }));
  assert.equal(result, "Jessicah Mudekunye");
});

test("priority 5: the primary vendor identity's display name is used as a last resort before the placeholder", () => {
  const result = resolveWorkforceDisplayName(
    member({ display_name: "", preferred_name: null, legal_first_name: null, legal_last_name: null }),
    { primaryVendorIdentity: link({ vendor_display_name: "jessicah mudekunye" }) }
  );
  assert.equal(result, "jessicah mudekunye");
});

test("priority 6: falls all the way back to the placeholder when nothing at all is available", () => {
  const result = resolveWorkforceDisplayName(
    member({ display_name: "", preferred_name: null, legal_first_name: null, legal_last_name: null })
  );
  assert.equal(result, "Unnamed workforce member");
});

// ─── resolveWorkforcePhone / resolveWorkforceEmail ─────────────────────
test("resolveWorkforcePhone prefers the canonical primary_phone over the vendor identity", () => {
  const result = resolveWorkforcePhone(member({ primary_phone: "555-0100" }), link({ approved_source_data: { mobilePhone: "555-9999" } }));
  assert.equal(result, "555-0100");
});

test("resolveWorkforcePhone falls back to the vendor identity's mobilePhone, then homePhone, when canonical is null", () => {
  assert.equal(resolveWorkforcePhone(member({ primary_phone: null }), link({ approved_source_data: { mobilePhone: "555-9999" } })), "555-9999");
  assert.equal(
    resolveWorkforcePhone(member({ primary_phone: null }), link({ approved_source_data: { homePhone: "555-1111" } })),
    "555-1111"
  );
});

test("resolveWorkforceEmail prefers the canonical primary_email over the vendor identity", () => {
  const result = resolveWorkforceEmail(
    member({ primary_email: "jessicah@serve.example" }),
    link({ approved_source_data: { personalEmail: "jessicah@axiscare.example" } })
  );
  assert.equal(result, "jessicah@serve.example");
});

test("resolveWorkforceEmail returns null when neither canonical nor vendor has one", () => {
  assert.equal(resolveWorkforceEmail(member({ primary_email: null }), null), null);
});

// ─── resolvePrimaryVendorIdentity ────────────────────────────────────────
test("resolvePrimaryVendorIdentity returns only the primary-role confirmed link for the given source", () => {
  const primary = link({ id: "a", link_role: "primary" });
  const duplicate = link({ id: "b", link_role: "duplicate", vendor_record_id: "AC-2" });
  assert.equal(resolvePrimaryVendorIdentity([primary, duplicate], "axiscare")?.id, "a");
});

// ─── resolveWorkforceStatus ──────────────────────────────────────────────
test("resolveWorkforceStatus derives lifecycle status from the primary vendor identity's source data", () => {
  const result = resolveWorkforceStatus(link({ approved_source_data: { statusActive: true, terminationDate: null, startDate: null } }));
  assert.equal(result.status, "active");
});

test("resolveWorkforceStatus returns inactive when there is no primary vendor identity at all", () => {
  const result = resolveWorkforceStatus(null);
  assert.equal(result.status, "inactive");
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
