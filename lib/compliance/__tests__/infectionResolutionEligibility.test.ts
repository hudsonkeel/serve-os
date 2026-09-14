// Pure-function tests for ../infectionResolutionEligibility.ts — no
// database, matching lib/compliance/__tests__/incidentResolutionEligibility.test.ts's
// established convention. Run with:
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/infectionResolutionEligibility.test.ts
import assert from "node:assert/strict";
import { computeInfectionResolutionEligibility } from "../infectionResolutionEligibility.ts";
import type { ComplianceCorrectiveAction, Infection } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function infection(
  overrides: Partial<Pick<Infection, "review_status" | "follow_up_required" | "next_follow_up_date">> = {}
): Pick<Infection, "review_status" | "follow_up_required" | "next_follow_up_date"> {
  return {
    review_status: "reviewed",
    follow_up_required: false,
    next_follow_up_date: null,
    ...overrides,
  };
}

function action(overrides: Partial<ComplianceCorrectiveAction> = {}): ComplianceCorrectiveAction {
  return {
    id: "action-1",
    subject_type: "resident",
    subject_id: "resident-1",
    requirement_id: null,
    domain: "infections",
    action_type: "infection_follow_up_required",
    title: "Reinforce PPE protocol",
    reason: "Client reported worsening symptoms.",
    action_plan: "Retrain assigned caregiver on PPE protocol.",
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

test("not reviewed -> blocked, early return regardless of anything else", () => {
  const result = computeInfectionResolutionEligibility(infection({ review_status: "not_reviewed" }), 5, []);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "not_reviewed" }]);
});

test("reviewed, follow-up not required, no corrective action -> eligible", () => {
  const result = computeInfectionResolutionEligibility(infection({ follow_up_required: false }), 0, []);
  assert.equal(result.eligible, true);
});

test("reviewed, follow-up required, zero follow-up entries -> blocked (the Linda Kaplan migration case)", () => {
  const result = computeInfectionResolutionEligibility(infection({ follow_up_required: true }), 0, []);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "follow_up_not_recorded" }]);
});

test("reviewed, follow-up required, entries exist, next_follow_up_date still set -> blocked (obligation outstanding)", () => {
  const result = computeInfectionResolutionEligibility(
    infection({ follow_up_required: true, next_follow_up_date: "2026-10-01" }),
    1,
    []
  );
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "follow_up_outstanding" }]);
});

test("reviewed, follow-up required, entries exist, no outstanding date -> eligible (loop closed)", () => {
  const result = computeInfectionResolutionEligibility(infection({ follow_up_required: true, next_follow_up_date: null }), 2, []);
  assert.equal(result.eligible, true);
});

// Final Migration Tightening, item 1 — the exact bypass sequence: (1)
// follow-up was required, (2) a follow-up was scheduled
// (next_follow_up_date set), (3) follow_up_required was later re-affirmed
// to false (mark_infection_reviewed's reaffirm path never clears the
// schedule). Resolution must remain blocked on the outstanding date
// regardless of the now-false follow_up_required — and critically,
// "follow_up_not_recorded" must NOT also appear, since that reason is
// gated on follow_up_required being true.
test("Final Migration Tightening: a scheduled follow-up blocks resolution even after follow_up_required is later changed to false", () => {
  const result = computeInfectionResolutionEligibility(
    infection({ follow_up_required: false, next_follow_up_date: "2026-10-01" }),
    0,
    []
  );
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "follow_up_outstanding" }]);
});

test("no corrective action ever created — never blocks (optional branch, unlike Incident)", () => {
  const result = computeInfectionResolutionEligibility(infection({ follow_up_required: false }), 0, []);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockers, []);
});

test("a linked corrective action still open -> blocked independently of the follow-up loop", () => {
  const result = computeInfectionResolutionEligibility(
    infection({ follow_up_required: false }),
    0,
    [action({ lifecycle_stage: "open" })]
  );
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "corrective_action_incomplete", actionId: "action-1" }]);
});

test("every linked corrective action cancelled -> blocked (cancellation-gating decision, same as Incident)", () => {
  const result = computeInfectionResolutionEligibility(
    infection({ follow_up_required: false }),
    0,
    [action({ lifecycle_stage: "cancelled" })]
  );
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "all_actions_cancelled" }]);
});

test("a linked corrective action implemented (no effectiveness required) -> eligible", () => {
  const result = computeInfectionResolutionEligibility(
    infection({ follow_up_required: false }),
    0,
    [action({ lifecycle_stage: "implemented", effectiveness_review_required: false })]
  );
  assert.equal(result.eligible, true);
});

test("follow-up loop closed AND corrective action complete -> eligible", () => {
  const result = computeInfectionResolutionEligibility(
    infection({ follow_up_required: true, next_follow_up_date: null }),
    1,
    [action({ lifecycle_stage: "verified_effective", effectiveness_review_required: true })]
  );
  assert.equal(result.eligible, true);
});

test("follow-up loop open AND corrective action complete -> still blocked by the follow-up loop", () => {
  const result = computeInfectionResolutionEligibility(
    infection({ follow_up_required: true, next_follow_up_date: "2026-10-01" }),
    1,
    [action({ lifecycle_stage: "verified_effective", effectiveness_review_required: true })]
  );
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "follow_up_outstanding" }]);
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
