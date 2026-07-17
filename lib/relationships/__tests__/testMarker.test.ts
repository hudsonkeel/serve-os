// Pure-function tests for lib/relationships/testMarker.ts. Run with:
//   npm run test:relationships
import assert from "node:assert/strict";
import { generateTestMarker, isTestMarker } from "../testMarker.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. generateTestMarker produces the documented format", () => {
  const now = new Date("2026-07-16T14:32:00.000Z");
  const marker = generateTestMarker("operational-whiteboard", now, "a81f");
  assert.equal(marker, "__SERVE_TEST__ operational-whiteboard 20260716T143200Z-a81f");
});

test("2. generateTestMarker is deterministic given the same inputs", () => {
  const now = new Date("2026-07-16T14:32:00.000Z");
  const a = generateTestMarker("relationship-action-edit", now, "a81f");
  const b = generateTestMarker("relationship-action-edit", now, "a81f");
  assert.equal(a, b);
});

test("3. generateTestMarker varies with the run id (different suffix)", () => {
  const now = new Date("2026-07-16T14:32:00.000Z");
  const a = generateTestMarker("relationship-action-edit", now, "aaaa");
  const b = generateTestMarker("relationship-action-edit", now, "bbbb");
  assert.notEqual(a, b);
});

test("4. generateTestMarker rejects a blank purpose", () => {
  assert.throws(() => generateTestMarker("   "));
});

test("5. isTestMarker recognizes a generated marker", () => {
  const marker = generateTestMarker("foo", new Date(), "abcd");
  assert.equal(isTestMarker(marker), true);
});

test("6. isTestMarker rejects an ordinary display name", () => {
  assert.equal(isTestMarker("Smith Family Inquiry"), false);
});

test("7. isTestMarker rejects null/undefined", () => {
  assert.equal(isTestMarker(null), false);
  assert.equal(isTestMarker(undefined), false);
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
