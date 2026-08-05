// Pure-function tests for ../confidenceBands.ts. Run with:
//   npm run test:residentIdentity
import assert from "node:assert/strict";
import { assignConfidenceBand } from "../confidenceBands.ts";
import type { HouseholdEvidenceSignal, IdentityEvidenceSignal } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function identity(strength: IdentityEvidenceSignal["strength"], signalType: IdentityEvidenceSignal["signalType"] = "exact_full_name"): IdentityEvidenceSignal {
  return { signalType, residentIdA: "a", residentIdB: "b", description: "test", strength };
}

function household(signalType: HouseholdEvidenceSignal["signalType"] = "same_apartment"): HouseholdEvidenceSignal {
  return { signalType, residentIdA: "a", residentIdB: "b", description: "test" };
}

test("1. zero identity evidence -> null, no matter how much household evidence exists (the core Phase 2 rule)", () => {
  assert.equal(assignConfidenceBand([], [household(), household("same_phone")]), null);
});

test("2. two or more strong identity signals with no conflict -> high", () => {
  assert.equal(assignConfidenceBand([identity("strong"), identity("strong", "same_dob")]), "high");
});

test("3. exactly one strong identity signal, no household corroboration -> probable", () => {
  assert.equal(assignConfidenceBand([identity("strong")]), "probable");
});

test("4. exactly one strong identity signal PLUS household corroboration -> high (household can upgrade, never manufacture)", () => {
  assert.equal(assignConfidenceBand([identity("strong")], [household()]), "high");
});

test("5. only contextual identity evidence, no household -> needs investigation", () => {
  assert.equal(assignConfidenceBand([identity("contextual", "absent_while_similar_present")]), "needs_investigation");
});

test("6. a negative identity signal always downgrades to needs investigation, even with multiple strong signals and household corroboration", () => {
  assert.equal(
    assignConfidenceBand([identity("strong"), identity("strong", "same_dob"), identity("negative", "conflicting_dob")], [household()]),
    "needs_investigation",
  );
});

test("7. household evidence alone, with a suppressed pair's negative identity evidence, is still gated by identity evidence being non-empty", () => {
  assert.equal(assignConfidenceBand([identity("negative", "suppressed_pair")], [household()]), "needs_investigation");
});

// ─── Runner ──────────────────────────────────────────────────────────

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
