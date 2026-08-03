// Pure-function tests for the requirement-status-to-action mapping — see
// lib/workforce/complianceActionSync.ts. Only the pure mapping is tested
// here; the I/O sync itself is integration behavior, consistent with this
// codebase's convention (e.g. axiscareCaregiverSync.ts's orchestration is
// untested, only its pure helpers are).
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/complianceActionSync.test.ts
import assert from "node:assert/strict";
import { mapRequirementStatusToComplianceAction } from "../complianceActionSync.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("missing requirement produces an urgent, imperative evidence_missing action", () => {
  const mapping = mapRequirementStatusToComplianceAction("missing");
  assert.ok(mapping);
  assert.equal(mapping!.actionType, "evidence_missing");
  assert.equal(mapping!.priority, "urgent");
  assert.equal(mapping!.title("HIPAA Training"), "Upload HIPAA Training");
});

test("expired requirement produces an urgent, imperative evidence_expired action", () => {
  const mapping = mapRequirementStatusToComplianceAction("expired");
  assert.ok(mapping);
  assert.equal(mapping!.actionType, "evidence_expired");
  assert.equal(mapping!.priority, "urgent");
  assert.equal(mapping!.title("NAR Search"), "Renew NAR Search");
});

test("expiring_soon requirement produces a high-priority evidence_expiring_soon action (Due Soon tier)", () => {
  const mapping = mapRequirementStatusToComplianceAction("expiring_soon");
  assert.ok(mapping);
  assert.equal(mapping!.actionType, "evidence_expiring_soon");
  assert.equal(mapping!.priority, "high");
  assert.equal(mapping!.title("EMR Search"), "Renew EMR Search before it expires");
});

test("requires_review requirement produces a normal-priority evidence_requires_review action (Review tier)", () => {
  const mapping = mapRequirementStatusToComplianceAction("requires_review");
  assert.ok(mapping);
  assert.equal(mapping!.actionType, "evidence_requires_review");
  assert.equal(mapping!.priority, "normal");
  assert.equal(mapping!.title("Background Check"), "Review Background Check");
});

test("awaiting_verification requirement produces a low-priority evidence_awaiting_verification action (Waiting tier)", () => {
  const mapping = mapRequirementStatusToComplianceAction("awaiting_verification");
  assert.ok(mapping);
  assert.equal(mapping!.actionType, "evidence_awaiting_verification");
  assert.equal(mapping!.priority, "low");
  assert.equal(mapping!.title("Form I-9"), "Verify Form I-9");
});

test("satisfied never generates an action", () => {
  assert.equal(mapRequirementStatusToComplianceAction("satisfied"), null);
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
