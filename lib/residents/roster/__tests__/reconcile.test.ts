// Pure-function tests for ../reconcile.ts. Run with:
//   npm run test:residentRoster
import assert from "node:assert/strict";
import { normalizeRawRowToPersons, reconcileRoster } from "../reconcile.ts";
import type { LiveResident, RawRosterRow } from "../types.ts";

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

function row(overrides: Partial<RawRosterRow> & { apartmentRaw: string; lastNameRaw: string; firstNamesRaw: string }): RawRosterRow {
  return {
    sourceSheet: "Building 1",
    sourceRowNumber: 10,
    phoneRaw: null,
    alternatePhoneRaw: null,
    emailRaw: null,
    noteRaw: null,
    ...overrides,
  };
}

// ─── normalizeRawRowToPersons ───────────────────────────────────────────

test("1. a single-person row produces exactly one NormalizedPerson", () => {
  const persons = normalizeRawRowToPersons(row({ apartmentRaw: "1302", lastNameRaw: "Morish", firstNamesRaw: "Janet" }));
  assert.equal(persons.length, 1);
  assert.equal(persons[0].isPartOfCouple, false);
});

test("2. a couple row produces exactly two NormalizedPersons, both marked as part of a couple", () => {
  const persons = normalizeRawRowToPersons(row({ apartmentRaw: "1301", lastNameRaw: "Hatch", firstNamesRaw: "Bob & Pam" }));
  assert.equal(persons.length, 2);
  assert.ok(persons.every((p) => p.isPartOfCouple));
  assert.equal(persons[0].firstNameRaw, "Bob");
  assert.equal(persons[1].firstNameRaw, "Pam");
});

// ─── reconcileRoster ─────────────────────────────────────────────────────

test("2b. a row whose last name is a vacancy marker ('Unoccupied'/'Vacant') produces zero persons, even with a stray artifact in the first-name cell", () => {
  const vacant1 = normalizeRawRowToPersons(row({ apartmentRaw: "2404", lastNameRaw: "Unoccupied", firstNamesRaw: "46176" }));
  assert.deepEqual(vacant1, []);
  const vacant2 = normalizeRawRowToPersons(row({ apartmentRaw: "3107", lastNameRaw: "VACANT", firstNamesRaw: "" }));
  assert.deepEqual(vacant2, []);
});

test("3. an unmatched name at a vacant apartment is classified new_resident", () => {
  const rows = [row({ apartmentRaw: "1500", lastNameRaw: "Newperson", firstNamesRaw: "Nancy" })];
  const result = reconcileRoster(rows, [], []);
  assert.equal(result.personOutcomes[0].classification, "new_resident");
});

test("4. an exact-name match at the same apartment is classified exact_match", () => {
  const carl = resident({ id: "carl", firstName: "Carl", lastName: "Reedy", unitNumber: "1201" });
  const rows = [row({ apartmentRaw: "1201", lastNameRaw: "Reedy", firstNamesRaw: "Carl" })];
  const result = reconcileRoster(rows, [], [carl]);
  assert.equal(result.personOutcomes[0].classification, "exact_match");
  assert.equal(result.personOutcomes[0].residentId, "carl");
});

test("5. an exact-name match at a different apartment is classified apartment_change, preserving the resident id", () => {
  const carl = resident({ id: "carl", firstName: "Carl", lastName: "Reedy", unitNumber: "1201" });
  const rows = [row({ apartmentRaw: "1305", lastNameRaw: "Reedy", firstNamesRaw: "Carl" })];
  const result = reconcileRoster(rows, [], [carl]);
  assert.equal(result.personOutcomes[0].classification, "apartment_change");
  assert.equal(result.personOutcomes[0].residentId, "carl");
  assert.equal(result.personOutcomes[0].priorUnit, "1201");
});

test("6. apartment reassigned: a name that doesn't match the current occupant is a new_resident, and the current occupant is NOT auto-displaced", () => {
  const oldOccupant = resident({ id: "old", firstName: "Old", lastName: "Occupant", unitNumber: "1201" });
  const rows = [row({ apartmentRaw: "1201", lastNameRaw: "Newperson", firstNamesRaw: "Nancy" })];
  const result = reconcileRoster(rows, [], [oldOccupant]);
  assert.equal(result.personOutcomes[0].classification, "new_resident");
  // The old occupant was never matched by this run, so shows up as absent
  // — never silently reassigned or removed.
  assert.equal(result.absentResidents.length, 1);
  assert.equal(result.absentResidents[0].residentId, "old");
});

test("7. an existing resident absent from every row in the roster is reported, never given a status change", () => {
  const carl = resident({ id: "carl", firstName: "Carl", lastName: "Reedy", unitNumber: "1201" });
  const stillThere = resident({ id: "still", firstName: "Still", lastName: "Here", unitNumber: "1202" });
  const rows = [row({ apartmentRaw: "1202", lastNameRaw: "Here", firstNamesRaw: "Still" })];
  const result = reconcileRoster(rows, [], [carl, stillThere]);
  assert.equal(result.absentResidents.length, 1);
  assert.equal(result.absentResidents[0].residentId, "carl");
  // The reconciliation result carries no field capable of representing a
  // status/is_active change — absence is reported, not applied.
  assert.ok(!("status" in result.absentResidents[0]));
  assert.ok(!("isActive" in result.absentResidents[0]));
});

test("8. two source rows claiming the same apartment are both flagged possible_duplicate, neither auto-applied", () => {
  const rows = [
    row({ apartmentRaw: "1201", lastNameRaw: "Reedy", firstNamesRaw: "Carl", sourceRowNumber: 10 }),
    row({ apartmentRaw: "1201", lastNameRaw: "Reedy", firstNamesRaw: "Carla", sourceRowNumber: 20 }),
  ];
  const result = reconcileRoster(rows, [], []);
  assert.equal(result.personOutcomes.length, 2);
  assert.ok(result.personOutcomes.every((o) => o.classification === "possible_duplicate"));
});

test("9. a Directory-sheet name disagreement is surfaced as an informational note, never overrides the Building-sheet classification", () => {
  const carl = resident({ id: "carl", firstName: "Carl", lastName: "Reedy", unitNumber: "1201" });
  const rows = [row({ apartmentRaw: "1201", lastNameRaw: "Reedy", firstNamesRaw: "Carl" })];
  const directory = [{ sourceRowNumber: 5, apartmentRaw: "1201", lastNameRaw: "Reedy", firstNamesRaw: "Someone Else" }];
  const result = reconcileRoster(rows, directory, [carl]);
  assert.equal(result.personOutcomes[0].classification, "exact_match");
  assert.ok(result.personOutcomes[0].directoryDiscrepancy);
});

test("10. reconciliation never produces any residents.status/is_active value anywhere in its output shape", () => {
  const rows = [row({ apartmentRaw: "1201", lastNameRaw: "Reedy", firstNamesRaw: "Carl" })];
  const result = reconcileRoster(rows, [], []);
  const serialized = JSON.stringify(result);
  assert.ok(!/"deceased"|"moved_out"|is_active/i.test(serialized));
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
