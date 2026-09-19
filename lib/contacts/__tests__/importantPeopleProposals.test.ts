import assert from "node:assert/strict";
import { buildImportantPeopleProposals, splitFullName, type ApprovedFactForProposal } from "../importantPeopleProposals.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function fact(overrides: Partial<ApprovedFactForProposal> & { id: string; fieldPath: string }): ApprovedFactForProposal {
  return { value: "x", assertionState: "confirmed_yes", ...overrides };
}

// ─── A. Same compatible identity across roles -> ONE proposed person, multiple roles ───────────

test("A: Primary Contact Susan + Decision Maker Susan with the same phone -> ONE proposed person with both roles, never two", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.primary_contact_name", value: "Susan Carter" }),
    fact({ id: "f2", fieldPath: "important_people.primary_contact_relationship", value: "Daughter" }),
    fact({ id: "f3", fieldPath: "important_people.primary_contact_phone", value: "214-555-0187" }),
    fact({ id: "f4", fieldPath: "important_people.decision_maker", value: "Susan Carter" }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.equal(result.people.length, 1);
  const susan = result.people[0];
  assert.equal(susan.firstName, "Susan");
  assert.equal(susan.lastName, "Carter");
  assert.equal(susan.phone, "214-555-0187");
  const roleTypes = susan.roles.map((r) => r.roleType).sort();
  assert.deepEqual(roleTypes, ["decision_maker", "primary_contact", "relationship:Daughter"].sort());
});

test("A: same name, no phone stated on either slot -> still grouped as one person (name-only agreement is sufficient WITHIN one assessment)", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.primary_contact_name", value: "Susan Carter" }),
    fact({ id: "f2", fieldPath: "important_people.decision_maker", value: "Susan Carter" }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.equal(result.people.length, 1);
  assert.deepEqual(
    result.people[0].roles.map((r) => r.roleType).sort(),
    ["decision_maker", "primary_contact"]
  );
});

// ─── B. Same name but conflicting strong identifiers -> NOT grouped ────────────────────────────

test("B: same name but explicitly different phone numbers on each slot -> two separate proposed people, never merged", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.primary_contact_name", value: "Susan Carter" }),
    fact({ id: "f2", fieldPath: "important_people.primary_contact_phone", value: "214-555-0187" }),
    fact({ id: "f3", fieldPath: "important_people.decision_maker", value: "Susan Carter" }),
    fact({ id: "f4", fieldPath: "important_people.decision_maker_phone", value: "214-555-9999" }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.equal(result.people.length, 2);
  const roleSets = result.people.map((p) => p.roles.map((r) => r.roleType));
  assert.ok(roleSets.some((roles) => roles.includes("primary_contact")));
  assert.ok(roleSets.some((roles) => roles.includes("decision_maker")));
  assert.ok(!roleSets.some((roles) => roles.includes("primary_contact") && roles.includes("decision_maker")));
});

// ─── I. Ordinary roles are claimed with real assessment provenance ─────────────────────────────

test("I: every role in a proposal carries its own real sourceApprovedFactId and sourceFieldPath -- never fabricated", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "name-fact", fieldPath: "important_people.primary_contact_name", value: "Susan Carter" }),
    fact({ id: "rel-fact", fieldPath: "important_people.primary_contact_relationship", value: "Daughter" }),
  ];
  const result = buildImportantPeopleProposals(facts);
  const susan = result.people[0];
  const primaryContactRole = susan.roles.find((r) => r.roleType === "primary_contact");
  const relationshipRole = susan.roles.find((r) => r.roleType === "relationship:Daughter");
  assert.equal(primaryContactRole?.sourceApprovedFactId, "name-fact");
  assert.equal(primaryContactRole?.sourceFieldPath, "important_people.primary_contact_name");
  assert.equal(relationshipRole?.sourceApprovedFactId, "rel-fact");
});

test("uncertain/conflicting assertion states never contribute a slot at all -- unknown stays unknown", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.primary_contact_name", value: "Susan Carter", assertionState: "uncertain" }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.equal(result.people.length, 0);
});

// ─── POA attachment ─────────────────────────────────────────────────────────────────────────────

test("a confirmed medical_poa attaches to whichever proposal has a decision_maker role", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.decision_maker", value: "Susan Carter" }),
    fact({ id: "f2", fieldPath: "advance_planning.medical_poa", value: true }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.equal(result.people.length, 1);
  assert.ok(result.people[0].roles.some((r) => r.roleType === "medical_poa" && r.sourceApprovedFactId === "f2"));
  assert.equal(result.unattachedPoaClaims.length, 0);
});

test("a confirmed financial_poa with NO decision-maker captured is surfaced as an unattached claim, never guessed onto the wrong person", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.primary_contact_name", value: "Susan Carter" }),
    fact({ id: "f2", fieldPath: "advance_planning.financial_poa", value: true }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.equal(result.unattachedPoaClaims.length, 1);
  assert.equal(result.unattachedPoaClaims[0].roleType, "financial_poa");
  assert.ok(!result.people[0].roles.some((r) => r.roleType === "financial_poa"));
});

test("medical_poa confirmed_no never attaches a claim -- only an explicit confirmed_yes does", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.decision_maker", value: "Susan Carter" }),
    fact({ id: "f2", fieldPath: "advance_planning.medical_poa", value: false, assertionState: "confirmed_no" }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.ok(!result.people[0].roles.some((r) => r.roleType === "medical_poa"));
  assert.equal(result.unattachedPoaClaims.length, 0);
});

// ─── Physician exclusion (Slice C.3 product decision) ───────────────────────────────────────────

test("physician fields never produce a proposal -- physician is deliberately excluded from Important People v0.1", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.physician_name", value: "Dr. Lee" }),
    fact({ id: "f2", fieldPath: "important_people.physician_phone", value: "214-555-0000" }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.equal(result.people.length, 0);
});

// ─── Emergency contact ──────────────────────────────────────────────────────────────────────────

test("an emergency contact with a distinct name produces its own proposed person with only the emergency_contact role", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.emergency_contact", value: "Robert Carter" }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.equal(result.people.length, 1);
  assert.deepEqual(
    result.people[0].roles.map((r) => r.roleType),
    ["emergency_contact"]
  );
});

test("an emergency contact with the SAME name as the primary contact groups into one person (no phone on either side, still name-only-compatible within one assessment)", () => {
  const facts: ApprovedFactForProposal[] = [
    fact({ id: "f1", fieldPath: "important_people.primary_contact_name", value: "Susan Carter" }),
    fact({ id: "f2", fieldPath: "important_people.emergency_contact", value: "Susan Carter" }),
  ];
  const result = buildImportantPeopleProposals(facts);
  assert.equal(result.people.length, 1);
  assert.deepEqual(
    result.people[0].roles.map((r) => r.roleType).sort(),
    ["emergency_contact", "primary_contact"]
  );
});

// ─── splitFullName ──────────────────────────────────────────────────────────────────────────────

test("splitFullName: two tokens split into first/last", () => {
  assert.deepEqual(splitFullName("Susan Carter"), { firstName: "Susan", lastName: "Carter" });
});

test("splitFullName: a single token has no last name", () => {
  assert.deepEqual(splitFullName("Cher"), { firstName: "Cher", lastName: null });
});

test("splitFullName: multiple tokens -- everything but the last token is the first name", () => {
  assert.deepEqual(splitFullName("Mary Jane Watson"), { firstName: "Mary Jane", lastName: "Watson" });
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
