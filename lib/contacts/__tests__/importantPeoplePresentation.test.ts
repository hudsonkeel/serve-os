import assert from "node:assert/strict";
import { presentPersonRoles, operationalRoleLabel, isRelationshipRoleType, relationshipText } from "../importantPeoplePresentation.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

interface Role {
  roleType: string;
  status: string;
}

function role(roleType: string, status = "claimed"): Role {
  return { roleType, status };
}

// ─── M. Relationship label deduplicated in presentation, provenance untouched ──────────────────

test("M: the SAME relationship word asserted twice (primary-contact + decision-maker both 'Daughter') collapses to ONE display label", () => {
  const roles = [
    role("primary_contact"),
    role("decision_maker"),
    role("relationship:Daughter"),
    role("relationship:Daughter"),
  ];
  const presented = presentPersonRoles(roles);
  assert.deepEqual(presented.relationshipLabels, ["Daughter"]);
});

test("M: deduplication is case-insensitive but preserves first-seen casing", () => {
  const roles = [role("relationship:daughter"), role("relationship:Daughter")];
  const presented = presentPersonRoles(roles);
  assert.deepEqual(presented.relationshipLabels, ["daughter"]);
});

test("M: presentPersonRoles never drops or mutates the original role rows -- every source fact is still there for provenance", () => {
  const roles = [role("primary_contact"), role("relationship:Daughter"), role("relationship:Daughter")];
  presentPersonRoles(roles);
  assert.equal(roles.length, 3, "the original array passed in must be untouched");
});

test("M: genuinely different relationship words are never silently collapsed into one", () => {
  const roles = [role("relationship:Daughter"), role("relationship:Niece")];
  const presented = presentPersonRoles(roles);
  assert.deepEqual(presented.relationshipLabels, ["Daughter", "Niece"]);
});

test("operational roles (primary_contact, decision_maker, emergency_contact) are grouped separately from relationship and authority roles", () => {
  const roles = [role("primary_contact"), role("decision_maker"), role("relationship:Daughter"), role("medical_poa")];
  const presented = presentPersonRoles(roles);
  assert.deepEqual(presented.operationalRoles.map((r) => r.roleType).sort(), ["decision_maker", "primary_contact"]);
  assert.equal(presented.authorityRoles.length, 1);
  assert.equal(presented.authorityRoles[0].roleType, "medical_poa");
});

test("a person with only a relationship and no operational roles still presents cleanly (no crash, empty operational list)", () => {
  const presented = presentPersonRoles([role("relationship:Daughter")]);
  assert.deepEqual(presented.operationalRoles, []);
  assert.deepEqual(presented.relationshipLabels, ["Daughter"]);
});

test("isRelationshipRoleType / relationshipText round-trip", () => {
  assert.equal(isRelationshipRoleType("relationship:Daughter"), true);
  assert.equal(isRelationshipRoleType("primary_contact"), false);
  assert.equal(relationshipText("relationship:Daughter"), "Daughter");
});

test("operationalRoleLabel maps known role types to human labels and falls back to the raw type for unknown ones", () => {
  assert.equal(operationalRoleLabel("primary_contact"), "Primary Contact");
  assert.equal(operationalRoleLabel("decision_maker"), "Decision Maker");
  assert.equal(operationalRoleLabel("medical_poa"), "Medical POA");
  assert.equal(operationalRoleLabel("some_future_role"), "some_future_role");
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
