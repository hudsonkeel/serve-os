// Pure-function tests for ../fingerprint.ts. Run with:
//   npm run test:residentDataIntegrity
import assert from "node:assert/strict";
import { computeFingerprint } from "../fingerprint.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. detection idempotency: identical input twice produces the identical fingerprint", () => {
  const first = computeFingerprint("same_import_duplicate", ["a", "b"], ["batch-1"]);
  const second = computeFingerprint("same_import_duplicate", ["a", "b"], ["batch-1"]);
  assert.equal(first, second);
});

test("2. resident id order does not affect the fingerprint (sorted internally)", () => {
  assert.equal(computeFingerprint("same_import_duplicate", ["a", "b"]), computeFingerprint("same_import_duplicate", ["b", "a"]));
});

test("3. different issue types never collide even with identical resident ids/fields", () => {
  const a = computeFingerprint("same_import_duplicate", ["x", "y"]);
  const b = computeFingerprint("duplicate_source_row", ["x", "y"]);
  assert.notEqual(a, b);
});

test("4. resolution idempotency: a fingerprint changes when the underlying evidence changes", () => {
  const before = computeFingerprint("malformed_phone", ["r1"], ["815073076"]);
  const after = computeFingerprint("malformed_phone", ["r1"], ["8150730761"]);
  assert.notEqual(before, after);
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
