// Pure-function tests for the Attention State derivation — see
// lib/workforce/attentionState.ts. Requirement evaluations are produced
// through the real evaluateRequirementSetStatus() engine (never hand-built
// RequirementEvaluation objects) so these tests exercise the actual
// integration, not a stand-in shape.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/attentionState.test.ts
import assert from "node:assert/strict";
import { evaluateRequirementSetStatus } from "../../compliance/requirementSetStatus.ts";
import { ATTENTION_STATE_RANK, attentionStateForRequirement, deriveAttentionState, isActiveWorkforce } from "../attentionState.ts";
import type { PersonEvidence, PersonRequirement } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function requirement(overrides: Partial<PersonRequirement> = {}): PersonRequirement {
  return {
    id: "req-1",
    requirement_code: "GENERIC_CHECK",
    name: "Generic Check",
    description: null,
    category: "test",
    requires_document: true,
    requires_verification: true,
    is_active: true,
    required_score: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function evidence(overrides: Partial<PersonEvidence> = {}): PersonEvidence {
  return {
    id: "ev-1",
    subject_type: "workforce_member",
    subject_id: "member-1",
    requirement_id: "req-1",
    document_id: null,
    verification_status: "unverified",
    lifecycle_status: "active",
    lifecycle_status_reason: null,
    lifecycle_status_changed_by: null,
    lifecycle_status_changed_at: null,
    result: null,
    source_system: "manual_upload",
    performed_at: null,
    effective_date: null,
    review_due_date: null,
    expiration_date: null,
    entered_by: "tester@example.com",
    verified_by: null,
    verified_at: null,
    notes: null,
    supersedes_evidence_id: null,
    numeric_score: null,
    authoritative_source_system: null,
    collection_method: null,
    verification_method: null,
    attestation_result: null,
    external_reference: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("rank ordering matches the mission's stated precedence: Action Needed > Due Soon > Review > Waiting > Ready", () => {
  assert.ok(ATTENTION_STATE_RANK.action_needed > ATTENTION_STATE_RANK.due_soon);
  assert.ok(ATTENTION_STATE_RANK.due_soon > ATTENTION_STATE_RANK.review);
  assert.ok(ATTENTION_STATE_RANK.review > ATTENTION_STATE_RANK.waiting);
  assert.ok(ATTENTION_STATE_RANK.waiting > ATTENTION_STATE_RANK.ready);
});

test("no open requirements at all -> ready", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "verified", verified_by: "r@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const { requirements } = evaluateRequirementSetStatus([req], [ev]);
  const result = deriveAttentionState("active", requirements);
  assert.equal(result.state, "ready");
});

test("a missing requirement -> action_needed", () => {
  const req = requirement();
  const { requirements } = evaluateRequirementSetStatus([req], []);
  const result = deriveAttentionState("active", requirements);
  assert.equal(result.state, "action_needed");
});

test("an expired requirement -> action_needed", () => {
  const req = requirement();
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "r@example.com",
    verified_at: "2020-01-02T00:00:00Z",
    expiration_date: "2020-01-01",
  });
  const { requirements } = evaluateRequirementSetStatus([req], [ev]);
  const result = deriveAttentionState("active", requirements);
  assert.equal(result.state, "action_needed");
});

test("an unverified requirement (evidence on file, not yet reviewed) -> waiting", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "unverified" });
  const { requirements } = evaluateRequirementSetStatus([req], [ev]);
  const result = deriveAttentionState("active", requirements);
  assert.equal(result.state, "waiting");
});

test("a rejected requirement -> review", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "rejected" });
  const { requirements } = evaluateRequirementSetStatus([req], [ev]);
  const result = deriveAttentionState("active", requirements);
  assert.equal(result.state, "review");
});

test("the worst state across all requirements wins, following the stated precedence", () => {
  const reqMissing = requirement({ id: "r1", requirement_code: "MISSING" });
  const reqWaiting = requirement({ id: "r2", requirement_code: "WAITING" });
  const evWaiting = evidence({ id: "e1", requirement_id: "r2", verification_status: "unverified" });
  const { requirements } = evaluateRequirementSetStatus([reqMissing, reqWaiting], [evWaiting]);
  const result = deriveAttentionState("active", requirements);
  assert.equal(result.state, "action_needed", "missing (action_needed) outranks waiting");
});

test("attentionStateForRequirement maps a single satisfied requirement to 'ready', not null", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "verified", verified_by: "r@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const { requirements } = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(attentionStateForRequirement(requirements[0]), "ready");
});

// ─── Workforce Lifecycle Boundary ─────────────────────────────────────────
// "Ready" is an operational-readiness state for a person currently in
// scope to work — never merely "no open issue exists." Lifecycle
// eligibility is decided BEFORE any requirement is inspected:
//   Lifecycle eligibility -> requirement evaluation -> evidence assurance
//   -> attention state
// never "no open issues -> Ready."

test("1. Active + all applicable requirements satisfied -> Ready", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "verified", verified_by: "r@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const { requirements } = evaluateRequirementSetStatus([req], [ev]);
  const result = deriveAttentionState("active", requirements);
  assert.equal(result.state, "ready");
});

