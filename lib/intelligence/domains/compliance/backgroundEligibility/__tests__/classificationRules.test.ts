// Tests for lib/intelligence/domains/compliance/backgroundEligibility/classificationRules.ts
// Run with: npm run test:governance
import assert from "node:assert/strict";
import path from "node:path";
import { loadClassificationRules } from "../classificationRules.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

test("1. loads the real governance classification-rules.yml successfully", () => {
  const rules = loadClassificationRules();
  assert.equal(rules.fallbackClassification, "eligible");
  assert.ok(rules.evaluationOrder.some((s) => s.action === "fallback"));
});

test("2. evaluation order matches 05-review-workflow.md §3's fixed sequence (regression check)", () => {
  const rules = loadClassificationRules();
  const matchSteps = rules.evaluationOrder.filter((s) => s.action === "match");
  assert.deepEqual(
    matchSteps.map((s) => s.againstCategoryClassification),
    ["automatic_disqualification", "presumptive_disqualification", "reviewable"],
  );
});

test("3. missing YAML file throws a clear error", () => {
  assert.throws(
    () => loadClassificationRules(path.join(FIXTURES_DIR, "does-not-exist.yml")),
    /Could not read the governance classification rules/,
  );
});

test("4. a rules file with no fallback step throws a clear error (collectively exhaustive rule, ontology §3.3)", () => {
  assert.throws(
    () => loadClassificationRules(path.join(FIXTURES_DIR, "invalid-shape-rules.yml")),
    /no fallback step/,
  );
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
