// Pure-function tests for the centrally preserved Evidence Assurance
// vocabulary — see lib/workforce/evidenceAssurance.ts. Never touches the
// evaluator; only interprets its already-computed RequirementEvaluation.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/evidenceAssurance.test.ts
import assert from "node:assert/strict";
import { evaluateRequirementSetStatus } from "../../compliance/requirementSetStatus.ts";
import { deriveEvidenceAssuranceLevel, EVIDENCE_ASSURANCE_LADDER } from "../evidenceAssurance.ts";
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

test("no evidence at all -> Unknown", () => {
  const req = requirement();
  assert.equal(deriveEvidenceAssuranceLevel(evaluationFor(req, [])), "Unknown");
});

test("evidence present but unverified -> Corroborated", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "unverified" });
  assert.equal(deriveEvidenceAssuranceLevel(evaluationFor(req, [ev])), "Corroborated");
});

test("rejected evidence -> Contradictory", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "rejected" });
  assert.equal(deriveEvidenceAssuranceLevel(evaluationFor(req, [ev])), "Contradictory");
});

test("below-score-threshold verified evidence -> Contradictory (requires_review, same as an outright rejection)", () => {
  const req = requirement({ required_score: 80 });
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "r@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    numeric_score: 65,
  });
  assert.equal(deriveEvidenceAssuranceLevel(evaluationFor(req, [ev])), "Contradictory");
});

test("a clean verified result (no attestation fields) -> Verified", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, verification_status: "verified", verified_by: "r@example.com", verified_at: "2026-01-02T00:00:00Z" });
  assert.equal(deriveEvidenceAssuranceLevel(evaluationFor(req, [ev])), "Verified");
});

test("a clean Human Attestation ('verified') -> Verified, matching the product mission's own worked example", () => {
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
  assert.equal(deriveEvidenceAssuranceLevel(evaluationFor(req, [ev])), "Verified");
});

test("a Human Attestation with 'verified_with_observation' -> Attested, one notch below a clean Verified", () => {
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
  assert.equal(deriveEvidenceAssuranceLevel(evaluationFor(req, [ev])), "Attested");
});

test("expired evidence keeps the assurance level it earned — currency is Audit Readiness's concern, not assurance's", () => {
  const req = requirement();
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "r@example.com",
    verified_at: "2020-01-02T00:00:00Z",
    expiration_date: "2020-01-01",
  });
  assert.equal(deriveEvidenceAssuranceLevel(evaluationFor(req, [ev])), "Verified");
});

test("expiring_soon evidence still reads Verified", () => {
  const req = requirement();
  const withinWindow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ev = evidence({
    requirement_id: req.id,
    verification_status: "verified",
    verified_by: "r@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    expiration_date: withinWindow,
  });
  assert.equal(deriveEvidenceAssuranceLevel(evaluationFor(req, [ev])), "Verified");
});

test("the assurance ladder is ordered weakest to strongest and does not include Contradictory (a distinct problem signal, not a rung)", () => {
  assert.deepEqual(EVIDENCE_ASSURANCE_LADDER, ["Unknown", "Inferred", "Corroborated", "Attested", "Verified"]);
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
