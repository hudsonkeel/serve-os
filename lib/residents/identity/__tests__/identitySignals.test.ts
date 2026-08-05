// Pure-function tests for ../identitySignals.ts. Run with:
//   npm run test:residentIdentity
import assert from "node:assert/strict";
import { generateIdentitySignals } from "../identitySignals.ts";
import type { LiveResidentForIdentity } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function resident(overrides: Partial<LiveResidentForIdentity> & { id: string }): LiveResidentForIdentity {
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
    phone: null,
    email: null,
    dateOfBirth: null,
    familyContactName: null,
    familyContactPhone: null,
    needsReview: null,
    isActive: true,
    sourceSystem: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const emptyContext = { confirmedAliases: [], absentResidentIds: new Set<string>(), recentlyCreatedResidentIds: new Set<string>() };

test("1. Elliot/Elliott Goldberg: last name identical, first names differ by one character -> strong signal", () => {
  const a = resident({ id: "a", firstName: "Elliot", lastName: "Goldberg", unitNumber: "6303" });
  const b = resident({ id: "b", firstName: "Elliott", lastName: "Goldberg", unitNumber: "3107" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.ok(signals.some((s) => s.signalType === "first_name_edit_distance_one" && s.strength === "strong"));
});

test("2. Susan Elliot/Elliott: identical first name, last names differ by one character -> strong signal", () => {
  const a = resident({ id: "a", firstName: "Susan", lastName: "Elliot" });
  const b = resident({ id: "b", firstName: "Susan", lastName: "Elliott" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.ok(signals.some((s) => s.signalType === "last_name_edit_distance_one" && s.strength === "strong"));
});

test("3. exact full name match", () => {
  const a = resident({ id: "a", firstName: "Jane", lastName: "Smith" });
  const b = resident({ id: "b", firstName: "Jane", lastName: "Smith" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.ok(signals.some((s) => s.signalType === "exact_full_name" && s.strength === "strong"));
});

test("4. Marilyn Born / Marilyn Holstein Born: a middle name embedded in the first-name field is a compound-name variant, not a different person", () => {
  const a = resident({ id: "a", firstName: "Marilyn", lastName: "Born" });
  const b = resident({ id: "b", firstName: "Marilyn Holstein", lastName: "Born" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.ok(signals.some((s) => s.signalType === "compound_name_variant" && s.strength === "strong"));
});

test("5. Amy Nickell / Amy Nickell-Willson: a hyphenated compound surname is a variant, not a different person", () => {
  const a = resident({ id: "a", firstName: "Amy", lastName: "Nickell" });
  const b = resident({ id: "b", firstName: "Amy", lastName: "Nickell-Willson" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.ok(signals.some((s) => s.signalType === "compound_name_variant"));
});

test("6. William Knight / Jane Knight: same last name, unrelated first names, no DOB -> no identity signal at all (this is the core Phase 2 regression)", () => {
  const a = resident({ id: "a", firstName: "William", lastName: "Knight" });
  const b = resident({ id: "b", firstName: "Jane", lastName: "Knight" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.deepEqual(signals, []);
});

test("7. same DOB is a strong signal", () => {
  const a = resident({ id: "a", dateOfBirth: "1940-01-01" });
  const b = resident({ id: "b", dateOfBirth: "1940-01-01" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.ok(signals.some((s) => s.signalType === "same_dob" && s.strength === "strong"));
});

test("8. conflicting DOB is a negative signal, not a strong one", () => {
  const a = resident({ id: "a", dateOfBirth: "1940-01-01" });
  const b = resident({ id: "b", dateOfBirth: "1955-06-15" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  const dobSignal = signals.find((s) => s.signalType === "conflicting_dob");
  assert.ok(dobSignal);
  assert.equal(dobSignal!.strength, "negative");
});

test("9. same DOB with unrelated legal names is uncertain, not a confident match", () => {
  const a = resident({ id: "a", firstName: "Robert", lastName: "DeBoom", dateOfBirth: "1940-01-01" });
  const b = resident({ id: "b", firstName: "Geri", lastName: "Forsythe", dateOfBirth: "1940-01-01" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.ok(signals.some((s) => s.signalType === "same_dob"));
  const conflict = signals.find((s) => s.signalType === "conflicting_legal_name");
  assert.ok(conflict);
  assert.equal(conflict!.strength, "negative");
});

test("10. no similarity at all produces no signals", () => {
  const a = resident({ id: "a", firstName: "Alice", lastName: "Anderson", unitNumber: "1101" });
  const b = resident({ id: "b", firstName: "Zack", lastName: "Ziegler", unitNumber: "9909" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.deepEqual(signals, []);
});

test("11. a confirmed alias linking one name to the other resident is a strong signal", () => {
  const a = resident({ id: "a", firstName: "Elliot", lastName: "Goldberg" });
  const b = resident({ id: "b", firstName: "Elliott", lastName: "Goldberg" });
  const context = { ...emptyContext, confirmedAliases: [{ canonicalResidentId: "b", normalizedValue: "elliot goldberg" }] };
  const signals = generateIdentitySignals(a, b, context);
  assert.ok(signals.some((s) => s.signalType === "confirmed_alias_match"));
});

test("12. one resident absent from roster while a similarly-named one is recently new -> contextual signal", () => {
  const a = resident({ id: "a", firstName: "Doris", lastName: "Kakazu" });
  const b = resident({ id: "b", firstName: "Doris", lastName: "Kakazu" });
  const context = { confirmedAliases: [], absentResidentIds: new Set(["a"]), recentlyCreatedResidentIds: new Set(["b"]) };
  const signals = generateIdentitySignals(a, b, context);
  assert.ok(signals.some((s) => s.signalType === "absent_while_similar_present"));
});

test("13. regression: absent + recently-created flags alone, with NO name similarity, must never produce a signal", () => {
  const a = resident({ id: "a", firstName: "Marilyn", lastName: "Born" });
  const b = resident({ id: "b", firstName: "Gerald", lastName: "Gould" });
  const context = { confirmedAliases: [], absentResidentIds: new Set(["a"]), recentlyCreatedResidentIds: new Set(["b"]) };
  const signals = generateIdentitySignals(a, b, context);
  assert.deepEqual(signals, []);
});

test("14. identity signals never mention phone, apartment, or email — those are household questions", () => {
  const a = resident({ id: "a", firstName: "Bob", lastName: "Hatch", phone: "9729712460", unitNumber: "1101" });
  const b = resident({ id: "b", firstName: "Robert", lastName: "Hatch", phone: "9729712460", unitNumber: "1101" });
  const signals = generateIdentitySignals(a, b, emptyContext);
  assert.deepEqual(signals, []);
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
