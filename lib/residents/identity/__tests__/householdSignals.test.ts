// Pure-function tests for ../householdSignals.ts. Run with:
//   npm run test:residentIdentity
import assert from "node:assert/strict";
import { generateHouseholdSignals } from "../householdSignals.ts";
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

test("1. same apartment is a household signal", () => {
  const a = resident({ id: "a", unitNumber: "6303" });
  const b = resident({ id: "b", unitNumber: "6303" });
  const signals = generateHouseholdSignals(a, b);
  assert.ok(signals.some((s) => s.signalType === "same_apartment"));
});

test("2. William Knight / Jane Knight: same phone + same apartment -> household evidence, but this module never mentions identity at all", () => {
  const a = resident({ id: "a", firstName: "William", lastName: "Knight", unitNumber: "4102", phone: "9725551212" });
  const b = resident({ id: "b", firstName: "Jane", lastName: "Knight", unitNumber: "4102", phone: "9725551212" });
  const signals = generateHouseholdSignals(a, b);
  assert.ok(signals.some((s) => s.signalType === "same_apartment"));
  assert.ok(signals.some((s) => s.signalType === "same_phone"));
});

test("3. same phone with different apartments is still a household signal", () => {
  const a = resident({ id: "a", unitNumber: "1101", phone: "9725551212" });
  const b = resident({ id: "b", unitNumber: "2202", phone: "9725551212" });
  const signals = generateHouseholdSignals(a, b);
  assert.ok(signals.some((s) => s.signalType === "same_phone"));
  assert.ok(!signals.some((s) => s.signalType === "same_apartment"));
});

test("4. same building/community alone (no apartment, no phone, no family contact match) is NEVER a freestanding signal — otherwise nearly every pair in a mostly-one-building community would qualify", () => {
  const a = resident({ id: "a", unitNumber: "1101", building: "Building A", communityCode: "watermere-frisco" });
  const b = resident({ id: "b", unitNumber: "2202", building: "Building A", communityCode: "watermere-frisco" });
  const signals = generateHouseholdSignals(a, b);
  assert.deepEqual(signals, []);
});

test("4b. same building and community IS included, but only as corroboration on top of an already-established signal (here, same phone)", () => {
  const a = resident({ id: "a", unitNumber: "1101", building: "Building A", communityCode: "watermere-frisco", phone: "9725551212" });
  const b = resident({ id: "b", unitNumber: "2202", building: "Building A", communityCode: "watermere-frisco", phone: "9725551212" });
  const signals = generateHouseholdSignals(a, b);
  assert.ok(signals.some((s) => s.signalType === "same_phone"));
  assert.ok(signals.some((s) => s.signalType === "same_building_and_community"));
});

test("5. same_building_and_community does not ALSO fire when they already share the same apartment (not additional context on top of apartment)", () => {
  const a = resident({ id: "a", unitNumber: "1101", building: "Building A", communityCode: "watermere-frisco" });
  const b = resident({ id: "b", unitNumber: "1101", building: "Building A", communityCode: "watermere-frisco" });
  const signals = generateHouseholdSignals(a, b);
  assert.ok(!signals.some((s) => s.signalType === "same_building_and_community"));
});

test("6. shared family/emergency contact phone is a household signal", () => {
  const a = resident({ id: "a", familyContactPhone: "9725551212" });
  const b = resident({ id: "b", familyContactPhone: "9725551212" });
  const signals = generateHouseholdSignals(a, b);
  assert.ok(signals.some((s) => s.signalType === "shared_family_contact"));
});

test("7. no household evidence at all produces no signals", () => {
  const a = resident({ id: "a", unitNumber: "1101" });
  const b = resident({ id: "b", unitNumber: "9909" });
  const signals = generateHouseholdSignals(a, b);
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
