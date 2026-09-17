// Security hotfix (fix/resident-identity-authorization) — table-driven
// coverage for resolveReconciliationActor(), the pure authorization
// decision behind every mutating export in lib/actions/residentIdentity.ts
// and lib/actions/residentDataIntegrity.ts (mergeResidents,
// completeResidentConsolidation, resolveIdentityCandidateNotDuplicate,
// resolveIdentityCandidateProfileCorrected, resolveIdentityCandidateInvestigate,
// dismissIdentityCandidate, confirmDuplicateImportRecord,
// correctIntegrityIssueMalformedField, returnIntegrityIssueToIdentityReview,
// dismissIntegrityIssueNotAnIssue, markIntegrityIssueInvestigating) — see
// lib/actions/__tests__/residentIdentityAuthorization.test.ts for the
// structural proof that each of those 11 exports actually calls this gate
// before doing any mutating work.
//
// The action functions themselves cannot be unit-tested directly: they
// resolve the caller's profile via getCurrentAuthorizedUser(), which reads
// next/headers cookies and throws outside a real Next.js request context
// (including this codebase's plain-node test harness). Splitting the pure
// decision out of that I/O, as this hotfix does, is what makes the
// authorization logic itself testable at all.
//
//   node --experimental-strip-types --conditions=react-server lib/auth/__tests__/reconciliationActor.test.ts
import assert from "node:assert/strict";
import { AUTH_ROLES } from "../constants.ts";
import { resolveReconciliationActor } from "../reconciliationActor.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const AUTHORIZED_ROLES = ["admin", "manager", "executive"] as const;
const UNAUTHORIZED_ROLES = AUTH_ROLES.filter((r) => !(AUTHORIZED_ROLES as readonly string[]).includes(r));

for (const role of AUTHORIZED_ROLES) {
  test(`${role} is authorized: resolveReconciliationActor returns an actor, not an error`, () => {
    const result = resolveReconciliationActor({ role, full_name: "Test User", email: "test@example.com" });
    assert.ok(!("error" in result), `expected ${role} to be authorized`);
    assert.equal((result as { actor: string }).actor, "Test User");
  });
}

for (const role of UNAUTHORIZED_ROLES) {
  test(`REGRESSION: ${role} is rejected: resolveReconciliationActor returns an error, never an actor`, () => {
    const result = resolveReconciliationActor({ role, full_name: "Test User", email: "test@example.com" });
    assert.ok("error" in result, `expected ${role} to be rejected`);
  });
}

test("REGRESSION: office_staff explicitly cannot resolve a reconciliation actor (the exact production gap this hotfix closes)", () => {
  const result = resolveReconciliationActor({ role: "office_staff", full_name: "Idah", email: "idah@example.com" });
  assert.deepEqual(result, { error: "You are not authorized to make reconciliation decisions." });
});

test("a null profile (not signed in) is rejected", () => {
  const result = resolveReconciliationActor(null);
  assert.ok("error" in result);
});

test("an undefined profile is rejected", () => {
  const result = resolveReconciliationActor(undefined);
  assert.ok("error" in result);
});

test("a profile with a null/unrecognized role is rejected", () => {
  const result = resolveReconciliationActor({ role: null, full_name: "Nobody", email: "nobody@example.com" });
  assert.ok("error" in result);
});

test("an authorized actor falls back to email when full_name is null", () => {
  const result = resolveReconciliationActor({ role: "manager", full_name: null, email: "manager@example.com" });
  assert.deepEqual(result, { actor: "manager@example.com" });
});

test("an authorized actor's full_name is trimmed", () => {
  const result = resolveReconciliationActor({ role: "admin", full_name: "  Admin Person  ", email: "admin@example.com" });
  assert.deepEqual(result, { actor: "Admin Person" });
});

test("every AUTH_ROLE is exercised exactly once above (no role silently skipped as this list evolves)", () => {
  assert.equal(AUTHORIZED_ROLES.length + UNAUTHORIZED_ROLES.length, AUTH_ROLES.length);
  for (const role of AUTHORIZED_ROLES) assert.ok(!UNAUTHORIZED_ROLES.includes(role), `${role} is in both buckets`);
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
