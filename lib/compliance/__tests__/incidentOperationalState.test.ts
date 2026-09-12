// Pure-function tests for ../incidentOperationalState.ts — no database,
// matching lib/compliance/__tests__/incidentResolutionEligibility.test.ts's
// established convention. Run with:
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/incidentOperationalState.test.ts
import assert from "node:assert/strict";
import { deriveIncidentOperationalState } from "../incidentOperationalState.ts";
import type { ComplianceCorrectiveAction, CorrectiveActionEffectivenessReview, Incident } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const NOW = new Date("2026-09-10T18:00:00.000Z");

function incident(
  overrides: Partial<Pick<Incident, "status" | "review_status" | "follow_up_required">> = {}
): Pick<Incident, "status" | "review_status" | "follow_up_required"> {
  return {
    status: "open",
    review_status: "reviewed",
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

function review(overrides: Partial<CorrectiveActionEffectivenessReview> = {}): CorrectiveActionEffectivenessReview {
  return {
    id: "review-1",
    corrective_action_id: "action-1",
    due_at: "2026-09-24",
    owner: "Jordan Lee",
    success_criteria: "No repeat medication events for 30 days.",
    outcome: null,
    evidence: null,
    reviewed_by: null,
    reviewed_at: null,
    voided_outcome: null,
    voided_evidence: null,
    voided_reviewed_by: null,
    voided_reviewed_at: null,
    voided_by: null,
    voided_at: null,
    void_reason: null,
    created_by: "Jordan Lee",
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("resolved incident -> resolved, regardless of anything else", () => {
  const state = deriveIncidentOperationalState(incident({ status: "resolved" }), [], new Map(), NOW);
  assert.equal(state, "resolved");
});

test("not reviewed -> needs_review", () => {
  const state = deriveIncidentOperationalState(incident({ review_status: "not_reviewed" }), [], new Map(), NOW);
  assert.equal(state, "needs_review");
});

test("reviewed, no follow-up required -> ready_to_resolve", () => {
  const state = deriveIncidentOperationalState(incident({ follow_up_required: false }), [], new Map(), NOW);
  assert.equal(state, "ready_to_resolve");
});

test("reviewed, follow-up required, zero actions -> action_required", () => {
  const state = deriveIncidentOperationalState(incident({ follow_up_required: true }), [], new Map(), NOW);
  assert.equal(state, "action_required");
});

test("follow-up required, every action cancelled -> action_required (cancellation-gating decision)", () => {
  const state = deriveIncidentOperationalState(
    incident({ follow_up_required: true }),
    [action({ lifecycle_stage: "cancelled" })],
    new Map(),
    NOW
  );
  assert.equal(state, "action_required");
});

test("follow-up required, action still open (not yet implemented) -> action_required", () => {
  const state = deriveIncidentOperationalState(
    incident({ follow_up_required: true }),
    [action({ lifecycle_stage: "open" })],
    new Map(),
    NOW
  );
  assert.equal(state, "action_required");
});

test("follow-up required, action implemented, no effectiveness review required -> ready_to_resolve", () => {
  const state = deriveIncidentOperationalState(
    incident({ follow_up_required: true }),
    [action({ lifecycle_stage: "implemented", effectiveness_review_required: false })],
    new Map(),
    NOW
  );
  assert.equal(state, "ready_to_resolve");
});

test("follow-up required, action implemented, effectiveness review scheduled but not yet due -> follow_up_pending", () => {
  const a = action({ lifecycle_stage: "implemented", effectiveness_review_required: true });
  const r = review({ corrective_action_id: a.id, due_at: "2026-10-15" }); // well after NOW
  const state = deriveIncidentOperationalState(incident({ follow_up_required: true }), [a], new Map([[a.id, r]]), NOW);
  assert.equal(state, "follow_up_pending");
});

test("follow-up required, action implemented, effectiveness review due today/overdue -> effectiveness_due", () => {
  const a = action({ lifecycle_stage: "implemented", effectiveness_review_required: true });
  const r = review({ corrective_action_id: a.id, due_at: "2026-09-01" }); // well before NOW
  const state = deriveIncidentOperationalState(incident({ follow_up_required: true }), [a], new Map([[a.id, r]]), NOW);
  assert.equal(state, "effectiveness_due");
});

test("follow-up required, action verified_effective -> ready_to_resolve", () => {
  const a = action({ lifecycle_stage: "verified_effective", effectiveness_review_required: true });
  const r = review({ corrective_action_id: a.id, outcome: "effective", evidence: "No repeat events.", reviewed_by: "Jordan Lee", reviewed_at: "2026-09-15T00:00:00.000Z" });
  const state = deriveIncidentOperationalState(incident({ follow_up_required: true }), [a], new Map([[a.id, r]]), NOW);
  assert.equal(state, "ready_to_resolve");
});

test("multiple actions — one still open, one implemented — action_required wins (least-complete state)", () => {
  const state = deriveIncidentOperationalState(
    incident({ follow_up_required: true }),
    [action({ id: "a1", lifecycle_stage: "open" }), action({ id: "a2", lifecycle_stage: "implemented", effectiveness_review_required: false })],
    new Map(),
    NOW
  );
  assert.equal(state, "action_required");
});

test("multiple actions — one effectiveness due, one already verified — effectiveness_due", () => {
  const a1 = action({ id: "a1", lifecycle_stage: "implemented", effectiveness_review_required: true });
  const r1 = review({ corrective_action_id: "a1", due_at: "2026-09-01" });
  const a2 = action({ id: "a2", lifecycle_stage: "verified_effective", effectiveness_review_required: true });
  const state = deriveIncidentOperationalState(
    incident({ follow_up_required: true }),
    [a1, a2],
    new Map([["a1", r1]]),
    NOW
  );
  assert.equal(state, "effectiveness_due");
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
