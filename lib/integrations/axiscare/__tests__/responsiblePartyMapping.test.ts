import assert from "node:assert/strict";
import { buildResponsiblePartyCandidate, type ApprovedFactForResponsibleParty } from "../responsiblePartyMapping.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("maps name/relationship/phone from confirmed facts, targets slot 1 (Primary)", () => {
  const facts: ApprovedFactForResponsibleParty[] = [
    { fieldPath: "important_people.primary_contact_name", assertionState: "confirmed_yes", value: "Karen Voss" },
    { fieldPath: "important_people.primary_contact_relationship", assertionState: "confirmed_yes", value: "daughter" },
    { fieldPath: "important_people.primary_contact_phone", assertionState: "confirmed_yes", value: "555-330-1189" },
  ];
  const candidate = buildResponsiblePartyCandidate(facts);
  assert.equal(candidate.listNumber, 1);
  assert.equal(candidate.payload.name, "Karen Voss");
  assert.equal(candidate.payload.relationship, "daughter");
  assert.deepEqual(candidate.payload.phones, [{ listNumber: 1, type: null, number: "555-330-1189" }]);
});

test("CRITICAL: hipaaDisclosureAuthorization is never populated without an explicit confirmed fact — decision_maker alone proves nothing", () => {
  const facts: ApprovedFactForResponsibleParty[] = [
    { fieldPath: "important_people.decision_maker", assertionState: "confirmed_yes", value: "Karen Voss" },
    // No important_people.hipaa_disclosure_authorization fact at all.
  ];
  const candidate = buildResponsiblePartyCandidate(facts);
  assert.equal(candidate.payload.hipaaDisclosureAuthorization, undefined);
  const field = candidate.fieldStates.find((f) => f.axisCareField === "hipaaDisclosureAuthorization")!;
  assert.equal(field.state, "MISSING_OPTIONAL");
});

test("CRITICAL: canMakeMedicalDecisions is never populated without an explicit confirmed fact", () => {
  const facts: ApprovedFactForResponsibleParty[] = [
    { fieldPath: "important_people.decision_maker", assertionState: "confirmed_yes", value: "Karen Voss" },
  ];
  const candidate = buildResponsiblePartyCandidate(facts);
  assert.equal(candidate.payload.canMakeMedicalDecisions, undefined);
});

test("authority fields ARE populated when explicitly, separately confirmed", () => {
  const facts: ApprovedFactForResponsibleParty[] = [
    { fieldPath: "important_people.hipaa_disclosure_authorization", assertionState: "confirmed_yes", value: true },
    { fieldPath: "important_people.medical_decision_authority", assertionState: "confirmed_no", value: false },
  ];
  const candidate = buildResponsiblePartyCandidate(facts);
  assert.equal(candidate.payload.hipaaDisclosureAuthorization, true);
  assert.equal(candidate.payload.canMakeMedicalDecisions, false);
});

test("email/address/dateOfBirth are UNSUPPORTED — real domain-model gaps, not silently omitted without a reason", () => {
  const candidate = buildResponsiblePartyCandidate([]);
  for (const field of ["email", "address", "dateOfBirth"]) {
    const row = candidate.fieldStates.find((f) => f.axisCareField === field)!;
    assert.equal(row.state, "UNSUPPORTED");
  }
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
