// Pure-function tests for ../malformedPhoneDetection.ts. Run with:
//   npm run test:residentDataIntegrity
import assert from "node:assert/strict";
import { detectMalformedPhone } from "../malformedPhoneDetection.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. no phone at all -> no issue", () => {
  assert.deepEqual(detectMalformedPhone(null), []);
});

test("2. valid 10-digit phone -> no issue", () => {
  assert.deepEqual(detectMalformedPhone("8179649557"), []);
});

test("3. invalid 9-digit phone (815073076) -> flagged, raw preserved, never guessed", () => {
  const signals = detectMalformedPhone("815073076");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signalType, "invalid_phone_length_or_format");
  assert.equal(signals[0].rawValue, "815073076");
  assert.equal(signals[0].normalizedValue, null);
});

test("4. invalid 9-digit phone starting with 1 (179649557) -> flagged, not silently accepted as a country-code number", () => {
  const signals = detectMalformedPhone("179649557");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].rawValue, "179649557");
});

test("5. a malformed phone never overwrites — this detector only ever reports, callers must never pass the invalid value through to `phone`", () => {
  const signals = detectMalformedPhone("179649557");
  assert.equal(signals[0].normalizedValue, null);
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
