// Direct coverage for ../correctiveActionCompletion.ts — the shared leaf
// extracted from incidentResolutionEligibility.ts's own tests (still the
// primary end-to-end coverage for this logic's behavior inside Incident's
// top-level rule). Run with:
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/correctiveActionCompletion.test.ts
import assert from "node:assert/strict";
import { allCorrectiveActionsCancelled, isCorrectiveActionSatisfied } from "../correctiveActionCompletion.ts";
import type { ComplianceCorrectiveAction } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function action(overrides: Partial<ComplianceCorrectiveAction> = {}): ComplianceCorrectiveAction {
  return {
    id: "action-1",
    subject_type: "resident",
    subject_id: "resident-1",
    requirement_id: null,
    domain: "infections",
    action_type: "infection_follow_up_required",
    title: "Confirm caregiver precautions",
    reason: "Client reported worsening symptoms.",
    action_plan: "Reinforce PPE protocol with assigned caregiver.",
    owner: "Jordan Lee",
    priority: "high",
    due_at: "2026-09-20",
    status: "open",
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
    lifecycle_stage: "open",
    implemented_at: null,
    implemented_by: null,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_note: null,
    effectiveness_review_required: false,
    audit_session_item_id: null,
    source_incident_id: null,
    source_infection_id: "infection-1",
    source_review_item_id: null,
    created_by: "Jordan Lee",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("isCorrectiveActionSatisfied: cancelled is always satisfied", () => {
  assert.equal(isCorrectiveActionSatisfied(action({ lifecycle_stage: "cancelled" })), true);
});

test("isCorrectiveActionSatisfied: open (no effectiveness required) is not satisfied", () => {
  assert.equal(isCorrectiveActionSatisfied(action({ lifecycle_stage: "open" })), false);
});

test("isCorrectiveActionSatisfied: implemented (no effectiveness required) is satisfied", () => {
  assert.equal(isCorrectiveActionSatisfied(action({ lifecycle_stage: "implemented", effectiveness_review_required: false })), true);
});

test("isCorrectiveActionSatisfied: generic resolved/dismissed closure satisfies a non-effectiveness action", () => {
  assert.equal(isCorrectiveActionSatisfied(action({ lifecycle_stage: "open", status: "resolved" })), true);
  assert.equal(isCorrectiveActionSatisfied(action({ lifecycle_stage: "open", status: "dismissed" })), true);
});

test("isCorrectiveActionSatisfied: implemented + effectiveness required is NOT satisfied (resolved/dismissed never substitutes)", () => {
  assert.equal(
    isCorrectiveActionSatisfied(action({ lifecycle_stage: "implemented", effectiveness_review_required: true, status: "resolved" })),
    false
  );
});

test("isCorrectiveActionSatisfied: verified_effective + effectiveness required IS satisfied", () => {
  assert.equal(
    isCorrectiveActionSatisfied(action({ lifecycle_stage: "verified_effective", effectiveness_review_required: true })),
    true
  );
});

test("allCorrectiveActionsCancelled: empty set is false (absence is a distinct case, not 'all cancelled')", () => {
  assert.equal(allCorrectiveActionsCancelled([]), false);
});

test("allCorrectiveActionsCancelled: true only when every action is cancelled", () => {
  assert.equal(allCorrectiveActionsCancelled([action({ lifecycle_stage: "cancelled" }), action({ lifecycle_stage: "cancelled" })]), true);
});

test("allCorrectiveActionsCancelled: a mix of cancelled and completed is false", () => {
  assert.equal(
    allCorrectiveActionsCancelled([action({ lifecycle_stage: "cancelled" }), action({ lifecycle_stage: "implemented" })]),
    false
  );
});

// ─── Runner ──────────────────────────────────────────────────────────

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
