// Pure-function tests for ../sameImportDuplicateDetection.ts. Run with:
//   npm run test:residentDataIntegrity
import assert from "node:assert/strict";
import { detectSameImportDuplicate } from "../sameImportDuplicateDetection.ts";
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

test("1. exact same-import duplicate: same name, apartment, source, phone -> flagged", () => {
  const a = resident({ id: "a", firstName: "Maurice", lastName: "Lambert", unitNumber: "2201", phone: "8175551212", sourceSystem: "Watermere official roster", importBatch: "batch-1" });
  const b = resident({ id: "b", firstName: "Maurice", lastName: "Lambert", unitNumber: "2201", phone: "8175551212", sourceSystem: "Watermere official roster", importBatch: "batch-1" });
  const signals = detectSameImportDuplicate(a, b);
  assert.ok(signals.length > 0);
  assert.ok(signals.some((s) => s.signalType === "same_import_batch"));
});

test("2. exact same-import duplicate with both phones blank -> still flagged (both_phone_blank)", () => {
  const a = resident({ id: "a", firstName: "Audreya", lastName: "Lambert", unitNumber: "2202", sourceSystem: "Watermere official roster" });
  const b = resident({ id: "b", firstName: "Audreya", lastName: "Lambert", unitNumber: "2202", sourceSystem: "Watermere official roster" });
  const signals = detectSameImportDuplicate(a, b);
  assert.ok(signals.some((s) => s.signalType === "both_phone_blank"));
});

test("3. partial divergence: different apartments -> NOT a same-import duplicate", () => {
  const a = resident({ id: "a", firstName: "Lynell", lastName: "Pinion", unitNumber: "1101", sourceSystem: "Watermere official roster" });
  const b = resident({ id: "b", firstName: "Lynell", lastName: "Pinion", unitNumber: "1102", sourceSystem: "Watermere official roster" });
  assert.deepEqual(detectSameImportDuplicate(a, b), []);
});

test("4. same name from DIFFERENT source systems -> not a same-import duplicate (different mechanics, not this defect)", () => {
  const a = resident({ id: "a", firstName: "Linda", lastName: "Thorp", unitNumber: "3301", sourceSystem: "Watermere official roster" });
  const b = resident({ id: "b", firstName: "Linda", lastName: "Thorp", unitNumber: "3301", sourceSystem: "AxisCare" });
  assert.deepEqual(detectSameImportDuplicate(a, b), []);
});

test("5. conflicting middle names -> real evidence of distinct people, not flagged", () => {
  const a = resident({ id: "a", firstName: "John", lastName: "Smith", middleName: "Robert", unitNumber: "5501", sourceSystem: "Watermere official roster" });
  const b = resident({ id: "b", firstName: "John", lastName: "Smith", middleName: "Michael", unitNumber: "5501", sourceSystem: "Watermere official roster" });
  assert.deepEqual(detectSameImportDuplicate(a, b), []);
});

test("6. mismatched phones (both present, different) -> not flagged", () => {
  const a = resident({ id: "a", firstName: "Susan", lastName: "Elliot", unitNumber: "7404", phone: "8175551111", sourceSystem: "Watermere official roster" });
  const b = resident({ id: "b", firstName: "Susan", lastName: "Elliott", unitNumber: "7404", phone: "8175552222", sourceSystem: "Watermere official roster" });
  assert.deepEqual(detectSameImportDuplicate(a, b), []);
});

test("7. spelling-variant names (Elliot/Elliott) never match here — that's identity resolution's job, not import-integrity's", () => {
  const a = resident({ id: "a", firstName: "Elliot", lastName: "Goldberg", unitNumber: "6303", sourceSystem: "Watermere official roster" });
  const b = resident({ id: "b", firstName: "Elliott", lastName: "Goldberg", unitNumber: "6303", sourceSystem: "Watermere official roster" });
  assert.deepEqual(detectSameImportDuplicate(a, b), []);
});

test("8. detection idempotency: identical input twice produces identical output", () => {
  const a = resident({ id: "a", firstName: "Maurice", lastName: "Lambert", unitNumber: "2201", sourceSystem: "Watermere official roster" });
  const b = resident({ id: "b", firstName: "Maurice", lastName: "Lambert", unitNumber: "2201", sourceSystem: "Watermere official roster" });
  assert.deepEqual(detectSameImportDuplicate(a, b), detectSameImportDuplicate(a, b));
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
