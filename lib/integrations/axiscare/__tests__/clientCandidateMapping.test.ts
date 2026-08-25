import assert from "node:assert/strict";
import {
  buildNewClientCandidate,
  buildUpdateClientCandidate,
  resolveCreateEligibility,
  summarizeCandidate,
  type ApprovedFactForMapping,
} from "../clientCandidateMapping.ts";
import type { AxisCareClientClass } from "../types.ts";
import type { AxisCareIdentityLinkState } from "../../../assessmentIntelligence/axiscareReadiness.ts";
import type { ReassessmentComparisonRow } from "../../../assessmentIntelligence/reassessmentComparison.ts";
import { FIXTURE_A_PROFILE, FIXTURE_A_ASSESSMENT_DATE } from "../../../assessmentIntelligence/__fixtures__/syntheticAssessments.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// Real classes captured from a live GET /api/classes/client call against the actual configured
// AxisCare site during this work (see the completion report) — using the real subset relevant
// here, not invented codes.
const REAL_CLASSES: AxisCareClientClass[] = [
  { code: "WAF Prospect", label: "WAF Prospect" },
  { code: "WAF - Active No Visits", label: "WAF Signed Agreement / No Visits" },
  { code: "CINCH", label: "CINCH" },
  { code: "PP", label: "Private Pay" },
];

function factsFromFixtureA(): ApprovedFactForMapping[] {
  // Fixture A's expected facts don't all carry a `value` — for this test we only need the ones
  // this mapping module actually reads (identity/contact fields); daily-life/care fields aren't
  // client-record fields at all (see UNSUPPORTED assertions below).
  return [
    { fieldPath: "identity.date_of_birth", assertionState: "confirmed_yes", value: FIXTURE_A_PROFILE.dateOfBirth },
    { fieldPath: "identity.email", assertionState: "confirmed_yes", value: FIXTURE_A_PROFILE.email },
    { fieldPath: "identity.phone", assertionState: "confirmed_yes", value: FIXTURE_A_PROFILE.phone },
  ];
}

test("new client candidate: firstName/lastName come from resident identity, never assessment facts", () => {
  const candidate = buildNewClientCandidate({
    residentIdentity: { residentId: "res-123", firstName: FIXTURE_A_PROFILE.firstName, lastName: FIXTURE_A_PROFILE.lastName },
    approvedFacts: factsFromFixtureA(),
    availableClasses: REAL_CLASSES,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
  });
  assert.equal((candidate.payload as { firstName: string }).firstName, "Eleanor");
  assert.equal((candidate.payload as { lastName: string }).lastName, "Voss");
  const firstNameField = candidate.fieldStates.find((f) => f.axisCareField === "firstName")!;
  assert.equal(firstNameField.serveFieldPath, null);
});

test("new client candidate: status is always Inactive, never left to an API default", () => {
  const candidate = buildNewClientCandidate({
    residentIdentity: { residentId: "res-123", firstName: "Eleanor", lastName: "Voss" },
    approvedFacts: [],
    availableClasses: REAL_CLASSES,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
  });
  assert.equal((candidate.payload as { status: string }).status, "Inactive");
});

test("new client candidate: WAF Prospect class resolves against the REAL class list, not a hardcoded code", () => {
  const candidate = buildNewClientCandidate({
    residentIdentity: { residentId: "res-123", firstName: "Eleanor", lastName: "Voss" },
    approvedFacts: [],
    availableClasses: REAL_CLASSES,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
  });
  assert.deepEqual((candidate.payload as { classes: unknown }).classes, [{ code: "WAF Prospect", label: "WAF Prospect" }]);
  assert.equal(candidate.readyToPreview, true);
});

test("new client candidate: missing class in the supplied list is BLOCKING, never an invented code", () => {
  const candidate = buildNewClientCandidate({
    residentIdentity: { residentId: "res-123", firstName: "Eleanor", lastName: "Voss" },
    approvedFacts: [],
    availableClasses: [{ code: "PP", label: "Private Pay" }], // no WAF Prospect in this list
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
  });
  assert.equal(candidate.readyToPreview, false);
  assert.ok(candidate.blocking.some((f) => f.axisCareField === "classes"));
  assert.equal((candidate.payload as { classes?: unknown }).classes, undefined);
});

test("new client candidate: empty firstName/lastName is BLOCKING", () => {
  const candidate = buildNewClientCandidate({
    residentIdentity: { residentId: "res-123", firstName: "", lastName: "Voss" },
    approvedFacts: [],
    availableClasses: REAL_CLASSES,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
  });
  assert.equal(candidate.readyToPreview, false);
  assert.ok(candidate.blocking.some((f) => f.axisCareField === "firstName"));
});

test("new client candidate: identity.preferred_name maps to goesBy, NEVER firstName/lastName", () => {
  const candidate = buildNewClientCandidate({
    residentIdentity: { residentId: "res-123", firstName: "Eleanor", lastName: "Voss" },
    approvedFacts: [{ fieldPath: "identity.preferred_name", assertionState: "confirmed_yes", value: "Ellie" }],
    availableClasses: REAL_CLASSES,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
  });
  assert.equal((candidate.payload as { goesBy?: string }).goesBy, "Ellie");
  assert.equal((candidate.payload as { firstName: string }).firstName, "Eleanor");
});

test("new client candidate: SSN is never mapped, always UNSUPPORTED", () => {
  const candidate = buildNewClientCandidate({
    residentIdentity: { residentId: "res-123", firstName: "Eleanor", lastName: "Voss" },
    approvedFacts: [],
    availableClasses: REAL_CLASSES,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
  });
  const ssnField = candidate.fieldStates.find((f) => f.axisCareField === "ssn")!;
  assert.equal(ssnField.state, "UNSUPPORTED");
  assert.ok(!("ssn" in candidate.payload));
});

