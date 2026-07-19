// Tests for lib/intelligence/domains/compliance/backgroundEligibility/missingEvidenceGuidance.ts
// Run with: npm run test:governance
import assert from "node:assert/strict";
import { classifyBackgroundEligibility } from "../classificationEngine.ts";
import { normalizeOffenses } from "../normalizeOffense.ts";
import { getMissingEvidenceGuidance } from "../missingEvidenceGuidance.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. report not received -> one blocking, high-risk guidance item", () => {
  const items = getMissingEvidenceGuidance({ reportReceived: false, classificationResult: null });
  assert.equal(items.length, 1);
  assert.equal(items[0].blocksDecision, true);
  assert.equal(items[0].risk, "high");
});

test("2. report received, clean classification -> no guidance items", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses([]));
  const items = getMissingEvidenceGuidance({ reportReceived: true, classificationResult: result });
  assert.deepEqual(items, []);
});

test("3. unrecognized offense -> one blocking guidance item per unrecognized offense", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Not In The Taxonomy", "Also Not In The Taxonomy"]));
  const items = getMissingEvidenceGuidance({ reportReceived: true, classificationResult: result });
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.blocksDecision));
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
