// Pure-function tests for Client Readiness's bespoke composition rules —
// the three requirements whose truth genuinely depends on canonical
// resident facts or applicability logic the shared evidence engine can't
// express (Client Profile, Significant Events, Discharge). Every other
// requirement routes through the same shared evaluator already exhaustively
// tested by requirementSetStatus.test.ts — not re-tested here.
//
//   node --experimental-strip-types --conditions=react-server lib/clientReadiness/__tests__/clientReadinessReadiness.test.ts
import assert from "node:assert/strict";
import { evaluateClientProfile, evaluateDischarge, evaluateSignificantEvents } from "../clientReadinessReadiness.ts";
import { CR_CLIENT_PROFILE_ON_FILE, CR_DISCHARGE_SUMMARY_ON_FILE, CR_SIGNIFICANT_EVENTS_DOCUMENTED } from "../constants.ts";
import type { PersonEvidence, PersonRequirement, Resident } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function requirement(overrides: Partial<PersonRequirement> = {}): PersonRequirement {
  return {
    id: "req-1",
    requirement_code: CR_CLIENT_PROFILE_ON_FILE,
    name: "Client Identity & Core Information",
    description: null,
    category: "profile",
    requires_document: false,
    requires_verification: false,
    is_active: true,
    required_score: null,
    regulatory_authority: "Serve P&P §301(a)",
    domain: "client_readiness",
    version: 1,
    effective_date: null,
    retired_at: null,
    supersedes_requirement_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function resident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: "resident-1",
    external_source_key: null,
    community_name: null,
    community_code: null,
    first_name: "Mary",
    middle_name: null,
    last_name: "Smith",
    preferred_name: null,
    display_name: "Mary Smith",
    full_name: "Mary Smith",
    status: "active",
    relationship_status: null,
    serve_relationship_status: "active_client",
    resident_type: null,
    building: "Watermere",
    unit_number: "204",
    email: null,
    phone: null,
    phone_raw: null,
    phone_type: null,
    date_of_birth: "1940-01-01",
    date_of_admission: "2025-01-01",
    mobility: null,
    preferred_language: null,
    sex: "F",
    gender: null,
    address: null,
    city: null,
    state: null,
    country: null,
    zip_code: null,
    care_needs: null,
    family_contact_name: null,
    family_contact_relationship: null,
    family_contact_phone: null,
    family_contact_email: null,
    physician_name: "Dr. Reyes",
    physician_phone: "5555550100",
    legal_guardian_name: null,
    legal_guardian_phone: null,
    source_system: null,
    source_file: null,
    source_status: null,
    notes: null,
    needs_review: null,
    import_batch: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    is_active: true,
    ...overrides,
  };
}

