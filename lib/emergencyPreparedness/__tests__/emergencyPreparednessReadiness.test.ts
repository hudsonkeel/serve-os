// Pure-function tests for Emergency Preparedness's Domain Interpretation —
// the classifier (satisfied_by_event-style labeling) and the
// EP_PLAN_MAINTAINED / EP_ANNUAL_PLAN_REVIEW independence guarantee. Both
// exercised through the real, unchanged shared engine
// (evaluateRequirementSetStatus) + the real classifier — no reimplementation
// of either.
//
//   node --experimental-strip-types --conditions=react-server lib/emergencyPreparedness/__tests__/emergencyPreparednessReadiness.test.ts
import assert from "node:assert/strict";
import { evaluateRequirementSetStatus } from "../../compliance/requirementSetStatus.ts";
import { deriveAuditReadinessStatus } from "../../compliance/auditReadinessStatus.ts";
import { classifyEmergencyPreparednessEvidence } from "../emergencyPreparednessReadiness.ts";
import { NON_EXPIRING_REQUIREMENT_CODES } from "../constants.ts";
import type { PersonEvidence, PersonRequirement } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function requirement(overrides: Partial<PersonRequirement> = {}): PersonRequirement {
  return {
    id: "req-1",
    requirement_code: "EP_PLAN_MAINTAINED",
    name: "Emergency Preparedness and Response Plan (EPRP) On File and Current",
    description: null,
    category: "plan_governance",
    requires_document: true,
    requires_verification: true,
    is_active: true,
    required_score: null,
    regulatory_authority: "Serve P&P §256",
    domain: "emergency_preparedness",
    version: 1,
    effective_date: null,
    retired_at: null,
    supersedes_requirement_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function evidence(overrides: Partial<PersonEvidence> = {}): PersonEvidence {
  return {
    id: "ev-1",
    subject_type: "agency",
    subject_id: "agency-1",
    requirement_id: "req-1",
    document_id: "doc-1",
    verification_status: "verified",
    lifecycle_status: "active",
    lifecycle_status_reason: null,
    lifecycle_status_changed_by: null,
    lifecycle_status_changed_at: null,
    result: null,
    source_system: "Serve OS",
    performed_at: "2026-01-01",
    effective_date: "2026-01-01",
    review_due_date: null,
    expiration_date: null,
    entered_by: "Reviewer",
    verified_by: "Reviewer",
    verified_at: "2026-01-01T00:00:00Z",
    notes: null,
    supersedes_evidence_id: null,
    numeric_score: null,
    authoritative_source_system: null,
    collection_method: null,
    verification_method: null,
    attestation_result: null,
    external_reference: null,
    satisfaction_context: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Classifier ────────────────────────────────────────────────────────

test("planned_drill satisfaction_context classifies as satisfied_by_event", () => {
  const result = classifyEmergencyPreparednessEvidence(evidence({ satisfaction_context: "planned_drill", effective_date: "2026-08-10" }));
  assert.equal(result?.status, "satisfied_by_event");
  assert.match(result!.explanation, /planned drill/i);
});

test("actual_emergency_response satisfaction_context classifies as satisfied_by_event", () => {
  const result = classifyEmergencyPreparednessEvidence(
    evidence({ satisfaction_context: "actual_emergency_response", effective_date: "2026-02-14" })
  );
  assert.equal(result?.status, "satisfied_by_event");
  assert.match(result!.explanation, /actual emergency response/i);
});

test("annual_reaffirmation / annual_update / annual_review_completed all fall back to the ordinary compliant label (no override)", () => {
  for (const ctx of ["annual_reaffirmation", "annual_update", "annual_review_completed"] as const) {
    assert.equal(classifyEmergencyPreparednessEvidence(evidence({ satisfaction_context: ctx })), null);
  }
});

test("no satisfaction_context at all falls back to the ordinary compliant label", () => {
  assert.equal(classifyEmergencyPreparednessEvidence(evidence({ satisfaction_context: null })), null);
});

// ─── EP_PLAN_MAINTAINED / EP_ANNUAL_PLAN_REVIEW independence ─────────────
// A missed annual review must never cascade into a false EP_PLAN_MAINTAINED
// failure — the plan's satisfying evidence carries expiration_date: null
// (satisfied by continued existence), while EP_ANNUAL_PLAN_REVIEW's own
// evidence is a genuinely separate, independently-expiring fact.

test("EP_PLAN_MAINTAINED (null expiration) stays satisfied even when EP_ANNUAL_PLAN_REVIEW's own evidence has lapsed", () => {
  const planRequirement = requirement({ id: "req-plan", requirement_code: "EP_PLAN_MAINTAINED" });
  const reviewRequirement = requirement({
    id: "req-review",
    requirement_code: "EP_ANNUAL_PLAN_REVIEW",
    name: "Annual EPRP Review",
  });

  const planEvidence = evidence({
    id: "ev-plan",
    requirement_id: "req-plan",
    expiration_date: null, // EP_PLAN_MAINTAINED never expires on a calendar
    effective_date: "2024-01-01",
  });
  // The annual review last happened over a year ago — its own evidence has
  // lapsed, but this must not touch the plan's own evaluation at all.
  const staleReviewEvidence = evidence({
    id: "ev-review",
    requirement_id: "req-review",
    satisfaction_context: "annual_review_completed",
    effective_date: "2024-01-01",
    expiration_date: "2024-12-31", // long past
  });

  const setEvaluation = evaluateRequirementSetStatus(
    [planRequirement, reviewRequirement],
    [planEvidence, staleReviewEvidence],
    () => new Date("2026-08-14T00:00:00Z")
  );
  const derived = deriveAuditReadinessStatus(setEvaluation, classifyEmergencyPreparednessEvidence);

  const planResult = derived.requirements.find((r) => r.requirementEvaluation.requirement.id === "req-plan")!;
  const reviewResult = derived.requirements.find((r) => r.requirementEvaluation.requirement.id === "req-review")!;

  assert.equal(planResult.status, "compliant", "EP_PLAN_MAINTAINED must stay satisfied — nothing about it expires");
  assert.equal(reviewResult.status, "overdue", "EP_ANNUAL_PLAN_REVIEW is independently overdue on its own lapsed evidence");
});

test("NON_EXPIRING_REQUIREMENT_CODES contains exactly EP_PLAN_MAINTAINED and EP_DISASTER_COORDINATOR_DESIGNATED", () => {
  assert.deepEqual(
    [...NON_EXPIRING_REQUIREMENT_CODES].sort(),
    ["EP_DISASTER_COORDINATOR_DESIGNATED", "EP_PLAN_MAINTAINED"].sort()
  );
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
      console.error(err);
    }
  }
  console.log(`\n${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();
