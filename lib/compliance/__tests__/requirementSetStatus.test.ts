// Pure-function tests for the platform-level, domain-agnostic Compliance
// Status calculation. Deliberately exercised with no knowledge of
// Workforce/NAR/EMR — generic requirement/evidence fixtures only, proving
// this layer has no domain-specific behavior baked in.
//
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/requirementSetStatus.test.ts
import assert from "node:assert/strict";
import { EXPIRING_SOON_WINDOW_DAYS, evaluateRequirementSetStatus } from "../requirementSetStatus.ts";
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
    regulatory_authority: null,
    domain: null,
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
    satisfaction_context: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const FIXED_NOW = () => new Date("2026-07-29T12:00:00");

test("not_applicable when the requirement set has no requirements", () => {
  const result = evaluateRequirementSetStatus([], []);
  assert.equal(result.status, "not_applicable");
});

test("incomplete when a requirement has no evidence at all", () => {
  const req = requirement();
  const result = evaluateRequirementSetStatus([req], []);
  assert.equal(result.status, "incomplete");
  assert.match(result.explanation, /^Incomplete because/);
});

test("awaiting_verification when evidence exists but hasn't been verified", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "unverified" });
  const result = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(result.status, "awaiting_verification");
});

test("complete when every requirement has verified evidence", () => {
  const reqA = requirement({ id: "req-a", requirement_code: "A" });
  const reqB = requirement({ id: "req-b", requirement_code: "B" });
  const evA = evidence({ id: "ev-a", requirement_id: "req-a", verification_status: "verified", verified_by: "reviewer@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const evB = evidence({ id: "ev-b", requirement_id: "req-b", verification_status: "verified", verified_by: "reviewer@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const result = evaluateRequirementSetStatus([reqA, reqB], [evA, evB]);
  assert.equal(result.status, "complete");
});

test("requires_review when evidence was rejected", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "rejected" });
  const result = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(result.status, "requires_review");
});

test("expired when verified evidence's expiration_date has passed", () => {
  const req = requirement();
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2020-01-02T00:00:00Z",
    expiration_date: "2020-01-01",
  });
  const result = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(result.status, "expired");
});

test("expired when lifecycle_status is explicitly 'expired', even with no expiration_date set", () => {
  const req = requirement();
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    lifecycle_status: "expired",
    expiration_date: null,
  });
  const result = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(result.status, "expired");
  // Verification history survives an explicit expiration exactly like it
  // survives supersession.
  assert.equal(ev.verification_status, "verified");
  assert.equal(ev.verified_by, "reviewer@example.com");
});

test("verification and lifecycle are independent: unverified evidence with a future expiration_date is awaiting_verification, not expired", () => {
  const req = requirement();
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "unverified",
    expiration_date: "2099-01-01",
  });
  const result = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(result.status, "awaiting_verification");
});

test("precedence: expired outranks requires_review, incomplete, and awaiting_verification", () => {
  const reqExpired = requirement({ id: "r1", requirement_code: "EXPIRED" });
  const reqRejected = requirement({ id: "r2", requirement_code: "REJECTED" });
  const reqMissing = requirement({ id: "r3", requirement_code: "MISSING" });
  const evExpired = evidence({
    id: "e1",
    requirement_id: "r1",
    verification_status: "verified",
    verified_by: "x@example.com",
    verified_at: "2020-01-02T00:00:00Z",
    expiration_date: "2020-01-01",
  });
  const evRejected = evidence({ id: "e2", requirement_id: "r2", verification_status: "rejected" });
  const result = evaluateRequirementSetStatus([reqExpired, reqRejected, reqMissing], [evExpired, evRejected]);
  assert.equal(result.status, "expired");
});

test("precedence: a fully missing requirement outranks one merely awaiting verification", () => {
  const reqMissing = requirement({ id: "r1", requirement_code: "MISSING" });
  const reqAwaiting = requirement({ id: "r2", requirement_code: "AWAITING" });
  const evAwaiting = evidence({ id: "e1", requirement_id: "r2", verification_status: "unverified" });
  const result = evaluateRequirementSetStatus([reqMissing, reqAwaiting], [evAwaiting]);
  assert.equal(result.status, "incomplete");
});

