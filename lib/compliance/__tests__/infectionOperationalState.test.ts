// Pure-function tests for ../infectionOperationalState.ts — no database,
// matching lib/compliance/__tests__/incidentOperationalState.test.ts's
// established convention. Run with:
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/infectionOperationalState.test.ts
import assert from "node:assert/strict";
import { deriveInfectionOperationalState } from "../infectionOperationalState.ts";
import type { ComplianceCorrectiveAction, Infection } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const NOW = new Date("2026-09-10T18:00:00.000Z");

function infection(
  overrides: Partial<Pick<Infection, "status" | "review_status" | "follow_up_required" | "next_follow_up_date">> = {}
): Pick<Infection, "status" | "review_status" | "follow_up_required" | "next_follow_up_date"> {
  return {
    status: "open",
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

test("resolved infection -> resolved, regardless of anything else", () => {
  const state = deriveInfectionOperationalState(infection({ status: "resolved" }), 0, [], NOW);
  assert.equal(state, "resolved");
});

test("not reviewed -> needs_review", () => {
  const state = deriveInfectionOperationalState(infection({ review_status: "not_reviewed" }), 0, [], NOW);
  assert.equal(state, "needs_review");
});

test("reviewed, no follow-up required, no corrective action -> ready_to_resolve", () => {
  const state = deriveInfectionOperationalState(infection({ follow_up_required: false }), 0, [], NOW);
  assert.equal(state, "ready_to_resolve");
});

test("follow-up required, zero entries recorded -> follow_up_needed (the Linda Kaplan migration case)", () => {
  const state = deriveInfectionOperationalState(infection({ follow_up_required: true }), 0, [], NOW);
  assert.equal(state, "follow_up_needed");
});

test("follow-up required, entries exist, next follow-up overdue -> follow_up_due", () => {
  const state = deriveInfectionOperationalState(
    infection({ follow_up_required: true, next_follow_up_date: "2026-09-01" }),
    1,
    [],
    NOW
  );
  assert.equal(state, "follow_up_due");
});

test("follow-up required, entries exist, next follow-up due today -> follow_up_due", () => {
  const state = deriveInfectionOperationalState(
    infection({ follow_up_required: true, next_follow_up_date: "2026-09-10" }),
    1,
    [],
    NOW
  );
  assert.equal(state, "follow_up_due");
});

test("follow-up required, entries exist, next follow-up not yet due -> follow_up_scheduled", () => {
  const state = deriveInfectionOperationalState(
    infection({ follow_up_required: true, next_follow_up_date: "2026-10-15" }),
    1,
    [],
    NOW
  );
  assert.equal(state, "follow_up_scheduled");
});

test("follow-up loop closed, no corrective action -> ready_to_resolve", () => {
  const state = deriveInfectionOperationalState(infection({ follow_up_required: true, next_follow_up_date: null }), 2, [], NOW);
  assert.equal(state, "ready_to_resolve");
});

// ─── Follow-Up & Resolution UX Refinement — the six acceptance states the
// Resolution card's presentation is now driven by. All of these are
// exact-combination regression checks: the presentation layer
// (InfectionResolutionCard) reads deriveInfectionOperationalState's return
// value directly and renders one of the six presentations from it —
// there's no component-render test in this codebase (no
// @testing-library/react / jsdom dependency), so these state-derivation
// tests ARE the presentation's test coverage. ─────────────────────────────

test("State 2 — a follow-up date scheduled via schedule_infection_follow_up with ZERO entries recorded yet -> follow_up_scheduled, not follow_up_needed", () => {
  const state = deriveInfectionOperationalState(
    infection({ follow_up_required: true, next_follow_up_date: "2026-10-15" }),
    0,
    [],
    NOW
  );
  assert.equal(state, "follow_up_scheduled");
});

test("State 5 — follow-up loop already closed (entries exist, no outstanding date) but a linked corrective action is still open -> corrective_action_incomplete, not ready_to_resolve", () => {
  const state = deriveInfectionOperationalState(
    infection({ follow_up_required: true, next_follow_up_date: null }),
    1,
    [action({ lifecycle_stage: "open" })],
    NOW
  );
  assert.equal(state, "corrective_action_incomplete");
});

// Final Migration Tightening — a scheduled follow-up still reads as
// follow_up_scheduled/follow_up_due even after follow_up_required has been
// re-affirmed to false; the register must keep surfacing the outstanding
// obligation, not silently drop back to "ready to resolve."
test("Final Migration Tightening: a scheduled follow-up still surfaces after follow_up_required is later changed to false", () => {
  const state = deriveInfectionOperationalState(
    infection({ follow_up_required: false, next_follow_up_date: "2026-10-15" }),
    0,
    [],
    NOW
  );
  assert.equal(state, "follow_up_scheduled");
});

test("no follow-up required, but a linked corrective action is still open -> corrective_action_incomplete", () => {
  const state = deriveInfectionOperationalState(
    infection({ follow_up_required: false }),
    0,
    [action({ lifecycle_stage: "open" })],
    NOW
  );
  assert.equal(state, "corrective_action_incomplete");
});

test("follow-up loop still outstanding wins over an also-incomplete corrective action (precedence)", () => {
  const state = deriveInfectionOperationalState(
    infection({ follow_up_required: true, next_follow_up_date: "2026-09-01" }),
    1,
    [action({ lifecycle_stage: "open" })],
    NOW
  );
  assert.equal(state, "follow_up_due");
});

test("follow-up loop closed AND corrective action complete -> ready_to_resolve", () => {
  const state = deriveInfectionOperationalState(
    infection({ follow_up_required: true, next_follow_up_date: null }),
    1,
    [action({ lifecycle_stage: "verified_effective", effectiveness_review_required: true })],
    NOW
  );
  assert.equal(state, "ready_to_resolve");
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
