// node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/permissions.test.ts
import assert from "node:assert/strict";
import { AUTH_ROLES } from "../../auth/constants.ts";
import {
  canBulkImportWorkforceRoster,
  canCorrectWorkforceIdentityLinks,
  canDeleteWorkforceDocuments,
  canEditWorkforceCanonicalProfile,
  canEditWorkforceLegalIdentity,
  canManageWorkforceCommunityMemberships,
  canManageWorkforceComplianceActions,
  canManageWorkforceDocuments,
  canReassignWorkforceEvidence,
  canTriggerAxisCareSync,
  canVerifyWorkforceEvidence,
  canViewWorkforceTechnicalDetails,
} from "../permissions.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// Table-driven: one row per role, one column per permission predicate.
// AUTH_ROLES is imported (not hardcoded) so this table fails loudly if a
// sixth role is ever added without an explicit row here.
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

// ─── canManageWorkforceDocuments — ordinary personnel-document work ──────
// View caregiver documents, open via signed URL, upload, and
// supersede/replace/edit-in-place-while-unverified. This is the one tier
// office_staff was added to in User Roles & Permissions v0.1.
assertRoleTable(canManageWorkforceDocuments, "canManageWorkforceDocuments", {
  admin: true,
  manager: true,
  executive: false,
  operations: false,
  office_staff: true,
});

// ─── canVerifyWorkforceEvidence — compliance determination authority ─────
// Verify/reject evidence, human attestation, and marking a settled record
// entered in error. office_staff is explicitly denied — the v0.1 business
// requirement is ordinary document administration, not compliance
// decision authority.
assertRoleTable(canVerifyWorkforceEvidence, "canVerifyWorkforceEvidence", {
  admin: true,
  manager: true,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canManageWorkforceComplianceActions — resolve/own a compliance action ─
assertRoleTable(canManageWorkforceComplianceActions, "canManageWorkforceComplianceActions", {
  admin: true,
  manager: true,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canReassignWorkforceEvidence — move a record to a different caregiver ─
// Not requested for office_staff in v0.1; kept at the pre-v0.1 level.
assertRoleTable(canReassignWorkforceEvidence, "canReassignWorkforceEvidence", {
  admin: true,
  manager: true,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canDeleteWorkforceDocuments — hard-delete an accidental upload ──────
// Explicitly NOT extended to office_staff this slice (deletion decision
// deferred — "we can revisit this later").
assertRoleTable(canDeleteWorkforceDocuments, "canDeleteWorkforceDocuments", {
  admin: true,
  manager: true,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canBulkImportWorkforceRoster — org-wide roster import ───────────────
assertRoleTable(canBulkImportWorkforceRoster, "canBulkImportWorkforceRoster", {
  admin: true,
  manager: true,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canTriggerAxisCareSync — admin only, unchanged ───────────────────────
assertRoleTable(canTriggerAxisCareSync, "canTriggerAxisCareSync", {
  admin: true,
  manager: false,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canCorrectWorkforceIdentityLinks — admin only, unchanged ─────────────
assertRoleTable(canCorrectWorkforceIdentityLinks, "canCorrectWorkforceIdentityLinks", {
  admin: true,
  manager: false,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canEditWorkforceCanonicalProfile — admin+manager, unchanged ─────────
assertRoleTable(canEditWorkforceCanonicalProfile, "canEditWorkforceCanonicalProfile", {
  admin: true,
  manager: true,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canEditWorkforceLegalIdentity — admin only, unchanged ───────────────
assertRoleTable(canEditWorkforceLegalIdentity, "canEditWorkforceLegalIdentity", {
  admin: true,
  manager: false,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canManageWorkforceCommunityMemberships — admin+manager, unchanged ───
assertRoleTable(canManageWorkforceCommunityMemberships, "canManageWorkforceCommunityMemberships", {
  admin: true,
  manager: true,
  executive: false,
  operations: false,
  office_staff: false,
});

// ─── canViewWorkforceTechnicalDetails — Office Staff Visibility v0.1 ─────
// Open Actions, Source Identities, Workforce Activity Timeline, Profile
// Change History. Every pre-existing role unchanged; office_staff denied.
assertRoleTable(canViewWorkforceTechnicalDetails, "canViewWorkforceTechnicalDetails", {
  admin: true,
  manager: true,
  executive: true,
  operations: true,
  office_staff: false,
});

// ─── Explicit regression guards for the v0.1 business requirement ────────
// "office_staff should be allowed to do ordinary personnel-document work,
// and NOT receive broader administrative or compliance-decision
// capabilities" — restated directly (not just via the tables above) so a
// future refactor that accidentally widens one of the restricted tiers to
// include office_staff fails a test whose name says exactly what broke.

test("office_staff CAN manage ordinary workforce documents (view/upload/replace)", () => {
  assert.equal(canManageWorkforceDocuments("office_staff"), true);
});

test("office_staff CANNOT verify or reject compliance evidence", () => {
  assert.equal(canVerifyWorkforceEvidence("office_staff"), false);
});

test("office_staff CANNOT submit a compliance attestation (gated by canVerifyWorkforceEvidence)", () => {
  assert.equal(canVerifyWorkforceEvidence("office_staff"), false);
});

test("office_staff CANNOT mark evidence entered in error (gated by canVerifyWorkforceEvidence)", () => {
  assert.equal(canVerifyWorkforceEvidence("office_staff"), false);
});

test("office_staff CANNOT resolve or own compliance corrective actions", () => {
  assert.equal(canManageWorkforceComplianceActions("office_staff"), false);
});

test("office_staff CANNOT bulk-import the workforce roster", () => {
  assert.equal(canBulkImportWorkforceRoster("office_staff"), false);
});

test("office_staff CANNOT edit the canonical workforce profile", () => {
  assert.equal(canEditWorkforceCanonicalProfile("office_staff"), false);
});

test("office_staff CANNOT edit legal identity", () => {
  assert.equal(canEditWorkforceLegalIdentity("office_staff"), false);
});

test("office_staff CANNOT manage community memberships", () => {
  assert.equal(canManageWorkforceCommunityMemberships("office_staff"), false);
});

test("office_staff CANNOT correct workforce identity links", () => {
  assert.equal(canCorrectWorkforceIdentityLinks("office_staff"), false);
});

test("office_staff CANNOT trigger AxisCare synchronization", () => {
  assert.equal(canTriggerAxisCareSync("office_staff"), false);
});

test("office_staff CANNOT hard-delete a document (kept at pre-v0.1 level)", () => {
  assert.equal(canDeleteWorkforceDocuments("office_staff"), false);
});

test("office_staff CANNOT reassign evidence to a different caregiver", () => {
  assert.equal(canReassignWorkforceEvidence("office_staff"), false);
});

test("office_staff CANNOT view workforce technical/administrative sections (Open Actions, Source Identities, Activity Timeline, Change History)", () => {
  assert.equal(canViewWorkforceTechnicalDetails("office_staff"), false);
});

test("operations retains workforce technical-detail visibility (unchanged pre-existing behavior)", () => {
  assert.equal(canViewWorkforceTechnicalDetails("operations"), true);
});

// User/role management: no executable capability exists yet for any role
// (Settings -> Users & Roles UI is explicitly out of scope for v0.1 — see
// app/settings/page.tsx's "provisioned directly in Supabase" note), so
// there is no permission predicate to test here. Recorded as a marker so
// this suite doesn't silently look complete once that UI is built without
// a role-gating test being added alongside it.

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
