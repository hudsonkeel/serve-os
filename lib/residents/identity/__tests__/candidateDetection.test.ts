// Pure-function tests for ../candidateDetection.ts. Run with:
//   npm run test:residentIdentity
import assert from "node:assert/strict";
import { buildSuppressionSet, detectIdentityCandidates, suppressionKey } from "../candidateDetection.ts";
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

const elliot = resident({ id: "elliot", firstName: "Elliot", lastName: "Goldberg", unitNumber: "6303" });
const elliott = resident({ id: "elliott", firstName: "Elliott", lastName: "Goldberg", unitNumber: "3107" });
const unrelated = resident({ id: "unrelated", firstName: "Zack", lastName: "Ziegler", unitNumber: "9909" });
const william = resident({ id: "william", firstName: "William", lastName: "Knight", unitNumber: "4102", phone: "9725551212" });
const janeKnight = resident({ id: "jane", firstName: "Jane", lastName: "Knight", unitNumber: "4102", phone: "9725551212" });

const emptyContext = { confirmedAliases: [], absentResidentIds: new Set<string>(), recentlyCreatedResidentIds: new Set<string>() };

test("1. detects the known Elliot/Elliott pair among a larger population", () => {
  const result = detectIdentityCandidates({
    residents: [elliot, elliott, unrelated],
    context: emptyContext,
    suppressedPairs: new Set(),
  });
  assert.equal(result.identityCandidates.length, 1);
  assert.deepEqual([...result.identityCandidates[0].residentIds].sort(), ["elliot", "elliott"]);
});

test("2. THE CORE PHASE 2 REGRESSION: William Knight / Jane Knight — same phone, same apartment, same last name, different first names — produces ZERO identity candidates and exactly ONE household link, never the reverse", () => {
  const result = detectIdentityCandidates({
    residents: [william, janeKnight],
    context: emptyContext,
    suppressedPairs: new Set(),
  });
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.householdLinks.length, 1);
  assert.equal(result.householdLinks[0].relationshipHint, "likely_spouse");
  assert.deepEqual([...result.householdLinks[0].residentIds].sort(), ["jane", "william"]);
});

test("3. a suppressed pair is hard-excluded from IDENTITY candidate generation, but still evaluated for household evidence", () => {
  const suppressed = buildSuppressionSet([{ residentIdA: "elliot", residentIdB: "elliott" }]);
  const result = detectIdentityCandidates({
    residents: [elliot, elliott, unrelated],
    context: emptyContext,
    suppressedPairs: suppressed,
  });
  assert.equal(result.identityCandidates.length, 0);
  // Elliot/Elliott share no apartment/phone/family contact in this fixture,
  // so no household evidence exists either — the suppression itself
  // doesn't fabricate household evidence, it just stops blocking it.
  assert.equal(result.householdLinks.length, 0);
});

test("4. suppressionKey is order-independent", () => {
  assert.equal(suppressionKey("a", "b"), suppressionKey("b", "a"));
});

test("5. detection is deterministic — identical input twice produces identical output", () => {
  const input = { residents: [elliot, elliott, unrelated, william, janeKnight], context: emptyContext, suppressedPairs: new Set<string>() };
  const first = detectIdentityCandidates(input);
  const second = detectIdentityCandidates(input);
  assert.deepEqual(first, second);
});

test("6. no signal at all between any pair produces zero candidates and zero household links", () => {
  const result = detectIdentityCandidates({
    residents: [unrelated, resident({ id: "other", firstName: "Marge", lastName: "Simpson", unitNumber: "1001" })],
    context: emptyContext,
    suppressedPairs: new Set(),
  });
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.householdLinks.length, 0);
});

test("7. a shared-household pair with DIFFERENT last names gets the 'shared_household' hint, not 'likely_spouse'", () => {
  const bob = resident({ id: "bob", firstName: "Bob", lastName: "Ortiz", unitNumber: "2201", phone: "9725559999" });
  const carla = resident({ id: "carla", firstName: "Carla", lastName: "Diaz", unitNumber: "2201", phone: "9725559999" });
  const result = detectIdentityCandidates({ residents: [bob, carla], context: emptyContext, suppressedPairs: new Set() });
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.householdLinks.length, 1);
  assert.equal(result.householdLinks[0].relationshipHint, "shared_household");
});

test("8. a real identity candidate carries its household evidence as separate householdContext, never merged into evidence", () => {
  const susanA = resident({ id: "susanA", firstName: "Susan", lastName: "Elliot", unitNumber: "7404", phone: "9725550000" });
  const susanB = resident({ id: "susanB", firstName: "Susan", lastName: "Elliott", unitNumber: "7404", phone: "9725550000" });
  const result = detectIdentityCandidates({ residents: [susanA, susanB], context: emptyContext, suppressedPairs: new Set() });
  assert.equal(result.identityCandidates.length, 1);
  const candidate = result.identityCandidates[0];
  // Structurally guaranteed, not just a runtime check: IdentitySignalType
  // has no "same_apartment"/"same_phone" member, so `evidence` (typed as
  // IdentityEvidenceSignal[]) could never contain a household signal in
  // the first place — the type system itself enforces the separation.
  assert.ok(candidate.householdContext.some((h) => h.signalType === "same_apartment"));
  assert.equal(result.householdLinks.length, 0);
});

test("9. a pair claimed by integrityClaimedPairs (Resident Data Integrity) is excluded from BOTH identity AND household evidence — stronger than an ordinary suppression", () => {
  const bob = resident({ id: "bob2", firstName: "Bob", lastName: "Ortiz", unitNumber: "2202", phone: "9725559998" });
  const bobDupe = resident({ id: "bob2dupe", firstName: "Bob", lastName: "Ortiz", unitNumber: "2202", phone: "9725559998" });
  const claimed = new Set([suppressionKey("bob2", "bob2dupe")]);
  const result = detectIdentityCandidates({
    residents: [bob, bobDupe],
    context: emptyContext,
    suppressedPairs: new Set(),
    integrityClaimedPairs: claimed,
  });
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.householdLinks.length, 0);
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
