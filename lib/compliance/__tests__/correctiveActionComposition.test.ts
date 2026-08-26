// Pure-function tests for the workforce/audit-readiness corrective-action
// composition — no database, no mocking, exercises composeCorrectiveActions()
// directly with fixture rows from both source tables.
//
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/correctiveActionComposition.test.ts
import assert from "node:assert/strict";
import { composeCorrectiveActions } from "../correctiveActionComposition.ts";
import type { ComplianceCorrectiveAction, WorkforceComplianceAction } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function workforceAction(overrides: Partial<WorkforceComplianceAction> = {}): WorkforceComplianceAction {
  return {
    id: "wf-1",
    workforce_member_id: "member-1",
    requirement_id: "req-1",
    action_type: "evidence_missing",
    title: "Upload Form I-9",
    reason: "Form I-9 is missing.",
    owner: null,
    priority: "urgent",
    due_at: null,
    status: "open",
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function auditReadinessAction(overrides: Partial<ComplianceCorrectiveAction> = {}): ComplianceCorrectiveAction {
  return {
    id: "ar-1",
    subject_type: "resident",
    subject_id: "resident-1",
    requirement_id: "req-2",
    domain: "client_file",
    action_type: "evidence_missing",
    title: "Obtain updated emergency triage assessment",
    reason: "No current triage assessment on file.",
    owner: null,
    priority: "normal",
    due_at: null,
    status: "open",
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
    audit_session_item_id: null,
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("merges both sources into one list, correctly source-labeled", () => {
  const result = composeCorrectiveActions([workforceAction()], [auditReadinessAction()]);
  assert.equal(result.length, 2);
  assert.equal(result.find((a) => a.id === "wf-1")?.source, "workforce");
  assert.equal(result.find((a) => a.id === "ar-1")?.source, "audit_readiness");
});

test("workforce actions map to subjectType workforce_member using workforce_member_id", () => {
  const result = composeCorrectiveActions([workforceAction({ workforce_member_id: "member-42" })], []);
  assert.equal(result[0].subjectType, "workforce_member");
  assert.equal(result[0].subjectId, "member-42");
});

test("audit-readiness actions preserve their own polymorphic subject", () => {
  const result = composeCorrectiveActions([], [auditReadinessAction({ subject_type: "agency", subject_id: "agency-1" })]);
  assert.equal(result[0].subjectType, "agency");
  assert.equal(result[0].subjectId, "agency-1");
});

test("sorts urgent before high before normal before low, across sources", () => {
  const result = composeCorrectiveActions(
    [workforceAction({ id: "wf-low", priority: "low" }), workforceAction({ id: "wf-urgent", priority: "urgent" })],
    [auditReadinessAction({ id: "ar-high", priority: "high" }), auditReadinessAction({ id: "ar-normal", priority: "normal" })]
  );
  assert.deepEqual(
    result.map((a) => a.id),
    ["wf-urgent", "ar-high", "ar-normal", "wf-low"]
  );
});

test("within the same priority, sorts by due date ascending, nulls last", () => {
  const result = composeCorrectiveActions(
    [
      workforceAction({ id: "wf-no-due", priority: "high", due_at: null }),
      workforceAction({ id: "wf-later", priority: "high", due_at: "2026-03-01" }),
    ],
    [auditReadinessAction({ id: "ar-sooner", priority: "high", due_at: "2026-02-01" })]
  );
  assert.deepEqual(
    result.map((a) => a.id),
    ["ar-sooner", "wf-later", "wf-no-due"]
  );
});

test("actionType passes through unchanged from both source tables (2026-08-25, QAPI v0.1 bucket summaries depend on this)", () => {
  const result = composeCorrectiveActions(
    [workforceAction({ id: "wf-1", action_type: "evidence_expired" })],
    [auditReadinessAction({ id: "ar-1", action_type: "audit_finding_failed" })]
  );
  assert.equal(result.find((a) => a.id === "wf-1")?.actionType, "evidence_expired");
  assert.equal(result.find((a) => a.id === "ar-1")?.actionType, "audit_finding_failed");
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
