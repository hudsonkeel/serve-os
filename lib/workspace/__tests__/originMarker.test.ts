// Pure-function tests for ../originMarker.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import { hasTodaysWorkOrigin, withTodaysWorkOrigin } from "../originMarker.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. appends the marker to a plain route with '?'", () => {
  assert.equal(withTodaysWorkOrigin("/residents/abc"), "/residents/abc?from=todays-work");
});

test("2. appends the marker with '&' when the route already has a query string", () => {
  assert.equal(withTodaysWorkOrigin("/relationships/abc?tab=notes"), "/relationships/abc?tab=notes&from=todays-work");
});

test("3. hasTodaysWorkOrigin is true only for the exact marker value", () => {
  assert.equal(hasTodaysWorkOrigin("todays-work"), true);
});

test("4. hasTodaysWorkOrigin is false for an unrelated value, undefined, or null", () => {
  assert.equal(hasTodaysWorkOrigin("something-else"), false);
  assert.equal(hasTodaysWorkOrigin(undefined), false);
  assert.equal(hasTodaysWorkOrigin(null), false);
});

test("5. round-trip: a route built with withTodaysWorkOrigin is recognized by hasTodaysWorkOrigin via its query value", () => {
  const built = withTodaysWorkOrigin("/recruiting/xyz");
  const url = new URL(built, "http://localhost");
  assert.equal(hasTodaysWorkOrigin(url.searchParams.get("from")), true);
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
