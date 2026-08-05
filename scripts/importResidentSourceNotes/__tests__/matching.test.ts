// Pure-function tests for ../matching.ts — the implementation of the
// import's 17 operating rules around resident matching. Run with:
//   npm run test:importResidentSourceNotes
import assert from "node:assert/strict";
import { matchFirstNamePair, matchResident } from "../matching.ts";
import type { LiveResident } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function resident(overrides: Partial<LiveResident> & { id: string }): LiveResident {
  return {
    firstName: null,
    lastName: null,
    displayName: null,
    fullName: null,
    unitNumber: null,
    ...overrides,
  };
}

const jerald = resident({ id: "jerald", firstName: "Jerald", lastName: "Maxwell", unitNumber: "7313" });
const elizabeth = resident({ id: "elizabeth", firstName: "Elizabeth", lastName: "Maxwell", unitNumber: "7313" });
const carolyn = resident({ id: "carolyn", firstName: "Carolyn", lastName: "Rikee", unitNumber: "10201" });
const virginia = resident({ id: "virginia", firstName: "Virginia", lastName: "Wynn", unitNumber: "9306" });
const johnny = resident({ id: "johnny", firstName: "Johnny", lastName: "Rivers", unitNumber: "1101" });
const lajuana = resident({ id: "lajuana", firstName: "Lajuana", lastName: "Rivers", unitNumber: "1101" });
const johnA = resident({ id: "john-a", firstName: "John", lastName: "Adams", unitNumber: "2201" });
const johnB = resident({ id: "john-b", firstName: "John", lastName: "Betts", unitNumber: "2202" });

// ─── Apartment + name (rules 4, 5) ──────────────────────────────────────

test("1. exact apartment + name match is high confidence", () => {
  const result = matchResident("Carolyn Rikee", "10201", [carolyn, virginia]);
  assert.equal(result.status, "matched");
  assert.equal(result.residentId, "carolyn");
  assert.equal(result.confidence, "high");
  assert.equal(result.method, "apartment_and_name");
});

test("2. apartment alone is never used when more than one resident occupies it (rule 7)", () => {
  // Both Jerald and Elizabeth occupy 7313; a source name that matches
  // neither of them must not fall back to "pick one" — it's ambiguous.
  const result = matchResident("Someone Else", "7313", [jerald, elizabeth]);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.residentId, null);
});

test("3. multiple occupants disambiguated by a unique name match is still accepted", () => {
  const result = matchResident("Jerald Maxwell", "7313", [jerald, elizabeth]);
  assert.equal(result.status, "matched");
  assert.equal(result.residentId, "jerald");
  assert.equal(result.confidence, "high");
});

// ─── Name-only, apartment unavailable (rule 6) ──────────────────────────

test("4. unique normalized full-name match accepted only when apartment is unavailable", () => {
  const result = matchResident("Virginia Wynn", undefined, [carolyn, virginia]);
  assert.equal(result.status, "matched");
  assert.equal(result.residentId, "virginia");
  assert.equal(result.method, "unique_normalized_full_name");
});

test("5. name-only match rejected when the same name is ambiguous", () => {
  const virginia2 = resident({ id: "virginia-2", firstName: "Virginia", lastName: "Wynn", unitNumber: "4401" });
  const result = matchResident("Virginia Wynn", undefined, [virginia, virginia2]);
  assert.equal(result.status, "ambiguous");
});

test("6. unmatched when nothing corresponds to the source name", () => {
  const result = matchResident("Nobody Here", undefined, [carolyn, virginia]);
  assert.equal(result.status, "unmatched");
});

// ─── Couple matching (rule 8, first-name pairs) ─────────────────────────

test("7. matchFirstNamePair resolves a couple when both first names are unique", () => {
  const { a, b } = matchFirstNamePair("Johnny", "Lajuana", [johnny, lajuana, carolyn]);
  assert.equal(a.status, "matched");
  assert.equal(a.residentId, "johnny");
  assert.equal(b.status, "matched");
  assert.equal(b.residentId, "lajuana");
});

// ─── Ambiguous first-name rejection ─────────────────────────────────────

test("8. matchFirstNamePair rejects a first name shared by multiple residents", () => {
  const { a } = matchFirstNamePair("John", "Lajuana", [johnA, johnB, lajuana]);
  assert.equal(a.status, "ambiguous");
  assert.deepEqual([...(a.ambiguousCandidateIds ?? [])].sort(), ["john-a", "john-b"]);
});

test("9. matchFirstNamePair reports unmatched when a first name has no candidate", () => {
  const { b } = matchFirstNamePair("Johnny", "NoSuchPerson", [johnny, lajuana]);
  assert.equal(b.status, "unmatched");
});

// ─── Initials handling ───────────────────────────────────────────────────

test("10. initial-form first name ('E. Goldberg') matches on last name + starting letter", () => {
  const elaine = resident({ id: "elaine", firstName: "Elaine", lastName: "Goldberg", unitNumber: "6703" });
  const result = matchResident("E. Goldberg", "6703", [elaine]);
  assert.equal(result.status, "matched");
  assert.equal(result.confidence, "high");
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
