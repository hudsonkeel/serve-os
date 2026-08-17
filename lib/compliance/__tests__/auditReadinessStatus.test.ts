// Pure-function tests for the Audit Readiness Domain Interpretation layer.
// Exercises the mapping from the shared engine's RequirementStatus/
// RequirementSetStatus onto the Audit Readiness product vocabulary, and
// the satisfied_by_event / exception classifier extension point — proving
// neither is a new engine state (evaluateRequirementSetStatus() is never
// imported or called here at all).
//
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/auditReadinessStatus.test.ts
import assert from "node:assert/strict";
import { deriveAuditReadinessStatus, type EvidenceSatisfactionClassifier } from "../auditReadinessStatus.ts";
import type { RequirementEvaluation, RequirementSetEvaluation } from "../requirementSetStatus.ts";
import type { PersonEvidence, PersonRequirement } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function requirement(overrides: Partial<PersonRequirement> = {}): PersonRequirement {
  return {
    id: "req-1",
    requirement_code: "EP_ANNUAL_DRILL",
    name: "Annual Emergency Response Drill",
    description: null,
    category: "emergency_preparedness",
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
    subject_type: "resident",
    subject_id: "agency-1",
    requirement_id: "req-1",
    document_id: null,
    verification_status: "verified",
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
    verified_by: "reviewer@example.com",
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

function requirementEvaluation(overrides: Partial<RequirementEvaluation> = {}): RequirementEvaluation {
  return {
    requirement: requirement(),
    status: "satisfied",
    latestEvidence: evidence(),
    explanation: "Annual Emergency Response Drill is satisfied — verified.",
    ...overrides,
  };
}

function setEvaluation(overrides: Partial<RequirementSetEvaluation> = {}): RequirementSetEvaluation {
  const req = requirementEvaluation();
  return {
    status: "complete",
    explanation: "All requirements are satisfied and verified.",
    requirements: [req],
    ...overrides,
  };
}

test("satisfied with no classifier maps to compliant", () => {
  const result = deriveAuditReadinessStatus(setEvaluation());
  assert.equal(result.status, "compliant");
  assert.equal(result.requirements[0].status, "compliant");
});

test("missing maps to missing_evidence", () => {
  const req = requirementEvaluation({ status: "missing", latestEvidence: null });
  const result = deriveAuditReadinessStatus(
    setEvaluation({ status: "incomplete", requirements: [req], explanation: "Incomplete because..." })
  );
  assert.equal(result.status, "missing_evidence");
  assert.equal(result.requirements[0].status, "missing_evidence");
});

test("awaiting_verification maps to needs_review", () => {
  const req = requirementEvaluation({ status: "awaiting_verification" });
  const result = deriveAuditReadinessStatus(setEvaluation({ status: "awaiting_verification", requirements: [req] }));
  assert.equal(result.status, "needs_review");
  assert.equal(result.requirements[0].status, "needs_review");
});

test("requires_review maps to needs_review", () => {
  const req = requirementEvaluation({ status: "requires_review" });
  const result = deriveAuditReadinessStatus(setEvaluation({ status: "requires_review", requirements: [req] }));
  assert.equal(result.status, "needs_review");
  assert.equal(result.requirements[0].status, "needs_review");
});

test("expired maps to overdue", () => {
  const req = requirementEvaluation({ status: "expired" });
  const result = deriveAuditReadinessStatus(setEvaluation({ status: "expired", requirements: [req] }));
  assert.equal(result.status, "overdue");
  assert.equal(result.requirements[0].status, "overdue");
});

test("expiring_soon maps to due_soon", () => {
  const req = requirementEvaluation({ status: "expiring_soon" });
  const result = deriveAuditReadinessStatus(setEvaluation({ status: "expiring_soon", requirements: [req] }));
  assert.equal(result.status, "due_soon");
  assert.equal(result.requirements[0].status, "due_soon");
});

test("not_applicable set status maps to not_applicable", () => {
  const result = deriveAuditReadinessStatus(setEvaluation({ status: "not_applicable", requirements: [] }));
  assert.equal(result.status, "not_applicable");
});

test("a classifier returning satisfied_by_event overrides compliant for a satisfied requirement", () => {
  const classify: EvidenceSatisfactionClassifier = (ev) =>
    ev.source_system === "actual_emergency_response"
      ? { status: "satisfied_by_event", explanation: "Satisfied by a documented actual emergency response." }
      : null;

  const req = requirementEvaluation({ latestEvidence: evidence({ source_system: "actual_emergency_response" }) });
  const result = deriveAuditReadinessStatus(setEvaluation({ requirements: [req] }), classify);

  assert.equal(result.requirements[0].status, "satisfied_by_event");
  assert.match(result.requirements[0].explanation, /actual emergency response/);
  // The set-level status still comes from the engine's own set status
  // (unaffected by the per-requirement override) — "complete" -> "compliant".
  assert.equal(result.status, "compliant");
});

test("a classifier returning exception overrides compliant for a satisfied requirement", () => {
  const classify: EvidenceSatisfactionClassifier = (ev) =>
    ev.notes === "exception-granted" ? { status: "exception", explanation: "Exception approved by the Administrator." } : null;

  const req = requirementEvaluation({ latestEvidence: evidence({ notes: "exception-granted" }) });
  const result = deriveAuditReadinessStatus(setEvaluation({ requirements: [req] }), classify);

  assert.equal(result.requirements[0].status, "exception");
});

test("a classifier returning null falls back to compliant", () => {
  const classify: EvidenceSatisfactionClassifier = () => null;
  const result = deriveAuditReadinessStatus(setEvaluation(), classify);
  assert.equal(result.requirements[0].status, "compliant");
});

test("a classifier is never consulted for a non-satisfied requirement", () => {
  let calls = 0;
  const classify: EvidenceSatisfactionClassifier = () => {
    calls++;
    return null;
  };
  const req = requirementEvaluation({ status: "missing", latestEvidence: null });
  deriveAuditReadinessStatus(setEvaluation({ status: "incomplete", requirements: [req] }), classify);
  assert.equal(calls, 0);
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
