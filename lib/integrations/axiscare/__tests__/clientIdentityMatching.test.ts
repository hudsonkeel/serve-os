import assert from "node:assert/strict";
import {
  matchAxisCareClientToResident,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  isKnownNonResidentAxisCareClient,
  type NormalizedResidentCandidate,
} from "../clientIdentityMatching.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function resident(overrides: Partial<NormalizedResidentCandidate>): NormalizedResidentCandidate {
  return {
    id: "r-1",
    displayName: "Test Resident",
    normalizedEmail: null,
    normalizedPhones: [],
    normalizedName: "test resident",
    unitNumber: null,
    communityName: null,
    ...overrides,
  };
}

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Jane@Example.com "), "jane@example.com");
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(""), null);
});

test("normalizePhone strips formatting and a leading country code", () => {
  assert.equal(normalizePhone("(512) 555-1234"), "5125551234");
  assert.equal(normalizePhone("1-512-555-1234"), "5125551234");
  assert.equal(normalizePhone("555-1234"), null);
});

test("normalizeName joins and lowercases", () => {
  assert.equal(normalizeName("Jane", "Doe"), "jane doe");
});

test("isKnownNonResidentAxisCareClient flags observed placeholder names", () => {
  assert.equal(isKnownNonResidentAxisCareClient("integration test"), true);
  assert.equal(isKnownNonResidentAxisCareClient("client lead"), true);
  assert.equal(isKnownNonResidentAxisCareClient("jane doe"), false);
});

test("matches on exact email", () => {
  const residents = [resident({ id: "r-1", normalizedEmail: "jane@example.com" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: "jane@example.com", normalizedPhones: [], normalizedName: "jane doe", unitNumber: null, communityName: null },
    residents
  );
  assert.equal(result.residentId, "r-1");
  assert.equal(result.basis, "email");
  assert.equal(result.requiresReview, false);
});

test("matches on exact phone when names agree — no review needed", () => {
  const residents = [resident({ id: "r-1", normalizedPhones: ["5125551234"], normalizedName: "jane doe" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: null, normalizedPhones: ["5125551234"], normalizedName: "jane doe", unitNumber: null, communityName: null },
    residents
  );
  assert.equal(result.residentId, "r-1");
  assert.equal(result.basis, "phone");
  assert.equal(result.requiresReview, false);
});

test("phone match with a disagreeing name is flagged for review, not silently accepted", () => {
  const residents = [resident({ id: "r-1", displayName: "Lynell Pinion", normalizedPhones: ["5125551234"], normalizedName: "lynell pinion" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: null, normalizedPhones: ["5125551234"], normalizedName: "wilma pinion", unitNumber: null, communityName: null },
    residents
  );
  assert.equal(result.residentId, "r-1");
  assert.equal(result.basis, "phone");
  assert.equal(result.requiresReview, true);
  assert.ok(result.reviewReason?.includes("Lynell Pinion"));
});

test("matches on exact name + apartment when no email/phone match exists", () => {
  const residents = [resident({ id: "r-1", normalizedName: "jane doe", unitNumber: "204" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: null, normalizedPhones: [], normalizedName: "jane doe", unitNumber: "204", communityName: null },
    residents
  );
  assert.equal(result.residentId, "r-1");
  assert.equal(result.basis, "name_and_apartment");
});

test("matches on exact name + community as the last deterministic tier", () => {
  const residents = [resident({ id: "r-1", normalizedName: "jane doe", communityName: "Watermere at Frisco" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: null, normalizedPhones: [], normalizedName: "jane doe", unitNumber: null, communityName: "Watermere at Frisco" },
    residents
  );
  assert.equal(result.residentId, "r-1");
  assert.equal(result.basis, "name_and_community");
});

test("name alone, with no other corroborating evidence, never auto-matches", () => {
  const residents = [resident({ id: "r-1", normalizedName: "jane doe" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: null, normalizedPhones: [], normalizedName: "jane doe", unitNumber: null, communityName: null },
    residents
  );
  assert.equal(result.residentId, null);
  assert.equal(result.basis, "none");
});

test("no match anywhere -> none, not review (review is reserved for conflicting evidence)", () => {
  const residents = [resident({ id: "r-1", normalizedName: "someone else" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: "nobody@example.com", normalizedPhones: ["5559990000"], normalizedName: "jane doe", unitNumber: null, communityName: null },
    residents
  );
  assert.equal(result.residentId, null);
  assert.equal(result.basis, "none");
  assert.equal(result.requiresReview, false);
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
