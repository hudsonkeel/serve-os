// Pure-function tests for ../matching.ts. Run with:
//   npm run test:residentRoster
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

const carl = resident({ id: "carl", firstName: "Carl", lastName: "Reedy", unitNumber: "1201" });
const patti = resident({ id: "patti", firstName: "Patti Ann", lastName: "Witherspoon", unitNumber: "1210" });
const bob = resident({ id: "bob", firstName: "Robert", lastName: "Hatch", unitNumber: "1301" });
const janetA = resident({ id: "janet-a", firstName: "Janet", lastName: "Morish", unitNumber: "1302" });
const janetB = resident({ id: "janet-b", firstName: "Janet", lastName: "Morish", unitNumber: "9999" });

test("1. exact normalized (last, first) match at the same apartment -> high confidence, apartment_matches", () => {
  const result = matchPerson(person({ firstName: "carl", lastName: "reedy", apartment: "1201" }), [carl, patti]);
  assert.equal(result.status, "matched");
  assert.equal(result.residentId, "carl");
  assert.equal(result.confidence, "high");
  assert.equal(result.method, "unique_name_apartment_matches");
});

test("2. exact normalized (last, first) match at a DIFFERENT apartment -> apartment_differs (apartment change candidate)", () => {
  const result = matchPerson(person({ firstName: "carl", lastName: "reedy", apartment: "1305" }), [carl, patti]);
  assert.equal(result.status, "matched");
  assert.equal(result.residentId, "carl");
  assert.equal(result.method, "unique_name_apartment_differs");
});

test("3. name-only ambiguity: two residents share the exact normalized name", () => {
  const result = matchPerson(person({ firstName: "janet", lastName: "morish", apartment: "1302" }), [janetA, janetB]);
  assert.equal(result.status, "ambiguous");
  assert.deepEqual([...(result.ambiguousCandidateIds ?? [])].sort(), ["janet-a", "janet-b"]);
});

test("4. apartment + last-name-only match (first name variant) -> medium confidence, still matched", () => {
  // Resident on file is "Robert Hatch" at 1301; roster says "Bob Hatch" at 1301.
  const result = matchPerson(person({ firstName: "bob", lastName: "hatch", apartment: "1301" }), [bob]);
  assert.equal(result.status, "matched");
  assert.equal(result.residentId, "bob");
  assert.equal(result.confidence, "medium");
});

test("5. apartment-only ambiguity: multiple residents at the apartment share the last name but none match first name", () => {
  const bob2 = resident({ id: "bob2", firstName: "William", lastName: "Hatch", unitNumber: "1301" });
  const result = matchPerson(person({ firstName: "bob", lastName: "hatch", apartment: "1301" }), [bob, bob2]);
  assert.equal(result.status, "ambiguous");
});

test("6. no match at all -> unmatched", () => {
  const result = matchPerson(person({ firstName: "nobody", lastName: "here", apartment: "1201" }), [carl, patti]);
  assert.equal(result.status, "unmatched");
});

test("7. unmatched when the apartment is occupied by a completely different name (never inferred as the same person)", () => {
  const result = matchPerson(person({ firstName: "new", lastName: "person", apartment: "1201" }), [carl]);
  assert.equal(result.status, "unmatched");
  assert.equal(result.residentId, null);
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
