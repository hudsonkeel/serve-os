// Security hotfix (fix/resident-identity-authorization) — structural
// regression proof that every mutating export in lib/actions/residentIdentity.ts
// and lib/actions/residentDataIntegrity.ts actually calls the
// requireReconciliationActor() gate, and calls it BEFORE any record-layer
// mutation, not merely somewhere in the function body.
//
// This is a source-inspection test, not a behavioral one, because the
// action functions themselves cannot be invoked outside a real Next.js
// request: they resolve the caller via getCurrentAuthorizedUser(), which
// reads next/headers cookies and throws in this codebase's plain-node
// test harness. See lib/auth/__tests__/reconciliationActor.test.ts for the
// behavioral, table-driven proof of the underlying authorization decision
// (resolveReconciliationActor) that this gate delegates to — the two
// tests together are the closest thing to an end-to-end proof this
// codebase's test conventions allow for an I/O-heavy "use server" file.
//
// Before this hotfix, every one of the 11 functions below called a
// currentActorLabel() helper that checked ONLY that a session existed,
// never the caller's role — meaning office_staff (and any other
// authenticated role) could reach mergeResidents and every sibling
// mutation. This test fails loudly if a future change removes the gate,
// reorders it after the mutation, or adds a new mutating export without
// wiring it in.
//
//   node --experimental-strip-types --conditions=react-server lib/actions/__tests__/residentIdentityAuthorization.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const residentIdentitySource = readFileSync(path.join(__dirname, "../residentIdentity.ts"), "utf8");
const residentDataIntegritySource = readFileSync(path.join(__dirname, "../residentDataIntegrity.ts"), "utf8");

// Extracts one exported async function's body, from its `export async
// function {name}` declaration up to the next top-level `export async
// function` (or end of file). Good enough for this file's flat,
// non-nested export shape — every function here is a single top-level
// "use server" action, never a nested/local export async function.
function extractFunctionBody(source: string, name: string): string {
  const startMarker = `export async function ${name}(`;
  const startIndex = source.indexOf(startMarker);
  assert.ok(startIndex !== -1, `could not find "export async function ${name}(" in source`);
  const nextExportIndex = source.indexOf("\nexport async function ", startIndex + startMarker.length);
  return nextExportIndex === -1 ? source.slice(startIndex) : source.slice(startIndex, nextExportIndex);
}

// Asserts requireReconciliationActor() is called, its error is checked,
// and both happen strictly before the first call to `mutatingCallToken`
// (a record-layer function call like "mergeResidentsRecord(") — proving
// the gate actually guards the mutation, not just that both appear
// somewhere in the same function.
function assertGatedBeforeMutation(source: string, functionName: string, mutatingCallToken: string) {
  const body = extractFunctionBody(source, functionName);

  const gateCallIndex = body.indexOf("requireReconciliationActor()");
  assert.ok(gateCallIndex !== -1, `${functionName} does not call requireReconciliationActor()`);

  const errorCheckIndex = body.indexOf('"error" in actorResult');
  assert.ok(errorCheckIndex !== -1, `${functionName} does not check "error" in actorResult after calling the gate`);
  assert.ok(errorCheckIndex > gateCallIndex, `${functionName} checks the error before calling the gate`);

  const mutationIndex = body.indexOf(mutatingCallToken);
  assert.ok(mutationIndex !== -1, `${functionName} does not appear to call ${mutatingCallToken} at all — mutatingCallToken may be stale`);
  assert.ok(gateCallIndex < mutationIndex, `${functionName} calls ${mutatingCallToken} before requireReconciliationActor()`);
  assert.ok(errorCheckIndex < mutationIndex, `${functionName} calls ${mutatingCallToken} before checking the gate's error`);
}

// ─── lib/actions/residentIdentity.ts ──────────────────────────────────────
test("merge residents (mergeResidents) is gated before mergeResidentsRecord()", () => {
  assertGatedBeforeMutation(residentIdentitySource, "mergeResidents", "mergeResidentsRecord(");
});

test("complete consolidation (completeResidentConsolidation) is gated before completeResidentConsolidationRecord()", () => {
  assertGatedBeforeMutation(residentIdentitySource, "completeResidentConsolidation", "completeResidentConsolidationRecord(");
});

test("resolve identity candidate as not duplicate (resolveIdentityCandidateNotDuplicate) is gated before resolveCandidateNotDuplicateRecord()", () => {
  assertGatedBeforeMutation(residentIdentitySource, "resolveIdentityCandidateNotDuplicate", "resolveCandidateNotDuplicateRecord(");
});

test("resolve identity candidate as profile-corrected (resolveIdentityCandidateProfileCorrected) is gated before resolveCandidateProfileCorrectedRecord()", () => {
  assertGatedBeforeMutation(residentIdentitySource, "resolveIdentityCandidateProfileCorrected", "resolveCandidateProfileCorrectedRecord(");
});

test("resolve identity candidate as investigate (resolveIdentityCandidateInvestigate) is gated before resolveCandidateInvestigateRecord()", () => {
  assertGatedBeforeMutation(residentIdentitySource, "resolveIdentityCandidateInvestigate", "resolveCandidateInvestigateRecord(");
});

test("dismiss identity candidate (dismissIdentityCandidate) is gated before dismissIdentityCandidateRecord()", () => {
  assertGatedBeforeMutation(residentIdentitySource, "dismissIdentityCandidate", "dismissIdentityCandidateRecord(");
});

// ─── lib/actions/residentDataIntegrity.ts ─────────────────────────────────
test("duplicate-import confirmation (confirmDuplicateImportRecord) is gated before mergeResidentsRecord()", () => {
  assertGatedBeforeMutation(residentDataIntegritySource, "confirmDuplicateImportRecord", "mergeResidentsRecord(");
});

test("malformed-field correction (correctIntegrityIssueMalformedField) is gated before correctMalformedFieldRecord()", () => {
  assertGatedBeforeMutation(residentDataIntegritySource, "correctIntegrityIssueMalformedField", "correctMalformedFieldRecord(");
});

test("return-to-identity-review (returnIntegrityIssueToIdentityReview) is gated before returnIssueToIdentityReviewRecord()", () => {
  assertGatedBeforeMutation(residentDataIntegritySource, "returnIntegrityIssueToIdentityReview", "returnIssueToIdentityReviewRecord(");
});

test("dismiss integrity issue (dismissIntegrityIssueNotAnIssue) is gated before dismissIssueNotAnIssueRecord()", () => {
  assertGatedBeforeMutation(residentDataIntegritySource, "dismissIntegrityIssueNotAnIssue", "dismissIssueNotAnIssueRecord(");
});

test("investigate integrity issue (markIntegrityIssueInvestigating) is gated before markIssueInvestigatingRecord()", () => {
  assertGatedBeforeMutation(residentDataIntegritySource, "markIntegrityIssueInvestigating", "markIssueInvestigatingRecord(");
});

// ─── Regression: the old, role-blind helper must never come back ─────────
test("REGRESSION: neither file references the old sign-in-only currentActorLabel() helper", () => {
  assert.ok(!residentIdentitySource.includes("currentActorLabel"), "residentIdentity.ts still references currentActorLabel");
  assert.ok(!residentDataIntegritySource.includes("currentActorLabel"), "residentDataIntegrity.ts still references currentActorLabel");
});

test("REGRESSION: both files import the shared, role-aware gate (not a locally re-derived predicate)", () => {
  assert.ok(residentIdentitySource.includes('from "@/lib/auth/reconciliationActor"'));
  assert.ok(residentDataIntegritySource.includes('from "@/lib/auth/reconciliationActor"'));
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
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();
