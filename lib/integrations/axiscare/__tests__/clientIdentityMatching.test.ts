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

test("REGRESSION (Michele Helsley / Kathryn Morshed): normalizeName strips a parenthetical nickname AxisCare embeds in firstName", () => {
  assert.equal(normalizeName("Michelle (Mick)", "Helsley"), "michelle helsley");
  assert.equal(normalizeName("Kathryn (Kathy)", "Morshed"), "kathryn morshed");
});

test("isKnownNonResidentAxisCareClient flags observed placeholder names", () => {
  assert.equal(isKnownNonResidentAxisCareClient("integration test"), true);
  assert.equal(isKnownNonResidentAxisCareClient("client lead"), true);
  assert.equal(isKnownNonResidentAxisCareClient("jane doe"), false);
});

test("matches on exact email when names agree — no review needed", () => {
  const residents = [resident({ id: "r-1", normalizedEmail: "jane@example.com", normalizedName: "jane doe" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: "jane@example.com", normalizedPhones: [], normalizedName: "jane doe", unitNumber: null, communityName: null },
    residents
  );
  assert.equal(result.residentId, "r-1");
  assert.equal(result.basis, "email");
  assert.equal(result.requiresReview, false);
});

test("REGRESSION (Bob Hatch / Pamela Hatch, shared household email): an email match with a materially disagreeing name is flagged for review, never a clean candidate match", () => {
  const residents = [
    resident({ id: "pamela-hatch", displayName: "Pamela Hatch", normalizedEmail: "hatch.pam@bobnpam.com", normalizedName: "pamela hatch" }),
  ];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: "hatch.pam@bobnpam.com", normalizedPhones: [], normalizedName: "bob hatch", unitNumber: null, communityName: null },
    residents
  );
  assert.equal(result.residentId, "pamela-hatch");
  assert.equal(result.basis, "email");
  assert.equal(result.requiresReview, true);
  assert.ok(result.reviewReason?.includes("Pamela Hatch"));
  assert.ok(result.reviewReason?.toLowerCase().includes("household"));
});

test("REGRESSION (reverse direction): Pamela Hatch does not resolve to a clean candidate match against Bob Hatch's contact info for the same reason", () => {
  const residents = [
    resident({ id: "bob-hatch", displayName: "Bob Hatch", normalizedEmail: "hatch.bob@bobnpam.com", normalizedName: "bob hatch" }),
  ];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: "hatch.bob@bobnpam.com", normalizedPhones: [], normalizedName: "pamela hatch", unitNumber: null, communityName: null },
    residents
  );
  assert.equal(result.residentId, "bob-hatch");
  assert.equal(result.basis, "email");
  assert.equal(result.requiresReview, true);
});

test("REGRESSION: legitimate nickname/spelling cases (Wilma/Lynell Pinion via shared phone) still surface as a reviewable match, not silently dropped to 'none'", () => {
  const residents = [resident({ id: "r-1", displayName: "Lynell Pinion", normalizedPhones: ["5125551234"], normalizedName: "lynell pinion" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: null, normalizedPhones: ["5125551234"], normalizedName: "wilma pinion", unitNumber: null, communityName: null },
    residents
  );
  assert.equal(result.residentId, "r-1");
  assert.equal(result.requiresReview, true);
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

test("REGRESSION (Kathryn Morshed, AxisCare #13): exact last name + community match, after the parenthetical nickname is stripped, matches cleanly with no review needed", () => {
  const residents = [
    resident({ id: "r-1", displayName: "Kathryn Morshed", normalizedName: "kathryn morshed", normalizedLastName: "morshed", communityName: "Watermere at Frisco" }),
  ];
  const result = matchAxisCareClientToResident(
    {
      normalizedEmail: null,
      normalizedPhones: [],
      normalizedName: normalizeName("Kathryn (Kathy)", "Morshed"),
      normalizedLastName: "morshed",
      unitNumber: null,
      communityName: "Watermere at Frisco",
    },
    residents
  );
  assert.equal(result.residentId, "r-1");
  assert.equal(result.basis, "name_and_community");
  assert.equal(result.requiresReview, false);
});

test("REGRESSION (Michele Helsley, AxisCare #11): last name + community match, but full name still disagrees (Michelle vs Michele) — surfaced for review, not silently accepted, and not left fully unmatched", () => {
  const residents = [
    resident({ id: "r-1", displayName: "Michele Helsley", normalizedName: "michele helsley", normalizedLastName: "helsley", communityName: "Watermere at Frisco" }),
  ];
  const result = matchAxisCareClientToResident(
    {
      normalizedEmail: null,
      normalizedPhones: [],
      normalizedName: normalizeName("Michelle (Mick)", "Helsley"),
      normalizedLastName: "helsley",
      unitNumber: null,
      communityName: "Watermere at Frisco",
    },
    residents
  );
  assert.equal(result.residentId, "r-1");
  assert.equal(result.basis, "surname_and_community");
  assert.equal(result.requiresReview, true);
  assert.ok(result.reviewReason?.includes("Michele Helsley"));
});

test("surname_and_community never fires when normalizedLastName is omitted (existing callers unaffected)", () => {
  const residents = [resident({ id: "r-1", normalizedName: "jane smith", communityName: "Watermere at Frisco" })];
  const result = matchAxisCareClientToResident(
    { normalizedEmail: null, normalizedPhones: [], normalizedName: "jane doe", unitNumber: null, communityName: "Watermere at Frisco" },
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
