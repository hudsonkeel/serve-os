// Pure-function tests for the structured EP_CLIENT_TRIAGE_CLASSIFIED
// feature: label exactness, the AxisCare description allowlist (including
// the two real legacy values found in production data), the 7-state
// comparison model, and the bespoke satisfaction rule (read from the
// governed table, not from person_evidence).
//
//   node --experimental-strip-types --conditions=react-server lib/clientReadiness/__tests__/triageClassification.test.ts
import assert from "node:assert/strict";
import { TRIAGE_LEVEL_LABELS, isTriageLevelCode } from "../triageClassification.ts";
import { mapAxisCareTriageDescriptionToCode } from "../../integrations/axiscare/triageMapping.ts";
import { buildTriageClassificationDetail } from "../triageClassificationDetail.ts";
import { evaluateTriageClassification } from "../clientReadinessReadiness.ts";
import { EP_CLIENT_TRIAGE_CLASSIFIED } from "../constants.ts";
import type { ResidentTriageClassification } from "../../data/residentTriageClassifications.ts";
import type { PersonEvidence, PersonRequirement } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function classification(overrides: Partial<ResidentTriageClassification> = {}): ResidentTriageClassification {
  return {
    id: "triage-1",
    residentId: "resident-1",
    levelCode: "P1",
    effectiveDate: "2026-01-01",
    notes: null,
    actor: "Reviewer",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function requirement(overrides: Partial<PersonRequirement> = {}): PersonRequirement {
  return {
    id: "req-triage",
    requirement_code: EP_CLIENT_TRIAGE_CLASSIFIED,
    name: "Client Emergency Triage Classification On File",
    description: null,
    category: "client_safety",
    requires_document: false,
    requires_verification: false,
    is_active: true,
    required_score: null,
    regulatory_authority: "Serve P&P §256, item 4",
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
    subject_id: "resident-1",
    requirement_id: "req-triage",
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
    ...overrides,
  } as PersonEvidence;
}

// ─── Label exactness ────────────────────────────────────────────────────

test("TRIAGE_LEVEL_LABELS renders the exact three AxisCare-matching strings, including the em dash", () => {
  assert.equal(TRIAGE_LEVEL_LABELS.P1, "PRIORITY 1 — HIGH CONTINUITY NEED");
  assert.equal(TRIAGE_LEVEL_LABELS.P2, "PRIORITY 2 — MODERATE CONTINUITY NEED");
  assert.equal(TRIAGE_LEVEL_LABELS.P3, "PRIORITY 3 — LOW CONTINUITY NEED");
  // Confirm it's a real em dash (U+2014), not a hyphen or en dash.
  assert.equal(TRIAGE_LEVEL_LABELS.P1.includes("—"), true);
});

test("isTriageLevelCode accepts exactly P1/P2/P3 and rejects everything else", () => {
  assert.equal(isTriageLevelCode("P1"), true);
  assert.equal(isTriageLevelCode("P2"), true);
  assert.equal(isTriageLevelCode("P3"), true);
  assert.equal(isTriageLevelCode("P4"), false);
  assert.equal(isTriageLevelCode(""), false);
  assert.equal(isTriageLevelCode(null), false);
  assert.equal(isTriageLevelCode(undefined), false);
});

// ─── AxisCare description allowlist ─────────────────────────────────────

test("mapAxisCareTriageDescriptionToCode recognizes all three real Priority descriptions", () => {
  assert.equal(mapAxisCareTriageDescriptionToCode("PRIORITY 1 — HIGH CONTINUITY NEED"), "P1");
  assert.equal(mapAxisCareTriageDescriptionToCode("PRIORITY 2 — MODERATE CONTINUITY NEED"), "P2");
  assert.equal(mapAxisCareTriageDescriptionToCode("PRIORITY 3 — LOW CONTINUITY NEED"), "P3");
});

test("mapAxisCareTriageDescriptionToCode tolerates surrounding whitespace", () => {
  assert.equal(mapAxisCareTriageDescriptionToCode("  PRIORITY 1 — HIGH CONTINUITY NEED  "), "P1");
});

test("REGRESSION: mapAxisCareTriageDescriptionToCode never coerces the two real legacy AxisCare values into a Priority level", () => {
  assert.equal(mapAxisCareTriageDescriptionToCode("Can get out on their own"), null);
  assert.equal(mapAxisCareTriageDescriptionToCode("Need assistance or reminding"), null);
});

test("mapAxisCareTriageDescriptionToCode returns null for no value and for an unrecognized value", () => {
  assert.equal(mapAxisCareTriageDescriptionToCode(null), null);
  assert.equal(mapAxisCareTriageDescriptionToCode(""), null);
  assert.equal(mapAxisCareTriageDescriptionToCode("Some future AxisCare admin renamed this to something else"), null);
});

// ─── buildTriageClassificationDetail: the 7-state model ─────────────────

test("no_data: neither Serve nor AxisCare has a value", () => {
  const result = buildTriageClassificationDetail({ serveCurrent: null, axiscareRawDescription: null });
  assert.equal(result.state, "no_data");
  assert.equal(result.serve, null);
  assert.equal(result.axiscare, null);
});

test("axiscare_only_recognized: AxisCare has a real Priority value, Serve hasn't recorded yet", () => {
  const result = buildTriageClassificationDetail({
    serveCurrent: null,
    axiscareRawDescription: "PRIORITY 2 — MODERATE CONTINUITY NEED",
  });
  assert.equal(result.state, "axiscare_only_recognized");
  assert.equal(result.axiscare?.code, "P2");
  assert.equal(result.axiscare?.rawDescription, "PRIORITY 2 — MODERATE CONTINUITY NEED");
});

test("axiscare_only_unrecognized: AxisCare has a legacy value, Serve hasn't recorded yet -- never coerced or dropped", () => {
  const result = buildTriageClassificationDetail({ serveCurrent: null, axiscareRawDescription: "Can get out on their own" });
  assert.equal(result.state, "axiscare_only_unrecognized");
  assert.equal(result.axiscare?.code, null);
  assert.equal(result.axiscare?.rawDescription, "Can get out on their own");
});

test("serve_only: Serve has recorded, AxisCare has no triage value at all", () => {
  const result = buildTriageClassificationDetail({ serveCurrent: classification({ levelCode: "P3" }), axiscareRawDescription: null });
  assert.equal(result.state, "serve_only");
  assert.equal(result.serve?.code, "P3");
});

test("agree: both exist and match", () => {
  const result = buildTriageClassificationDetail({
    serveCurrent: classification({ levelCode: "P1" }),
    axiscareRawDescription: "PRIORITY 1 — HIGH CONTINUITY NEED",
  });
  assert.equal(result.state, "agree");
});

test("REGRESSION: disagree -- both exist (Serve + a recognized AxisCare value) and differ, the only real conflict state", () => {
  const result = buildTriageClassificationDetail({
    serveCurrent: classification({ levelCode: "P1" }),
    axiscareRawDescription: "PRIORITY 3 — LOW CONTINUITY NEED",
  });
  assert.equal(result.state, "disagree");
  assert.equal(result.serve?.code, "P1");
  assert.equal(result.axiscare?.code, "P3");
});

test("serve_with_unrecognized_axiscare: Serve has recorded; AxisCare's value is legacy/unrecognized -- noted, not a conflict", () => {
  const result = buildTriageClassificationDetail({
    serveCurrent: classification({ levelCode: "P2" }),
    axiscareRawDescription: "Need assistance or reminding",
  });
  assert.equal(result.state, "serve_with_unrecognized_axiscare");
  assert.equal(result.serve?.code, "P2");
  assert.equal(result.axiscare?.code, null);
  assert.equal(result.axiscare?.rawDescription, "Need assistance or reminding");
});

// ─── evaluateTriageClassification: satisfaction reads the governed table ─

test("evaluateTriageClassification is missing_evidence when no current classification exists, even if stray evidence exists", () => {
  const req = requirement();
  const staleEvidence = evidence({ requirement_id: req.id, lifecycle_status: "active" });
  const result = evaluateTriageClassification(null, req, [staleEvidence]);
  assert.equal(result.status, "missing_evidence");
});

test("REGRESSION: evaluateTriageClassification is compliant purely from the governed classification, even with zero person_evidence rows -- the atomicity guarantee", () => {
  const req = requirement();
  const result = evaluateTriageClassification(classification({ levelCode: "P2" }), req, []);
  assert.equal(result.status, "compliant");
});

test("evaluateTriageClassification still surfaces the latest active evidence for display, when one exists", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id, id: "ev-latest" });
  const result = evaluateTriageClassification(classification(), req, [ev]);
  assert.equal(result.latestEvidence?.id, "ev-latest");
});

test("evaluateTriageClassification falls back to the standard evidence-currency evaluator when the caller passes undefined (e.g. a client-bundle-safe context that can't resolve the governed table)", () => {
  const req = requirement();
  const ev = evidence({ requirement_id: req.id });
  const withEvidence = evaluateTriageClassification(undefined, req, [ev]);
  assert.equal(withEvidence.status, "compliant");

  const withoutEvidence = evaluateTriageClassification(undefined, req, []);
  assert.equal(withoutEvidence.status, "missing_evidence");
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
