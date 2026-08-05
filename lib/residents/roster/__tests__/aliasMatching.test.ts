// Tests for matchPerson's confirmed-alias tier (../matching.ts) — the
// mechanism that stops a resolved Resident Identity Resolution decision
// from being recreated as a duplicate on the next roster import. Run
// with: npm run test:residentIdentity
import assert from "node:assert/strict";
import { matchPerson } from "../matching.ts";
import type { LiveResident, NormalizedPerson } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function resident(overrides: Partial<LiveResident> & { id: string }): LiveResident {
  return {
    firstName: null,
    lastName: null,
    middleName: null,
    preferredName: null,
    displayName: null,
    fullName: null,
    unitNumber: null,
    building: null,
    communityCode: "watermere-frisco",
    isActive: true,
    ...overrides,
  };
}

function person(overrides: Partial<NormalizedPerson> & { firstName: string; lastName: string; apartment: string }): NormalizedPerson {
  return {
    sourceSheet: "Building 1",
    sourceRowNumber: 10,
    firstNameRaw: overrides.firstName,
    lastNameRaw: overrides.lastName,
    displayLabel: `${overrides.firstName} ${overrides.lastName}`,
    isPartOfCouple: false,
    phoneRaw: null,
    ...overrides,
  };
}

test("1. a roster row matching a confirmed alias resolves to the alias's canonical resident", () => {
  // Apartment deliberately does NOT match the resident's own apartment,
  // so tier 1 (exact name) and tier 2 (apartment + last-name-only) both
  // correctly fail first — this isolates the alias tier specifically.
  const elliott = resident({ id: "elliott", firstName: "Elliott", lastName: "Goldberg", unitNumber: "3107" });
  const aliases = [{ canonicalResidentId: "elliott", normalizedValue: "elliot goldberg" }];
  const result = matchPerson(person({ firstName: "elliot", lastName: "goldberg", apartment: "6303" }), [elliott], aliases);
  assert.equal(result.status, "matched");
  assert.equal(result.residentId, "elliott");
  assert.equal(result.method, "confirmed_alias_match");
  assert.equal(result.confidence, "high");
});

test("2. an alias whose canonical resident is no longer active (not in candidates) is not used", () => {
  const aliases = [{ canonicalResidentId: "merged-away-id", normalizedValue: "elliot goldberg" }];
  const result = matchPerson(person({ firstName: "elliot", lastName: "goldberg", apartment: "3107" }), [], aliases);
  assert.equal(result.status, "unmatched");
});

test("3. no aliases provided falls back to the ordinary unmatched result", () => {
  const result = matchPerson(person({ firstName: "elliot", lastName: "goldberg", apartment: "3107" }), []);
  assert.equal(result.status, "unmatched");
});

test("4. an exact name match still takes priority over the alias tier when both would apply", () => {
  const exact = resident({ id: "exact", firstName: "Elliot", lastName: "Goldberg", unitNumber: "3107" });
  const aliases = [{ canonicalResidentId: "someone-else", normalizedValue: "elliot goldberg" }];
  const result = matchPerson(person({ firstName: "elliot", lastName: "goldberg", apartment: "3107" }), [exact], aliases);
  assert.equal(result.residentId, "exact");
  assert.notEqual(result.method, "confirmed_alias_match");
});

// ─── Runner ──────────────────────────────────────────────────────────

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