test("new client candidate: residentialAddress/billingAddress are MANUAL, never a partially-fabricated object", () => {
  const candidate = buildNewClientCandidate({
    residentIdentity: { residentId: "res-123", firstName: "Eleanor", lastName: "Voss" },
    approvedFacts: [{ fieldPath: "residence.address_line1", assertionState: "confirmed_yes", value: "4400 Meadowbrook Lane" }],
    availableClasses: REAL_CLASSES,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
  });
  const addr = candidate.fieldStates.find((f) => f.axisCareField === "residentialAddress")!;
  assert.equal(addr.state, "MANUAL");
  assert.ok(!("residentialAddress" in candidate.payload), "must never send a partial address object — AxisCare requires the full object");
});

test("summarizeCandidate buckets Fixture A's minimal contact info correctly", () => {
  const candidate = buildNewClientCandidate({
    residentIdentity: { residentId: "res-123", firstName: FIXTURE_A_PROFILE.firstName, lastName: FIXTURE_A_PROFILE.lastName },
    approvedFacts: factsFromFixtureA(),
    availableClasses: REAL_CLASSES,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
  });
  const summary = summarizeCandidate(candidate);
  assert.ok(summary.ready.some((f) => f.axisCareField === "dateOfBirth"));
  assert.ok(summary.ready.some((f) => f.axisCareField === "personalEmail"));
  assert.ok(summary.ready.some((f) => f.axisCareField === "homePhone"));
  assert.ok(summary.manual.some((f) => f.axisCareField === "residentialAddress"));
  assert.ok(summary.unsupported.some((f) => f.axisCareField === "mobilePhone"));
});

// ── Duplicate refusal (Phase 4) ──────────────────────────────────────────────────────────

test("resolveCreateEligibility: confirmed existing identity refuses create", () => {
  const link: AxisCareIdentityLinkState = { status: "confirmed", axiscareClientId: "999", matchConfidence: "high" };
  const result = resolveCreateEligibility(link);
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.reason, "confirmed_identity_exists");
});

test("resolveCreateEligibility: ambiguous proposed match refuses create pending human reconciliation", () => {
  const link: AxisCareIdentityLinkState = { status: "proposed", axiscareClientId: null, matchConfidence: "low" };
  const result = resolveCreateEligibility(link);
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.reason, "possible_duplicate_requires_reconciliation");
});

test("resolveCreateEligibility: high-confidence proposed-but-unconfirmed still refuses create (needs a human to confirm, not auto-trusted)", () => {
  const link: AxisCareIdentityLinkState = { status: "proposed", axiscareClientId: null, matchConfidence: "high" };
  const result = resolveCreateEligibility(link);
  assert.equal(result.eligible, false);
});

test("resolveCreateEligibility: no link at all, or a rejected/deferred one, is eligible to create", () => {
  assert.equal(resolveCreateEligibility({ status: null, axiscareClientId: null, matchConfidence: null }).eligible, true);
  assert.equal(resolveCreateEligibility({ status: "rejected", axiscareClientId: null, matchConfidence: null }).eligible, true);
  assert.equal(resolveCreateEligibility({ status: "deferred", axiscareClientId: null, matchConfidence: null }).eligible, true);
});

// ── Update candidate (Phase 5 -> Phase 3 boundary) ───────────────────────────────────────

function changedRow(fieldPath: string, proposedNewValue: unknown, classification: "CHANGED_FACT" | "NEW_FACT" = "CHANGED_FACT"): ReassessmentComparisonRow {
  return {
    fieldPath,
    classification,
    currentApprovedValue: null,
    currentApprovedAssertionState: null,
    newlyExtractedFacts: [],
    proposedNewValue,
    proposedNewAssertionState: "confirmed_yes",
    proposedDownstreamAction: "propose_update",
    rationale: "test",
  };
}

test("update candidate: only includes fields with a real AxisCare mapping", () => {
  const candidate = buildUpdateClientCandidate("axc-42", [
    changedRow("identity.email", "new@example.test"),
    changedRow("daily_life.bathing", true), // no client-record mapping — care-need field
  ]);
  assert.equal((candidate.payload as { personalEmail?: string }).personalEmail, "new@example.test");
  assert.ok(!("bathing" in candidate.payload));
  const unmapped = candidate.fieldStates.find((f) => f.serveFieldPath === "daily_life.bathing")!;
  assert.equal(unmapped.state, "UNSUPPORTED");
  assert.equal(candidate.existingAxisCareClientId, "axc-42");
});

test("update candidate: rejects a non-approved-classification row rather than silently including it", () => {
  const notApproved: ReassessmentComparisonRow = {
    fieldPath: "identity.email",
    classification: "REQUIRES_REVIEW",
    currentApprovedValue: null,
    currentApprovedAssertionState: null,
    newlyExtractedFacts: [],
    proposedNewValue: "sneaky@example.test",
    proposedNewAssertionState: "confirmed_yes",
    proposedDownstreamAction: "none",
    rationale: "test",
  };
  assert.throws(() => buildUpdateClientCandidate("axc-42", [notApproved]), /only human-approved CHANGED_FACT\/NEW_FACT rows/);
});

test("update candidate: NEW_FACT rows are included exactly like CHANGED_FACT rows", () => {
  const candidate = buildUpdateClientCandidate("axc-42", [changedRow("identity.phone", "555-000-1111", "NEW_FACT")]);
  assert.equal((candidate.payload as { homePhone?: string }).homePhone, "555-000-1111");
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
