// Pure-function tests for the AxisCare duplicate-candidate detection and
// pre-rejection warning — see lib/workforce/identityDuplicateDetection.ts.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/identityDuplicateDetection.test.ts
import assert from "node:assert/strict";
import {
  buildIdentityRejectionWarning,
  findPotentialDuplicateLinks,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "../identityDuplicateDetection.ts";
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
    subject_id: null,
    source_system: "axiscare",
    vendor_record_id: "AC-1",
    vendor_display_name: "Locardia Magoga",
    match_method: "name_similarity_pending_review",
    match_confidence: "medium",
    status: "proposed",
    link_role: null,
    duplicate_of_link_id: null,
    approved_source_data: { firstName: "Locardia", lastName: "Magoga", statusActive: false },
    last_synced_at: "2026-07-01T00:00:00Z",
    resolved_by: null,
    resolved_at: null,
    resolution_rationale: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Normalization ──────────────────────────────────────────────────────
test("normalizeName lowercases, strips punctuation, and collapses whitespace", () => {
  assert.equal(normalizeName("  Locardia   Magoga! "), "locardia magoga");
});

test("normalizeName returns null for empty/null input", () => {
  assert.equal(normalizeName(null), null);
  assert.equal(normalizeName(""), null);
});

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail(" Locardia@Example.com "), "locardia@example.com");
});

test("normalizePhone strips non-digits and drops a leading country code", () => {
  assert.equal(normalizePhone("+1 (512) 555-0100"), "5125550100");
  assert.equal(normalizePhone("512-555-0100"), "5125550100");
});

// ─── findPotentialDuplicateLinks ────────────────────────────────────────
test("finds another AxisCare record with the same normalized name", () => {
  const target = link({ id: "active", approved_source_data: { firstName: "Locardia", lastName: "Magoga", statusActive: true } });
  const other = link({ id: "inactive", vendor_record_id: "AC-2", approved_source_data: { firstName: "Locardia", lastName: "Magoga", statusActive: false } });

  const duplicates = findPotentialDuplicateLinks(target, [target, other]);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].id, "inactive");
});

test("finds another record by matching email even with a different name spelling", () => {
  const target = link({ id: "a", approved_source_data: { personalEmail: "locardia@example.com" } });
  const other = link({ id: "b", vendor_record_id: "AC-2", approved_source_data: { firstName: "Loki", lastName: "M", personalEmail: "Locardia@Example.com" } });

  const duplicates = findPotentialDuplicateLinks(target, [target, other]);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].id, "b");
});

test("finds another record by matching phone", () => {
  const target = link({ id: "a", approved_source_data: { mobilePhone: "512-555-0100" } });
  const other = link({ id: "b", vendor_record_id: "AC-2", approved_source_data: { mobilePhone: "(512) 555-0100" } });

  const duplicates = findPotentialDuplicateLinks(target, [target, other]);
  assert.equal(duplicates.length, 1);
});

test("excludes the link itself", () => {
  const target = link({ id: "a" });
  assert.deepEqual(findPotentialDuplicateLinks(target, [target]), []);
});

test("excludes records from a different source_system", () => {
  const target = link({ id: "a", source_system: "axiscare" });
  const other = link({ id: "b", source_system: "viventium", vendor_record_id: "V-1" });
  assert.deepEqual(findPotentialDuplicateLinks(target, [target, other]), []);
});

test("returns nothing when neither name, email, nor phone is available to compare", () => {
  const target = link({ id: "a", vendor_display_name: null, approved_source_data: {} });
  const other = link({ id: "b", vendor_record_id: "AC-2" });
  assert.deepEqual(findPotentialDuplicateLinks(target, [target, other]), []);
});

// ─── buildIdentityRejectionWarning ──────────────────────────────────────
test("no warning when no duplicate candidate exists", () => {
  const target = link({ id: "a" });
  const warning = buildIdentityRejectionWarning(target, [target]);
  assert.equal(warning.shouldWarn, false);
  assert.deepEqual(warning.reasons, []);
});

test("warns when another identity has the same name and a matching email", () => {
  const target = link({
    id: "a",
    approved_source_data: { firstName: "Locardia", lastName: "Magoga", personalEmail: "locardia@example.com" },
  });
  const other = link({
    id: "b",
    vendor_record_id: "AC-2",
    approved_source_data: { firstName: "Locardia", lastName: "Magoga", personalEmail: "locardia@example.com" },
  });

  const warning = buildIdentityRejectionWarning(target, [target, other]);
  assert.equal(warning.shouldWarn, true);
  assert.ok(warning.reasons.some((r) => r.includes("matching email or phone")));
});

test("warns when a matching candidate is already a confirmed link (appears to be the same person)", () => {
  const target = link({ id: "a", status: "proposed" });
  const confirmedOther = link({
    id: "b",
    vendor_record_id: "AC-2",
    status: "confirmed",
    link_role: "primary",
    subject_id: "member-1",
  });

  const warning = buildIdentityRejectionWarning(target, [target, confirmedOther]);
  assert.equal(warning.shouldWarn, true);
  assert.ok(warning.reasons.some((r) => r.includes("appears to represent the same person")));
});

// The exact Locardia shape: same name, one active and one inactive.
test("warns when one candidate is active and the other inactive — the Locardia case", () => {
  const active = link({
    id: "active",
    approved_source_data: { firstName: "Locardia", lastName: "Magoga", statusActive: true },
  });
  const inactive = link({
    id: "inactive",
    vendor_record_id: "AC-2",
    approved_source_data: { firstName: "Locardia", lastName: "Magoga", statusActive: false },
    status: "confirmed",
    link_role: "primary",
    subject_id: "member-1",
  });

  const warning = buildIdentityRejectionWarning(active, [active, inactive]);
  assert.equal(warning.shouldWarn, true);
  assert.ok(warning.reasons.some((r) => r.includes("active while the other is inactive")));
  assert.ok(warning.reasons.some((r) => r.includes("appears to represent the same person")));
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
