import assert from "node:assert/strict";
import { computeAxisCareReadiness, buildAxisCarePayloadPreview, type ApprovedFactForReadiness } from "../axiscareReadiness.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const REQUIRED_FACTS: ApprovedFactForReadiness[] = [
  { fieldPath: "identity.date_of_birth", assertionState: "confirmed_yes", value: "1940-01-01" },
  { fieldPath: "important_people.primary_contact_phone", assertionState: "confirmed_yes", value: "555-1234" },
];

test("no existing AxisCare link + all required fields present -> ready to propose CREATE", () => {
  const result = computeAxisCareReadiness(REQUIRED_FACTS, { status: null, axiscareClientId: null, matchConfidence: null });
  assert.equal(result.readiness, "ready_to_propose_create");
  assert.equal(result.proposedAction, "create");
});

test("confirmed existing AxisCare link -> ready to propose UPDATE, carries the existing client id", () => {
  const result = computeAxisCareReadiness(REQUIRED_FACTS, {
    status: "confirmed",
    axiscareClientId: "12345",
    matchConfidence: "high",
  });
  assert.equal(result.readiness, "ready_to_propose_update");
  if (result.readiness === "ready_to_propose_update") {
    assert.equal(result.existingAxisCareClientId, "12345");
  }
});

test("AMBIGUOUS MATCH: a proposed link with non-high confidence routes to reconciliation, never auto-resolved", () => {
  const result = computeAxisCareReadiness(REQUIRED_FACTS, {
    status: "proposed",
    axiscareClientId: null,
    matchConfidence: "low",
  });
  assert.equal(result.readiness, "possible_duplicate_requires_reconciliation");
  assert.equal(result.proposedAction, null);
});

test("ATTEMPTED DUPLICATE CREATION: a rejected link status never falls through to 'ready_to_propose_create' — still requires a human decision", () => {
  const result = computeAxisCareReadiness(REQUIRED_FACTS, {
    status: "rejected",
    axiscareClientId: null,
    matchConfidence: null,
  });
  assert.equal(result.readiness, "possible_duplicate_requires_reconciliation");
});

test("missing required fields blocks readiness before identity is even considered", () => {
  const result = computeAxisCareReadiness([], { status: null, axiscareClientId: null, matchConfidence: null });
  assert.equal(result.readiness, "missing_required_fields");
  assert.deepEqual(result.missingRequiredFields.sort(), ["identity.date_of_birth", "important_people.primary_contact_phone"]);
});

test("payload preview includes only confirmed_yes/confirmed_no facts, and is always marked as a preview action", () => {
  const facts: ApprovedFactForReadiness[] = [
    ...REQUIRED_FACTS,
    { fieldPath: "cognition.wandering", assertionState: "uncertain", value: true },
  ];
  const preview = buildAxisCarePayloadPreview(facts, "create");
  assert.equal(preview.action, "create");
  assert.ok("identity.date_of_birth" in preview.fields);
  assert.ok(!("cognition.wandering" in preview.fields), "uncertain facts must not appear in a payload preview");
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
