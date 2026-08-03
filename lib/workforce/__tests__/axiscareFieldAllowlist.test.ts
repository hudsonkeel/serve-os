// Pure-function tests for the AxisCare caregiver field allowlist — see
// lib/workforce/axiscareFieldAllowlist.ts. Same dependency-free
// node:assert convention as lib/integrations/axiscare/__tests__/sanitization.test.ts.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/axiscareFieldAllowlist.test.ts
import assert from "node:assert/strict";
import {
  applyAxisCareFieldAllowlist,
  deriveCanonicalIdentityFromAxisCare,
  extractAxisCareCaregiverIdentity,
} from "../axiscareFieldAllowlist.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// Fictional fixture, real live-confirmed field shape (see
// docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md).
const FIXTURE = {
  id: 42,
  firstName: "Jamie",
  middleInitial: "R",
  lastName: "Doe",
  goesBy: "JD",
  gender: "F",
  dateOfBirth: "1990-01-01",
  ethnicity: "Prefers not to say",
  status: { active: true, label: "Active" },
  classes: [{ code: "CNA", label: "CERTIFIED NURSES AIDE" }],
  hireDate: "2019-03-13",
  startDate: "2020-02-03",
  terminationDate: null,
  administrators: [{ id: 1, name: "Admin Person" }],
  region: { id: 1, name: "Waco" },
  referredBy: null,
  payrollId: "PR-999",
  mailingAddress: { streetAddress1: "123 Main St", city: "Waco", state: "TX", postalCode: "76710" },
  homePhone: "555-555-5555",
  mobilePhone: "555-555-5556",
  otherPhone: "555-555-5557",
  personalEmail: "jamie@example.com",
  externalId: "ext-1",
  acceptableDrivingDistance: 50,
  payRate: "15.001",
  ssn: "111-11-1111",
  driverLicenseNumber: "D400-7836-0001",
};

test("applyAxisCareFieldAllowlist never includes ssn, payRate, driverLicenseNumber, payrollId, mailingAddress, acceptableDrivingDistance, administrators, referredBy", () => {
  const allowed = applyAxisCareFieldAllowlist(FIXTURE);
  const serialized = JSON.stringify(allowed);
  for (const forbidden of ["ssn", "payRate", "driverLicense", "payrollId", "mailingAddress", "acceptableDrivingDistance", "PR-999", "111-11-1111", "D400-7836-0001"]) {
    assert.equal(serialized.includes(forbidden), false, `allowlisted output must never contain "${forbidden}"`);
  }
});

test("applyAxisCareFieldAllowlist preserves the fields the mission actually needs", () => {
  const allowed = applyAxisCareFieldAllowlist(FIXTURE);
  assert.equal(allowed.firstName, "Jamie");
  assert.equal(allowed.lastName, "Doe");
  assert.equal(allowed.statusActive, true);
  assert.equal(allowed.statusLabel, "Active");
  assert.deepEqual(allowed.classes, [{ code: "CNA", label: "CERTIFIED NURSES AIDE" }]);
  assert.equal(allowed.regionName, "Waco");
  assert.equal(allowed.personalEmail, "jamie@example.com");
  assert.equal(allowed.dateOfBirth, "1990-01-01");
  assert.equal(allowed.gender, "F");
  assert.equal(allowed.externalId, "ext-1");
});

test("applyAxisCareFieldAllowlist handles a missing/malformed record without throwing", () => {
  assert.doesNotThrow(() => applyAxisCareFieldAllowlist(null));
  assert.doesNotThrow(() => applyAxisCareFieldAllowlist(undefined));
  assert.doesNotThrow(() => applyAxisCareFieldAllowlist("not an object"));
  const empty = applyAxisCareFieldAllowlist({});
  assert.equal(empty.firstName, null);
  assert.deepEqual(empty.classes, []);
});

test("extractAxisCareCaregiverIdentity reads id and builds a display name, never leaks anything else", () => {
  const identity = extractAxisCareCaregiverIdentity(FIXTURE);
  assert.equal(identity.vendorRecordId, "42");
  assert.equal(identity.vendorDisplayName, "Jamie Doe");
});

test("extractAxisCareCaregiverIdentity handles a numeric-string id and a missing name gracefully", () => {
  assert.deepEqual(extractAxisCareCaregiverIdentity({ id: "abc-1" }), {
    vendorRecordId: "abc-1",
    vendorDisplayName: null,
  });
  assert.deepEqual(extractAxisCareCaregiverIdentity({}), { vendorRecordId: null, vendorDisplayName: null });
});

// ─── deriveCanonicalIdentityFromAxisCare ────────────────────────────────
// See the "Unnamed workforce member" fix — a new standalone workforce
// member must be initialized with a real name at creation, not left to be
// computed later.
test("deriveCanonicalIdentityFromAxisCare joins legal first/last name for displayName, and captures goesBy separately as preferredName", () => {
  const identity = deriveCanonicalIdentityFromAxisCare({ firstName: "Jamie", lastName: "Doe", goesBy: "JD" }, "Jamie Doe");
  assert.equal(identity.displayName, "Jamie Doe");
  assert.equal(identity.legalFirstName, "Jamie");
  assert.equal(identity.legalLastName, "Doe");
  assert.equal(identity.preferredName, "JD");
});

test("deriveCanonicalIdentityFromAxisCare falls back to vendorDisplayName when firstName/lastName are both missing", () => {
  const identity = deriveCanonicalIdentityFromAxisCare({ firstName: null, lastName: null, goesBy: null }, "Legacy Vendor Name");
  assert.equal(identity.displayName, "Legacy Vendor Name");
});

test("deriveCanonicalIdentityFromAxisCare returns a null displayName only when no name data exists anywhere", () => {
  const identity = deriveCanonicalIdentityFromAxisCare({ firstName: null, lastName: null, goesBy: null }, null);
  assert.equal(identity.displayName, null);
});

test("deriveCanonicalIdentityFromAxisCare handles a first-name-only or last-name-only record", () => {
  assert.equal(deriveCanonicalIdentityFromAxisCare({ firstName: "Jamie", lastName: null, goesBy: null }, null).displayName, "Jamie");
  assert.equal(deriveCanonicalIdentityFromAxisCare({ firstName: null, lastName: "Doe", goesBy: null }, null).displayName, "Doe");
});

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
