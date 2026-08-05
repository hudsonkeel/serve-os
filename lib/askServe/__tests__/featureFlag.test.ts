// Pure-function tests for ../featureFlag.ts. Run with:
//   npm run test:askServe
import assert from "node:assert/strict";
import { isContextualAskServeEnabled } from "../featureFlag.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. admin role is enabled", () => {
  assert.equal(isContextualAskServeEnabled("admin"), true);
});

test("2. manager/executive/operations roles are not yet enabled", () => {
  assert.equal(isContextualAskServeEnabled("manager"), false);
  assert.equal(isContextualAskServeEnabled("executive"), false);
  assert.equal(isContextualAskServeEnabled("operations"), false);
});

test("3. null/undefined role is not enabled", () => {
  assert.equal(isContextualAskServeEnabled(null), false);
  assert.equal(isContextualAskServeEnabled(undefined), false);
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
