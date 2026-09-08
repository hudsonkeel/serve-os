// Tests for lib/scheduling/metrics/visitsPerActiveClient.ts (Financial
// Metric Registry #12 — Visits per Active Client). Run with:
//   npm run test:scheduling
//
// The pure ratio calculation is imported from visitsPerActiveClientMath.ts
// (not visitsPerActiveClient.ts itself) so this test never needs to load
// visitsPerActiveClient.ts's transitive dependency on the DB-touching
// residentServeRelationships.ts — this file's source is still scanned
// directly (via readFileSync below), matching the style of
// lib/intelligence/core/__tests__/boundaries.test.ts's repo-wide scans,
// to assert it reuses the canonical Active Client pipeline rather than
// reimplementing AxisCare lifecycle classification.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { calculateVisitsPerActiveClient } from "../visitsPerActiveClientMath.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── Pure ratio calculation ──────────────────────────────────────────────

test("qualifying Visits divided by Active Client count", () => {
  const result = calculateVisitsPerActiveClient(20, 10);
  assert.equal(result.ratio, 2);
});

test("zero Active Clients -> ratio is null (undefined), never 0 or Infinity", () => {
  const result = calculateVisitsPerActiveClient(5, 0);
  assert.equal(result.ratio, null);
});

test("zero qualifying Visits with nonzero Active Clients -> ratio 0, a real (not undefined) result", () => {
  const result = calculateVisitsPerActiveClient(0, 10);
  assert.equal(result.ratio, 0);
});

// ─── Active Client reuse (no duplicated lifecycle logic) ────────────────

test("imports the canonical getAuditEligibleActiveClientResidents rather than reimplementing lifecycle classification", () => {
  const path = fileURLToPath(new URL("../visitsPerActiveClient.ts", import.meta.url));
  const source = readFileSync(path, "utf8");

  assert.ok(
    source.includes("getAuditEligibleActiveClientResidents"),
    "expected the canonical Active Client population function to be imported/used"
  );

  const forbiddenReimplementationMarkers = [
    "classifyAxisCareClientLifecycle",
    "computed_lifecycle",
    "status.active",
    "AXISCARE_LIFECYCLE_CLASS_MAP",
  ];
  for (const marker of forbiddenReimplementationMarkers) {
    assert.ok(
      !source.includes(marker),
      `expected no re-implementation of AxisCare lifecycle classification (found forbidden marker: ${marker})`
    );
  }
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
