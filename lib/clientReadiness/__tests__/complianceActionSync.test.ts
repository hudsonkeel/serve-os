// Pure-function tests for the Client Readiness status-to-action mapping and
// due-date helper — see lib/clientReadiness/complianceActionSync.ts. Only
// the pure functions are tested here; syncClientReadinessComplianceActionsForResident
// itself is I/O (it calls syncCorrectiveAction/autoResolveCorrectiveActionsForRequirement
// against Supabase) and is untested here, consistent with this codebase's
// convention — see lib/workforce/__tests__/complianceActionSync.test.ts's
// own stated rationale for the same split.
//
//   node --experimental-strip-types --conditions=react-server lib/clientReadiness/__tests__/complianceActionSync.test.ts
import assert from "node:assert/strict";
import { mapClientReadinessStatusToComplianceAction, nextBusinessDayIso } from "../complianceActionSync.ts";
import { AUDIT_READINESS_STATUSES } from "../../compliance/auditReadinessDashboard.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("needs_review produces a low-priority evidence_awaiting_verification action", () => {
  const mapping = mapClientReadinessStatusToComplianceAction("needs_review");
  assert.ok(mapping);
  assert.equal(mapping!.actionType, "evidence_awaiting_verification");
  assert.equal(mapping!.priority, "low");
  assert.equal(mapping!.title("Service Agreement", "Brenda Fritchen"), "Verify Service Agreement — Brenda Fritchen");
});

test("missing_evidence does NOT produce a verifier action — collecting evidence is office_staff's ordinary job, not a reviewer handoff", () => {
  assert.equal(mapClientReadinessStatusToComplianceAction("missing_evidence"), null);
});

test("compliant does not produce an action", () => {
  assert.equal(mapClientReadinessStatusToComplianceAction("compliant"), null);
});

test("every non-needs_review AuditReadinessStatus produces null — needs_review is the only status that creates a verifier action", () => {
  for (const status of AUDIT_READINESS_STATUSES) {
    if (status === "needs_review") continue;
    assert.equal(mapClientReadinessStatusToComplianceAction(status), null, `status "${status}" should not create an action`);
  }
});

test("nextBusinessDayIso: a Monday input rolls to Tuesday", () => {
  // 2026-09-14 is a Monday (UTC).
  const result = nextBusinessDayIso(new Date("2026-09-14T12:00:00.000Z"));
  assert.equal(result.slice(0, 10), "2026-09-15");
});

test("nextBusinessDayIso: a Friday input skips the weekend to Monday", () => {
  // 2026-09-11 is a Friday (UTC).
  const result = nextBusinessDayIso(new Date("2026-09-11T12:00:00.000Z"));
  assert.equal(result.slice(0, 10), "2026-09-14");
});

test("nextBusinessDayIso: a Saturday input rolls to Monday", () => {
  // 2026-09-12 is a Saturday (UTC).
  const result = nextBusinessDayIso(new Date("2026-09-12T12:00:00.000Z"));
  assert.equal(result.slice(0, 10), "2026-09-14");
});

test("nextBusinessDayIso: a Sunday input rolls to Monday", () => {
  // 2026-09-13 is a Sunday (UTC).
  const result = nextBusinessDayIso(new Date("2026-09-13T12:00:00.000Z"));
  assert.equal(result.slice(0, 10), "2026-09-14");
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