test("2. Terminated + all requirements satisfied -> Terminated (not_applicable), never Ready", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "verified", verified_by: "r@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const { requirements } = evaluateRequirementSetStatus([req], [ev]);
  const result = deriveAttentionState("terminated", requirements);
  assert.equal(result.state, "not_applicable");
  assert.notEqual(result.state, "ready");
});

test("3. Terminated + missing requirements -> Terminated (not_applicable), never escalates to action_needed", () => {
  const req = requirement();
  const { requirements } = evaluateRequirementSetStatus([req], []); // nothing on file at all
  const result = deriveAttentionState("terminated", requirements);
  assert.equal(result.state, "not_applicable");
  assert.notEqual(result.state, "action_needed", "a terminated caregiver's missing evidence must never read as ordinary onboarding work");
});

test("4. Inactive + all requirements satisfied -> Inactive (not_applicable), never Ready", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "verified", verified_by: "r@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const { requirements } = evaluateRequirementSetStatus([req], [ev]);
  const result = deriveAttentionState("inactive", requirements);
  assert.equal(result.state, "not_applicable");
  assert.notEqual(result.state, "ready");
});

test("5. Inactive + missing requirements -> not_applicable by default, excluded from active attention totals", () => {
  const req = requirement();
  const { requirements } = evaluateRequirementSetStatus([req], []);
  const result = deriveAttentionState("inactive", requirements);
  assert.equal(result.state, "not_applicable", "no policy in this codebase yet requires ongoing attention for inactive records");
});

test("pending_start with a fully clean record -> not_applicable, never mixed into Active Ready", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "verified", verified_by: "r@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const { requirements } = evaluateRequirementSetStatus([req], [ev]);
  const result = deriveAttentionState("pending_start", requirements);
  assert.equal(result.state, "not_applicable");
  assert.notEqual(result.state, "ready");
});

test("pending_start with real outstanding onboarding work still surfaces it (not suppressed like terminated/inactive)", () => {
  const req = requirement();
  const { requirements } = evaluateRequirementSetStatus([req], []); // missing
  const result = deriveAttentionState("pending_start", requirements);
  assert.equal(result.state, "action_needed", "onboarding checklist work is real, actionable work — unlike terminated/inactive it is not suppressed");
});

test("6. a terminated or inactive person's per-requirement evidence and verification history remain fully inspectable", () => {
  // Per-requirement evaluation (Level 3/4 detail — attentionStateForRequirement
  // and the underlying RequirementEvaluation itself) is computed identically
  // regardless of lifecycle status; only the member-level AGGREGATE
  // (deriveAttentionState) changes. Nothing about a terminated/inactive
  // person's real evidence, verification, or history is hidden or altered.
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "verified", verified_by: "r@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const { requirements: activeRequirements } = evaluateRequirementSetStatus([req], [ev]);
  const { requirements: terminatedRequirements } = evaluateRequirementSetStatus([req], [ev]);

  assert.equal(activeRequirements[0].status, terminatedRequirements[0].status, "requirement evaluation itself never varies by lifecycle status");
  assert.equal(attentionStateForRequirement(activeRequirements[0]), attentionStateForRequirement(terminatedRequirements[0]));
  assert.deepEqual(activeRequirements[0].latestEvidence, terminatedRequirements[0].latestEvidence, "the underlying evidence record is identical and fully inspectable either way");
});

test("7. dashboard Ready count includes only active workforce members, from a mixed roster", () => {
  const req = requirement();
  const cleanEvidence = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "r@example.com",
    verified_at: "2026-01-02T00:00:00Z",
  });
  const { requirements: clean } = evaluateRequirementSetStatus([req], [cleanEvidence]);

  const roster = [
    { lifecycle: "active" as const, attention: deriveAttentionState("active", clean) },
    { lifecycle: "terminated" as const, attention: deriveAttentionState("terminated", clean) },
    { lifecycle: "inactive" as const, attention: deriveAttentionState("inactive", clean) },
    { lifecycle: "pending_start" as const, attention: deriveAttentionState("pending_start", clean) },
  ];

  const readyCount = roster.filter((r) => r.attention.state === "ready").length;
  assert.equal(readyCount, 1, "only the active, fully-satisfied member should count toward Ready");
});

test("isActiveWorkforce is true only for 'active' — terminated/inactive/pending_start are all excluded", () => {
  assert.equal(isActiveWorkforce("active"), true);
  assert.equal(isActiveWorkforce("terminated"), false);
  assert.equal(isActiveWorkforce("inactive"), false);
  assert.equal(isActiveWorkforce("pending_start"), false);
});

test("8. lifecycle status is decided before requirements are even inspected — an ineligible status short-circuits regardless of requirement content", () => {
  // A terminated caregiver with a requirement set that would otherwise
  // resolve to the single worst possible state (missing) must still land
  // on not_applicable — lifecycle always wins over requirement/attention
  // status, never the other way around.
  const req = requirement();
  const { requirements } = evaluateRequirementSetStatus([req], []);
  assert.equal(requirements[0].status, "missing");
  const result = deriveAttentionState("terminated", requirements);
  assert.equal(result.state, "not_applicable");
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
