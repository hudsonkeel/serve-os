// Tests for lib/intelligence/domains/compliance/backgroundEligibility/offenseTaxonomy.ts
// Run with: npm run test:governance
import assert from "node:assert/strict";
import path from "node:path";
import { loadOffenseTaxonomy } from "../offenseTaxonomy.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

test("1. loads the real governance offense-taxonomy.yml successfully", () => {
  const taxonomy = loadOffenseTaxonomy();
  assert.equal(taxonomy.status, "draft");
  assert.ok(taxonomy.categories.length >= 7, "expected all 7 categories from 06-offense-taxonomy.md");
});

test("2. the real taxonomy's category ids and classifications match 06-offense-taxonomy.md §2 (regression check, not a second source of truth)", () => {
  const taxonomy = loadOffenseTaxonomy();
  const byId = new Map(taxonomy.categories.map((c) => [c.id, c]));
  assert.equal(byId.get("violence")?.classification, "automatic_disqualification");
  assert.equal(byId.get("sexual_misconduct")?.classification, "automatic_disqualification");
  assert.equal(byId.get("crimes_against_vulnerable_persons")?.classification, "automatic_disqualification");
  assert.equal(byId.get("healthcare_trust")?.classification, "automatic_disqualification");
  assert.equal(byId.get("executive_review_required")?.classification, "presumptive_disqualification");
  assert.equal(byId.get("reviewable_offenses")?.classification, "reviewable");
  assert.equal(byId.get("eligible_offenses")?.classification, "eligible");
});

test("3. representative offenses resolve to the expected category (sample, not exhaustive)", () => {
  const taxonomy = loadOffenseTaxonomy();
  const violence = taxonomy.categories.find((c) => c.id === "violence");
  const reviewable = taxonomy.categories.find((c) => c.id === "reviewable_offenses");
  assert.ok(violence?.offenses.includes("Murder"));
  assert.ok(reviewable?.offenses.includes("Simple Possession"));
});

test("4. missing YAML file throws a clear error, never a silent empty taxonomy", () => {
  assert.throws(
    () => loadOffenseTaxonomy(path.join(FIXTURES_DIR, "does-not-exist.yml")),
    /Could not read the governance offense taxonomy/,
  );
});

test("5. malformed YAML syntax throws a clear error", () => {
  assert.throws(
    () => loadOffenseTaxonomy(path.join(FIXTURES_DIR, "malformed-syntax.yml")),
    /is not valid YAML/,
  );
});

test("6. valid YAML with an unrecognized classification value throws a clear shape error", () => {
  assert.throws(
    () => loadOffenseTaxonomy(path.join(FIXTURES_DIR, "invalid-shape-taxonomy.yml")),
    /unrecognized classification/,
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
