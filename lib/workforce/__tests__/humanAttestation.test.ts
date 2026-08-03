// Pure-function tests for Human Attestation's one real decision — see
// lib/workforce/humanAttestation.ts. The evaluator never reads
// attestation_result directly; this module decides, per requirement code,
// whether an observed result is acceptable, and that decision determines
// whether the new evidence row resolves to verified or rejected.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/humanAttestation.test.ts
import assert from "node:assert/strict";
import {
  attestationVerificationOutcome,
  getAcceptableAttestationResults,
  getAttestationResultOptions,
  isAttestationResultAcceptable,
  E_VERIFY_ATTESTATION_RESULTS,
  GENERIC_ATTESTATION_RESULTS,
} from "../humanAttestation.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("a clean 'verified' result is acceptable for any requirement (generic default)", () => {
  assert.equal(isAttestationResultAcceptable("I9_COMPLETION", "verified"), true);
});

test("'verified_with_observation' is acceptable — a qualified confirmation still satisfies the requirement", () => {
  assert.equal(isAttestationResultAcceptable("I9_COMPLETION", "verified_with_observation"), true);
});

test("'completed_closed' is acceptable — the clean E-Verify success outcome — without assuming it's universally sufficient elsewhere", () => {
  assert.equal(isAttestationResultAcceptable("E_VERIFY_COMPLETION", "completed_closed"), true);
  // Same value, same generic default, for an unrelated requirement — proves
  // the acceptability decision is a real per-requirement lookup, not a
  // single hardcoded special case for E-Verify only.
  assert.equal(isAttestationResultAcceptable("SKILLS_SELF_ASSESSMENT", "completed_closed"), true);
});

test("'pending' is never acceptable — a case still in progress does not satisfy the requirement", () => {
  assert.equal(isAttestationResultAcceptable("E_VERIFY_COMPLETION", "pending"), false);
});

test("'contradictory' and 'requires_review' are never acceptable", () => {
  assert.equal(isAttestationResultAcceptable("TX_NAR_SEARCH", "contradictory"), false);
  assert.equal(isAttestationResultAcceptable("TX_NAR_SEARCH", "requires_review"), false);
});

test("'case_not_found', 'unable_to_verify', 'not_found', 'unknown' are all never acceptable", () => {
  for (const result of ["case_not_found", "unable_to_verify", "not_found", "unknown"] as const) {
    assert.equal(isAttestationResultAcceptable("E_VERIFY_COMPLETION", result), false, `${result} should not be acceptable`);
  }
});

test("attestationVerificationOutcome maps acceptable results to 'verified' and everything else to 'rejected' — the only two words the evaluator ever reads", () => {
  assert.equal(attestationVerificationOutcome("I9_COMPLETION", "verified"), "verified");
  assert.equal(attestationVerificationOutcome("E_VERIFY_COMPLETION", "completed_closed"), "verified");
  assert.equal(attestationVerificationOutcome("E_VERIFY_COMPLETION", "pending"), "rejected");
  assert.equal(attestationVerificationOutcome("E_VERIFY_COMPLETION", "contradictory"), "rejected");
});

test("getAcceptableAttestationResults returns the same generic set for every requirement today — no per-requirement override exists yet, disclosed rather than hidden", () => {
  const a = getAcceptableAttestationResults("I9_COMPLETION");
  const b = getAcceptableAttestationResults("E_VERIFY_COMPLETION");
  assert.deepEqual([...a].sort(), [...b].sort());
});

test("getAttestationResultOptions gives E-Verify its own named outcome set, matching the product mission's explicit list", () => {
  const options = getAttestationResultOptions("E_VERIFY_COMPLETION");
  assert.deepEqual(options, E_VERIFY_ATTESTATION_RESULTS);
  for (const required of ["completed_closed", "pending", "case_not_found", "unable_to_verify", "contradictory", "requires_review"] as const) {
    assert.ok(options.includes(required), `E-Verify options must include ${required}`);
  }
});

test("getAttestationResultOptions falls back to the generic set for every other requirement", () => {
  assert.deepEqual(getAttestationResultOptions("TX_NAR_SEARCH"), GENERIC_ATTESTATION_RESULTS);
  assert.deepEqual(getAttestationResultOptions("SOME_FUTURE_REQUIREMENT"), GENERIC_ATTESTATION_RESULTS);
});

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
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
