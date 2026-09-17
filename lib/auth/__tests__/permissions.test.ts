import assert from "node:assert/strict";
import {
  canAccessResidentEvidence,
  canCaptureResidentAssessment,
  canEditResidentProfile,
  canManageResidentDocuments,
  canPerformReconciliationActions,
  canVerifyResidentEvidence,
} from "../permissions.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("admin can edit resident profiles", () => {
  assert.equal(canEditResidentProfile("admin"), true);
});

test("manager can edit resident profiles", () => {
  assert.equal(canEditResidentProfile("manager"), true);
});

test("executive can edit resident profiles", () => {
  assert.equal(canEditResidentProfile("executive"), true);
});

test("operations cannot edit resident profiles", () => {
  assert.equal(canEditResidentProfile("operations"), false);
});

test("null role cannot edit resident profiles", () => {
  assert.equal(canEditResidentProfile(null), false);
});

test("undefined role cannot edit resident profiles", () => {
  assert.equal(canEditResidentProfile(undefined), false);
});

test("admin can access resident evidence", () => {
  assert.equal(canAccessResidentEvidence("admin"), true);
});

test("manager can access resident evidence", () => {
  assert.equal(canAccessResidentEvidence("manager"), true);
});

test("executive can access resident evidence", () => {
  assert.equal(canAccessResidentEvidence("executive"), true);
});

test("operations cannot access resident evidence", () => {
  assert.equal(canAccessResidentEvidence("operations"), false);
});

test("null role cannot access resident evidence", () => {
  assert.equal(canAccessResidentEvidence(null), false);
});

// office_staff (resident-access revision) — regression guards: viewing
// The People We Serve is now unrestricted, but these narrower
// capabilities must stay excluded.
test("office_staff CANNOT edit resident profiles (canonical identity/PII)", () => {
  assert.equal(canEditResidentProfile("office_staff"), false);
});

test("office_staff CANNOT access resident evidence (documents/client readiness)", () => {
  assert.equal(canAccessResidentEvidence("office_staff"), false);
});

test("admin can perform reconciliation actions", () => {
  assert.equal(canPerformReconciliationActions("admin"), true);
});

test("manager can perform reconciliation actions", () => {
  assert.equal(canPerformReconciliationActions("manager"), true);
});

test("executive can perform reconciliation actions", () => {
  assert.equal(canPerformReconciliationActions("executive"), true);
});

test("operations cannot perform reconciliation actions", () => {
  assert.equal(canPerformReconciliationActions("operations"), false);
});

test("office_staff CANNOT perform reconciliation actions (data-integrity/identity resolution)", () => {
  assert.equal(canPerformReconciliationActions("office_staff"), false);
});

test("null role cannot perform reconciliation actions", () => {
  assert.equal(canPerformReconciliationActions(null), false);
});

// canCaptureResidentAssessment — admin/manager/executive/operations
// unchanged (startAssessmentCapture had no role check before this
// predicate existed, so every one of them already had this capability);
// office_staff is the only newly-excluded role.
test("admin can capture a resident assessment", () => {
  assert.equal(canCaptureResidentAssessment("admin"), true);
});

test("manager can capture a resident assessment", () => {
  assert.equal(canCaptureResidentAssessment("manager"), true);
});

test("executive can capture a resident assessment", () => {
  assert.equal(canCaptureResidentAssessment("executive"), true);
});

test("operations can capture a resident assessment (unchanged pre-existing behavior)", () => {
  assert.equal(canCaptureResidentAssessment("operations"), true);
});

test("office_staff CANNOT capture a resident assessment", () => {
  assert.equal(canCaptureResidentAssessment("office_staff"), false);
});

test("null role cannot capture a resident assessment", () => {
  assert.equal(canCaptureResidentAssessment(null), false);
});

// Office Staff Client Readiness v0.1 — canManageResidentDocuments (ordinary
// client document view/upload/supersede) vs. canVerifyResidentEvidence
// (verify/reject once Awaiting Verification). office_staff gains the
// former, never the latter — the same document-work-vs-compliance-decision
// split already proven for Workforce.
for (const role of ["admin", "manager", "executive", "office_staff"] as const) {
  test(`${role} can manage resident documents`, () => {
    assert.equal(canManageResidentDocuments(role), true);
  });
}

test("operations cannot manage resident documents", () => {
  assert.equal(canManageResidentDocuments("operations"), false);
});

test("null role cannot manage resident documents", () => {
  assert.equal(canManageResidentDocuments(null), false);
});

for (const role of ["admin", "manager", "executive"] as const) {
  test(`${role} can verify resident evidence`, () => {
    assert.equal(canVerifyResidentEvidence(role), true);
  });
}

test("REGRESSION: office_staff CANNOT verify resident evidence (upload authority does not imply verification authority)", () => {
  assert.equal(canVerifyResidentEvidence("office_staff"), false);
});

test("operations cannot verify resident evidence", () => {
  assert.equal(canVerifyResidentEvidence("operations"), false);
});

test("null role cannot verify resident evidence", () => {
  assert.equal(canVerifyResidentEvidence(null), false);
});

// REGRESSION: office_staff's newly-widened document capability must never
// leak into the attestation/triage/canonical-edit/reconciliation
// predicates that stayed admin/manager/executive-only in this same slice.
test("REGRESSION: office_staff CANNOT access resident evidence attestations (source attestations/triage) even though it can now manage resident documents", () => {
  assert.equal(canManageResidentDocuments("office_staff"), true);
  assert.equal(canAccessResidentEvidence("office_staff"), false);
});

test("REGRESSION: office_staff CANNOT edit resident profiles (canonical identity/PII) after Client Readiness v0.1", () => {
  assert.equal(canEditResidentProfile("office_staff"), false);
});

test("REGRESSION: office_staff CANNOT perform reconciliation actions after Client Readiness v0.1", () => {
  assert.equal(canPerformReconciliationActions("office_staff"), false);
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
