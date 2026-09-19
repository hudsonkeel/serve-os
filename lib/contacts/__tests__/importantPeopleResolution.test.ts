import assert from "node:assert/strict";
import {
  computeMissingRoleInserts,
  isProposalFullyResolved,
  partitionProposalsByResolution,
} from "../importantPeopleResolution.ts";
import type { ImportantPersonRoleProposal, ProposedImportantPerson } from "../importantPeopleProposals.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function role(roleType: string, sourceApprovedFactId: string): ImportantPersonRoleProposal {
  return { roleType, sourceApprovedFactId, sourceFieldPath: `important_people.${roleType}` };
}

function proposal(overrides: Partial<ProposedImportantPerson> & { roles: ImportantPersonRoleProposal[] }): ProposedImportantPerson {
  return {
    proposalKey: "key-1",
    firstName: "Susan",
    lastName: "Carter",
    rawFullName: "Susan Carter",
    nameSourceApprovedFactId: "name-fact",
    nameSourceFieldPath: "important_people.primary_contact_name",
    phone: null,
    normalizedPhone: null,
    phoneSourceApprovedFactId: null,
    phoneSourceFieldPath: null,
    ...overrides,
  };
}

// ─── G/H. Idempotency ───────────────────────────────────────────────────────────────────────────

test("G/H: with no existing roles recorded, every requested role is missing -- a first confirmation would create all of them", () => {
  const requested = [role("primary_contact", "f1"), role("decision_maker", "f2")];
  const missing = computeMissingRoleInserts(requested, new Set());
  assert.equal(missing.length, 2);
});

test("H: a role already recorded (by source_reference) is never re-inserted on a repeated confirmation", () => {
  const requested = [role("primary_contact", "f1"), role("decision_maker", "f2")];
  const missing = computeMissingRoleInserts(requested, new Set(["f1"]));
  assert.deepEqual(
    missing.map((r) => r.roleType),
    ["decision_maker"]
  );
});

test("H: a fully-repeated confirmation (every role already recorded) inserts nothing at all -- true idempotency, not just partial dedup", () => {
  const requested = [role("primary_contact", "f1"), role("decision_maker", "f2")];
  const missing = computeMissingRoleInserts(requested, new Set(["f1", "f2"]));
  assert.equal(missing.length, 0);
});

// ─── L. Resolved proposals never reappear as unresolved ────────────────────────────────────────

test("L: a proposal is fully resolved once every one of its roles has a matching existing source_reference", () => {
  const p = proposal({ roles: [role("primary_contact", "f1"), role("decision_maker", "f2")] });
  assert.equal(isProposalFullyResolved(p, new Set(["f1", "f2"])), true);
  assert.equal(isProposalFullyResolved(p, new Set(["f1"])), false);
  assert.equal(isProposalFullyResolved(p, new Set()), false);
});

test("L: partitionProposalsByResolution moves a fully-confirmed proposal out of 'unresolved' entirely", () => {
  const resolvedProposal = proposal({ proposalKey: "resolved", roles: [role("primary_contact", "f1")] });
  const stillPendingProposal = proposal({ proposalKey: "pending", roles: [role("primary_contact", "f2")] });
  const { unresolved, resolved } = partitionProposalsByResolution([resolvedProposal, stillPendingProposal], new Set(["f1"]));
  assert.deepEqual(
    unresolved.map((p) => p.proposalKey),
    ["pending"]
  );
  assert.deepEqual(
    resolved.map((p) => p.proposalKey),
    ["resolved"]
  );
});

test("L: a partially-confirmed proposal (some roles recorded, not all) still counts as unresolved -- it should keep surfacing until complete", () => {
  const partial = proposal({ roles: [role("primary_contact", "f1"), role("decision_maker", "f2")] });
  const { unresolved, resolved } = partitionProposalsByResolution([partial], new Set(["f1"]));
  assert.equal(unresolved.length, 1);
  assert.equal(resolved.length, 0);
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
