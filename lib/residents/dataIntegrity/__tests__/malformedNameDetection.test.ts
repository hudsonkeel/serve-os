// Pure-function tests for ../malformedNameDetection.ts. Run with:
//   npm run test:residentDataIntegrity
import assert from "node:assert/strict";
import { detectMalformedName, detectPossibleNameReversal, isNumericLikeName } from "../malformedNameDetection.ts";
import type { ResidentForIntegrityDetection } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function resident(overrides: Partial<ResidentForIntegrityDetection> & { id: string }): ResidentForIntegrityDetection {
  return {
    firstName: null,
    lastName: null,
    middleName: null,
    unitNumber: null,
    phone: null,
    phoneRaw: null,
    sourceSystem: null,
    sourceFile: null,
    importBatch: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    isActive: true,
    ...overrides,
  };
}

test("1. Excel serial number in first name -> flagged", () => {
  const signals = detectMalformedName({ firstName: "45678", lastName: "Smith" });
  assert.ok(signals.some((s) => s.signalType === "numeric_first_name"));
});

test("2. Excel serial with decimal -> flagged", () => {
  assert.equal(isNumericLikeName("45678.5"), true);
});

test("3. a normal name -> not flagged", () => {
  assert.deepEqual(detectMalformedName({ firstName: "John", lastName: "Smith" }), []);
});

test("4. vacancy marker as last name -> flagged", () => {
  const signals = detectMalformedName({ firstName: null, lastName: "Vacant" });
  assert.ok(signals.some((s) => s.signalType === "vacancy_marker_as_person"));
});

test("5. genuinely ambiguous compound name (e.g. 'Mary Jane' as first name) is never restructured or flagged here", () => {
  assert.deepEqual(detectMalformedName({ firstName: "Mary Jane", lastName: "Watson" }), []);
});

test("6. first/last reversal: swapping exactly matches another resident on file -> flagged, never auto-corrected", () => {
  const reversed = resident({ id: "r1", firstName: "Smith", lastName: "John" });
  const correct = resident({ id: "r2", firstName: "John", lastName: "Smith" });
  const signals = detectPossibleNameReversal(reversed, [correct]);
  assert.ok(signals.some((s) => s.signalType === "possible_first_last_reversal"));
});

test("7. no reversal match found among candidates -> not flagged", () => {
  const a = resident({ id: "r1", firstName: "Smith", lastName: "John" });
  const b = resident({ id: "r2", firstName: "Amy", lastName: "Nickell" });
  assert.deepEqual(detectPossibleNameReversal(a, [b]), []);
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
