// Add New Client phase — pure-function tests for ../duplicateCheckLogic.ts.
// Run with:
//   node --experimental-strip-types --conditions=react-server lib/residents/addClient/__tests__/duplicateCheckLogic.test.ts
import assert from "node:assert/strict";
import { scanForIdentitySignalMatches } from "../duplicateCheckLogic.ts";
import type { NewClientCandidatePerson } from "../duplicateCheckLogic.ts";
import type { LiveResident } from "../../roster/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function person(overrides: Partial<NewClientCandidatePerson> & { firstName: string; lastName: string }): NewClientCandidatePerson {
  return { dateOfBirth: null, phone: null, unitNumber: null, ...overrides };
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
    communityCode: "watermere-heritage-ranch",
    isActive: true,
    ...overrides,
  };
}

test("name alone is never proof: an unrelated pair with no signals at all -> no match", () => {
  const p = person({ firstName: "William", lastName: "Knight" });
  const candidates = [resident({ id: "r1", firstName: "Jane", lastName: "Knight" })];
  const found = scanForIdentitySignalMatches(p, candidates, [], { communityId: "c1" });
  assert.equal(found.length, 0);
});

test("exact full name IS one strong signal on its own (identitySignals.ts's own exact_full_name tier) -> probable, without corroboration", () => {
  const p = person({ firstName: "Jane", lastName: "Doe" });
  const candidates = [resident({ id: "r1", firstName: "Jane", lastName: "Doe" })];
  const found = scanForIdentitySignalMatches(p, candidates, [], { communityId: "c1" });
  assert.equal(found.length, 1);
  assert.equal(found[0].band, "probable");
});

test("exact name + shared phone (household corroboration) upgrades probable -> high", () => {
  const p = person({ firstName: "Jane", lastName: "Doe", phone: "555-1234" });
  const candidates = [resident({ id: "r1", firstName: "Jane", lastName: "Doe", phone: "555-1234" })];
  const found = scanForIdentitySignalMatches(p, candidates, [], { communityId: "c1" });
  assert.equal(found.length, 1);
  assert.equal(found[0].band, "high");
});

test("conflicting DOB downgrades even an exact name match to 'needs_investigation' (excluded — never a suggestion)", () => {
  const p = person({ firstName: "Jane", lastName: "Doe", dateOfBirth: "1990-01-01" });
  const candidates = [resident({ id: "r1", firstName: "Jane", lastName: "Doe", dateOfBirth: "1955-06-06" })];
  const found = scanForIdentitySignalMatches(p, candidates, [], { communityId: "c1" });
  assert.equal(found.length, 0);
});

test("shared phone alone, with unrelated names, never produces a match (household evidence cannot manufacture identity)", () => {
  const p = person({ firstName: "Alice", lastName: "Smith", phone: "555-1234" });
  const candidates = [resident({ id: "r1", firstName: "Bob", lastName: "Jones", phone: "555-1234" })];
  const found = scanForIdentitySignalMatches(p, candidates, [], { communityId: "c1" });
  assert.equal(found.length, 0);
});

test("cross-community scan (communityId: null): a shared phone still corroborates probable -> high, since phone isn't community-relative", () => {
  const p = person({ firstName: "Jane", lastName: "Doe", phone: "555-1234" });
  const candidates = [resident({ id: "r1", firstName: "Jane", lastName: "Doe", phone: "555-1234" })];
  const found = scanForIdentitySignalMatches(p, candidates, [], { communityId: null });
  assert.equal(found.length, 1);
  assert.equal(found[0].band, "high");
});

test("cross-community scan never claims same_apartment even when unit numbers happen to match textually (communities differ/unknown)", () => {
  const p = person({ firstName: "Jane", lastName: "Doe", unitNumber: "204" });
  const candidates = [resident({ id: "r1", firstName: "Jane", lastName: "Doe", unitNumber: "204" })];
  const found = scanForIdentitySignalMatches(p, candidates, [], { communityId: null });
  assert.equal(found.length, 1);
  assert.equal(found[0].band, "probable");
});

test("a confirmed alias for this exact name is a strong signal on its own", () => {
  const p = person({ firstName: "Bobby", lastName: "Smithe" });
  const candidates = [resident({ id: "r1", firstName: "Robert", lastName: "Smith" })];
  const found = scanForIdentitySignalMatches(p, candidates, [{ canonicalResidentId: "r1", normalizedValue: "bobby smithe" }], {
    communityId: "c1",
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].band, "probable");
});

test("two credible in-community candidates both surface — never silently picks one", () => {
  const p = person({ firstName: "Jane", lastName: "Doe" });
  const candidates = [
    resident({ id: "r1", firstName: "Jane", lastName: "Doe" }),
    resident({ id: "r2", firstName: "Jane", lastName: "Doe", building: "B" }),
  ];
  const found = scanForIdentitySignalMatches(p, candidates, [], { communityId: "c1" });
  assert.equal(found.length, 2);
});

let passed = 0;
for (const t of tests) {
  t.fn();
  passed++;
  console.log(`ok - ${t.name}`);
}
console.log(`\n${passed}/${tests.length} passed`);
