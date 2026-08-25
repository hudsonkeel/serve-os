import assert from "node:assert/strict";
import { buildNewClientWritePreview, buildUpdateClientWritePreview } from "../fullWritePreview.ts";
import { compareReassessment, type ExistingApprovedFactForComparison, type NewDraftFactForComparison } from "../../../assessmentIntelligence/reassessmentComparison.ts";
import { FIXTURE_A_PROFILE, FIXTURE_A_ASSESSMENT_DATE, FIXTURE_B_EXISTING_APPROVED_FACTS } from "../../../assessmentIntelligence/__fixtures__/syntheticAssessments.ts";
import type { AxisCareClientClass } from "../types.ts";
import type { ConfiguredAdl } from "../adlMapping.ts";
import type { AxisCareIdentityLinkState } from "../../../assessmentIntelligence/axiscareReadiness.ts";

// Phase 13 — synthetic end-to-end DRY-RUN harness, Case A (new prospect) and Case B (existing
// client reassessment), exercising the full mapping pipeline this branch built: reassessment
// comparison -> client candidate mapping -> responsible-party mapping -> ADL mapping -> a single
// composed write-safety preview. No AxisCare HTTP write exists anywhere in this codebase, so
// there is nothing to dry-run a POST/PATCH against directly — this proves everything up to that
// boundary, which is exactly what was authorized for this build phase. Uses REAL class/ADL
// reference data captured live against the actual configured AxisCare site during this work.

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const REAL_CLASSES: AxisCareClientClass[] = [
  { code: "WAF Prospect", label: "WAF Prospect" },
  { code: "WAF - Active No Visits", label: "WAF Signed Agreement / No Visits" },
  { code: "CINCH", label: "CINCH" },
];

const REAL_ADLS: ConfiguredAdl[] = [
  { id: 1, name: "Shower Assist", adlKey: "bathing", active: true },
  { id: 4, name: "Dressing", adlKey: "dressing", active: true },
  { id: 6, name: "Medication Reminders", adlKey: "medication", active: true },
  { id: 10, name: "Light Housekeeping", adlKey: "lthouse", active: true },
  { id: 11, name: "Grooming", adlKey: "grooming", active: true },
  { id: 13, name: "Laundry", adlKey: "laundry", active: true },
  { id: 14, name: "Meal Preparation", adlKey: "mealprep", active: true },
  { id: 18, name: "Toileting Assistance", adlKey: "toilet_assistance", active: true },
];

const NO_IDENTITY_LINK: AxisCareIdentityLinkState = { status: null, axiscareClientId: null, matchConfidence: null };

// ── Case A: new prospect ────────────────────────────────────────────────────────────────

test("CASE A (new prospect): plausible approved facts from Fixture A produce a ready-to-preview create candidate", () => {
  const approvedFacts = [
    { fieldPath: "important_people.primary_contact_name", assertionState: "confirmed_yes" as const, value: "Karen Voss" },
    { fieldPath: "important_people.primary_contact_relationship", assertionState: "confirmed_yes" as const, value: "daughter" },
    { fieldPath: "important_people.primary_contact_phone", assertionState: "confirmed_yes" as const, value: FIXTURE_A_PROFILE.phone },
    { fieldPath: "identity.date_of_birth", assertionState: "confirmed_yes" as const, value: FIXTURE_A_PROFILE.dateOfBirth },
    { fieldPath: "identity.email", assertionState: "confirmed_yes" as const, value: FIXTURE_A_PROFILE.email },
    { fieldPath: "daily_life.bathing", assertionState: "confirmed_yes" as const, value: true },
    { fieldPath: "daily_life.medication_reminders", assertionState: "confirmed_yes" as const, value: true },
    { fieldPath: "mobility_safety.recent_falls", assertionState: "confirmed_yes" as const, value: true },
  ];

  const preview = buildNewClientWritePreview({
    residentIdentity: { residentId: "res-eleanor-voss", firstName: FIXTURE_A_PROFILE.firstName, lastName: FIXTURE_A_PROFILE.lastName },
    approvedFacts,
    availableClasses: REAL_CLASSES,
    configuredAdls: REAL_ADLS,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
    identityLink: NO_IDENTITY_LINK,
  });

  assert.equal(preview.eligibility.eligible, true);
  assert.ok(preview.client, "client candidate must be built when eligible");
  assert.equal(preview.client!.readyToPreview, true);
  assert.equal((preview.client!.payload as { status: string }).status, "Inactive");
  assert.deepEqual((preview.client!.payload as { classes: unknown }).classes, [{ code: "WAF Prospect", label: "WAF Prospect" }]);

  // Responsible party: name/relationship/phone READY, authority fields correctly left unset.
  assert.equal(preview.responsibleParty.payload.name, "Karen Voss");
  assert.equal(preview.responsibleParty.payload.hipaaDisclosureAuthorization, undefined);

  // ADLs: bathing and medication_reminders resolve to real configured ADLs; recent_falls is out
  // of ADL-mapping scope (a diagnostic signal, not a task).
  const bathingAdl = preview.adls.find((a) => a.fieldPath === "daily_life.bathing");
  assert.equal(bathingAdl?.state, "READY");
  assert.equal(bathingAdl?.candidatePayload?.id, 1);
  const fallsRow = preview.adls.find((a) => a.fieldPath === "mobility_safety.recent_falls");
  assert.equal(fallsRow?.state, "NOT_APPLICABLE");
});

