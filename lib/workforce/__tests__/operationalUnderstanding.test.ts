// Pure-function tests for the three-axis Operational Understanding / Evidence
// Assurance / Audit Readiness distinction — see
// lib/workforce/operationalUnderstanding.ts. The one hard constraint this
// file exists to enforce: "absence of connected evidence" must never read
// as "the event never happened" — every missing/awaiting case below is
// checked for exactly that phrasing distinction.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/operationalUnderstanding.test.ts
import assert from "node:assert/strict";
import { evaluateRequirementSetStatus } from "../../compliance/requirementSetStatus.ts";
import { deriveOperationalUnderstanding } from "../operationalUnderstanding.ts";
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

function evaluationFor(req: PersonRequirement, evidenceRows: PersonEvidence[]) {
  return evaluateRequirementSetStatus([req], evidenceRows).requirements[0];
}

test("satisfied -> Completed / Verified / Ready", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "verified", verified_by: "r@example.com", verified_at: "2026-01-02T00:00:00Z" });
  const result = deriveOperationalUnderstanding(evaluationFor(req, [ev]));
  assert.equal(result.operationalUnderstanding, "Completed");
  assert.equal(result.evidenceAssurance, "Verified");
  assert.equal(result.auditReadiness, "Ready");
});

test("missing -> Unknown, never implies the event didn't happen — not knowing is a different claim than knowing it didn't occur", () => {
  const req = requirement();
  const result = deriveOperationalUnderstanding(evaluationFor(req, []));
  assert.equal(result.evidenceAssurance, "Unknown");
  assert.match(result.operationalUnderstanding, /^Unknown/);
  assert.doesNotMatch(result.operationalUnderstanding, /never (happened|occurred)/i);
  assert.match(result.auditReadiness, /^Action required/);
});

test("awaiting_verification -> Completed / Corroborated / Needs Source Confirmation", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "unverified" });
  const result = deriveOperationalUnderstanding(evaluationFor(req, [ev]));
  assert.equal(result.operationalUnderstanding, "Completed");
  assert.equal(result.evidenceAssurance, "Corroborated");
  assert.equal(result.auditReadiness, "Needs Source Confirmation");
});

test("expired -> was completed, now lapsed, distinct from never having evidence at all — but assurance keeps the level it earned", () => {
  const req = requirement();
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "r@example.com",
    verified_at: "2020-01-02T00:00:00Z",
    expiration_date: "2020-01-01",
  });
  const result = deriveOperationalUnderstanding(evaluationFor(req, [ev]));
  assert.match(result.operationalUnderstanding, /lapsed/);
  assert.equal(result.evidenceAssurance, "Verified", "currency is Audit Readiness's concern, not assurance's");
  assert.match(result.auditReadiness, /^Action required/);
});

test("requires_review below score threshold -> Contradictory, distinguishes from a rejected review in operationalUnderstanding wording", () => {
  const req = requirement({ required_score: 80 });
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "r@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    numeric_score: 65,
  });
  const result = deriveOperationalUnderstanding(evaluationFor(req, [ev]));
  assert.match(result.operationalUnderstanding, /did not meet the required standard/);
  assert.equal(result.evidenceAssurance, "Contradictory");
  assert.equal(result.auditReadiness, "Needs Human Review");
});

test("requires_review from an outright rejection -> distinct operationalUnderstanding wording from below-threshold, same Contradictory assurance", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "rejected" });
  const result = deriveOperationalUnderstanding(evaluationFor(req, [ev]));
  assert.match(result.operationalUnderstanding, /evidence was found insufficient/);
  assert.equal(result.evidenceAssurance, "Contradictory");
});

test("expiring_soon -> still Completed/Verified, but Audit Readiness flags the approaching renewal", () => {
  const req = requirement();
  const withinWindow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "r@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    expiration_date: withinWindow,
  });
  const result = deriveOperationalUnderstanding(evaluationFor(req, [ev]));
  assert.equal(result.operationalUnderstanding, "Completed");
  assert.equal(result.evidenceAssurance, "Verified");
  assert.match(result.auditReadiness, /renewal approaching/);
});

test("a clean Human Attestation reaches Verified assurance, matching the product mission's own example", () => {
  const req = requirement();
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "elizabeth@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    collection_method: "human_attestation",
    authoritative_source_system: "viventium",
    verification_method: "direct_source_review",
    attestation_result: "verified",
  });
  const result = deriveOperationalUnderstanding(evaluationFor(req, [ev]));
  assert.equal(result.operationalUnderstanding, "Completed");
  assert.equal(result.evidenceAssurance, "Verified");
  assert.equal(result.auditReadiness, "Ready");
});

test("a Human Attestation with 'Verified with Observation' reaches Attested, one notch below a clean Verified", () => {
  const req = requirement();
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "elizabeth@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    collection_method: "human_attestation",
    authoritative_source_system: "viventium",
    verification_method: "direct_source_review",
    attestation_result: "verified_with_observation",
  });
  const result = deriveOperationalUnderstanding(evaluationFor(req, [ev]));
  assert.equal(result.evidenceAssurance, "Attested");
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