test("superseded evidence is ignored in favor of the most recent current row, and keeps its own verification history", () => {
  const req = requirement();
  const old = evidence({
    id: "ev-old",
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "original-reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    lifecycle_status: "superseded",
    created_at: "2026-01-01T00:00:00Z",
  });
  const current = evidence({
    id: "ev-new",
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2026-02-02T00:00:00Z",
    created_at: "2026-02-01T00:00:00Z",
  });
  const result = evaluateRequirementSetStatus([req], [old, current]);
  assert.equal(result.status, "complete");
  // The superseded row's own verification history must still be intact —
  // supersession never retroactively erases who verified it originally.
  assert.equal(old.verification_status, "verified");
  assert.equal(old.verified_by, "original-reviewer@example.com");
});

test("per-requirement evaluations are returned alongside the set-level status", () => {
  const req = requirement();
  const result = evaluateRequirementSetStatus([req], []);
  assert.equal(result.requirements.length, 1);
  assert.equal(result.requirements[0].status, "missing");
  assert.equal(result.requirements[0].requirement.id, req.id);
});

// ─── Employee Record Audit additions: expiring_soon + score threshold ────
test("expiring_soon when verified evidence's expiration falls within the warning window", () => {
  const req = requirement();
  const withinWindow = new Date(FIXED_NOW().getTime() + (EXPIRING_SOON_WINDOW_DAYS - 5) * 24 * 60 * 60 * 1000);
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    expiration_date: withinWindow.toISOString().slice(0, 10),
  });
  const result = evaluateRequirementSetStatus([req], [ev], FIXED_NOW);
  assert.equal(result.status, "expiring_soon");
  assert.equal(result.requirements[0].status, "expiring_soon");
});

test("satisfied (not expiring_soon) when the expiration is beyond the warning window", () => {
  const req = requirement();
  const beyondWindow = new Date(FIXED_NOW().getTime() + (EXPIRING_SOON_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000);
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    expiration_date: beyondWindow.toISOString().slice(0, 10),
  });
  const result = evaluateRequirementSetStatus([req], [ev], FIXED_NOW);
  assert.equal(result.status, "complete");
  assert.equal(result.requirements[0].status, "satisfied");
});

test("expiring_soon ranks below every other open problem but above complete", () => {
  const reqMissing = requirement({ id: "r1", requirement_code: "MISSING" });
  const reqExpiringSoon = requirement({ id: "r2", requirement_code: "EXPIRING" });
  const withinWindow = new Date(FIXED_NOW().getTime() + 5 * 24 * 60 * 60 * 1000);
  const evExpiringSoon = evidence({
    id: "e1",
    requirement_id: "r2",
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    expiration_date: withinWindow.toISOString().slice(0, 10),
  });
  const withMissing = evaluateRequirementSetStatus([reqMissing, reqExpiringSoon], [evExpiringSoon], FIXED_NOW);
  assert.equal(withMissing.status, "incomplete", "a missing requirement still outranks expiring_soon");

  const onlyExpiringSoon = evaluateRequirementSetStatus([reqExpiringSoon], [evExpiringSoon], FIXED_NOW);
  assert.equal(onlyExpiringSoon.status, "expiring_soon");
});

test("a score-gated requirement is not satisfied by verified evidence below the required score", () => {
  const req = requirement({ required_score: 80 });
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    numeric_score: 65,
  });
  const result = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(result.status, "requires_review");
  assert.match(result.requirements[0].explanation, /below the required 80/);
});

test("a score-gated requirement with no recorded score at all requires review, not satisfied", () => {
  const req = requirement({ required_score: 80 });
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    numeric_score: null,
  });
  const result = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(result.status, "requires_review");
});

test("a score-gated requirement is satisfied when the recorded score meets or exceeds the threshold", () => {
  const req = requirement({ required_score: 80 });
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    numeric_score: 80,
  });
  const result = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(result.status, "complete");
  assert.equal(result.requirements[0].status, "satisfied");
});

test("a non-score-gated requirement (required_score null) is unaffected by numeric_score entirely", () => {
  const req = requirement({ required_score: null });
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    numeric_score: null,
  });
  const result = evaluateRequirementSetStatus([req], [ev]);
  assert.equal(result.status, "complete");
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