test("CASE A: a confirmed existing AxisCare identity refuses the create candidate entirely (no candidate object at all)", () => {
  const preview = buildNewClientWritePreview({
    residentIdentity: { residentId: "res-x", firstName: "Eleanor", lastName: "Voss" },
    approvedFacts: [],
    availableClasses: REAL_CLASSES,
    configuredAdls: REAL_ADLS,
    assessmentDate: FIXTURE_A_ASSESSMENT_DATE,
    identityLink: { status: "confirmed", axiscareClientId: "789", matchConfidence: "high" },
  });
  assert.equal(preview.eligibility.eligible, false);
  assert.equal(preview.client, null, "must never build a create candidate when a confirmed identity already exists");
});

// ── Case B: existing client reassessment ────────────────────────────────────────────────

test("CASE B (existing client reassessment): only human-approved changed fields reach the PATCH candidate; ADLs pick up the same changes independently", () => {
  const existing: ExistingApprovedFactForComparison[] = FIXTURE_B_EXISTING_APPROVED_FACTS.map((f) => ({
    fieldPath: f.fieldPath,
    assertionState: f.assertionState,
    value: f.value,
  }));

  const newDraftFacts: NewDraftFactForComparison[] = [
    { fieldPath: "daily_life.medication_reminders", assertionState: "confirmed_yes", value: true, reporter: "daughter", evidence: "missed doses twice" },
    { fieldPath: "daily_life.toileting", assertionState: "confirmed_yes", value: true, reporter: "daughter", evidence: "needs help now" },
    { fieldPath: "mobility_safety.walker", assertionState: "confirmed_yes", value: true, reporter: "son", evidence: "still uses it" },
    { fieldPath: "mobility_safety.recent_falls", assertionState: "confirmed_yes", value: true, reporter: "daughter", evidence: "almost fell" },
    { fieldPath: "mobility_safety.recent_falls", assertionState: "confirmed_no", value: false, reporter: "son", evidence: "hasn't fallen" },
  ];

  const changeRows = compareReassessment(existing, newDraftFacts);

  // Human reviewer approves ONLY the two clean, non-identity-sensitive changes — the conflicting
  // recent_falls row is deliberately left unapproved (it's CONFLICTING_FACT, not even eligible).
  const approvedFieldPaths = new Set(["daily_life.medication_reminders", "daily_life.toileting"]);

  // Facts for responsible-party/ADL mapping: same confirmed_yes set as the approved changes,
  // representing what the resident's full approved-facts table would contain after this
  // reassessment's approved changes are merged in.
  const factsForAdls = [
    { fieldPath: "daily_life.medication_reminders", assertionState: "confirmed_yes" as const, value: true },
    { fieldPath: "daily_life.toileting", assertionState: "confirmed_yes" as const, value: true },
  ];

  const preview = buildUpdateClientWritePreview({
    existingAxisCareClientId: "axc-walter-higby-42",
    allChangeRows: changeRows,
    approvedFieldPaths,
    approvedFactsForResponsiblePartyAndAdls: factsForAdls,
    configuredAdls: REAL_ADLS,
  });

  assert.equal(preview.approvedChangeRows.length, 2);
  assert.ok(!preview.approvedChangeRows.some((r) => r.fieldPath === "mobility_safety.recent_falls"), "conflicting field must never reach the approved set, even though it was 'changed' in the raw comparison");

  // Neither approved field has a direct AxisCare CLIENT-record mapping (they're care-task
  // fields, not identity/contact fields) — correctly UNSUPPORTED at the client-PATCH layer...
  assert.ok(!("medication_reminders" in preview.client.payload));
  assert.equal(preview.client.fieldStates.filter((f) => f.state === "UNSUPPORTED").length, 2);
  assert.equal(preview.client.existingAxisCareClientId, "axc-walter-higby-42");

  // ...but DO resolve at the ADL layer, independently and correctly.
  const medAdl = preview.adls.find((a) => a.fieldPath === "daily_life.medication_reminders");
  assert.equal(medAdl?.state, "READY");
  assert.equal(medAdl?.candidatePayload?.id, 6);
  const toiletingAdl = preview.adls.find((a) => a.fieldPath === "daily_life.toileting");
  assert.equal(toiletingAdl?.state, "READY");
  assert.equal(toiletingAdl?.candidatePayload?.id, 18);
});

test("CASE B: NOT_DISCUSSED and UNCHANGED rows are visible in changeRows for display, but never in approvedChangeRows or the PATCH payload", () => {
  const existing: ExistingApprovedFactForComparison[] = FIXTURE_B_EXISTING_APPROVED_FACTS.map((f) => ({
    fieldPath: f.fieldPath,
    assertionState: f.assertionState,
    value: f.value,
  }));
  const changeRows = compareReassessment(existing, []); // nothing discussed at all this time
  const preview = buildUpdateClientWritePreview({
    existingAxisCareClientId: "axc-1",
    allChangeRows: changeRows,
    approvedFieldPaths: new Set(), // nothing approved
    approvedFactsForResponsiblePartyAndAdls: [],
    configuredAdls: REAL_ADLS,
  });
  assert.ok(changeRows.every((r) => r.classification === "NOT_DISCUSSED"));
  assert.equal(preview.approvedChangeRows.length, 0);
  assert.deepEqual(preview.client.payload, {});
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
