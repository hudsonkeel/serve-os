import assert from "node:assert/strict";
import { describeAxisCareClientCreatePayload } from "../clientCreateSummary.ts";
import { AXISCARE_INACTIVE_STATUS, type AxisCareClientCreateRequest } from "../clientCreateRequest.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function payload(overrides: Partial<AxisCareClientCreateRequest> = {}): AxisCareClientCreateRequest {
  return {
    firstName: "Margaret",
    lastName: "Thompson",
    status: AXISCARE_INACTIVE_STATUS,
    externalId: "resident-1",
    ...overrides,
  };
}

test("full name combines firstName + lastName exactly as they appear on the payload", () => {
  const summary = describeAxisCareClientCreatePayload(payload({ firstName: "Margaret", lastName: "Thompson" }));
  assert.equal(summary.fullName, "Margaret Thompson");
});

test("statusActive reflects the literal payload.status.active value, never hardcoded", () => {
  const inactive = describeAxisCareClientCreatePayload(payload({ status: { active: false, label: "Inactive" } }));
  assert.equal(inactive.statusActive, false);

  const active = describeAxisCareClientCreatePayload(payload({ status: { active: true, label: "Active" } }));
  assert.equal(active.statusActive, true);
});

test("a payload with no status at all reads as statusActive: false, never silently Active", () => {
  const summary = describeAxisCareClientCreatePayload(payload({ status: undefined }));
  assert.equal(summary.statusActive, false);
});

test("optional fields absent from the payload produce NO row at all -- never an empty/placeholder row", () => {
  const summary = describeAxisCareClientCreatePayload(payload());
  assert.equal(summary.clientRows.length, 0);
  assert.equal(summary.assessmentDateDisplay, null);
});

test("goesBy, dateOfBirth, homePhone, personalEmail, and residentialAddress each produce exactly one row when present on the payload", () => {
  const summary = describeAxisCareClientCreatePayload(
    payload({
      goesBy: "Maggie",
      dateOfBirth: "1938-02-17",
      homePhone: "555-555-1515",
      personalEmail: "margaret@example.com",
      residentialAddress: { streetAddress1: "123 Main St", streetAddress2: null, city: "Frisco", state: "TX", postalCode: "75034" },
    })
  );
  assert.deepEqual(
    summary.clientRows.map((r) => r.label),
    ["Preferred name", "Date of birth", "Phone", "Email", "Address"]
  );
  const byLabel = Object.fromEntries(summary.clientRows.map((r) => [r.label, r.value]));
  assert.equal(byLabel["Preferred name"], "Maggie");
  assert.equal(byLabel["Date of birth"], "Feb 17, 1938");
  assert.equal(byLabel["Phone"], "555-555-1515");
  assert.equal(byLabel["Email"], "margaret@example.com");
  assert.equal(byLabel["Address"], "123 Main St, Frisco, TX 75034");
});

test("dateOfBirth is formatted as a plain calendar date (no timezone conversion / off-by-one-day risk)", () => {
  const summary = describeAxisCareClientCreatePayload(payload({ dateOfBirth: "1938-02-17" }));
  const dobRow = summary.clientRows.find((r) => r.label === "Date of birth");
  assert.equal(dobRow?.value, "Feb 17, 1938");
});

test("assessmentDate is surfaced separately from clientRows, not mixed into the client info list", () => {
  const summary = describeAxisCareClientCreatePayload(payload({ dateOfBirth: "1938-02-17", assessmentDate: "2026-09-15" }));
  assert.ok(!summary.clientRows.some((r) => r.label.toLowerCase().includes("assessment")));
  assert.equal(summary.assessmentDateDisplay, "Sep 15, 2026");
});

test("an address missing some sub-fields still renders whatever parts exist, without literal blank/undefined text", () => {
  const summary = describeAxisCareClientCreatePayload(
    payload({ residentialAddress: { streetAddress1: "123 Main St", streetAddress2: null, city: "Frisco", state: "TX", postalCode: "75034" } })
  );
  const addressRow = summary.clientRows.find((r) => r.label === "Address");
  assert.ok(addressRow);
  assert.ok(!addressRow!.value.includes("undefined"));
  assert.ok(!addressRow!.value.includes("null"));
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
