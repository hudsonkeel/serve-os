// node --experimental-strip-types --conditions=react-server lib/navigation/__tests__/permissions.test.ts
import assert from "node:assert/strict";
import { AUTH_ROLES } from "../../auth/constants.ts";
import { canViewAskServe, canViewCommunityOutlook, canViewManagementSettings, canViewOrganizationalDashboard } from "../permissions.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// Table-driven over every current role (imported, not hardcoded, so this
// fails loudly if a sixth role is ever added without an explicit row
// here) — Office Staff Visibility v0.1.
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

// ─── The two remaining "general staff" destinations — every
// pre-office_staff role unchanged, office_staff excluded. The People We
// Serve is deliberately NOT tested here anymore — it was revised to be
// unrestricted for every role (resident-access revision); see
// lib/navigation/navData.ts and lib/auth/__tests__/permissions.test.ts
// for the narrower capabilities within that page that DO still exclude
// office_staff (canEditResidentProfile, canAccessResidentEvidence,
// canPerformReconciliationActions, canCaptureResidentAssessment). ──────
assertRoleTable(canViewOrganizationalDashboard, "canViewOrganizationalDashboard", {
  admin: true,
  manager: true,
  executive: true,
  operations: true,
  office_staff: false,
});

assertRoleTable(canViewCommunityOutlook, "canViewCommunityOutlook", {
  admin: true,
  manager: true,
  executive: true,
  operations: true,
  office_staff: false,
});

// ─── Ask Serve — read-only organizational-knowledge lookup, deliberately
// widened to office_staff (unlike the two tables above): it grants no
// additional operational/governance authority, only the ability to see
// what Serve policy and Texas PAS regulation require. ─────────────────
assertRoleTable(canViewAskServe, "canViewAskServe", {
  admin: true,
  manager: true,
  executive: true,
  operations: true,
  office_staff: true,
});

// ─── Settings management tier — narrower: excludes operations too ────────
assertRoleTable(canViewManagementSettings, "canViewManagementSettings", {
  admin: true,
  manager: true,
  executive: true,
  operations: false,
  office_staff: false,
});

// ─── Explicit regression guards for the approved v0.1 direction ──────────
test("office_staff CANNOT view the organizational dashboard (How We're Doing)", () => {
  assert.equal(canViewOrganizationalDashboard("office_staff"), false);
});
test("office_staff CANNOT view Community Outlook", () => {
  assert.equal(canViewCommunityOutlook("office_staff"), false);
});
test("office_staff CAN view Ask Serve (read-only organizational knowledge, no added operational/governance authority)", () => {
  assert.equal(canViewAskServe("office_staff"), true);
});
test("office_staff sees Settings only as My Account (management tier denied)", () => {
  assert.equal(canViewManagementSettings("office_staff"), false);
});
test("operations retains full pre-existing access to the general-staff destinations, and to Ask Serve", () => {
  assert.equal(canViewOrganizationalDashboard("operations"), true);
  assert.equal(canViewCommunityOutlook("operations"), true);
  assert.equal(canViewAskServe("operations"), true);
});
test("operations does NOT see Settings management tier (unchanged pre-existing behavior)", () => {
  assert.equal(canViewManagementSettings("operations"), false);
});
test("admin/manager/executive retain full access to both tiers (unchanged)", () => {
  for (const role of ["admin", "manager", "executive"] as const) {
    assert.equal(canViewOrganizationalDashboard(role), true, role);
    assert.equal(canViewCommunityOutlook(role), true, role);
    assert.equal(canViewAskServe(role), true, role);
    assert.equal(canViewManagementSettings(role), true, role);
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
