// Pure-function tests for ../canonicalRecommendation.ts. Run with:
//   npm run test:residentIdentity
import assert from "node:assert/strict";
import { recommendCanonicalResident } from "../canonicalRecommendation.ts";
import type { CanonicalRecommendationInput } from "../canonicalRecommendation.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function record(overrides: Partial<CanonicalRecommendationInput> & { id: string }): CanonicalRecommendationInput {
  return {
    firstName: "Jane",
    lastName: "Smith",
    unitNumber: "1101",
    needsReview: null,
    sourceSystem: "Watermere official roster",
    linkedRecordCount: 0,
    ...overrides,
  };
}

test("1. identity quality beats history richness — better apartment/name/flag data wins even with less linked history", () => {
  const better = record({ id: "better", unitNumber: "1101", needsReview: null, linkedRecordCount: 0 });
  const worse = record({ id: "worse", unitNumber: null, needsReview: "stray artifact in name field", linkedRecordCount: 50 });
  const result = recommendCanonicalResident(better, worse);
  assert.equal(result.canonicalResidentId, "better");
});

test("2. source authority is the tie-breaker BEFORE history, never after — equal identity quality, different source, different history", () => {
  const trusted = record({ id: "trusted", sourceSystem: "Watermere official roster", linkedRecordCount: 1 });
  const untrusted = record({ id: "untrusted", sourceSystem: "Watermere resident roster CSV", linkedRecordCount: 50 });
  const result = recommendCanonicalResident(trusted, untrusted);
  assert.equal(result.canonicalResidentId, "trusted");
});

test("3. history richness is only consulted once quality and authority are truly tied", () => {
  const richer = record({ id: "richer", sourceSystem: "Watermere official roster", linkedRecordCount: 12 });
  const leaner = record({ id: "leaner", sourceSystem: "Watermere official roster", linkedRecordCount: 3 });
  const result = recommendCanonicalResident(richer, leaner);
  assert.equal(result.canonicalResidentId, "richer");
});

test("4. the recommendation always explains itself with a non-empty reasons list", () => {
  const a = record({ id: "a", unitNumber: "1101" });
  const b = record({ id: "b", unitNumber: null });
  const result = recommendCanonicalResident(a, b);
  assert.ok(result.reasons.length > 0);
});

test("5. a genuine tie on every tier still returns a deterministic, non-empty-reasons result", () => {
  const a = record({ id: "a" });
  const b = record({ id: "b" });
  const result = recommendCanonicalResident(a, b);
  assert.equal(result.canonicalResidentId, "a");
  assert.ok(result.reasons.length > 0);
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
