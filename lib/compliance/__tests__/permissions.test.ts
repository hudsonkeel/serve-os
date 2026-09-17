// node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/permissions.test.ts
import assert from "node:assert/strict";
import { AUTH_ROLES } from "../../auth/constants.ts";
import { canViewAuditReadiness, canViewPeopleReadiness } from "../permissions.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

type RoleExpectations = Record<(typeof AUTH_ROLES)[number], boolean>;

function assertRoleTable(fn: (role: string | null | undefined) => boolean, fnName: string, expected: RoleExpectations) {
  for (const role of AUTH_ROLES) {
    test(`${fnName}(${role}) is ${expected[role]}`, () => {
      assert.equal(fn(role), expected[role], `${fnName}("${role}") should be ${expected[role]}`);
    });
  }
  test(`${fnName} denies null/undefined/empty`, () => {
    assert.equal(fn(null), false);
    assert.equal(fn(undefined), false);
    assert.equal(fn(""), false);
  });
}

// ─── canViewAuditReadiness — unchanged by Scoped Workforce Audit
// Readiness for office_staff. This table exists specifically to prove
// that: office_staff must stay false here even though it now sees an
// "Audit Readiness" nav entry and a workforce-scoped page at the same
// URL — see canViewPeopleReadiness below for the actual mechanism.
assertRoleTable(canViewAuditReadiness, "canViewAuditReadiness", {
  admin: true,
  manager: true,
  executive: true,
  operations: true,
  office_staff: false,
});

// ─── canViewPeopleReadiness — the new, narrow predicate. Only
// office_staff — every other role already has the full dashboard via
// canViewAuditReadiness and has no use for the scoped view.
assertRoleTable(canViewPeopleReadiness, "canViewPeopleReadiness", {
  admin: false,
  manager: false,
  executive: false,
  operations: false,
  office_staff: true,
});

// ─── Explicit regressions named in the approved v0.1 direction ───────────
test("REGRESSION: canViewPeopleReadiness('office_staff') === true", () => {
  assert.equal(canViewPeopleReadiness("office_staff"), true);
});

test("REGRESSION: canViewAuditReadiness('office_staff') === false", () => {
  assert.equal(canViewAuditReadiness("office_staff"), false);
});

test("REGRESSION: no role passes both predicates at once — the scoped view and the full dashboard are mutually exclusive by construction", () => {
  for (const role of AUTH_ROLES) {
    const both = canViewAuditReadiness(role) && canViewPeopleReadiness(role);
    assert.equal(both, false, `${role} should never satisfy both canViewAuditReadiness and canViewPeopleReadiness`);
  }
});

test("REGRESSION: every pre-existing role (admin/manager/executive/operations) still passes canViewAuditReadiness — full dashboard access is unchanged", () => {
  for (const role of ["admin", "manager", "executive", "operations"] as const) {
    assert.equal(canViewAuditReadiness(role), true, role);
    assert.equal(canViewPeopleReadiness(role), false, role);
  }
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