function evidence(overrides: Partial<PersonEvidence> = {}): PersonEvidence {
  return {
    id: "ev-1",
    subject_type: "resident",
    subject_id: "resident-1",
    requirement_id: "req-1",
    document_id: null,
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

// ─── Client Profile ────────────────────────────────────────────────────

test("Client Profile is compliant when every required field is present and guardian is populated", () => {
  const r = resident({ legal_guardian_name: "John Smith", legal_guardian_phone: "5555550199" });
  const result = evaluateClientProfile(r, requirement(), []);
  assert.equal(result.status, "compliant");
});

test("Client Profile is missing_evidence when physician contact is absent", () => {
  const r = resident({ physician_name: null, physician_phone: null, legal_guardian_name: "John Smith", legal_guardian_phone: "5555550199" });
  const result = evaluateClientProfile(r, requirement(), []);
  assert.equal(result.status, "missing_evidence");
  assert.match(result.explanation, /physician contact/);
});

test("Client Profile is missing_evidence when guardian is genuinely unresolved (blank, no attestation)", () => {
  const r = resident({ legal_guardian_name: null, legal_guardian_phone: null });
  const result = evaluateClientProfile(r, requirement(), []);
  assert.equal(result.status, "missing_evidence");
  assert.match(result.explanation, /legal guardian/);
});

test("Client Profile is compliant when guardian is genuinely unresolved but a 'confirmed no guardian' attestation exists — silence alone never satisfies it, the attestation does", () => {
  const req = requirement();
  const r = resident({ legal_guardian_name: null, legal_guardian_phone: null });
  const attestation = evidence({ requirement_id: req.id, satisfaction_context: "guardian_confirmed_none" });
  const result = evaluateClientProfile(r, req, [attestation]);
  assert.equal(result.status, "compliant");
  assert.equal(result.latestEvidence?.id, attestation.id);
});

test("Client Profile ignores a superseded 'confirmed no guardian' attestation — guardian stays unresolved", () => {
  const req = requirement();
  const r = resident({ legal_guardian_name: null, legal_guardian_phone: null });
  const supersededAttestation = evidence({
    requirement_id: req.id,
    satisfaction_context: "guardian_confirmed_none",
    lifecycle_status: "superseded",
  });
  const result = evaluateClientProfile(r, req, [supersededAttestation]);
  assert.equal(result.status, "missing_evidence");
});

// ─── Significant Events — zero events is not_applicable, never a failure ──

test("Significant Events is not_applicable when zero events have been recorded — never a failure", () => {
  const req = requirement({ id: "req-events", requirement_code: CR_SIGNIFICANT_EVENTS_DOCUMENTED });
  const result = evaluateSignificantEvents(req, []);
  assert.equal(result.status, "not_applicable");
});

test("Significant Events is compliant when every recorded event is verified", () => {
  const req = requirement({ id: "req-events", requirement_code: CR_SIGNIFICANT_EVENTS_DOCUMENTED });
  const events = [
    evidence({ id: "ev-a", requirement_id: req.id, verification_status: "verified" }),
    evidence({ id: "ev-b", requirement_id: req.id, verification_status: "verified" }),
  ];
  const result = evaluateSignificantEvents(req, events);
  assert.equal(result.status, "compliant");
  assert.match(result.explanation, /2 significant events documented/);
});

test("Significant Events is needs_review when some (not all) recorded events lack documentation review", () => {
  const req = requirement({ id: "req-events", requirement_code: CR_SIGNIFICANT_EVENTS_DOCUMENTED });
  const events = [
    evidence({ id: "ev-a", requirement_id: req.id, verification_status: "verified" }),
    evidence({ id: "ev-b", requirement_id: req.id, verification_status: "unverified" }),
  ];
  const result = evaluateSignificantEvents(req, events);
  assert.equal(result.status, "needs_review");
  assert.match(result.explanation, /1 of 2/);
});

test("Significant Events excludes superseded/entered-in-error rows from the event count", () => {
  const req = requirement({ id: "req-events", requirement_code: CR_SIGNIFICANT_EVENTS_DOCUMENTED });
  const events = [
    evidence({ id: "ev-a", requirement_id: req.id, verification_status: "verified" }),
    evidence({ id: "ev-b", requirement_id: req.id, verification_status: "unverified", lifecycle_status: "entered_in_error" }),
  ];
  const result = evaluateSignificantEvents(req, events);
  assert.equal(result.status, "compliant");
  assert.match(result.explanation, /1 significant event documented/);
});

// ─── Discharge — not_applicable while active, required once former ──────
// Now driven by the canonical ServeRelationshipProjection value directly
// (never residents.serve_relationship_status — see
// clientReadinessReadiness.ts's own comment on evaluateDischarge).

test("Discharge applicability follows the projected relationship — not_applicable for every value except inactive_client", () => {
  const req = requirement({ id: "req-discharge", requirement_code: CR_DISCHARGE_SUMMARY_ON_FILE });
  for (const relationship of ["prospect", "active_client", "no_current_relationship", "needs_review"] as const) {
    const result = evaluateDischarge(relationship, req, []);
    assert.equal(result.status, "not_applicable", `${relationship} should be not_applicable, not a discharge failure`);
  }
});

test("Discharge is missing_evidence for inactive_client (canonical 'former client') with no discharge summary on file", () => {
  const req = requirement({ id: "req-discharge", requirement_code: CR_DISCHARGE_SUMMARY_ON_FILE });
  const result = evaluateDischarge("inactive_client", req, []);
  assert.equal(result.status, "missing_evidence");
});

test("Discharge is compliant for inactive_client with verified discharge evidence on file", () => {
  const req = requirement({ id: "req-discharge", requirement_code: CR_DISCHARGE_SUMMARY_ON_FILE });
  const dischargeEvidence = evidence({ requirement_id: req.id, document_id: "doc-1" });
  const result = evaluateDischarge("inactive_client", req, [dischargeEvidence]);
  assert.equal(result.status, "compliant");
});

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
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
