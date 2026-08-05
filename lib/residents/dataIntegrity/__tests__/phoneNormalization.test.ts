// Pure-function tests for ../phoneNormalization.ts. Run with:
//   npm run test:residentDataIntegrity
import assert from "node:assert/strict";
import { validatePhoneForStorage } from "../phoneNormalization.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. no phone provided is valid (absence is not malformed)", () => {
  assert.deepEqual(validatePhoneForStorage(null), { normalized: null, valid: true });
  assert.deepEqual(validatePhoneForStorage(""), { normalized: null, valid: true });
  assert.deepEqual(validatePhoneForStorage("   "), { normalized: null, valid: true });
});

test("2. valid 10-digit US number", () => {
  const result = validatePhoneForStorage("(817) 964-9557");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "8179649557");
});

test("3. valid +1 number strips the leading country code", () => {
  const result = validatePhoneForStorage("+1 817 964 9557");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "8179649557");
});

test("4. invalid 9-digit number is never guessed or padded", () => {
  const result = validatePhoneForStorage("815073076");
  assert.equal(result.valid, false);
  assert.equal(result.normalized, null);
});

test("5. invalid 9-digit number starting with 1 is still invalid (only 11-digit-starting-with-1 strips)", () => {
  const result = validatePhoneForStorage("179649557");
  assert.equal(result.valid, false);
  assert.equal(result.normalized, null);
});

test("6. invalid 7-digit number", () => {
  const result = validatePhoneForStorage("9649557");
  assert.equal(result.valid, false);
  assert.equal(result.normalized, null);
});

test("7. invalid 8-digit number", () => {
  const result = validatePhoneForStorage("79649557");
  assert.equal(result.valid, false);
  assert.equal(result.normalized, null);
});

test("8. a bare 10-digit string with no formatting is valid", () => {
  const result = validatePhoneForStorage("8179649557");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "8179649557");
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
