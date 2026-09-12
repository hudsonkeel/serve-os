// Pure-function tests for ../incidentResolutionEligibility.ts — no
// database, exercises computeIncidentResolutionEligibility() directly with
// fixture rows, matching lib/qapi/__tests__/signals.test.ts's established
// convention. Run with:
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/incidentResolutionEligibility.test.ts
import assert from "node:assert/strict";
import { computeIncidentResolutionEligibility } from "../incidentResolutionEligibility.ts";
import type { ComplianceCorrectiveAction, Incident } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function incident(overrides: Partial<Pick<Incident, "review_status" | "follow_up_required">> = {}) {
  return {
    review_status: "reviewed" as const,
    follow_up_required: false,
    ...overrides,
  };
}

function action(overrides: Partial<ComplianceCorrectiveAction> = {}): ComplianceCorrectiveAction {
  return {
    id: "action-1",
    subject_type: "resident",
    subject_id: "resident-1",
    requirement_id: null,
    domain: "incidents",
    action_type: "incident_follow_up_required",
    title: "Implement medication-assistance verification protocol",
    reason: "Medication administered without required verification step.",
    action_plan: "Add a second-signature verification step to the medication pass.",
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
    source_incident_id: "incident-1",
    source_infection_id: null,
    source_review_item_id: null,
    created_by: "Jordan Lee",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("not reviewed — blocked regardless of follow-up or actions", () => {
  const result = computeIncidentResolutionEligibility(incident({ review_status: "not_reviewed" }), []);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "not_reviewed" }]);
});

test("reviewed, no follow-up required — eligible with no actions at all", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: false }), []);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockers, []);
});

test("reviewed, follow-up required, zero corrective actions — blocked", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), []);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "no_corrective_action" }]);
});

test("follow-up required, action still open, no effectiveness review needed — blocked", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ lifecycle_stage: "open", effectiveness_review_required: false }),
  ]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "corrective_action_incomplete", actionId: "action-1" }]);
});

test("follow-up required, action implemented, no effectiveness review needed — eligible", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ lifecycle_stage: "implemented", effectiveness_review_required: false }),
  ]);
  assert.equal(result.eligible, true);
});

test("follow-up required, action closed via the generic resolved path, no effectiveness review needed — eligible", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ lifecycle_stage: "open", status: "resolved", effectiveness_review_required: false }),
  ]);
  assert.equal(result.eligible, true);
});

test("follow-up required, action dismissed via the generic path, no effectiveness review needed — eligible", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ lifecycle_stage: "open", status: "dismissed", effectiveness_review_required: false }),
  ]);
  assert.equal(result.eligible, true);
});

test("effectiveness review required, action only implemented (not yet verified) — blocked", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ lifecycle_stage: "implemented", effectiveness_review_required: true }),
  ]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "corrective_action_incomplete", actionId: "action-1" }]);
});

test("effectiveness review required, action verified_effective — eligible", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ lifecycle_stage: "verified_effective", effectiveness_review_required: true }),
  ]);
  assert.equal(result.eligible, true);
});

// The exact regression this round of feedback exists to prevent: closing
// an effectiveness-required action through the generic resolved/dismissed
// path must NEVER count as equivalent to a completed effectiveness review.
test("effectiveness review required, action resolved generically but never verified — still blocked", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ lifecycle_stage: "implemented", status: "resolved", effectiveness_review_required: true }),
  ]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "corrective_action_incomplete", actionId: "action-1" }]);
});

test("effectiveness review required, action dismissed generically but never verified — still blocked", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ lifecycle_stage: "open", status: "dismissed", effectiveness_review_required: true }),
  ]);
  assert.equal(result.eligible, false);
});

// A cancelled action, alongside a genuinely completed one, never blocks —
// but see "all actions cancelled" below for why a SOLE cancelled action is
// a different, blocked case (cancellation-gating decision).
test("effectiveness review required, action explicitly cancelled alongside a completed sibling — eligible (explicit withdrawal, not silently equivalent to verified)", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ id: "a1", lifecycle_stage: "cancelled", effectiveness_review_required: true }),
    action({ id: "a2", lifecycle_stage: "verified_effective", effectiveness_review_required: true }),
  ]);
  assert.equal(result.eligible, true);
});

test("cancelled action never blocks a separately-completed action, even without effectiveness review", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ id: "a1", lifecycle_stage: "cancelled", effectiveness_review_required: false }),
    action({ id: "a2", lifecycle_stage: "implemented", effectiveness_review_required: false }),
  ]);
  assert.equal(result.eligible, true);
});

test("multiple actions — one satisfied, one not, both reported/blocked appropriately", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ id: "a1", lifecycle_stage: "verified_effective", effectiveness_review_required: true }),
    action({ id: "a2", lifecycle_stage: "implemented", effectiveness_review_required: true }),
  ]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "corrective_action_incomplete", actionId: "a2" }]);
});

// The exact regression this round of feedback exists to prevent: an
// incident must not become trivially resolvable merely because every
// corrective action was cancelled.
test("all actions cancelled — blocked, distinct reason from zero actions", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ id: "a1", lifecycle_stage: "cancelled" }),
    action({ id: "a2", lifecycle_stage: "cancelled" }),
  ]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "all_actions_cancelled" }]);
});

test("single cancelled action (only action ever created) — blocked", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ lifecycle_stage: "cancelled" }),
  ]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "all_actions_cancelled" }]);
});

test("a mix of cancelled and completed actions — eligible (cancellation of one doesn't block another's completion)", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ id: "a1", lifecycle_stage: "cancelled" }),
    action({ id: "a2", lifecycle_stage: "implemented", effectiveness_review_required: false }),
  ]);
  assert.equal(result.eligible, true);
});

test("a mix of cancelled and still-incomplete actions — blocked on the incomplete one, not the cancellation rule", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ id: "a1", lifecycle_stage: "cancelled" }),
    action({ id: "a2", lifecycle_stage: "open" }),
  ]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, [{ reason: "corrective_action_incomplete", actionId: "a2" }]);
});

test("multiple actions — all satisfied via different valid paths — eligible", () => {
  const result = computeIncidentResolutionEligibility(incident({ follow_up_required: true }), [
    action({ id: "a1", lifecycle_stage: "verified_effective", effectiveness_review_required: true }),
    action({ id: "a2", lifecycle_stage: "implemented", effectiveness_review_required: false }),
    action({ id: "a3", lifecycle_stage: "cancelled", effectiveness_review_required: true }),
    action({ id: "a4", lifecycle_stage: "open", status: "dismissed", effectiveness_review_required: false }),
  ]);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockers, []);
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
