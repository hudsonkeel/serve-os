import assert from "node:assert/strict";
import {
  isRoleAuthorityVerified,
  isValidContactRoleAssignment,
  CONTACT_ROLE_TYPES,
  type ContactRoleAssignment,
} from "../roleTypes.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function assignment(overrides: Partial<ContactRoleAssignment> = {}): ContactRoleAssignment {
  return {
    contactId: "contact-1",
    residentId: "resident-1",
    roleType: "primary_contact",
    status: "claimed",
    effectiveStart: "2026-09-19",
    effectiveEnd: null,
    ...overrides,
  };
}

test("a 'claimed' role does NOT count as verified authority -- role existence is never equivalent to proof", () => {
  assert.equal(isRoleAuthorityVerified("claimed"), false);
});

test("only 'verified' counts as verified authority", () => {
  assert.equal(isRoleAuthorityVerified("verified"), true);
  assert.equal(isRoleAuthorityVerified("revoked"), false);
});

test("a role reported by an assessment (status 'claimed') can later become 'verified' once real documentation exists -- both are structurally valid states, verification is a separate transition, not automatic", () => {
  const claimed = assignment({ status: "claimed" });
  const verified = assignment({ status: "verified" });
  assert.equal(isValidContactRoleAssignment(claimed), true);
  assert.equal(isValidContactRoleAssignment(verified), true);
  assert.equal(isRoleAuthorityVerified(claimed.status), false);
  assert.equal(isRoleAuthorityVerified(verified.status), true);
});

test("ONE CONTACT can hold MULTIPLE roles for the same resident -- nothing in the assignment validator restricts this", () => {
  const primaryContact = assignment({ contactId: "susan", residentId: "margaret", roleType: "primary_contact" });
  const decisionMaker = assignment({ contactId: "susan", residentId: "margaret", roleType: "decision_maker" });
  assert.equal(isValidContactRoleAssignment(primaryContact), true);
  assert.equal(isValidContactRoleAssignment(decisionMaker), true);
});

test("MULTIPLE CONTACTS may legitimately hold the SAME role for the same resident (e.g. co-POAs, more than one emergency contact) -- nothing restricts this either", () => {
  const poaOne = assignment({ contactId: "susan", residentId: "margaret", roleType: "medical_poa" });
  const poaTwo = assignment({ contactId: "robert", residentId: "margaret", roleType: "medical_poa" });
  assert.equal(isValidContactRoleAssignment(poaOne), true);
  assert.equal(isValidContactRoleAssignment(poaTwo), true);
});

test("role_type is open-ended -- a value not in the currently-known CONTACT_ROLE_TYPES list is still a structurally valid assignment (extensible without a schema migration)", () => {
  const futureRole = assignment({ roleType: "future_pandadoc_witness" });
  assert.ok(!(CONTACT_ROLE_TYPES as readonly string[]).includes("future_pandadoc_witness"));
  assert.equal(isValidContactRoleAssignment(futureRole), true);
});

test("a blank role_type is invalid", () => {
  assert.equal(isValidContactRoleAssignment(assignment({ roleType: "   " })), false);
});

test("effective_end before effective_start is invalid", () => {
  assert.equal(
    isValidContactRoleAssignment(assignment({ effectiveStart: "2026-09-19", effectiveEnd: "2026-01-01" })),
    false
  );
});

test("effective_end on or after effective_start (or null, still active) is valid", () => {
  assert.equal(isValidContactRoleAssignment(assignment({ effectiveEnd: null })), true);
  assert.equal(
    isValidContactRoleAssignment(assignment({ effectiveStart: "2026-01-01", effectiveEnd: "2026-09-19" })),
    true
  );
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
