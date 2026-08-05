import assert from "node:assert/strict";
import { parseViventiumEmployeeUrl } from "../employeeUrl.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

const DIVISION_UUID = "ef600538-3dc8-43c9-8bc6-01ca7c45199c";
const EMPLOYEE_UUID = "9beeaf49-85a3-4852-a136-3b4f8d7bae3a";

// ─── The real, previously-mishandled case ─────────────────────────────────
test("valid employee profile URL: extracts the EMPLOYEE uuid, never the division uuid", () => {
  const url = `https://hcm.viventium.com/apps/viventium/divisions/${DIVISION_UUID}/hr/employees/${EMPLOYEE_UUID}/personal`;
  const result = parseViventiumEmployeeUrl(url);
  assert.equal(result.valid, true);
  assert.equal(result.employeeUuid, EMPLOYEE_UUID);
  assert.notEqual(result.employeeUuid, DIVISION_UUID);
  assert.equal(result.divisionUuid, DIVISION_UUID);
});

test("division dashboard URL (no /hr/employees/ segment): rejected, not merely 'no uuid found'", () => {
  const url = `https://hcm.viventium.com/apps/viventium/divisions/${DIVISION_UUID}/dashboard`;
  const result = parseViventiumEmployeeUrl(url);
  assert.equal(result.valid, false);
  assert.equal(result.employeeUuid, null);
  assert.ok(result.rejectionReason && /hr\/employees/i.test(result.rejectionReason));
  // The division uuid is still surfaced for operator context, but never
  // as a stand-in for the employee identifier.
  assert.equal(result.divisionUuid, DIVISION_UUID);
});

test("onboarding dashboard URL (no /hr/employees/ segment): rejected", () => {
  const url = `https://hcm.viventium.com/apps/viventium/divisions/${DIVISION_UUID}/onboarding/dashboard`;
  const result = parseViventiumEmployeeUrl(url);
  assert.equal(result.valid, false);
  assert.equal(result.employeeUuid, null);
});

test("malformed URL: rejected without throwing", () => {
  const result = parseViventiumEmployeeUrl("not a url");
  assert.equal(result.valid, false);
  assert.equal(result.employeeUuid, null);
  assert.ok(result.rejectionReason);
});

test("missing employee UUID (the segment after 'employees' is not a UUID): rejected", () => {
  const url = `https://hcm.viventium.com/apps/viventium/divisions/${DIVISION_UUID}/hr/employees/personal`;
  const result = parseViventiumEmployeeUrl(url);
  assert.equal(result.valid, false);
  assert.equal(result.employeeUuid, null);
  assert.ok(result.rejectionReason && /not a UUID/i.test(result.rejectionReason));
});

test("'/hr/employees/' with nothing after it at all: rejected", () => {
  const url = `https://hcm.viventium.com/apps/viventium/divisions/${DIVISION_UUID}/hr/employees`;
  const result = parseViventiumEmployeeUrl(url);
  assert.equal(result.valid, false);
  assert.equal(result.employeeUuid, null);
});

test("additional query parameters: still extracts the correct employee uuid", () => {
  const url = `https://hcm.viventium.com/apps/viventium/divisions/${DIVISION_UUID}/hr/employees/${EMPLOYEE_UUID}/personal?tab=documents&ref=abc`;
  const result = parseViventiumEmployeeUrl(url);
  assert.equal(result.valid, true);
  assert.equal(result.employeeUuid, EMPLOYEE_UUID);
});

test("trailing slash immediately after the employee uuid: still valid", () => {
  const url = `https://hcm.viventium.com/apps/viventium/divisions/${DIVISION_UUID}/hr/employees/${EMPLOYEE_UUID}/`;
  const result = parseViventiumEmployeeUrl(url);
  assert.equal(result.valid, true);
  assert.equal(result.employeeUuid, EMPLOYEE_UUID);
});

test("no trailing content after the employee uuid at all: still valid", () => {
  const url = `https://hcm.viventium.com/apps/viventium/divisions/${DIVISION_UUID}/hr/employees/${EMPLOYEE_UUID}`;
  const result = parseViventiumEmployeeUrl(url);
  assert.equal(result.valid, true);
  assert.equal(result.employeeUuid, EMPLOYEE_UUID);
});

test("a URL with no divisions segment at all still correctly extracts the employee uuid (divisionUuid is simply null)", () => {
  const url = `https://hcm.viventium.com/apps/viventium/hr/employees/${EMPLOYEE_UUID}/personal`;
  const result = parseViventiumEmployeeUrl(url);
  assert.equal(result.valid, true);
  assert.equal(result.employeeUuid, EMPLOYEE_UUID);
  assert.equal(result.divisionUuid, null);
});

test("a UUID appearing earlier in the path (e.g. a division id) is never returned as the employee uuid, even without /hr/employees/", () => {
  const url = `https://hcm.viventium.com/apps/viventium/divisions/${DIVISION_UUID}/dashboard`;
  const result = parseViventiumEmployeeUrl(url);
  assert.notEqual(result.employeeUuid, DIVISION_UUID);
  assert.equal(result.employeeUuid, null);
});

console.log(`\n${passed}/${passed} passed`);
